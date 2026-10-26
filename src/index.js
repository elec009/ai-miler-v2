const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const logger = require('./logger');
const utils = require('./utils');
const Mailer = require('./mailer');

const program = new Command();

program
  .name('ai-mailer')
  .description('Production-ready Node.js mailer with SMTP rotation and template localization')
  .version('1.0.0')
  .option('-c, --config <path>', 'Path to config file', 'config.json')
  .option('-t, --test-email <email>', 'Email address to receive periodic test emails')
  .option('-p, --test-password <password>', 'Password of test email for live IMAP inbox verification')
  .option('-i, --test-interval <number>', 'Interval (every N emails) to send test email')
  .option('--smart-inbox-guard', 'Enable live IMAP inbox verification and spam-dropper auto-filtering')
  .option('--no-interactive', 'Skip interactive prompt for test email')
  .option('--dry-run', 'Only log actions without sending emails')
  .parse();

const options = program.opts();

async function promptTestEmail(config, cliOptions) {
  // Merge CLI and config values with CLI taking precedence
  const cliEmail = cliOptions.testEmail ? String(cliOptions.testEmail).trim() : '';
  const cfgEmail = config.testEmail ? (typeof config.testEmail === 'string' ? config.testEmail : config.testEmail.email) : '';
  const email = (cliEmail || cfgEmail || '').trim();

  const cliPass = cliOptions.testPassword ? String(cliOptions.testPassword).trim() : '';
  const cfgPass = (config.testEmail && typeof config.testEmail === 'object') ? (config.testEmail.password || '') : '';
  const password = (cliPass || cfgPass || '').trim();

  const cliInterval = parseInt(cliOptions.testInterval, 10);
  const cfgInterval = (config.testEmail && typeof config.testEmail === 'object') ? parseInt(config.testEmail.interval, 10) : parseInt(config.testInterval, 10);
  const interval = !isNaN(cliInterval) && cliInterval > 0 ? cliInterval : (!isNaN(cfgInterval) && cfgInterval > 0 ? cfgInterval : 20);

  // If a password is provided or smartInboxGuard is passed, automatically activate smartInboxFilter
  const smartInboxFilter = Boolean(cliOptions.smartInboxGuard || (config.testEmail && typeof config.testEmail === 'object' && config.testEmail.smartInboxFilter) || password);

  if (email && email.includes('@')) {
    return {
      email,
      password,
      interval,
      smartInboxFilter: Boolean(smartInboxFilter && password)
    };
  }

  if (cliOptions.interactive === false) {
    return null;
  }

  if (process.stdin.isTTY) {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const ask = (query) => new Promise(resolve => readline.question(query, resolve));

    try {
      const emailInput = await ask('\x1b[36m[?] Enter test email address (or press Enter to skip):\x1b[0m ');
      if (emailInput && emailInput.trim().includes('@')) {
        const defaultInterval = parseInt(config.testInterval, 10) || (config.testEmail && config.testEmail.interval ? parseInt(config.testEmail.interval, 10) : 100);
        const intervalInput = await ask(`\x1b[36m[?] Send test email every N emails (default: ${defaultInterval}, or press Enter):\x1b[0m `);
        readline.close();
        const interval = parseInt(intervalInput, 10) || defaultInterval;
        return {
          email: emailInput.trim(),
          interval: interval > 0 ? interval : defaultInterval
        };
      }
      readline.close();
    } catch (e) {
      readline.close();
    }
  }

  return null;
}

async function main() {
  try {
    // Load configuration
    const configPath = path.resolve(options.config);
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    logger.level = config.logLevel || 'info';

    // Interactive or CLI test email configuration
    const testConfig = await promptTestEmail(config, options);
    if (testConfig && testConfig.email) {
      config.testEmail = testConfig;
    }
    
    // Load data files
    const smtpCredentials = utils.loadSmtpCredentials('smtp.txt');
    const emails = utils.loadTextFile('emails.txt');
    const subjects = utils.loadSubjects('subjects');
    const templates = utils.loadTemplates('letters');
    const links = utils.loadLinks('langs');
    const headers = utils.loadHeaders('headers');
    const footers = utils.loadFooters('footers');
    
    // Validate required data
    if (smtpCredentials.length === 0) {
      throw new Error('No SMTP credentials found in smtp.txt');
    }
    
    if (emails.length === 0) {
      throw new Error('No email addresses found in emails.txt');
    }
    
    if (Object.keys(subjects).length === 0) {
      throw new Error('No subjects found in subjects directory');
    }
    
    if (Object.keys(links).length === 0) {
      throw new Error('No links found in langs directory');
    }
    
    if (Object.keys(footers).length === 0) {
      throw new Error('No footers found in footers directory');
    }
    
    if (Object.keys(templates).length === 0) {
      throw new Error('No templates found in letters directory');
    }
    
    // Create mailer instance
    const mailer = new Mailer(config, smtpCredentials, templates, subjects, links, footers, headers);
    
    logger.info('Configuration loaded successfully', {
      smtpServers: smtpCredentials.length,
      emails: emails.length,
      subjects: Object.keys(subjects).length,
      headers: Object.keys(headers).length,
      footers: Object.keys(footers).length,
      languages: Object.keys(templates),
      testEmail: config.testEmail ? `${config.testEmail.email} (every ${config.testEmail.interval} emails)` : 'none'
    });
    

    

    
    // Handle graceful shutdown
    const shutdownHandler = async (signal) => {
      logger.info(`Received ${signal}, initiating graceful shutdown`);
      await mailer.shutdown();
      process.exit(0);
    };
    
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      mailer.shutdown().then(() => process.exit(1));
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      mailer.shutdown().then(() => process.exit(1));
    });
    
    // Start mailer
    await mailer.start(emails, options.dryRun);
    
  } catch (error) {
    logger.error('Fatal error', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Run the application
main().catch(error => {
  logger.error('Application error', { error: error.message, stack: error.stack });
  process.exit(1);
});