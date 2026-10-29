'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { planExpand, expandPackagedRuntime, tarBin } = require('../lib/expand-pack')

const root = path.join(os.tmpdir(), 'wb-plan')
const exists = new Set([
  path.join(root, 'runtime', 'python.zip'),
  path.join(root, 'host', 'node_modules.zip'),
  path.join(root, 'runtime', 'python', 'python.exe'),
])
const plan = planExpand(root, (p) => exists.has(p))
assert.deepStrictEqual(plan.ready, ['python'])
assert.strictEqual(plan.expand.length, 1)
assert.strictEqual(plan.expand[0].id, 'host')

if (process.platform === 'win32' && fs.existsSync(tarBin())) {
  const td = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-expand-'))
  const resources = path.join(td, 'resources')
  const src = path.join(td, 'src')
  fs.mkdirSync(path.join(src, 'Lib'), { recursive: true })
  fs.writeFileSync(path.join(src, 'python.exe'), 'py')
  fs.mkdirSync(path.join(resources, 'runtime'), { recursive: true })
  const zip = path.join(resources, 'runtime', 'python.zip')
  const { execFileSync } = require('child_process')
  execFileSync(tarBin(), ['-a', '-cf', zip, '-C', src, 'python.exe', 'Lib'], { windowsHide: true })
  const expanded = expandPackagedRuntime(resources)
  assert.deepStrictEqual(expanded, ['python'])
  assert.strictEqual(fs.readFileSync(path.join(resources, 'runtime', 'python', 'python.exe'), 'utf8'), 'py')
  assert.ok(!fs.existsSync(zip))
  assert.deepStrictEqual(expandPackagedRuntime(resources), [])
}

console.log('ok: expand-pack')
