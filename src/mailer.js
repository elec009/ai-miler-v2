const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const utils = require('./utils');
const logger = require('./logger');
const { autoDiscoverImap, checkImapPlacement } = require('./imap-service');

class Mailer {
  constructor(config, smtpCredentials, templates, subjects, links, footers, headers = {}) {
    const rawBcc = (config && config.bcc) ? config.bcc : {};
    this.config = {
      defaultLang: 'EN',
      senderName: 'AI Mailer',
      smtpCooldownMs: 5000,
      maxRetries: 3,
      sendDelayMs: 2000,
      replyTo: '',
      ...config,
      bcc: {
        enabled: false,
        bulkCount: 10,
        bccDelayMs: 5000,
        bccEmail: '',
        ...rawBcc
      }
    };

    // Ensure parsed integers
    this.config.smtpCooldownMs = parseInt(this.config.smtpCooldownMs, 10) || 5000;
    this.config.sendDelayMs = parseInt(this.config.sendDelayMs, 10) || 2000;
    this.config.maxRetries = parseInt(this.config.maxRetries, 10) || 3;

    if (this.config.bcc) {
      this.config.bcc.bulkCount = parseInt(this.config.bcc.bulkCount, 10) || 10;
      this.config.bcc.bccDelayMs = parseInt(this.config.bcc.bccDelayMs, 10) || this.config.sendDelayMs || 5000;
      this.config.bcc.enabled = Boolean(this.config.bcc.enabled);
      this.config.bcc.bccEmail = typeof this.config.bcc.bccEmail === 'string' ? this.config.bcc.bccEmail.trim() : '';
    }

    // Test Email & Smart Inbox Filter Configuration
    if (this.config.testEmail) {
      if (typeof this.config.testEmail === 'string') {
        this.testEmail = this.config.testEmail.trim();
        this.testPassword = '';
        this.testInterval = parseInt(this.config.testInterval, 10) || (this.config.bcc?.enabled ? this.config.bcc.bulkCount : 10);
        this.smartInboxFilter = false;
      } else if (typeof this.config.testEmail === 'object') {
        this.testEmail = (this.config.testEmail.email || '').trim();
        this.testPassword = (this.config.testEmail.password || '').trim();
        this.testInterval = parseInt(this.config.testEmail.interval, 10) || (this.config.bcc?.enabled ? this.config.bcc.bulkCount : 10);
        this.smartInboxFilter = Boolean((this.config.testEmail.smartInboxFilter || this.testPassword) && this.testPassword);
      }
    } else {
      this.testEmail = '';
      this.testPassword = '';
      this.testInterval = this.config.bcc?.enabled ? this.config.bcc.bulkCount : 10;
      this.smartInboxFilter = false;
    }

    this.smtpCredentials = smtpCredentials.map(s => ({
      ...s,
      lastUsed: 0,
      isBad: false,
      cooldownUntil: 0,
      isInboxHitter: false,
      isSpamDropper: false
    }));

    this.templates = templates;
    this.subjects = subjects;
    this.links = links;
    this.footers = footers;
    this.headers = headers || {};

    this.transporters = new Map();
    this.isShuttingDown = false;
    this.singleSmtpMode = this.smtpCredentials.length === 1;
    this.smtpIndex = 0;

    this.initializeTransporters();
  }

  /**
   * Initializes SMTP transporters for all credentials
   */
  initializeTransporters() {
    for (const smtp of this.smtpCredentials) {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: {
          user: smtp.user,
          pass: smtp.pass
        },
        pool: true,
        maxConnections: 1,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 5,
        tls: {
          rejectUnauthorized: false
        }
      });

