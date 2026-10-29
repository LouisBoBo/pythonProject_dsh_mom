'use strict'

/**
 * 桌面壳启动契约静态校验（不启 Electron）：
 * 1) 未拿到单例锁必须 app.exit(0)，且 whenReady 不得在锁外注册（防热启双窗）
 * 2) BrowserWindow 冷启动必须 show:true（show:false+ready-to-show 会导致白屏/整窗不出现）
 * 3) splash 必须 await loadFile/loadURL，禁止 fire-and-forget
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')

assert.ok(/app\.exit\(0\)/.test(mainJs), '未拿到锁须 app.exit(0)')
assert.ok(
  /if\s*\(\s*!gotLock\s*\)\s*\{[^}]*app\.exit\(0\)/s.test(mainJs),
  'app.exit(0) 须在 !gotLock 分支'
)

// whenReady 只能出现在 gotLock 为真的块内：粗检「if (gotLock)」在「whenReady」之前且文件后半段只有一处 whenReady
const idxLock = mainJs.lastIndexOf('if (gotLock)')
const idxReady = mainJs.indexOf('app.whenReady(')
assert.ok(idxLock > 0 && idxReady > idxLock, 'app.whenReady 必须在 if (gotLock) 之内')

assert.ok(/show:\s*true/.test(mainJs), 'BrowserWindow 须 show:true（冷启动可见）')
assert.ok(
  !/show:\s*hasStartUrl/.test(mainJs),
  '禁止 show:hasStartUrl（曾导致冷启动白屏）'
)

assert.ok(/async function loadSplashHtml/.test(mainJs), '须有 loadSplashHtml')
assert.ok(
  /return loadSplashHtml\(mainWindow\)/.test(mainJs) ||
    /await loadSplashHtml\(/.test(mainJs),
  'createWindow/boot 须 await splash，禁止丢弃 Promise'
)
assert.ok(/await win\.loadFile\(file\)/.test(mainJs), 'splash 须 await loadFile')

console.log('test_startup_contract.js OK')
