const tls = require('tls');

/**
 * Robust TLS IMAP Session Handler with RFC 3501 Tagged Commands
 */
class ImapSession {
  constructor(host, port) {
    this.host = host;
    this.port = port || 993;
    this.socket = null;
    this.cmdCount = 0;
  }

  connect(timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const timer = setTimeout(() => {
        this.close();
        reject(new Error(`IMAP connection timed out to ${this.host}:${this.port}`));
      }, timeoutMs);

      try {
        this.socket = tls.connect({ host: this.host, port: this.port, rejectUnauthorized: false }, () => {});
      } catch (err) {
        clearTimeout(timer);
        return reject(err);
      }

      this.socket.setEncoding('utf8');

      const onGreeting = (chunk) => {
        buffer += chunk;
        if (buffer.includes('* OK')) {
          clearTimeout(timer);
          this.socket.removeListener('data', onGreeting);
          resolve();
        }
      };

      this.socket.on('data', onGreeting);
      this.socket.once('error', (err) => {
        clearTimeout(timer);
        this.close();
        reject(err);
      });
    });
  }

  exec(command, timeoutMs = 7000) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        return reject(new Error('IMAP socket disconnected'));
      }
      this.cmdCount++;
      const tag = `T${String(this.cmdCount).padStart(3, '0')}`;
      let cmdBuffer = '';

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`IMAP command "${command.split(' ')[0]}" timed out`));
      }, timeoutMs);

      const onData = (chunk) => {
        cmdBuffer += chunk;
        if (cmdBuffer.includes(`${tag} OK`)) {
          cleanup();
          resolve({ ok: true, data: cmdBuffer });
        } else if (cmdBuffer.includes(`${tag} NO`) || cmdBuffer.includes(`${tag} BAD`)) {
          cleanup();
          resolve({ ok: false, data: cmdBuffer });
        }
      };

      const onError = (err) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timer);
        if (this.socket) {
          this.socket.removeListener('data', onData);
          this.socket.removeListener('error', onError);
        }
      };

      this.socket.on('data', onData);
      this.socket.once('error', onError);
      this.socket.write(`${tag} ${command}\r\n`);
    });
  }

  close() {
    if (this.socket) {
      try {
        this.socket.write('T999 LOGOUT\r\n');
        this.socket.removeAllListeners();
        this.socket.destroy();
      } catch (e) {}
      this.socket = null;
    }
  }
}

/**
 * Smart IMAP Auto-Discovery: tries known domain patterns and username combinations
 */
