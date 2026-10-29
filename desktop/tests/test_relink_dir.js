'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { relinkDirToHost, linkHostClosure, isBusyErr, moveAsideOrRemove } = require('../lib/relink-dir')

assert.ok(isBusyErr(Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' })))
assert.ok(!isBusyErr(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })))

const td = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-relink-'))
const host = path.join(td, 'host', 'dsh-tools')
const copy = path.join(td, 'bridge', 'dsh-tools')
fs.mkdirSync(host, { recursive: true })
fs.mkdirSync(copy, { recursive: true })
fs.writeFileSync(path.join(host, 'package.json'), '{"name":"host"}\n')
fs.writeFileSync(path.join(copy, 'package.json'), '{"name":"copy"}\n')
fs.writeFileSync(path.join(copy, 'marker.txt'), 'copy')

const first = relinkDirToHost(copy, host)
assert.ok(!first.skipped)
assert.strictEqual(fs.realpathSync(copy), fs.realpathSync(host))

const second = relinkDirToHost(copy, host)
assert.ok(second.skipped)

// moveAside on a fresh tree
const other = path.join(td, 'other')
fs.mkdirSync(other, { recursive: true })
fs.writeFileSync(path.join(other, 'a.txt'), 'x')
const moved = moveAsideOrRemove(other, { retries: 3, delayMs: 20 })
assert.ok(moved.method === 'rename' || moved.method === 'rm' || moved.method === 'rd')
assert.ok(!fs.existsSync(other))

const closureHost = path.join(td, 'nested')
const closureApp = path.join(td, 'app')
fs.mkdirSync(path.join(closureHost, '@deepseek-ai', 'dsh'), { recursive: true })
fs.mkdirSync(path.join(closureHost, 'cordis'), { recursive: true })
fs.writeFileSync(path.join(closureHost, '@deepseek-ai', 'dsh', 'package.json'), '{}\n')
fs.writeFileSync(path.join(closureHost, 'cordis', 'package.json'), '{}\n')
const firstLink = linkHostClosure(closureApp, closureHost)
assert.strictEqual(firstLink.linked, 2)
assert.strictEqual(firstLink.copied, 0)
assert.strictEqual(
  fs.readFileSync(path.join(closureApp, 'node_modules', 'cordis', 'package.json'), 'utf8'),
  '{}\n'
)
const secondLink = linkHostClosure(closureApp, closureHost)
assert.strictEqual(secondLink.skipped, 2)
assert.strictEqual(secondLink.linked, 0)

console.log('ok: relink-dir')
