'use strict'

const assert = require('assert')
const { canSkipBootDeps } = require('../lib/boot-deps-stamp')

assert.strictEqual(canSkipBootDeps('a\n---\nb', 'a\n---\nb'), true)
assert.strictEqual(canSkipBootDeps('a\r\n---\r\nb\r\n', 'a\n---\nb'), true)
assert.strictEqual(canSkipBootDeps('a\n---\nb', 'a\n---\nc'), false)
assert.strictEqual(canSkipBootDeps('', 'a'), false)
assert.strictEqual(canSkipBootDeps('a', ''), false)

console.log('ok: boot-deps-stamp')
