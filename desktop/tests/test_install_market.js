'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { installMarketIntoProfile, marketReady, undiciMajor } = require('../lib/install-market')

const td = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-market-'))
const srcNm = path.join(td, 'market', 'node_modules')
const profile = path.join(td, 'profile')
fs.mkdirSync(path.join(srcNm, 'dshmarket', 'client'), { recursive: true })
fs.mkdirSync(path.join(srcNm, 'undici'), { recursive: true })
fs.writeFileSync(
  path.join(srcNm, 'dshmarket', 'package.json'),
  JSON.stringify({ name: 'dshmarket', version: '1.66.38', dependencies: { undici: '^7.29.1' } })
)
fs.writeFileSync(path.join(srcNm, 'dshmarket', 'client', 'client.js'), 'export {}\n')
fs.writeFileSync(path.join(srcNm, 'undici', 'package.json'), JSON.stringify({ name: 'undici', version: '7.30.1' }))
fs.writeFileSync(path.join(srcNm, 'undici', 'index.js'), 'module.exports={}\n')

// 旧 profile：undici@5 已存在，且曾写过同版本 marker → 以前会跳过，宿主起不来
fs.mkdirSync(path.join(profile, 'node_modules', 'dshmarket', 'client'), { recursive: true })
fs.mkdirSync(path.join(profile, 'node_modules', 'undici'), { recursive: true })
fs.writeFileSync(
  path.join(profile, 'node_modules', 'dshmarket', 'package.json'),
  JSON.stringify({ name: 'dshmarket', version: '1.66.38' })
)
fs.writeFileSync(path.join(profile, 'node_modules', 'dshmarket', 'client', 'client.js'), 'export {}\n')
fs.writeFileSync(
  path.join(profile, 'node_modules', 'undici', 'package.json'),
  JSON.stringify({ name: 'undici', version: '5.28.4' })
)
fs.writeFileSync(path.join(profile, '.workbuddy-market'), '1.66.38')

assert.strictEqual(undiciMajor(path.join(profile, 'node_modules')), 5)
assert.strictEqual(marketReady(profile, '1.66.38'), false)

const first = installMarketIntoProfile(srcNm, profile)
assert.strictEqual(first.installed, true)
assert.strictEqual(undiciMajor(path.join(profile, 'node_modules')), 7)
assert.strictEqual(
  JSON.parse(fs.readFileSync(path.join(profile, 'node_modules', 'undici', 'package.json'), 'utf8')).version,
  '7.30.1'
)
assert.strictEqual(marketReady(profile, '1.66.38'), true)

const second = installMarketIntoProfile(srcNm, profile)
assert.strictEqual(second.installed, false)
assert.strictEqual(second.reason, 'already-ready')

console.log('ok: install-market')