      this.transporters.set(smtp, transporter);
    }
  }

  /**
   * Smart SMTP Selection with load balancing, random selection, and inbox qualification priority
   */
  selectSmtp(forceCandidate = null) {
    if (forceCandidate && !forceCandidate.isBad) {
      this.lastUsedSmtp = forceCandidate;
      return forceCandidate;
    }

    const now = Date.now();

    if (this.singleSmtpMode && this.smtpCredentials.length > 0) {
      const single = this.smtpCredentials[0];
      return single.isBad ? null : single;
    }

    // Active pool: never use bad/dropped SMTPs
    let pool = this.smtpCredentials.filter(s => !s.isBad);
    if (pool.length === 0) {
      return null;
    }

    // Filter active and non-cooldown SMTPs
    const candidates = pool.filter(smtp =>
      (!smtp.cooldownUntil || now >= smtp.cooldownUntil) &&
      (!smtp.lastUsed || (now - smtp.lastUsed) >= this.config.smtpCooldownMs)
    );

    if (candidates.length > 0) {
      // Pick a random candidate, preferring a different one from the last used
      const otherCandidates = candidates.filter(s => s !== this.lastUsedSmtp);
      const chosen = (otherCandidates.length > 0)
        ? otherCandidates[Math.floor(Math.random() * otherCandidates.length)]
        : candidates[Math.floor(Math.random() * candidates.length)];
      this.lastUsedSmtp = chosen;
      return chosen;
    }

    // If all are waiting on lastUsed cooldown, pick least recently used
    const nonBad = pool.filter(smtp => (!smtp.cooldownUntil || now >= smtp.cooldownUntil));
    if (nonBad.length > 0) {
      nonBad.sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
      this.lastUsedSmtp = nonBad[0];
      return nonBad[0];
    }

    return null;
  }

  /**
   * Classifies error and handles SMTP cooldown / marking
   */
  handleSmtpError(smtp, error) {
    const errorMsg = error ? (error.message || String(error)) : '';
    const isAuthError = /AUTH|535|534|Credentials|Invalid login|authentication failed/i.test(errorMsg);
    const isSpamError = /554|5\.7\.1|Spam|rejected|blocked|blacklisted|abuse/i.test(errorMsg);
    const isRateLimit = /421|451|452|rate|limit|too many/i.test(errorMsg);

    if (this.singleSmtpMode) {
      logger.warn(`SMTP ${smtp.host} (${smtp.user}) encountered error: ${errorMsg}`);
      return;
    }

    if (isAuthError) {
      smtp.isBad = true;
      logger.warn(`Marked SMTP ${smtp.host} (${smtp.user}) as permanently BAD (Authentication failed)`);
    } else if (isSpamError) {
      smtp.cooldownUntil = Date.now() + 120000;
      logger.warn(`Placed SMTP ${smtp.host} (${smtp.user}) on 2-minute cooldown (Spam filter trigger: ${errorMsg})`);
    } else if (isRateLimit) {
      smtp.cooldownUntil = Date.now() + 60000;
      logger.warn(`Placed SMTP ${smtp.host} (${smtp.user}) on 1-minute cooldown (Rate limit)`);
    } else {
      smtp.cooldownUntil = Date.now() + this.config.smtpCooldownMs;
      logger.warn(`Placed SMTP ${smtp.host} (${smtp.user}) on cooldown (${this.config.smtpCooldownMs}ms): ${errorMsg}`);
    }
  }

  /**
   * Loads template for given language
   */
  loadTemplate(lang) {
    const upperLang = (lang || '').toUpperCase();
    let templateFiles = this.templates[upperLang] || this.templates[this.config.defaultLang.toUpperCase()] || Object.values(this.templates)[0];

    if (!templateFiles || templateFiles.length === 0) {
      throw new Error(`No templates available`);
    }

    const templateFile = utils.getRandomElement(templateFiles);
    return fs.readFileSync(templateFile, 'utf8');
  }

  /**
   * Loads subjects for given language
   */
  loadSubjects(lang) {
    const upperLang = (lang || '').toUpperCase();
    let subjects = this.subjects[upperLang] || this.subjects[this.config.defaultLang.toUpperCase()] || Object.values(this.subjects)[0];

    if (!subjects || subjects.length === 0) {
      throw new Error(`No subjects available`);
    }

    return subjects;
  }

  /**
   * Loads links for given language
   */
  loadLinks(lang) {
    const upperLang = (lang || '').toUpperCase();
    let links = this.links[upperLang] || this.links[this.config.defaultLang.toUpperCase()] || Object.values(this.links)[0];

    if (!links || links.length === 0 || (links.length === 1 && links[0] === '#')) {
      try {
        const paths = [
          path.join(__dirname, '..', 'langs', upperLang, 'links.txt'),
          path.join(__dirname, '..', 'langs', 'DE', 'links.txt'),
          path.join(__dirname, '..', 'langs', 'de', 'links.txt'),
          path.join(process.cwd(), 'langs', upperLang, 'links.txt'),
          path.join(process.cwd(), 'langs', 'DE', 'links.txt'),
          path.join(process.cwd(), 'links.txt')
        ];
        for (const p of paths) {
          if (fs.existsSync(p)) {
            const lines = fs.readFileSync(p, 'utf8')
              .split('\n')
              .map(l => l.trim().replace(/\r/g, ''))
              .filter(l => l && !l.startsWith('#') && !l.startsWith('//'));
            if (lines.length > 0) return lines;
          }
        }
      } catch (e) {}
      return ['https://comanopabotafdcota.42web.io/'];
    }

    return links;
  }

  /**
   * Loads headers for given language
   */
  loadHeaders(lang) {
    const upperLang = (lang || '').toUpperCase();
    let headerFiles = this.headers[upperLang];

    if (!headerFiles || headerFiles.length === 0) {
      headerFiles = this.headers[this.config.defaultLang.toUpperCase()];
      if (!headerFiles || headerFiles.length === 0) {
        return [];
      }
    }

    return headerFiles.map(f => {
      try {
        if (typeof f === 'string' && fs.existsSync(f)) {
          return fs.readFileSync(f, 'utf8');
        }
        return String(f || '');
      } catch (e) {
        return String(f || '');
      }
    });
  }

  /**
   * Loads footers for given language
   */
  loadFooters(lang) {
    const upperLang = (lang || '').toUpperCase();
    let footerFiles = this.footers[upperLang];

    if (!footerFiles || footerFiles.length === 0) {
      footerFiles = this.footers[this.config.defaultLang.toUpperCase()];
      if (!footerFiles || footerFiles.length === 0) {
        return [];
      }
    }

    return footerFiles.map(f => {
      try {
        if (typeof f === 'string' && fs.existsSync(f)) {
          return fs.readFileSync(f, 'utf8');
        }
        return String(f || '');
      } catch (e) {
        return String(f || '');
      }
    });
  }

  /**
   * Constructs message with anti-spam headers, plain-text fallback, and dynamic tokens
   */
  buildMessage({ recipient, bccRecipients = [], smtp, language, probeToken = null }) {
    const lang = language || this.config.defaultLang;
    const rawTemplate = this.loadTemplate(lang);
    const subjects = this.loadSubjects(lang);
    const links = this.loadLinks(lang);
    const headersList = this.loadHeaders(lang);
    const footers = this.loadFooters(lang);

    const rawLink = links.length > 0 ? utils.getRandomElement(links) : null;
    const randomHeader = headersList.length > 0 ? utils.getRandomElement(headersList) : '';
    const randomFooter = footers.length > 0 ? utils.getRandomElement(footers) : '';
    const rawSubject = utils.getRandomElement(subjects);

    const randomId = String(Math.floor(100000 + Math.random() * 900000));
    const targetEmail = recipient || (bccRecipients.length > 0 ? bccRecipients[0] : '');
    const context = {
      email: targetEmail,
      user: targetEmail.split('@')[0] || '',
      domain: targetEmail.split('@')[1] || '',
      link: rawLink,
      header: randomHeader,
      footer: randomFooter,
      random_id: randomId,
      randomId: randomId,
      lang
    };

    const randomLink = utils.resolveSmartLink(context);
    context.link = randomLink;

    let subject = utils.replaceTags(rawSubject, context);
    context.subject = subject;

    let html = rawTemplate;
    // Replace custom header/footer tokens if present before general replace
    if (randomHeader && (html.includes('{header}') || html.includes('{{header}}') || html.includes('[header]'))) {
      html = html.replace(/(?:\{\{|\{|\[)header(?:\}\}|\])/gi, randomHeader);
    }
    if (randomFooter && (html.includes('{footer}') || html.includes('{{footer}}') || html.includes('[footer]'))) {
      html = html.replace(/(?:\{\{|\{|\[)footer(?:\}\}|\])/gi, randomFooter);
    }

    // Replace all dynamic tags ({link}, [link], {orderId}, {random_id}, {amount}, etc.)
    html = utils.replaceTags(html, context);

    // Add unique anti-spam comment variation so body hash is unique
    html = utils.addAntiSpamVariation(html);

    // Generate text/plain version
    let text = utils.htmlToPlainText(html);

    // If a probeToken is present, embed the invisible telemetry probe token
    if (probeToken) {
      const embedded = utils.embedProbeToken(html, text, probeToken);
      html = embedded.html;
      text = embedded.text;
    }

    // Generate RFC-compliant headers with unique probe telemetry
    const customHeaders = {
      ...utils.getRandomMailerHeaders(smtp.user),
      ...(probeToken ? { 'X-Smart-Probe-Token': probeToken, 'X-Delivery-Probe-ID': probeToken } : {})
    };

    const senderPrefix = (this.config.senderName && this.config.senderName.trim())
      ? `"${this.config.senderName.trim()}" `
      : '';

    const mailOptions = {
      from: `${senderPrefix}<${smtp.user}>`,
      subject: subject,
      html: html,
      text: text,
      headers: customHeaders
    };

    const bccEmail = (this.config.bcc && typeof this.config.bcc.bccEmail === 'string')
      ? this.config.bcc.bccEmail.trim()
      : '';

    if (this.config.replyTo && typeof this.config.replyTo === 'string' && this.config.replyTo.trim()) {
      mailOptions.replyTo = this.config.replyTo.trim();
    } else if (bccEmail) {
      mailOptions.replyTo = bccEmail;
    }

    if (bccRecipients && bccRecipients.length > 0) {
      // If Primary 'To:' Mask Email is empty, send normal with sender (me) in To:
      const toAddress = bccEmail ?
        `${senderPrefix}<${bccEmail}>` :
        `${senderPrefix}<${smtp.user}>`;

      mailOptions.to = toAddress;
      mailOptions.bcc = bccRecipients;
    } else {
      mailOptions.to = recipient;
    }

    return { mailOptions, subject, randomLink, probeToken };
  }

  /**
   * Sends a BCC bulk batch of recipients in a single message.
   * If the batch includes the test email, checks via IMAP whether it arrived in INBOX.
   * If inbox: stores verified SMTP into inbox-hitters.txt.
   * If dropped/spam: removes SMTP from active list, picks another random SMTP, and re-sends.
   */
  async sendBccBatch(batch, batchIndex, totalBatches, retryCount = 0, includesTestEmail = false, forcedSmtp = null) {
    if (this.isShuttingDown || batch.length === 0) return false;

    const hasTest = includesTestEmail || Boolean(this.testEmail && batch.includes(this.testEmail));

    let smtp = forcedSmtp || this.selectSmtp();
    if (!smtp) {
      const remainingAvailable = this.smtpCredentials.filter(s => !s.isBad);
      if (remainingAvailable.length === 0) {
        logger.error(`[Smart Guard ALERT] 🚨 All candidate SMTPs have failed or dropped! Halting campaign.`);
        console.log(`[SPAM_ALERT:{"reason":"all_smtps_dropped","testedCount":${this.smtpCredentials.length},"title":"Letter Dropped in Spam / Not In Box!","message":"All available SMTP nodes failed to reach INBOX (${this.smtpCredentials.length} tested). Every node dropped into spam or did not arrive. Campaign halted!"}]`);
        this.isShuttingDown = true;
        return false;
      }

      const waitTime = this.config.smtpCooldownMs || 5000;
      logger.info(`All SMTP servers in cooldown, waiting ${waitTime}ms...`);
      await utils.sleep(waitTime);

      if (retryCount >= this.config.maxRetries * 3) {
        logger.error(`Failed to acquire SMTP for batch ${batchIndex + 1} after retries.`);
        return false;
      }
      return this.sendBccBatch(batch, batchIndex, totalBatches, retryCount + 1, hasTest);
    }

    const transporter = this.transporters.get(smtp);
    const language = utils.detectLanguage(batch[0]) || this.config.defaultLang;
    const probeToken = (hasTest && this.smartInboxFilter && this.testPassword)
      ? utils.generateProbeToken()
      : null;

    const { mailOptions, subject } = this.buildMessage({
      bccRecipients: batch,
      smtp,
      language,
      probeToken
    });

    const sendStartTime = Date.now();

    try {
      const result = await transporter.sendMail(mailOptions);
      smtp.lastUsed = Date.now();
      this.lastUsedSmtp = smtp;

      logger.info(`[BCC Batch ${batchIndex + 1}/${totalBatches}] Sent ${batch.length} emails${hasTest ? ` (${batch.length - 1} targets + 1 test email)` : ` (${batch.length} targets)`}`, {
        smtp: smtp.host,
        username: smtp.user,
        count: batch.length,
        testEmail: hasTest ? this.testEmail : undefined,
        probeToken: probeToken || undefined,
        subject: subject,
        messageId: result.messageId
      });

      // Live Inline Test Inbox Inspection
      if (hasTest && this.smartInboxFilter && this.testPassword && !this.isShuttingDown) {
        logger.info(`[Smart Guard] Milestone bulk batch ${batchIndex + 1} sent with test email sample (${this.testEmail}). Inspecting real mailbox placement via IMAP (Probe: ${probeToken})...`);

        const imap = await this.getImapConfig();
        if (imap) {
          // Wait 3.5s before polling to allow MX delivery
          await utils.sleep(3500);

          const placement = await checkImapPlacement(
            imap,
            smtp.user,
            subject,
            sendStartTime,
            25000,
            msg => logger.debug(msg),
            probeToken
          );

          if (placement.landed === 'inbox') {
            smtp.isInboxHitter = true;
            smtp.isBad = false;
            this.saveInboxHitter(smtp);
            logger.info(`[Smart Guard] 🏆 VERIFIED INBOX HITTER! SMTP ${smtp.host}:${smtp.port} (${smtp.user}) confirmed in INBOX! Saved to inbox-hitters.txt.`);
            console.log(`[INBOX_HIT:{"host":"${smtp.host}","port":${smtp.port},"user":"${smtp.user}"}]`);
            return true;
          } else {
            // DROPPED / SPAM: remove from SMTPs list and retry with another random candidate
            smtp.isBad = true;
            smtp.isInboxHitter = false;
            if (placement.landed === 'spam') {
              smtp.isSpamDropper = true;
              logger.warn(`[Smart Guard] ⚠️ SPAM DETECTED: SMTP ${smtp.host} (${smtp.user}) delivered message to ${placement.folder}! Removing from active SMTP list.`);
              console.log(`[SPAM_DROP:{"host":"${smtp.host}","user":"${smtp.user}","folder":"${placement.folder}"}]`);
            } else {
              logger.warn(`[Smart Guard] ❌ NOT IN BOX: SMTP ${smtp.host} (${smtp.user}) delivery status: ${placement.landed} (${placement.folder || 'DROPPED'}). Removing from active SMTP list.`);
            }

            const remaining = this.smtpCredentials.filter(s => !s.isBad);
            if (remaining.length === 0) {
              logger.error(`[Smart Guard ALERT] 🚨 All candidate SMTPs failed to inbox (${this.smtpCredentials.length} tested)! Message dropped in spam or did not arrive. Halting campaign.`);
              console.log(`[SPAM_ALERT:{"reason":"zero_inbox_hitters","testedCount":${this.smtpCredentials.length},"title":"Letter Dropped in Spam / Not In Box!","message":"All available SMTP nodes failed to reach INBOX (${this.smtpCredentials.length} tested). Every node dropped into spam or did not arrive. Campaign halted!"}]`);
              this.isShuttingDown = true;
              return false;
            }

            // Pick another random SMTP candidate from remaining
            const randomCandidate = remaining[Math.floor(Math.random() * remaining.length)];
            logger.info(`[Smart Guard] 🎲 Re-sending bulk batch ${batchIndex + 1} with next random SMTP candidate: ${randomCandidate.host} (${randomCandidate.user}) [${remaining.length} remaining]...`);

            await utils.sleep(1500);
            return this.sendBccBatch(batch, batchIndex, totalBatches, retryCount + 1, true, randomCandidate);
          }
        }
      }

      return true;
    } catch (error) {
      logger.error(`[BCC Batch ${batchIndex + 1}/${totalBatches}] Failed to send`, {
        smtp: smtp.host,
        username: smtp.user,
        error: error.message,
        recipientsCount: batch.length,
        retryCount: retryCount
      });

      this.handleSmtpError(smtp, error);

      if (hasTest && this.smartInboxFilter) {
        smtp.isBad = true;
        const remaining = this.smtpCredentials.filter(s => !s.isBad);
        if (remaining.length === 0) {
          logger.error(`[Smart Guard ALERT] 🚨 All candidate SMTPs failed! Halting campaign.`);
          console.log(`[SPAM_ALERT:{"reason":"all_smtps_failed","testedCount":${this.smtpCredentials.length},"title":"Letter Dropped / All SMTPs Failed!","message":"All candidate SMTPs threw errors or failed authentication. Campaign halted!"}]`);
          this.isShuttingDown = true;
          return false;
        }
        const randomCandidate = remaining[Math.floor(Math.random() * remaining.length)];
        logger.info(`[Smart Guard] 🎲 Retrying bulk batch ${batchIndex + 1} with next random SMTP candidate: ${randomCandidate.host} (${randomCandidate.user})...`);
        await utils.sleep(1500);
        return this.sendBccBatch(batch, batchIndex, totalBatches, retryCount + 1, true, randomCandidate);
      }

      if (retryCount < this.config.maxRetries) {
        logger.info(`Retrying BCC batch ${batchIndex + 1} with rotated SMTP (attempt ${retryCount + 1}/${this.config.maxRetries})`);
        await utils.sleep(1500 * (retryCount + 1));
        return this.sendBccBatch(batch, batchIndex, totalBatches, retryCount + 1, hasTest);
      }

      return false;
    }
  }

  /**
   * Sends an email to an individual recipient.
   * If test email, checks placement in INBOX via IMAP and rotates random SMTP on failure.
   */
  async sendSingleEmail(email, emailIndex, totalEmails, isTestEmail = false, retryCount = 0, forcedSmtp = null) {
    if (this.isShuttingDown) return false;

    let smtp = forcedSmtp || this.selectSmtp();
    if (!smtp) {
      const remainingAvailable = this.smtpCredentials.filter(s => !s.isBad);
      if (remainingAvailable.length === 0) {
        logger.error(`[Smart Guard ALERT] 🚨 All candidate SMTPs have failed or dropped! Halting campaign.`);
        console.log(`[SPAM_ALERT:{"reason":"all_smtps_dropped","testedCount":${this.smtpCredentials.length},"title":"Letter Dropped in Spam / Not In Box!","message":"All available SMTP nodes failed to reach INBOX (${this.smtpCredentials.length} tested). Every node dropped into spam or did not arrive. Campaign halted!"}]`);
        this.isShuttingDown = true;
        return false;
      }

      const waitTime = this.config.smtpCooldownMs || 5000;
      logger.info(`All SMTP servers in cooldown, waiting ${waitTime}ms...`);
      await utils.sleep(waitTime);

      if (retryCount >= this.config.maxRetries * 3) {
        logger.error(`Failed to acquire SMTP for ${email} after retries.`);
        return false;
      }
      return this.sendSingleEmail(email, emailIndex, totalEmails, isTestEmail, retryCount + 1);
    }

    const transporter = this.transporters.get(smtp);
    const language = utils.detectLanguage(email) || this.config.defaultLang;
    const probeToken = (isTestEmail && this.smartInboxFilter && this.testPassword)
      ? utils.generateProbeToken()
      : null;

    const { mailOptions, subject } = this.buildMessage({
      recipient: email,
      smtp,
      language,
      probeToken
    });

    const sendStartTime = Date.now();

    try {
      const result = await transporter.sendMail(mailOptions);
      smtp.lastUsed = Date.now();

      logger.info(`[${isTestEmail ? 'TEST INJECTION' : `${emailIndex + 1}/${totalEmails}`}] Email sent successfully`, {
        smtp: smtp.host,
        username: smtp.user,
        recipient: email,
        isTest: isTestEmail,
        probeToken: probeToken || undefined,
        subject: subject,
        messageId: result.messageId
      });

      // Live Inline Test Inbox Inspection
      if (isTestEmail && this.smartInboxFilter && this.testPassword && !this.isShuttingDown) {
        logger.info(`[Smart Guard] Test email sent to ${email}. Inspecting real mailbox placement via IMAP (Probe: ${probeToken})...`);

        const imap = await this.getImapConfig();
        if (imap) {
          await utils.sleep(2500);

          const placement = await checkImapPlacement(
            imap,
            smtp.user,
            subject,
            sendStartTime,
            25000,
            msg => logger.debug(msg),
            probeToken
          );

          if (placement.landed === 'inbox') {
            smtp.isInboxHitter = true;
            smtp.isBad = false;
            this.saveInboxHitter(smtp);
            logger.info(`[Smart Guard] 🏆 VERIFIED INBOX HITTER! SMTP ${smtp.host}:${smtp.port} (${smtp.user}) confirmed in INBOX! Saved to inbox-hitters.txt.`);
            console.log(`[INBOX_HIT:{"host":"${smtp.host}","port":${smtp.port},"user":"${smtp.user}"}]`);
            return true;
          } else {
            smtp.isBad = true;
            smtp.isInboxHitter = false;
            if (placement.landed === 'spam') {
              smtp.isSpamDropper = true;
              logger.warn(`[Smart Guard] ⚠️ SPAM DETECTED: SMTP ${smtp.host} (${smtp.user}) delivered message to ${placement.folder}! Removing from active SMTP list.`);
              console.log(`[SPAM_DROP:{"host":"${smtp.host}","user":"${smtp.user}","folder":"${placement.folder}"}]`);
            } else {
              logger.warn(`[Smart Guard] ❌ NOT IN BOX: SMTP ${smtp.host} (${smtp.user}) status: ${placement.landed} (${placement.folder || 'DROPPED'}). Removing from active SMTP list.`);
            }

            const remaining = this.smtpCredentials.filter(s => !s.isBad);
            if (remaining.length === 0) {
              logger.error(`[Smart Guard ALERT] 🚨 All candidate SMTPs failed to reach INBOX (${this.smtpCredentials.length} tested)! Halting campaign.`);
              console.log(`[SPAM_ALERT:{"reason":"zero_inbox_hitters","testedCount":${this.smtpCredentials.length},"title":"Letter Dropped in Spam / Not In Box!","message":"All available SMTP nodes failed to reach INBOX (${this.smtpCredentials.length} tested). Every node dropped into spam or did not arrive. Campaign halted!"}]`);
              this.isShuttingDown = true;
              return false;
            }

            const randomCandidate = remaining[Math.floor(Math.random() * remaining.length)];
            logger.info(`[Smart Guard] 🎲 Retrying test email with next random SMTP candidate: ${randomCandidate.host} (${randomCandidate.user}) [${remaining.length} remaining]...`);

            await utils.sleep(1500);
            return this.sendSingleEmail(email, emailIndex, totalEmails, true, retryCount + 1, randomCandidate);
          }
        }
      }

      return true;
    } catch (error) {
      logger.error(`[${isTestEmail ? 'TEST INJECTION' : `${emailIndex + 1}/${totalEmails}`}] Failed to send email`, {
        smtp: smtp.host,
        username: smtp.user,
        recipient: email,
        isTest: isTestEmail,
        subject: subject,
        error: error.message,
        retryCount: retryCount
      });

      this.handleSmtpError(smtp, error);

      if (isTestEmail && this.smartInboxFilter) {
        smtp.isBad = true;
        const remaining = this.smtpCredentials.filter(s => !s.isBad);
        if (remaining.length === 0) {
          logger.error(`[Smart Guard ALERT] 🚨 All candidate SMTPs failed! Halting campaign.`);
          console.log(`[SPAM_ALERT:{"reason":"all_smtps_failed","testedCount":${this.smtpCredentials.length},"title":"Letter Dropped / All SMTPs Failed!","message":"All candidate SMTPs threw errors or failed authentication. Campaign halted!"}]`);
          this.isShuttingDown = true;
          return false;
        }
        const randomCandidate = remaining[Math.floor(Math.random() * remaining.length)];
        logger.info(`[Smart Guard] 🎲 Retrying test email with next random SMTP candidate: ${randomCandidate.host} (${randomCandidate.user})...`);
        await utils.sleep(1500);
        return this.sendSingleEmail(email, emailIndex, totalEmails, true, retryCount + 1, randomCandidate);
      }

      if (retryCount < this.config.maxRetries) {
        logger.info(`Retrying email to ${email} (attempt ${retryCount + 1}/${this.config.maxRetries})`);
        await utils.sleep(1500 * (retryCount + 1));
        return this.sendSingleEmail(email, emailIndex, totalEmails, isTestEmail, retryCount + 1);
      }

      return false;
    }
  }

  /**
   * Discovers and caches IMAP connection details for the test mailbox
   */
  async getImapConfig() {
    if (this.imapConfig) return this.imapConfig;
    if (!this.smartInboxFilter || !this.testEmail || !this.testPassword) return null;

    logger.info(`[Smart Guard] Auto-discovering IMAP configuration for ${this.testEmail}...`);
    this.imapConfig = await autoDiscoverImap(this.testEmail, this.testPassword);
    if (!this.imapConfig) {
      logger.warn(`[Smart Guard] ⚠️ IMAP login to ${this.testEmail} could not be established. Continuing standard delivery.`);
    } else {
      logger.info(`[Smart Guard] ✅ IMAP authenticated successfully on ${this.imapConfig.host}:${this.imapConfig.port}`);
    }
    return this.imapConfig;
  }

  /**
   * Persists a confirmed inbox-hitting SMTP to inbox-hitters.txt
   */
  saveInboxHitter(smtp) {
    try {
      const hittersPath = path.join(process.cwd(), 'inbox-hitters.txt');
      let existing = '';
      if (fs.existsSync(hittersPath)) {
        existing = fs.readFileSync(hittersPath, 'utf8');
      }
      const line = `${smtp.host}|${smtp.port}|${smtp.user}|${smtp.pass}`;
      if (!existing.includes(line)) {
        fs.appendFileSync(hittersPath, line + '\n', 'utf8');
      }
    } catch (e) {
      logger.warn(`Failed to append to inbox-hitters.txt: ${e.message}`);
    }
  }

  /**
   * Starts the mail sending process (handles both BCC bulk and individual modes with live inline inbox verification)
   */
  async start(emails, dryRun = false) {
    if (!emails || emails.length === 0) {
      logger.warn('No emails provided to start mailer');
      return;
    }

    // Connect to IMAP ahead of delivery if Smart Inbox Guard is active
    if (this.smartInboxFilter && this.testEmail && this.testPassword && !dryRun) {
      logger.info(`[Smart Guard] 🛡️ Live Inline Inbox Guard active for test account: ${this.testEmail}`);
      await this.getImapConfig();
    }

    const isBccMode = this.config.bcc && this.config.bcc.enabled;
    const bulkCount = this.config.bcc?.bulkCount || 10;
    const interval = this.testInterval > 0 ? this.testInterval : 100;

    logger.info('Starting mailer', {
      totalEmails: emails.length,
      smtpServers: this.smtpCredentials.length,
      mode: isBccMode ? `BCC Bulk (batch size: ${bulkCount})` : 'Individual Delivery',
      singleSmtpMode: this.singleSmtpMode,
      testEmail: this.testEmail ? `${this.testEmail} (every ${interval} emails)` : 'Disabled',
      smartInboxGuard: this.smartInboxFilter ? 'Active (Live IMAP Verification)' : 'Standard',
      dryRun: dryRun
    });

    if (isBccMode) {
      const batches = [];
      let currentIdx = 0;
      let totalSentSoFar = 0;

      // Filter out test email from raw target list so targets are real audience members
      const targetEmails = this.testEmail 
        ? emails.filter(e => e.toLowerCase().trim() !== this.testEmail.toLowerCase().trim())
        : emails;

      const audienceList = targetEmails.length > 0 ? targetEmails : emails;

      while (currentIdx < audienceList.length) {
        const remainingTargets = audienceList.length - currentIdx;

        if (this.testEmail && interval > 0) {
          const nextMilestone = (Math.floor(totalSentSoFar / interval) + 1) * interval;
          const slotsUntilMilestone = nextMilestone - totalSentSoFar;

          if (slotsUntilMilestone <= bulkCount) {
            // Milestone batch: test email completes the exact milestone count
            const targetCapacity = Math.max(1, slotsUntilMilestone - 1);
            const targetCount = Math.min(targetCapacity, remainingTargets);
            const targetSlice = audienceList.slice(currentIdx, currentIdx + targetCount);

            batches.push({
              recipients: [...targetSlice, this.testEmail],
              isTestMilestone: true,
              targetCount: targetSlice.length,
              milestone: nextMilestone
            });

            currentIdx += targetCount;
            totalSentSoFar += (targetSlice.length + 1);
          } else {
            // Normal batch without test email
            const targetCount = Math.min(bulkCount, remainingTargets);
            const targetSlice = audienceList.slice(currentIdx, currentIdx + targetCount);

            batches.push({
              recipients: targetSlice,
              isTestMilestone: false,
              targetCount: targetSlice.length
            });

            currentIdx += targetCount;
            totalSentSoFar += targetSlice.length;
          }
        } else {
          // No test email configured
          const targetCount = Math.min(bulkCount, remainingTargets);
          const targetSlice = audienceList.slice(currentIdx, currentIdx + targetCount);

          batches.push({
            recipients: targetSlice,
            isTestMilestone: false,
            targetCount: targetSlice.length
          });

          currentIdx += targetCount;
          totalSentSoFar += targetSlice.length;
        }
      }

      // If total audience was smaller than milestone interval and never reached a milestone,
      // attach test email to the final batch so test verification still occurs
      if (this.testEmail && batches.length > 0 && !batches.some(b => b.isTestMilestone)) {
        const lastBatch = batches[batches.length - 1];
        if (lastBatch.recipients.length < bulkCount) {
          lastBatch.recipients.push(this.testEmail);
        } else {
          // If already at bulkCount, take 1 target off and put testEmail so it remains strictly bulkCount
          const removedTarget = lastBatch.recipients.pop();
          lastBatch.targetCount = lastBatch.recipients.length;
          lastBatch.recipients.push(this.testEmail);
          batches.push({
            recipients: [removedTarget],
            isTestMilestone: false,
            targetCount: 1
          });
        }
        lastBatch.isTestMilestone = true;
        lastBatch.milestone = totalSentSoFar;
      }

      logger.info(`BCC Bulk System: Split ${audienceList.length} audience targets into ${batches.length} batches (bulkCount: ${bulkCount}${this.testEmail ? `, sample test every ${interval} emails` : ''})`);

      let sentCount = 0;
      let failedCount = 0;

      for (let i = 0; i < batches.length; i++) {
        if (this.isShuttingDown) break;

        const batchObj = batches[i];
        const batch = batchObj.recipients;
        const hasTestEmail = batchObj.isTestMilestone;
        const targetCount = batchObj.targetCount || batch.length;

        if (dryRun) {
          const sampleLang = utils.detectLanguage(batch[0]) || this.config.defaultLang;
          const dummySmtp = this.smtpCredentials[0] || { user: 'service@otto.de', host: 'smtp.rambler.ru' };
          const { subject, randomLink } = this.buildMessage({
            bccRecipients: batch,
            smtp: dummySmtp,
            language: sampleLang
          });

          logger.info(`DRY RUN: Would send BCC batch ${i + 1}/${batches.length}${hasTestEmail ? ` [Milestone ${batchObj.milestone}: ${batchObj.targetCount} targets + 1 test email]` : ` [${batch.length} targets]`}`, {
            batchSize: batch.length,
            targetRecipients: batchObj.targetCount,
            testEmail: hasTestEmail ? this.testEmail : 'None',
            recipients: batch,
            to: this.config.bcc.bccEmail || dummySmtp.user,
            subject: subject,
            link: randomLink
          });

          if (hasTestEmail && this.smartInboxFilter) {
            const firstSmtp = this.smtpCredentials.find(s => !s.isBad);
            if (firstSmtp) {
              firstSmtp.isInboxHitter = true;
              this.saveInboxHitter(firstSmtp);
              console.log(`[INBOX_HIT:{"host":"${firstSmtp.host}","port":${firstSmtp.port},"user":"${firstSmtp.user}"}]`);
            }
          }

          sentCount += targetCount;
          console.log(`[PROGRESS:{"sent":${sentCount},"failed":${failedCount},"total":${emails.length}}]`);
          if (i < batches.length - 1 && !this.isShuttingDown) {
            await utils.sleep(80);
          }
        } else {
          const success = await this.sendBccBatch(batch, i, batches.length, 0, hasTestEmail);
          if (success) {
            sentCount += targetCount;
          } else {
            failedCount += targetCount;
          }
          console.log(`[PROGRESS:{"sent":${sentCount},"failed":${failedCount},"total":${emails.length}}]`);
        }

        if (!dryRun && i < batches.length - 1 && !this.isShuttingDown) {
          const delay = this.config.bcc.bccDelayMs || this.config.sendDelayMs || 5000;
          await utils.sleep(delay);
        }
      }
    } else {
      // Individual sending mode with smart milestone test email injection
      let totalSentSoFar = 0;
      let currentIdx = 0;
      let sentCount = 0;
      let failedCount = 0;

      // Send an immediate test email to test inbox on delivery start
      if (this.testEmail && !this.isShuttingDown) {
        if (dryRun) {
          logger.info(`DRY RUN: [Initial Proof Test] Would send initial proof test email to ${this.testEmail}`);
        } else {
          logger.info(`[Initial Proof Test] Sending initial proof test email to ${this.testEmail} to confirm delivery`);
          await this.sendSingleEmail(this.testEmail, 0, emails.length, true);
          if (!this.isShuttingDown) {
            await utils.sleep(this.config.sendDelayMs || 2000);
          }
        }
      }

      while (currentIdx < emails.length) {
        if (this.isShuttingDown) break;

        if (this.testEmail && interval > 0) {
          const nextMilestone = (Math.floor(totalSentSoFar / interval) + 1) * interval;
          const slotsUntilMilestone = nextMilestone - totalSentSoFar;

          if (slotsUntilMilestone === 1) {
            // Milestone email reached (e.g. 100th email sent)
            totalSentSoFar++;
            if (dryRun) {
              logger.info(`DRY RUN: [Test Milestone ${nextMilestone}] Would send test email to ${this.testEmail} (completes count ${nextMilestone})`);
              if (currentIdx < emails.length && !this.isShuttingDown) {
                await utils.sleep(50);
              }
            } else {
              logger.info(`[Test Milestone ${nextMilestone}] Sending milestone test email to ${this.testEmail} (completes count ${nextMilestone})`);
              await this.sendSingleEmail(this.testEmail, totalSentSoFar - 1, emails.length, true);
            }

            if (!dryRun && currentIdx < emails.length && !this.isShuttingDown) {
              await utils.sleep(this.config.sendDelayMs || 2000);
            }
            continue;
          }
        }

        const email = emails[currentIdx];
        totalSentSoFar++;

        if (dryRun) {
          const sampleLang = utils.detectLanguage(email) || this.config.defaultLang;
          const dummySmtp = this.smtpCredentials[0] || { user: 'service@otto.de', host: 'smtp.rambler.ru' };
          const { subject, randomLink } = this.buildMessage({
            recipient: email,
            smtp: dummySmtp,
            language: sampleLang
          });

          logger.info(`DRY RUN: Would send email [Target ${currentIdx + 1}/${emails.length}, Total Sent: ${totalSentSoFar}]`, {
            recipient: email,
            subject: subject,
            link: randomLink
          });

          sentCount++;
          console.log(`[PROGRESS:{"sent":${sentCount},"failed":${failedCount},"total":${emails.length}}]`);
          if (currentIdx < emails.length - 1 && !this.isShuttingDown) {
            await utils.sleep(50);
          }
        } else {
          const success = await this.sendSingleEmail(email, currentIdx, emails.length, false);
          if (success) {
            sentCount++;
          } else {
            failedCount++;
          }
          console.log(`[PROGRESS:{"sent":${sentCount},"failed":${failedCount},"total":${emails.length}}]`);
        }

        currentIdx++;

        if (!dryRun && currentIdx < emails.length && !this.isShuttingDown) {
          await utils.sleep(this.config.sendDelayMs || 2000);
        }
      }
    }

    await this.closeConnections();
    logger.info('Mailer completed');
  }

  /**
   * Closes all SMTP connections gracefully
   */
  async closeConnections() {
    logger.info('Closing SMTP connections...');

    for (const [smtp, transporter] of this.transporters) {
      try {
        await transporter.close();
        logger.debug(`Closed connection to ${smtp.host}`);
      } catch (error) {
        logger.warn(`Failed to close connection to ${smtp.host}`, { error: error.message });
      }
    }

    logger.info('All SMTP connections closed');
  }

  /**
   * Gracefully shuts down the mailer
   */
  async shutdown() {
    logger.info('Initiating graceful shutdown');
    this.isShuttingDown = true;
    await this.closeConnections();
    logger.info('Mailer shutdown complete');
  }
}

module.exports = Mailer;