'use strict'
/** 修复 path.txt 被 PowerShell 写成 UTF-8 BOM 导致 spawn ﻿electron.exe ENOENT */
const fs = require('fs')
const path = require('path')

const distDir = path.join(__dirname, '..', 'node_modules', 'electron', 'dist')
const pathTxt = path.join(__dirname, '..', 'node_modules', 'electron', 'path.txt')
const exe = path.join(distDir, 'electron.exe')

if (!fs.existsSync(exe)) {
  console.error(
    '[ensure-electron-path] 缺少 electron 二进制，请在 desktop 目录执行：\n' +
      '  set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/\n' +
      '  node node_modules/electron/install.js'
  )
  process.exit(1)
}

const want = Buffer.from('electron.exe', 'ascii')
let cur = Buffer.alloc(0)
try {
  cur = fs.readFileSync(pathTxt)
} catch {
  /* 无 path.txt 则创建 */
}
const hasBom = cur.length >= 3 && cur[0] === 0xef && cur[1] === 0xbb && cur[2] === 0xbf
if (hasBom || !cur.equals(want)) {
  fs.writeFileSync(pathTxt, want)
  console.log('[ensure-electron-path] 已写入 path.txt（无 BOM）')
}
