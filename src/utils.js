const crypto = require('crypto');
const tldjs = require('tldjs');
const fs = require('fs');
const path = require('path');

/**
 * Replaces tags in text with random values and handles spintax
 * {nl:N} or {randomStr} - random alphanumeric token of length N
 * {n:N} or {randomNum} - random numeric token of length N
 * {opt1|opt2|opt3} - spintax support
 * {date}, {time}, {year}, {orderId}, {customerId}, {amount}, {hash}, {uuid}
 */
/**
 * Dynamically resolves the active link from language link files or fallback
 */
function resolveSmartLink(context = {}) {
  let link = context.link || (Array.isArray(context.links) && context.links.length > 0 ? context.links[0] : null);
  
  if (!link || typeof link !== 'string' || !link.trim() || link.trim() === '#') {
    const targetLang = (context.lang || 'DE').toUpperCase();
    const searchDirs = [
      path.join(__dirname, '..', 'langs', targetLang),
      path.join(__dirname, '..', 'langs', 'DE'),
      path.join(__dirname, '..', 'langs', 'de'),
      path.join(process.cwd(), 'langs', targetLang),
      path.join(process.cwd(), 'langs', 'DE'),
      path.join(process.cwd(), 'langs', 'de')
    ];

    for (const dir of searchDirs) {
      const filePath = path.join(dir, 'links.txt');
      try {
        if (fs.existsSync(filePath)) {
          const lines = fs.readFileSync(filePath, 'utf8')
            .split('\n')
            .map(l => l.trim().replace(/\r/g, ''))
            .filter(l => l && !l.startsWith('#') && !l.startsWith('//'));
          if (lines.length > 0) {
            link = lines[Math.floor(Math.random() * lines.length)];
            break;
          }
        }
      } catch (e) {}
    }

    if (!link) {
      const rootPaths = [
        path.join(__dirname, '..', 'links.txt'),
        path.join(process.cwd(), 'links.txt')
      ];
      for (const p of rootPaths) {
        try {
          if (fs.existsSync(p)) {
            const lines = fs.readFileSync(p, 'utf8')
              .split('\n')
              .map(l => l.trim().replace(/\r/g, ''))
              .filter(l => l && !l.startsWith('#') && !l.startsWith('//'));
            if (lines.length > 0) {
              link = lines[Math.floor(Math.random() * lines.length)];
              break;
            }
          }
        } catch (e) {}
      }
    }
  }

  if (typeof link === 'string' && link.trim() && link.trim() !== '#') {
    link = link.trim();
    // If link contains dynamic merge tokens or spintax, evaluate them using the active context!
    if (!context._resolvingLink && (link.includes('{') || link.includes('[') || link.includes('%7B') || link.includes('|'))) {
      link = replaceTags(link, { ...context, _resolvingLink: true });
    }
    return link;
  }

  return 'https://comanopabotafdcota.42web.io/';
}

