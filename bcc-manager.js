const fs = require('fs');
const path = require('path');

const EMAILS_PATH = path.join(__dirname, 'emails.txt');

/**
 * BCC Email Manager Utility
 * Manages emails.txt file for BCC functionality
 */

/**
 * Parse email addresses with optional display names
 * Supports formats: "email@domain.com" or "Display Name <email@domain.com>"
 * @param {string} line - Line from emails.txt
 * @returns {string|null} - Formatted email address
 */
function parseEmailWithDisplayName(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  
  // Check for "Display Name <email@domain.com>" format
  const match = trimmed.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    const displayName = match[1].trim();
    const email = match[2].trim();
    return `"${displayName}" <${email}>`;
  }
  
  // Simple email format
  if (trimmed.includes('@')) {
    return trimmed;
  }
  
  return null;
}

/**
 * Load all emails from emails.txt
 * @returns {string[]} Array of formatted email addresses
 */
function loadEmails() {
  try {
    if (!fs.existsSync(EMAILS_PATH)) {
      return [];
    }
    
    const content = fs.readFileSync(EMAILS_PATH, 'utf8');
    const lines = content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    
    return lines
      .map(parseEmailWithDisplayName)
      .filter(email => email !== null);
  } catch (error) {
    console.error('Error loading emails:', error.message);
    return [];
  }
}

/**
 * Save emails to emails.txt
 * @param {string[]} emails - Array of email addresses
 */
function saveEmails(emails) {
  try {
    const uniqueEmails = [...new Set(emails.filter(email => email && email.trim()))];
    fs.writeFileSync(EMAILS_PATH, uniqueEmails.join('\n') + '\n');
    console.log(`Saved ${uniqueEmails.length} emails to emails.txt`);
    return true;
  } catch (error) {
    console.error('Error saving emails:', error.message);
    return false;
  }
}

/**
 * Add emails to emails.txt
 * @param {string[]} emails - Array of email addresses to add
 */
function addEmails(emails) {
  const currentEmails = loadEmails();
  const newEmails = Array.isArray(emails) ? emails : [emails];
  const updatedEmails = [...new Set([...currentEmails, ...newEmails])];
  
  if (saveEmails(updatedEmails)) {
    console.log(`Added ${newEmails.length} new email(s). Total: ${updatedEmails.length}`);
  }
}

/**
 * Remove emails from emails.txt
 * @param {string[]} emails - Array of email addresses to remove
 */
function removeEmails(emails) {
  const currentEmails = loadEmails();
  const emailsToRemove = Array.isArray(emails) ? emails : [emails];
  
  const updatedEmails = currentEmails.filter(email => {
    const emailAddress = email.includes('<') ? email.match(/<(.+?)>/)[1] : email;
    return !emailsToRemove.some(removeEmail => {
      const removeAddress = removeEmail.includes('<') ? removeEmail.match(/<(.+?)>/)[1] : removeEmail;
      return emailAddress === removeAddress;
    });
  });
  
  if (saveEmails(updatedEmails)) {
    const removedCount = currentEmails.length - updatedEmails.length;
    console.log(`Removed ${removedCount} email(s). Remaining: ${updatedEmails.length}`);
  }
}

/**
 * Clear all emails from emails.txt
 */
function clearEmails() {
  if (saveEmails([])) {
    console.log('All emails cleared from emails.txt');
  }
}

/**
 * List all emails in emails.txt
 */
function listEmails() {
  const emails = loadEmails();
  if (emails.length === 0) {
    console.log('No emails found in emails.txt');
    return;
  }
  
  console.log(`\nEmails in emails.txt (${emails.length}):`);
  emails.forEach((email, index) => {
    console.log(`  ${index + 1}. ${email}`);
  });
}

/**
 * Show usage instructions
 */
function showUsage() {
  console.log(`
BCC Email Manager - emails.txt Utility

Usage: node bcc-manager.js [command] [options]

Commands:
  add <email> [...emails]     Add email(s) to emails.txt
  remove <email> [...emails]  Remove email(s) from emails.txt
  list                        Show all emails in emails.txt
  clear                       Clear all emails from emails.txt
  validate                    Validate email format in emails.txt

Examples:
  node bcc-manager.js add user@example.com "Marketing Team" <marketing@company.com>
  node bcc-manager.js remove user@example.com
  node bcc-manager.js list
  node bcc-manager.js clear
  `);
}

/**
 * Validate email formats in emails.txt
 */
function validateEmails() {
  try {
    if (!fs.existsSync(EMAILS_PATH)) {
      console.log('emails.txt does not exist');
      return;
    }
    
    const content = fs.readFileSync(EMAILS_PATH, 'utf8');
    const lines = content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    
    console.log('\nEmail validation results:');
    lines.forEach((line, index) => {
      const parsed = parseEmailWithDisplayName(line);
      const status = parsed ? '✓ Valid' : '✗ Invalid';
      console.log(`  ${index + 1}. ${line} - ${status}`);
    });
  } catch (error) {
    console.error('Error validating emails:', error.message);
  }
}

// Export functions for use in other modules
module.exports = {
  loadEmails,
  saveEmails,
  addEmails,
  removeEmails,
  clearEmails,
  listEmails,
  validateEmails
};

// CLI handling - only run when this file is executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help') {
    showUsage();
    process.exit(0);
  }

  switch (command.toLowerCase()) {
    case 'add':
      if (args.length < 2) {
        console.error('Please provide email addresses to add');
        process.exit(1);
      }
      addEmails(args.slice(1));
      break;
      
    case 'remove':
      if (args.length < 2) {
        console.error('Please provide email addresses to remove');
        process.exit(1);
      }
      removeEmails(args.slice(1));
      break;
      
    case 'list':
      listEmails();
      break;
      
    case 'clear':
      clearEmails();
      break;
      
    case 'validate':
      validateEmails();
      break;
      
    default:
      console.error(`Unknown command: ${command}`);
      showUsage();
      process.exit(1);
  }
}