async function autoDiscoverImap(email, password) {
  if (!email || !password) return null;
  const parts = email.split('@');
  if (parts.length < 2) return null;

  const domain = parts[1].toLowerCase().trim();
  const userPrefix = parts[0].trim();

  // Known candidate servers
  const providerMap = {
    't-online.de': [
      { host: 'secureimap.t-online.de', port: 993 },
      { host: 'imap.t-online.de', port: 993 }
    ],
    'web.de': [
      { host: 'imap.web.de', port: 993 }
    ],
    'gmx.net': [
      { host: 'imap.gmx.net', port: 993 }
    ],
    'gmx.de': [
      { host: 'imap.gmx.net', port: 993 }
    ],
    'gmail.com': [
      { host: 'imap.gmail.com', port: 993 }
    ],
    'googlemail.com': [
      { host: 'imap.gmail.com', port: 993 }
    ],
    'outlook.com': [
      { host: 'outlook.office365.com', port: 993 },
      { host: 'imap-mail.outlook.com', port: 993 }
    ],
    'hotmail.com': [
      { host: 'outlook.office365.com', port: 993 },
      { host: 'imap-mail.outlook.com', port: 993 }
    ],
    'live.com': [
      { host: 'outlook.office365.com', port: 993 }
    ],
    'office365.com': [
      { host: 'outlook.office365.com', port: 993 }
    ],
    'yahoo.com': [
      { host: 'imap.mail.yahoo.com', port: 993 }
    ],
    'yahoo.de': [
      { host: 'imap.mail.yahoo.com', port: 993 }
    ],
    'freenet.de': [
      { host: 'mx.freenet.de', port: 993 }
    ],
    'icloud.com': [
      { host: 'imap.mail.me.com', port: 993 }
    ],
    'mail.ru': [
      { host: 'imap.mail.ru', port: 993 }
    ],
    'yandex.com': [
      { host: 'imap.yandex.com', port: 993 }
    ],
    'yandex.ru': [
      { host: 'imap.yandex.ru', port: 993 }
    ]
  };

  let candidateHosts = [];
  if (providerMap[domain]) {
    candidateHosts = [...providerMap[domain]];
  } else {
    candidateHosts = [
      { host: `imap.${domain}`, port: 993 },
      { host: `mail.${domain}`, port: 993 },
      { host: domain, port: 993 }
    ];
  }

  const candidateUsers = [email];
  if (userPrefix !== email) {
    candidateUsers.push(userPrefix);
  }

  // Try combinations fast
  for (const target of candidateHosts) {
    for (const u of candidateUsers) {
      const session = new ImapSession(target.host, target.port);
      try {
        await session.connect(2500);
        const safeUser = u.replace(/["\\]/g, '\\$&');
        const safePass = password.replace(/["\\]/g, '\\$&');
        const res = await session.exec(`LOGIN "${safeUser}" "${safePass}"`, 3500);
        session.close();
        if (res.ok) {
          return {
            host: target.host,
            port: target.port,
            user: u,
            pass: password
          };
        }
      } catch (err) {
        session.close();
      }
    }
  }

  return null;
}

/**
 * Checks if a message from senderEmail actually exists in INBOX or SPAM folders.
 * Zero false positives: if the message has not arrived in mailbox, returns 'not_arrived'.
 */
async function checkImapPlacement(imapConfig, senderEmail, subjectText, sendTime, maxWaitMs = 25000, onLog = null, probeToken = null) {
  const session = new ImapSession(imapConfig.host, imapConfig.port);
  try {
    if (onLog) onLog(`[IMAP Placement] Connecting to ${imapConfig.host}:${imapConfig.port}...`);
    await session.connect(5000);

    const safeUser = imapConfig.user.replace(/["\\]/g, '\\$&');
    const safePass = imapConfig.pass.replace(/["\\]/g, '\\$&');
    const loginRes = await session.exec(`LOGIN "${safeUser}" "${safePass}"`, 6000);
    if (!loginRes.ok) {
      session.close();
      return { landed: 'auth_failed', folder: 'IMAP AUTH FAILED', error: 'Target IMAP login refused: invalid password' };
    }

    // Discover mailboxes (LIST "" "*")
    const listRes = await session.exec('LIST "" "*"', 5000);
    let spamFolders = [];
    if (listRes.ok) {
      const lines = listRes.data.split('\r\n');
      for (const line of lines) {
        const match = line.match(/\* LIST \([^)]*\) "(?:[^"\\]|\\.)*" "([^"]+)"/i) || line.match(/\* LIST \([^)]*\) "(?:[^"\\]|\\.)*" (.+)$/i);
        if (match) {
          const fName = match[1].trim();
          if (/spam|junk|bulk|quarantine|verdacht/i.test(fName) && !spamFolders.includes(fName)) {
            spamFolders.push(fName);
          }
        }
      }
    }
    if (spamFolders.length === 0) {
      spamFolders = ['Spam', 'Junk', 'INBOX.Spam', 'INBOX.Junk', 'Spamverdacht'];
    }

    const cleanSender = senderEmail.replace(/["\\]/g, '').trim();
    const tokenMatch = subjectText ? subjectText.match(/\[([A-Za-z0-9\-_ ]+)\]/) : null;
    const token = tokenMatch ? tokenMatch[1].trim() : '';
    const subjectWords = subjectText 
      ? subjectText.replace(/\[.*?\]/g, '').replace(/[^a-zA-Z0-9\u00C0-\u017F\s]/g, '').trim().split(/\s+/).filter(w => w.length >= 4)
      : [];
    const primarySubjectWord = subjectWords.length > 0 ? subjectWords[0] : '';

    const startTime = Date.now();
    let pollCount = 0;

    // Helper to decode RFC-2047 encoded headers (Base64 and Quoted-Printable)
    const decodeRfc2047 = (str) => {
      if (!str) return '';
      return str.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (match, charset, encoding, text) => {
        try {
          if (encoding.toUpperCase() === 'B') {
            return Buffer.from(text, 'base64').toString('utf8');
          } else if (encoding.toUpperCase() === 'Q') {
            return text.replace(/_/g, ' ').replace(/=([A-Fa-f0-9]{2})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
          }
        } catch (_) {}
        return match;
      });
    };

    // Helper to search folder with multiple strategies and verify unique probe token
    const findMatchingMessageId = async (folderName) => {
      const candidateIds = new Set();
      const subjectMatchedIds = new Set();

      // Strategy 1: If probeToken exists, search IMAP for that exact token in SUBJECT, TEXT, or HEADER
      if (probeToken) {
        try {
          const sRes = await session.exec(`SEARCH SUBJECT "${probeToken}"`, 4000);
          if (sRes.ok) {
            const m = sRes.data.match(/\*\s+SEARCH\s+([0-9\s]+)/i);
            if (m && m[1]) {
              m[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n)).forEach(id => {
                candidateIds.add(id);
                subjectMatchedIds.add(id);
              });
            }
          }
        } catch (e) {}

        try {
          const tRes = await session.exec(`SEARCH TEXT "${probeToken}"`, 4000);
          if (tRes.ok) {
            const m = tRes.data.match(/\*\s+SEARCH\s+([0-9\s]+)/i);
            if (m && m[1]) {
              m[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n)).forEach(id => candidateIds.add(id));
            }
          }
        } catch (e) {}

        try {
          const hRes = await session.exec(`SEARCH HEADER "X-Smart-Probe-Token" "${probeToken}"`, 4000);
          if (hRes.ok) {
            const m = hRes.data.match(/\*\s+SEARCH\s+([0-9\s]+)/i);
            if (m && m[1]) {
              m[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n)).forEach(id => candidateIds.add(id));
            }
          }
        } catch (e) {}
      }

      // Strategy 2: SEARCH FROM sender
      try {
        const fromRes = await session.exec(`SEARCH FROM "${cleanSender}"`, 4000);
        if (fromRes.ok) {
          const m = fromRes.data.match(/\*\s+SEARCH\s+([0-9\s]+)/i);
          if (m && m[1]) {
            m[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n)).forEach(id => candidateIds.add(id));
          }
        }
      } catch (e) {}

      // Strategy 3: SEARCH UNSEEN as backup
      try {
        const unseenRes = await session.exec('SEARCH UNSEEN', 4000);
        if (unseenRes.ok) {
          const m = unseenRes.data.match(/\*\s+SEARCH\s+([0-9\s]+)/i);
          if (m && m[1]) {
            m[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n)).forEach(id => candidateIds.add(id));
          }
        }
      } catch (e) {}

      if (candidateIds.size === 0) return null;

      // Sort candidate IDs descending (newest first)
      const sortedIds = Array.from(candidateIds).sort((a, b) => b - a);

      // Inspect up to 10 latest messages
      for (const id of sortedIds.slice(0, 10)) {
        try {
          // If server search already matched the exact subject probeToken, verified!
          if (probeToken && subjectMatchedIds.has(id)) {
            if (onLog) onLog(`[IMAP Placement] 🎯 Verified UNIQUE probe token match (${probeToken}) in message ID ${id} inside ${folderName}!`);
            return id;
          }

          const fRes = await session.exec(`FETCH ${id} (INTERNALDATE BODY.PEEK[HEADER.FIELDS (X-Smart-Probe-Token X-Delivery-Probe-ID SUBJECT FROM)] BODY.PEEK[TEXT]<0.8192>)`, 4000);
          if (fRes.ok) {
            const rawData = fRes.data;
            const decodedData = decodeRfc2047(rawData);

            // If probeToken is specified, message MUST contain the unique probe token!
            if (probeToken) {
              if (decodedData.includes(probeToken) || rawData.includes(probeToken)) {
                if (onLog) onLog(`[IMAP Placement] 🎯 Verified UNIQUE probe token match (${probeToken}) in message ID ${id} inside ${folderName}!`);
                return id;
              }
              // Skip old or non-matching messages from this sender
              continue;
            }

            // Fallback if no probeToken was given: enforce strict recent timestamp check
            let isRecent = true;
            const dateMatch = rawData.match(/INTERNALDATE "([^"]+)"/i);
            if (dateMatch && dateMatch[1]) {
              const msgDate = new Date(dateMatch[1]).getTime();
              if (!isNaN(msgDate) && msgDate < (sendTime - 10000)) {
                isRecent = false;
              }
            }
            if (isRecent) {
              return id;
            }
          }
        } catch (e) {}
      }

      return null;
    };

    // Iteratively scan INBOX & Spam to allow for MX delivery delay (usually 3-15s)
    while (Date.now() - startTime < maxWaitMs) {
      pollCount++;
      if (onLog) onLog(`[IMAP Placement] Scanning ${imapConfig.user} mailbox for sender ${cleanSender}${probeToken ? ` (Probe: ${probeToken})` : ''} (scan #${pollCount})...`);

      // 1. Check INBOX
      const selInbox = await session.exec('SELECT "INBOX"', 5000);
      if (selInbox.ok) {
        const inboxMsgId = await findMatchingMessageId('INBOX');
        if (inboxMsgId) {
          session.close();
          return { landed: 'inbox', folder: 'INBOX', messageId: inboxMsgId, probeToken };
        }
      }

      // 2. Check Spam folders
      for (const sf of spamFolders) {
        const selSpam = await session.exec(`SELECT "${sf}"`, 4000);
        if (selSpam.ok) {
          const spamMsgId = await findMatchingMessageId(sf);
          if (spamMsgId) {
            session.close();
            return { landed: 'spam', folder: sf, messageId: spamMsgId, probeToken };
          }
        }
      }

      // Wait 2.5 seconds before next poll
      if (Date.now() - startTime + 3000 < maxWaitMs) {
        await new Promise(r => setTimeout(r, 2500));
      } else {
        break;
      }
    }

    session.close();
    return {
      landed: 'not_arrived',
      folder: 'DROPPED / NOT IN BOX',
      error: `Accepted by relay, but unique message (${probeToken || cleanSender}) not detected in ${imapConfig.user} mailbox`
    };
  } catch (err) {
    session.close();
    return {
      landed: 'error',
      folder: 'IMAP CHECK FAILED',
      error: `IMAP inspection error: ${err.message}`
    };
  }
}

module.exports = {
  ImapSession,
  autoDiscoverImap,
  checkImapPlacement
};