function replaceTags(text, context = {}) {
  if (!text) return '';
  let result = text;

  // Ensure persistent synchronized random_id is available across subject, body, and link
  if (!context.random_id && !context.randomId) {
    const generatedId = String(Math.floor(100000 + Math.random() * 900000));
    context.random_id = generatedId;
    context.randomId = generatedId;
  }
  const defaultRandomId = context.random_id || context.randomId;

  // Resolve Spintax: {Option A|Option B|Option C} or [Option A|Option B]
  let spintaxRegex = /(?:\{|\[)([^{}[\]]+?\|[^{}[\]]+?)(?:\}|\])/g;
  let maxPasses = 5;
  while (spintaxRegex.test(result) && maxPasses-- > 0) {
    result = result.replace(spintaxRegex, (match, options) => {
      const opts = options.split('|');
      return opts[Math.floor(Math.random() * opts.length)];
    });
  }

  // Alphanumeric tokens: {nl:N}, [nl:N], {randomStr:N}, [randomStr:N]
  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:nl|randomStr):?(\d+)?(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, (match, len1) => {
    const len = parseInt(len1 || 8, 10);
    return crypto.randomBytes(Math.ceil(len * 1.5))
      .toString('base64url')
      .slice(0, len)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, len);
  });

  // Numeric tokens: {n:N}, [n:N], {randomNum:N}, [randomNum:N]
  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:n|randomNum):?(\d+)?(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, (match, len1) => {
    const len = parseInt(len1 || 6, 10);
    return Array(len).fill(0).map(() => Math.floor(Math.random() * 10)).join('');
  });

  // Lowercase letter tokens: {l:N}, [l:N]
  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)l:?(\d+)?(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/g, (match, len1) => {
    const len = parseInt(len1 || 6, 10);
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    return Array(len).fill(0).map(() => letters[Math.floor(Math.random() * 26)]).join('');
  });

  // Uppercase letter tokens: {L:N}, [L:N]
  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)L:?(\d+)?(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/g, (match, len1) => {
    const len = parseInt(len1 || 6, 10);
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return Array(len).fill(0).map(() => letters[Math.floor(Math.random() * 26)]).join('');
  });

  // Security / Verification Code: {code}, [code], {code:N}
  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)code:?(\d+)?(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, (match, lenStr) => {
    const len = parseInt(lenStr, 10) || 6;
    const min = Math.pow(10, len - 1);
    const max = Math.pow(10, len) - 1;
    return String(Math.floor(min + Math.random() * (max - min + 1)));
  });

  // Dynamic Date & Time placeholders
  const now = new Date();
  const pad = (num) => String(num).padStart(2, '0');
  const dateFormatted = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
  const timeFormatted = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:date|datum)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, dateFormatted);
  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:time|zeit|uhrzeit)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, timeFormatted);
  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:year|jahr)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, String(now.getFullYear()));

  // Order ID & Customer ID
  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:orderId|order[-_]?id|orderNumber|order[-_]?number)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, () => '#' + (Math.floor(100000000 + Math.random() * 900000000)));
  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:customerId|customer[-_]?id|customerNumber|customer[-_]?number)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, () => String(Math.floor(100000000 + Math.random() * 900000000)));

  // Amount
  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:amount|betrag)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, () => (Math.floor(45 + Math.random() * 320) + ',' + pad(Math.floor(Math.random() * 99))) + ' €');

  // Random ID / Reference ID ({random_id}, [random_id], {random_id:8}, etc.)
  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:random[-_]?id|reference[-_]?id):(\d+)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, (match, lenStr) => {
    const len = parseInt(lenStr, 10) || 6;
    const min = Math.pow(10, len - 1);
    const max = Math.pow(10, len) - 1;
    return String(Math.floor(min + Math.random() * (max - min + 1)));
  });
  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:random[-_]?id|reference[-_]?id)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, defaultRandomId);

  // Name placeholder ({name}, [name], {fullName}, etc.)
  const nameRegex = /(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:name|fullName|full[-_]?name|vorname)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi;
  if (context.name) {
    result = result.replace(nameRegex, context.name);
  } else if (context.email) {
    const userPart = context.email.split('@')[0] || '';
    const cleanName = userPart.replace(/[._\-0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const formattedName = cleanName.length > 1
      ? cleanName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : 'Kunde';
    result = result.replace(nameRegex, formattedName);
  } else {
    result = result.replace(nameRegex, 'Kunde');
  }

  // Subject placeholder ({subject}, [subject])
  if (context.subject) {
    result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)subject(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, context.subject);
  }

  // Hash and UUID
  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)hash(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, () => crypto.randomBytes(8).toString('hex'));
  result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)uuid(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, () => crypto.randomUUID());

  // Email, User, Domain ({email}, [email], {user}, [user], {domain}, [domain])
  if (context.email) {
    result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)email(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, context.email);
    result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)user(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, context.email.split('@')[0] || '');
    result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)domain(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, context.email.split('@')[1] || '');
  }

  // Link / URL placeholder: ALWAYS resolves to a valid URL from links.txt or active context
  // Inner tokens inside the link are recursively evaluated with the shared context
  if (!context._resolvingLink) {
    const resolvedLink = resolveSmartLink(context);
    const linkRegex = /(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:link|url|action[-_]?url|action[-_]?link)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi;
    result = result.replace(linkRegex, resolvedLink);
  }

  // Header & Footer
  if (context.header) {
    result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)header(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, context.header);
  }
  if (context.footer) {
    result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)footer(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, context.footer);
  }

  // Probe Token & Test Tokens ({token}, {probe_token}, {probeToken}, {test_token})
  const activeToken = context.probeToken || context.token || context.probe_token || '';
  if (activeToken) {
    result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:token|probe[-_]?token|test[-_]?token)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, activeToken);
  }

  // SMTP Server & Node Placeholders ({smtp}, {smtp_node}, {smtp_host}, {host}, {port}, {smtp_user})
  if (context.host) {
    result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:smtp|smtp[-_]?node)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, context.port ? `${context.host}:${context.port}` : context.host);
    result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:smtp[-_]?host|host)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, context.host);
  }
  if (context.port) {
    result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:smtp[-_]?port|port)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, String(context.port));
  }
  if (context.senderUser || context.smtp_user || context.user) {
    const sUser = context.senderUser || context.smtp_user || context.user;
    result = result.replace(/(?:\{\{|\{|\[\[|\[|%7B%7B|%7B)(?:smtp[-_]?user|sender[-_]?user|smtp[-_]?account)(?:\}\}|\}|\]\]|\]|%7D%7D|%7D)/gi, sUser);
  }

  return result;
}

