'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { cleanStalePackageDirs } = require('../lib/offline-plugin-update')

const td = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-offline-upd-'))
const scope = path.join(td, 'node_modules', '@zhongruan')
fs.mkdirSync(scope, { recursive: true })
fs.mkdirSync(path.join(scope, 'dsh-cursor-chat'), { recursive: true })
fs.mkdirSync(path.join(scope, 'dsh-cursor-chat_tmp_14184_1'), { recursive: true })
fs.writeFileSync(path.join(scope, 'dsh-cursor-chat_tmp_14184_1', 'x'), '1')
fs.mkdirSync(path.join(scope, 'dsh-cursor-chat.bak-copy'), { recursive: true })

const removed = cleanStalePackageDirs(td, '@zhongruan/dsh-cursor-chat')
assert.ok(removed.some((p) => p.includes('_tmp_')))
assert.ok(fs.existsSync(path.join(scope, 'dsh-cursor-chat')))
assert.ok(!fs.existsSync(path.join(scope, 'dsh-cursor-chat_tmp_14184_1')))
assert.ok(!fs.existsSync(path.join(scope, 'dsh-cursor-chat.bak-copy')))

console.log('ok: offline-plugin-update')
