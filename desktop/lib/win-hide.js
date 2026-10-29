'use strict'

/**
 * Windows 上 python.exe / node.exe / cmd 都是控制台程序。
 * 不设 windowsHide（CREATE_NO_WINDOW）就会闪一下终端。
 * stdio: inherit 在打包 Electron 里还会再弹出一个控制台。
 * inherit 改成 pipe 后必须加大 maxBuffer，否则 pnpm 日志会撑爆默认 1MB。
 */
function hideWin(opts) {
  const o = Object.assign({}, opts || {})
  o.windowsHide = true
  if (o.stdio === 'inherit') {
    o.stdio = ['ignore', 'pipe', 'pipe']
  }
  const usesPipe = o.stdio === 'pipe' || (Array.isArray(o.stdio) && o.stdio.some((s) => s === 'pipe'))
  if (usesPipe && o.maxBuffer == null) {
    o.maxBuffer = 16 * 1024 * 1024
  }
  return o
}

module.exports = { hideWin }
