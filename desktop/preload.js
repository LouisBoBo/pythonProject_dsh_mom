/**
 * 向渲染进程暴露一体包能力。不暴露 Node API。
 * 选目录走主进程 dialog，避免引擎 osascript 调 Finder 被系统拦（-1743）。
 *
 * 冷启会先以 port=0 开窗（启动页），引擎口稍后才 resolve——必须用 IPC 热更新
 * engineState，不能把 argv 里的 port:0 焊死（否则资料库打到错误口 → 401 退登）。
 */
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// 沙箱 preload 的 require 只能加载白名单模块，不能 require 本地文件
// （./lib/read-engine-argv 会报 module not found）。故把解析逻辑内联于此；
// lib/read-engine-argv.js 仍保留给 desktop/tests 单测。两处逻辑须保持一致。
function parseEngineArgv(argv) {
  const prefix = '--workbuddy-engine='
  const raw = (argv || []).find((a) => String(a).startsWith(prefix))
  if (!raw) return { host: '127.0.0.1', port: 0 }
  try {
    const u = new URL(raw.slice(prefix.length))
    const port = Number(u.port)
    const host = u.hostname || '127.0.0.1'
    if (!Number.isFinite(port) || port <= 0) return { host, port: 0 }
    return { host, port }
  } catch {
    return { host: '127.0.0.1', port: 0 }
  }
}

let engineState = parseEngineArgv(process.argv)

function applyEngineInfo(info) {
  if (!info || typeof info !== 'object') return
  const port = Number(info.port)
  if (!Number.isFinite(port) || port <= 0) return
  engineState = {
    host: String(info.host || '127.0.0.1').trim() || '127.0.0.1',
    port,
  }
}

ipcRenderer.on('workbuddy:engine-info', (_event, info) => {
  applyEngineInfo(info)
})

// 启动瞬间主进程可能已 resolve（热启）；同步拉一次，避免首屏竞态
try {
  const snap = ipcRenderer.sendSync('workbuddy:engine-info-sync')
  applyEngineInfo(snap)
} catch {
  /* ignore */
}

contextBridge.exposeInMainWorld('workbuddyDesktop', {
  pickFolder: (prompt) => ipcRenderer.invoke('workbuddy:pick-folder', prompt || '选择工程目录'),
  /** 安装包版本号（不拉清单）；检查更新失败时仍可展示「当前版本」。 */
  getAppVersion: () => ipcRenderer.invoke('workbuddy:get-app-version'),
  checkUpdate: () => ipcRenderer.invoke('workbuddy:check-update'),
  downloadUpdate: () => ipcRenderer.invoke('workbuddy:download-update'),
  installUpdate: () => ipcRenderer.invoke('workbuddy:install-update'),
  /** 订阅下载进度；返回退订函数。 */
  onUpdateProgress: (cb) => {
    if (typeof cb !== 'function') return () => {}
    const listener = (_event, payload) => cb(payload)
    ipcRenderer.on('workbuddy:update-progress', listener)
    return () => ipcRenderer.removeListener('workbuddy:update-progress', listener)
  },
  /** 始终返回当前引擎口（含冷启后 IPC 热更新）；client 必须走 getEngine。 */
  getEngine: () => ({ host: engineState.host, port: engineState.port }),
  /** 兼容旧读法；注意对象快照，口变更后请再读 getEngine() */
  get engine() {
    return { host: engineState.host, port: engineState.port }
  },
})
