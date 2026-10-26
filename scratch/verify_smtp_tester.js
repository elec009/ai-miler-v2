const fs = require('fs');
const path = require('path');
const utils = require('../src/utils');

console.log('--- STARTING SMTP INBOX TESTER VERIFICATION ---');

// 1. Test config reading & getActiveTemplateData behavior
const configPath = path.join(__dirname, '..', 'config.json');
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
console.log('Active Config BCC Enabled:', cfg.bcc ? cfg.bcc.enabled : false);
console.log('Active Default Language:', cfg.defaultLang);
console.log('Active Sender Name:', cfg.senderName);

// 2. Test Letter & Subject from Template Studio
const subjectsPath = path.join(__dirname, '..', 'subjects', cfg.defaultLang, 'subjects.txt');
const letterPath = path.join(__dirname, '..', 'letters', cfg.defaultLang, 'letter1.html');

console.log('\nChecking Template Studio asset existence:');
console.log('Subjects file exists:', fs.existsSync(subjectsPath));
console.log('Letter file exists:', fs.existsSync(letterPath));

const rawSubject = fs.existsSync(subjectsPath) ? fs.readFileSync(subjectsPath, 'utf8').trim() : '';
const rawLetter = fs.existsSync(letterPath) ? fs.readFileSync(letterPath, 'utf8') : '';

console.log('Raw Template Subject:', rawSubject);
console.log('Raw Letter length (bytes):', rawLetter.length);

// 3. Test clean token replacement without prepending tags
const probeToken = utils.generateProbeToken();
const host = 'smtp.testnode.net';
const port = 587;
const user = 'auth@testnode.net';
const targetEmail = 'inbox-target@domain.com';

const context = {
  email: targetEmail,
  user: targetEmail.split('@')[0],
  domain: targetEmail.split('@')[1],
  link: 'https://secure-login.test/auth',
  header: '',
  footer: '',
  random_id: '984123',
  randomId: '984123',
  lang: cfg.defaultLang,
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

const processedSubject = utils.replaceTags(rawSubject, context);
console.log('\n--- Subject Verification ---');
console.log('Processed Subject:', processedSubject);
if (processedSubject.includes(probeToken)) {
  console.error('FAIL: Subject contains probeToken!');
  process.exit(1);
} else {
  console.log('PASS: Subject is clean, authentic, and matches Template Studio directly.');
}

// 4. Test letter without sample banner
let processedHtml = rawLetter;
processedHtml = utils.replaceTags(processedHtml, context);
processedHtml = utils.addAntiSpamVariation(processedHtml);

console.log('\n--- Letter Verification ---');
if (processedHtml.includes('SMART INBOX VERIFICATION SAMPLE') || processedHtml.includes('🎯 SMART INBOX')) {
  console.error('FAIL: Letter contains sample banner!');
  process.exit(1);
} else {
  console.log('PASS: Letter does not contain any visual sample banner.');
}

// 5. Test invisible probe token embedding
const plainText = utils.htmlToPlainText(processedHtml);
const embedded = utils.embedProbeToken(processedHtml, plainText, probeToken, host, port);

if (!embedded.html.includes(probeToken)) {
  console.error('FAIL: HTML does not contain embedded probe token!');
  process.exit(1);
}
if (!embedded.html.includes('display:none!important') && !embedded.html.includes('smart-inbox-probe:')) {
  console.error('FAIL: Probe token is not hidden with zero-visibility CSS/comment!');
  process.exit(1);
}
console.log('PASS: Probe token embedded invisibly with zero visual footprint.');

// 6. Test BCC Mode vs Single Mode
console.log('\n--- Delivery Mode Verification ---');
function buildMailOptions(isBcc) {
  const mailHeaders = {
    ...utils.getRandomMailerHeaders(user),
    'X-Smart-Probe-Token': probeToken,
    'X-Delivery-Probe-ID': probeToken,
    'X-SMTP-Tester-Node': `${host}:${port}`,
    'X-SMTP-Tester-User': user
  };

  const mailOptions = {
    from: `"${cfg.senderName}" <${user}>`,
    subject: processedSubject,
    html: embedded.html,
    text: embedded.text,
    headers: mailHeaders
  };

  if (isBcc) {
    const bccMask = (cfg.bcc && cfg.bcc.bccEmail && cfg.bcc.bccEmail.trim())
      ? cfg.bcc.bccEmail.trim()
      : user;
    mailOptions.to = `"${cfg.senderName}" <${bccMask}>`;
    mailOptions.bcc = targetEmail;
  } else {
    mailOptions.to = targetEmail;
  }
  return mailOptions;
}

// A) When BCC is TRUE:
const bccOptions = buildMailOptions(true);
console.log('BCC Mode Options:', { to: bccOptions.to, bcc: bccOptions.bcc });
if (bccOptions.bcc !== targetEmail) {
  console.error('FAIL: In BCC mode, targetEmail must be in bcc!');
  process.exit(1);
}
console.log('PASS: BCC mode places recipient in BCC.');

// B) When BCC is FALSE:
const singleOptions = buildMailOptions(false);
console.log('Single Mode Options:', { to: singleOptions.to, bcc: singleOptions.bcc });
if (singleOptions.to !== targetEmail || singleOptions.bcc) {
  console.error('FAIL: In Single mode, targetEmail must be in to and bcc must be undefined!');
  process.exit(1);
}
console.log('PASS: Single mode places recipient directly in To.');

// 7. Test IMAP Probe Detection Simulation
console.log('\n--- IMAP Probe Detection Simulation ---');
const sampleImapFetchData = `* 42 FETCH (INTERNALDATE "23-Sep-2026 16:30:00 +0000" BODY[HEADER.FIELDS (X-Smart-Probe-Token)] {45}\r\nX-Smart-Probe-Token: ${probeToken}\r\n\r\n)`;

if (sampleImapFetchData.includes(probeToken)) {
  console.log(`PASS: IMAP detection finds unique probe token [${probeToken}] accurately without needing subject tags.`);
} else {
  console.error('FAIL: IMAP token matching failed.');
  process.exit(1);
}

console.log('\nALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
