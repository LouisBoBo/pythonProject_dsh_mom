'use strict'

const assert = require('assert')
const { hideWin } = require('../lib/win-hide')

assert.strictEqual(hideWin().windowsHide, true)
assert.strictEqual(hideWin({ timeout: 3 }).timeout, 3)
assert.strictEqual(hideWin({ windowsHide: false }).windowsHide, true)

const remapped = hideWin({ stdio: 'inherit', cwd: 'x' })
assert.deepStrictEqual(remapped.stdio, ['ignore', 'pipe', 'pipe'])
assert.strictEqual(remapped.cwd, 'x')
assert.strictEqual(remapped.maxBuffer, 16 * 1024 * 1024)

const kept = hideWin({ stdio: ['ignore', 'pipe', 'ignore'] })
assert.deepStrictEqual(kept.stdio, ['ignore', 'pipe', 'ignore'])
assert.strictEqual(kept.maxBuffer, 16 * 1024 * 1024)

const explicit = hideWin({ stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 99 })
assert.strictEqual(explicit.maxBuffer, 99)

console.log('ok: hideWin')
