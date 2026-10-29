'use strict'

const assert = require('assert')
const { spawnSync } = require('child_process')
const { assignPath } = require('../lib/win-path')

const env = { Path: 'C:\\already', CI: '1' }
assignPath(env, ['C:\\node-bin'])
assert.strictEqual(Object.keys(env).filter((k) => k.toLowerCase() === 'path').length, 1)
assert.strictEqual(Object.keys(env).includes('PATH'), true)
assert.ok(env.PATH.split(';')[0].toLowerCase() === 'c:\\node-bin' || env.PATH.includes('node-bin'))
assert.ok(env.PATH.toLowerCase().includes('c:\\already'))
assert.strictEqual(env.CI, '1')

if (process.platform === 'win32') {
  const system = process.env.Path || process.env.PATH || ''
  const broken = {
    Path: system,
    PATH: 'C:\\no-such-dir',
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    SystemRoot: process.env.SystemRoot || 'C:\\Windows',
  }
  const bad = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'exit 7'], {
    env: broken,
    windowsHide: true,
  })
  assert.strictEqual(bad.error && bad.error.code, 'ENOENT')

  const fixed = {
    Path: system,
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    SystemRoot: process.env.SystemRoot || 'C:\\Windows',
  }
  assignPath(fixed, ['C:\\no-such-dir'])
  assert.strictEqual('Path' in fixed, false)
  assert.ok(fixed.PATH.toLowerCase().includes('windowspowershell'))
  const good = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'exit 7'], {
    env: fixed,
    windowsHide: true,
  })
  assert.strictEqual(good.status, 7, good.error && good.error.message)
}

console.log('ok: assignPath')