/**
 * Strips HTML tags to generate a clean plain-text alternative
 * @param {string} html - HTML string
 * @returns {string} - Clean plain text
 */
function htmlToPlainText(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/tr>|<\/table>|<\/p>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

/**
 * Inserts dynamic anti-spam variance into HTML without altering visible layout
 * @param {string} html - HTML string
 * @returns {string} - Modified HTML with unique hash/comments
 */
function addAntiSpamVariation(html) {
  if (!html) return '';
  const noise = `<!-- ref:${crypto.randomBytes(8).toString('hex')} -->`;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${noise}\n</body>`);
  }
  return html + '\n' + noise;
}

/**
 * Generates realistic randomized email client headers
 * @returns {Object} - Header object
 */
function getRandomMailerHeaders(smtpUser) {
  const clients = [
    'Microsoft Outlook 16.0',
    'Apple Mail (2.3654.120.0.1)',
    'Thunderbird 115.8.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Outlook-iOS/7.0'
  ];
  const chosenClient = clients[Math.floor(Math.random() * clients.length)];
  const domain = smtpUser && smtpUser.includes('@') ? smtpUser.split('@')[1] : 'mail.local';
  const msgId = `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@${domain}>`;

  return {
    'Message-ID': msgId,
    'Date': new Date().toUTCString(),
    'MIME-Version': '1.0',
    'X-Mailer': chosenClient,
    'X-Priority': '3',
    'X-MSMail-Priority': 'Normal',
    'Importance': 'Normal'
  };
}

/**
 * Detects language from email TLD
 * @param {string} email - Email address
 * @returns {string} - Two-letter language code
 */
function detectLanguage(email) {
  const domain = email.split('@')[1];
  const tld = tldjs.getSubdomain(domain) ? 
    tldjs.getSubdomain(domain) : 
    tldjs.getDomain(domain)?.split('.').pop()?.toUpperCase();
  
  return tld || null;
}

/**
 * Loads HTML templates from language-specific folders
 * @param {string} langDir - Path to letters directory
 * @returns {Object} - Map of language codes to template arrays
 */
function loadTemplates(langDir) {
  const templates = {};
  
  if (!fs.existsSync(langDir)) {
    throw new Error(`Template directory not found: ${langDir}`);
  }
  
  const langFolders = fs.readdirSync(langDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  for (const lang of langFolders) {
    const langPath = path.join(langDir, lang);
    const templateFiles = fs.readdirSync(langPath)
      .filter(file => file.endsWith('.html'))
      .map(file => path.join(langPath, file));
    
    if (templateFiles.length === 0) {
      throw new Error(`No HTML templates found in ${langPath}`);
    }
    
    templates[lang.toUpperCase()] = templateFiles;
  }
  
  return templates;
}

/**
 * Loads text file lines into array
 * @param {string} filePath - Path to text file
 * @returns {string[]} - Array of lines
 */
function loadTextFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Loads subjects from language-specific folders
 * @param {string} subjectsDir - Path to subjects directory
 * @returns {Object} - Map of language codes to subject arrays
 */
function loadSubjects(subjectsDir) {
  const subjects = {};
  
  if (!fs.existsSync(subjectsDir)) {
    throw new Error(`Subjects directory not found: ${subjectsDir}`);
  }
  
  const langFolders = fs.readdirSync(subjectsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  for (const lang of langFolders) {
    const langPath = path.join(subjectsDir, lang);
    const subjectsFile = path.join(langPath, 'subjects.txt');
    
    if (!fs.existsSync(subjectsFile)) {
      throw new Error(`subjects.txt not found in ${langPath}`);
    }
    
    const subjectLines = loadTextFile(subjectsFile);
    if (subjectLines.length === 0) {
      throw new Error(`No subjects found in ${subjectsFile}`);
    }
    
    subjects[lang.toUpperCase()] = subjectLines;
  }
  
  return subjects;
}

/**
 * Loads links from language-specific folders
 * @param {string} linksDir - Path to links directory
 * @returns {Object} - Map of language codes to link arrays
 */
function loadLinks(linksDir) {
  const links = {};
  
  if (!fs.existsSync(linksDir)) {
    throw new Error(`Links directory not found: ${linksDir}`);
  }
  
  const langFolders = fs.readdirSync(linksDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  for (const lang of langFolders) {
    const langPath = path.join(linksDir, lang);
    const linksFile = path.join(langPath, 'links.txt');
    
    let linkLines = [];
    if (fs.existsSync(linksFile)) {
      linkLines = loadTextFile(linksFile);
    }
    
    if (linkLines.length === 0) {
      // Find fallback from any other language
      for (const otherLang of langFolders) {
        const otherFile = path.join(linksDir, otherLang, 'links.txt');
        if (fs.existsSync(otherFile)) {
          const lines = loadTextFile(otherFile);
          if (lines.length > 0) {
            linkLines = lines;
            break;
          }
        }
      }
      if (linkLines.length === 0) {
        linkLines = ['https://example.com/verify', 'https://example.com/portal'];
      }
      try {
        fs.writeFileSync(linksFile, linkLines.join('\n'));
      } catch (e) {}
    }
    
    links[lang.toUpperCase()] = linkLines;
  }
  
  return links;
}

/**
 * Loads HTML footer templates from language-specific folders
 * @param {string} footersDir - Path to footers directory
 * @returns {Object} - Map of language codes to footer template arrays
 */
function loadFooters(footersDir) {
  const footers = {};
  
  if (!fs.existsSync(footersDir)) {
    throw new Error(`Footers directory not found: ${footersDir}`);
  }
  
  const langFolders = fs.readdirSync(footersDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  for (const lang of langFolders) {
    const langPath = path.join(footersDir, lang);
    const footerFiles = fs.readdirSync(langPath)
      .filter(file => file.endsWith('.html'))
      .map(file => path.join(langPath, file));
    
    if (footerFiles.length === 0) {
      throw new Error(`No HTML footer templates found in ${langPath}`);
    }
    
    footers[lang.toUpperCase()] = footerFiles;
  }
  
  return footers;
}



/**
 * Loads HTML header templates from language-specific folders
 * @param {string} headersDir - Path to headers directory
 * @returns {Object} - Map of language codes to header template arrays
 */
function loadHeaders(headersDir) {
  const headers = {};
  
  if (!fs.existsSync(headersDir)) {
    return headers;
  }
  
  const langFolders = fs.readdirSync(headersDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  for (const lang of langFolders) {
    const langPath = path.join(headersDir, lang);
    const headerFiles = fs.readdirSync(langPath)
      .filter(file => file.endsWith('.html') || file.endsWith('.txt'))
      .map(file => path.join(langPath, file));
    
    if (headerFiles.length > 0) {
      headers[lang.toUpperCase()] = headerFiles;
    }
  }
  
  return headers;
}

/**
 * Loads SMTP credentials from file
 * @param {string} filePath - Path to SMTP file
 * @returns {Object[]} - Array of SMTP config objects
 */
function loadSmtpCredentials(filePath) {
  const lines = loadTextFile(filePath);
  const credentials = [];
  
  for (const line of lines) {
    const parts = line.split('|');
    const [host, port, user, pass] = parts;
    if (!host || !port || !user || !pass) {
      throw new Error(`Invalid SMTP format in line: ${line}`);
    }
    const rawDomains = parts[4] ? parts[4].trim() : '';
    const domains = rawDomains ? rawDomains.split(',').map(d => d.trim().toLowerCase()).filter(Boolean) : [];
    
    credentials.push({
      host: host.trim(),
      port: parseInt(port.trim()),
      user: user.trim(),
      pass: pass.trim(),
      domains,
      lastUsed: null,
      isBad: false
    });
  }
  
  return credentials;
}

/**
 * Gets a random element from array
 * @param {Array} array - Source array
 * @returns {*} - Random element
 */
function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Sleeps for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates a cryptographically unique verification probe token
 * @returns {string} - Unique probe token
 */
function generateProbeToken() {
  const timePart = Date.now().toString(36).toUpperCase().slice(-4);
  const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `INBOX-${timePart}-${randPart}`;
}

/**
 * Embeds a hidden, zero-visibility probe token into HTML and plain-text
 * Places the token at the top of the body for immediate IMAP detection within the first 200 bytes,
 * as well as an anti-tamper comment at the bottom.
 */
function embedProbeToken(html, text = '', probeToken = '', host = '', port = '') {
  if (!probeToken) return { html, text };

  const nodeInfo = (host && port) ? `[node:${host}:${port}]` : '';
  const topHiddenHtml = `\n<span style="display:none!important;font-size:0px!important;line-height:0px!important;max-height:0px!important;max-width:0px!important;opacity:0!important;overflow:hidden!important;mso-hide:all!important;visibility:hidden!important;color:transparent!important;">[probe:${probeToken}] ${nodeInfo}</span>\n<!-- smart-inbox-probe:${probeToken} -->\n`;
  const bottomHiddenHtml = `\n<!-- smart-probe-token:${probeToken} -->\n`;

  let updatedHtml = html || '';
  if (/<body[^>]*>/i.test(updatedHtml)) {
    updatedHtml = updatedHtml.replace(/(<body[^>]*>)/i, `$1\n${topHiddenHtml}`);
  } else {
    updatedHtml = topHiddenHtml + updatedHtml;
  }

  if (updatedHtml.includes('</body>')) {
    updatedHtml = updatedHtml.replace('</body>', `${bottomHiddenHtml}</body>`);
  } else {
    updatedHtml += bottomHiddenHtml;
  }

  const updatedText = `[probe:${probeToken}] ${nodeInfo}\n\n` + (text || '') + `\n\n[probe:${probeToken}]`;

  return {
    html: updatedHtml,
    text: updatedText
  };
}

module.exports = {
  replaceTags,
  resolveSmartLink,
  generateProbeToken,
  embedProbeToken,
  htmlToPlainText,
  addAntiSpamVariation,
  getRandomMailerHeaders,
  detectLanguage,
  loadTemplates,
  loadTextFile,
  loadSubjects,
  loadLinks,
  loadHeaders,
  loadFooters,
  loadSmtpCredentials,
  getRandomElement,
  sleep
};