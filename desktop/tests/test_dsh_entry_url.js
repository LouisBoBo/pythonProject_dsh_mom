const assert = require('assert')
const {
  extractDshTokenUrl,
  entryUrlHasToken,
  isSafeDshEntryUrl,
  redactHostSecrets,
} = require('../lib/dsh-entry-url')

const tokenUrl = 'http://127.0.0.1:13080/?token=abc123'
assert.strictEqual(
  extractDshTokenUrl('noise\ndsh web: ' + tokenUrl + '\n'),
  tokenUrl
)
assert.strictEqual(extractDshTokenUrl('dsh web: http://127.0.0.1:13080/'), '')
assert.strictEqual(extractDshTokenUrl('dsh web: http://evil.example/?token=abc'), '')
assert.strictEqual(extractDshTokenUrl('dsh web: http://127.0.0.1:13080/?token='), '')
assert.strictEqual(extractDshTokenUrl(''), '')
assert.strictEqual(entryUrlHasToken(tokenUrl), true)
assert.strictEqual(entryUrlHasToken('http://127.0.0.1:3081/'), false)
assert.strictEqual(entryUrlHasToken('http://127.0.0.1:3081/?token='), false)
assert.strictEqual(isSafeDshEntryUrl(tokenUrl), true)
assert.strictEqual(isSafeDshEntryUrl('http://localhost:13080/?token=x'), true)
assert.strictEqual(isSafeDshEntryUrl('http://evil.example/?token=x'), false)
assert.strictEqual(isSafeDshEntryUrl('http://127.0.0.1:13080/?token='), false)
assert.strictEqual(isSafeDshEntryUrl('file:///tmp/x?token=x'), false)
const red = redactHostSecrets('fail\ndsh web: ' + tokenUrl + '\nok')
assert.ok(!/abc123/.test(red), red)
assert.ok(/token=\*\*\*/.test(redactHostSecrets('u=?token=secret&x=1')), 'param redact')
console.log('ok')
