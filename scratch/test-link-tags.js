const utils = require('../src/utils');

// Test 1: Direct link resolution from links/DE/links.txt (which contains https://comanopabotafdcota.42web.io?uid={{random_id}})
const ctx1 = { email: 'kunde@example.de' };
const resolvedFromDisk = utils.resolveSmartLink(ctx1);
console.log('1. Read from links.txt (with {{random_id}}):', resolvedFromDisk);

// Test 2: Custom link with multiple tokens passed in context
const ctx2 = {
  email: 'johndoe@test.com',
  link: 'https://comanopabotafdcota.42web.io?uid={{random_id}}&e={email}&u={user}&tok={nl:8}&code={code}'
};

const template = 'Hallo {name},\nBesuchen Sie: {link}\nIhre Referenz: #{random_id} | Code: {code}';
const letterRendered = utils.replaceTags(template, ctx2);
console.log('\n2. Letter Rendered:\n' + letterRendered);

// Test 3: Subject with random_id and link
const subject = 'Wichtige Information zu Ihrer Rückerstattung #{random_id} - {link}';
const subjectRendered = utils.replaceTags(subject, ctx2);
console.log('\n3. Subject Rendered:\n' + subjectRendered);

// Test 4: Verify consistent random_id between subject, letter, and link
const extractUid = (str) => {
  const match = str.match(/uid=(\d+)/);
  return match ? match[1] : null;
};
const extractRef = (str) => {
  const match = str.match(/Referenz: #(\d+)/);
  return match ? match[1] : null;
};

const linkUid = extractUid(letterRendered);
const letterRef = extractRef(letterRendered);
console.log('\nConsistency Check:');
console.log('Link UID in letter:', linkUid);
console.log('Letter Reference ID:', letterRef);
if (linkUid && linkUid === letterRef) {
  console.log('✅ SUCCESS: Link UID and Letter Reference ID are synchronized perfectly!');
} else {
  console.log('❌ MISMATCH between link and letter reference');
}
