'use strict'

/**
 * 打包完成后单独执行：给 release/win-unpacked/*.exe 写入图标（不挂在 electron-builder afterPack）。
 * 用法: node scripts/apply-win-unpacked-icon.js [appOutDir]
 */
const fs = require('fs')
const path = require('path')
const { pngToIco, setWinExeIcon } = require('../lib/win-exe-icon')

const desktopRoot = path.join(__dirname, '..')
const outDir = path.resolve(process.argv[2] || path.join(desktopRoot, 'release'))
const appOutDir = path.join(outDir, 'win-unpacked')
const buildDir = path.join(desktopRoot, 'build')
const iconPng = path.join(buildDir, 'icon.png')

if (!fs.existsSync(iconPng)) {
  console.error('[apply-win-unpacked-icon] 缺少', iconPng, '请先: python scripts/lib/ensure_desktop_icon.py --require')
  process.exit(1)
}

if (!fs.existsSync(appOutDir)) {
  console.error('[apply-win-unpacked-icon] 缺少', appOutDir)
  process.exit(1)
}

const exes = fs.readdirSync(appOutDir).filter((n) => n.endsWith('.exe') && !n.toLowerCase().includes('uninstall'))
if (exes.length !== 1) {
  console.error('[apply-win-unpacked-icon] 期望 win-unpacked 下仅 1 个主 exe，实际:', exes)
  process.exit(1)
}

const exePath = path.join(appOutDir, exes[0])
const icoDir = path.join(outDir, '.icon-ico')
const ico = pngToIco(desktopRoot, buildDir, icoDir)

;(async () => {
  await setWinExeIcon(exePath, ico, desktopRoot)
  console.log('[apply-win-unpacked-icon] ok exe=' + exes[0])
})().catch((err) => {
  console.error('[apply-win-unpacked-icon] 失败:', err && err.message ? err.message : err)
  process.exit(1)
})
