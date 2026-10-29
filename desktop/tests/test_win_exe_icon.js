'use strict'

/**
 * 门禁：afterPack 图标链路依赖 rcedit 与 win-exe-icon 模块可加载。
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const desktopRoot = path.join(__dirname, '..')
const winExeIcon = require(path.join(desktopRoot, 'lib', 'win-exe-icon.js'))

assert(fs.existsSync(path.join(desktopRoot, 'build', 'icon.png')), 'desktop/build/icon.png 缺失，先运行 ensure_desktop_icon.py')

try {
  require('rcedit')
} catch (e) {
  assert.fail(`desktop 未安装 rcedit devDependency: ${e && e.message ? e.message : e}`)
}

assert(typeof winExeIcon.setWinExeIcon === 'function')
assert(typeof winExeIcon.pngToIco === 'function')

console.log('test_win_exe_icon: ok')
