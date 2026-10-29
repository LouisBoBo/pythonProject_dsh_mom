/**
 * ZR-WorkBuddy 宿主一体桌面壳
 * - 内嵌引擎（CPython）+ 内嵌 Host（staged dsh CLI）
 * - 使用独立 DSH_HOME（userData/dsh-home），不复用本机 ~/.dsh 里的皮肤/残缺 profile
 * - 启动时接线 link → 可写业务副本，并确保 mes-bridge
 * - 安装后在设置 / WorkBuddy 配置中心填 Key 即可用
 */
'use strict'

const { app, BrowserWindow, dialog, shell, ipcMain, Tray, Menu, nativeImage } = require('electron')
const childProcess = require('child_process')
const { pathToFileURL } = require('url')
const { hideWin } = require('./lib/win-hide')
const { assignPath } = require('./lib/win-path')
const { relinkDirToHost, linkHostClosure } = require('./lib/relink-dir')
const { expandPackagedRuntime } = require('./lib/expand-pack')
const { canSkipBootDeps, BOOT_STAMP_NAME } = require('./lib/boot-deps-stamp')
const { installMarketIntoProfile } = require('./lib/install-market')
const { updatePluginOffline } = require('./lib/offline-plugin-update')
function spawn(file, args, opts) {
  return childProcess.spawn(file, args, hideWin(opts))
}
function execFileSync(file, args, opts) {
  return childProcess.execFileSync(file, args, hideWin(opts))
}
const http = require('http')
const net = require('net')
const fs = require('fs')
const path = require('path')
const os = require('os')
const persistUserFeatures = require('./lib/persist-user-features')
const persistEngineData = require('./lib/persist-engine-data')
const killInstallTree = require('./lib/kill-install-tree')
const selfUpdate = require('./lib/self-update')
const { setupChineseApplicationMenu } = require('./lib/application-menu')
const {
  extractDshTokenUrl,
  isSafeDshEntryUrl,
  redactHostSecrets,
} = require('./lib/dsh-entry-url')

/** 窗口/托盘/安装包展示名（与 package.json productName / artifactName 一致） */
const DISPLAY_NAME = 'MOM'
/** userData 目录名保持稳定，避免改展示名后丢本机配置 */
const USER_DATA_DIRNAME = 'zr-workbuddy-desktop'
try {
  app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_DIRNAME))
} catch {
  /* before ready：仍尽量钉住 */
}

/** 窗口/任务栏图标（与 tray-icon 同源；不依赖 exe 内嵌 rcedit） */
function resolveAppIconPath() {
  return path.join(__dirname, 'tray-icon.png')
}

function loadAppIconNativeImage() {
  const icon = nativeImage.createFromPath(resolveAppIconPath())
  return icon.isEmpty() ? null : icon
}

let _cachedPython = undefined
function findPython() {
  if (_cachedPython !== undefined) return _cachedPython
  const bundled = [
    path.join(runtimeRoot(), 'python', 'bin', 'python3'),
    path.join(runtimeRoot(), 'python', 'bin', 'python'),
    path.join(runtimeRoot(), 'python', 'python.exe'),
    path.join(runtimeRoot(), 'python', 'Scripts', 'python.exe'),
  ]
  for (const p of bundled) {
    if (fs.existsSync(p)) {
      _cachedPython = p
      return p
    }
  }
  if (process.env.APP_ENGINE_PYTHON) {
    _cachedPython = process.env.APP_ENGINE_PYTHON
    return _cachedPython
  }
  const tries = process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python']
  for (const bin of tries) {
    try {
      const args = bin === 'py' ? ['-3', '-c', 'print(1)'] : ['-c', 'print(1)']
      execFileSync(bin, args, { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
      _cachedPython = bin
      return bin
    } catch {
      /* next */
    }
  }
  _cachedPython = ''
  return ''
}

const ENGINE_PORT_START = Number(process.env.WORKBUDDY_DESKTOP_ENGINE_PORT || 18000)
const DSH_PORT_START = Number(process.env.WORKBUDDY_DESKTOP_DSH_PORT || 13080)
const LINK_NAME = 'DSH-ZR-WorkBuddy'
const BRIDGE_PKG = '@dsh-external/dsh-mes-bridge'
const BRIDGE_ID = 'dsh-mes-bridge'
const MARKET_PKG = 'dshmarket'
/** WorkBuddy 预装本机知识库（中软包；默认关回写，见 ensure_dsh_knowledge.py） */
const KB_PKG = process.env.WORKBUDDY_KB_PKG || '@zhongruan/dsh-knowledge'
const KB_VERSION = process.env.WORKBUDDY_KB_VERSION || '1.0.0'
const KB_LEGACY_PKGS = ['@lemoncat7/dsh-knowledge', 'dsh-knowledge-base']
/** WorkBuddy 预装 LLM 用量计量（只记 llm/stream；见 ensure_dsh_llm_meter.py） */
const METER_PKG = process.env.WORKBUDDY_METER_PKG || '@zhongruan/dsh-llm-meter'
const METER_VERSION = process.env.WORKBUDDY_METER_VERSION || '0.1.1'
/** 旧 0.2.7/0.2.8 把 name 写成文件路径，client-modules 解析不了 package.json，设置里没有 WorkBuddy。 */
const BRIDGE_REL_LEGACY =
  `../../link/${LINK_NAME}/apps/zr-workbuddy/plugins/mes-bridge/lib/index.js`

/** @type {import('child_process').ChildProcess[]} */
const children = []
/** @type {BrowserWindow | null} */
let mainWindow = null
let shuttingDown = false
/** @type {Tray | null} 系统托盘（关窗不退出、后端常驻的关键） */
let tray = null
/** 真正退出标志：仅托盘「退出」/开机自启外的显式退出才置 true；关窗只隐藏不退出 */
let isQuitting = false
/** 后端（引擎+宿主）端口，常驻复用；重开窗口时直连，不必重启后端 */
let backendEnginePort = 0
let backendHostPort = 0
/** 开机后台自启标志：带此参数启动时只起后端+托盘、不弹窗（开机后第一次开也秒开） */
const isBackgroundLaunch = process.argv.includes('--workbuddy-background')
/** @type {string} */
let persistedEngineDir = ''
/** @type {string} */
let persistedAppRoot = ''

function winCmdArg(s) {
  return `"${String(s).replace(/"/g, '')}"`
}

function formatRuntimeDepsError(err) {
  const chunks = []
  if (err && err.stderr) chunks.push(String(err.stderr))
  if (err && err.stdout) chunks.push(String(err.stdout))
  const blob = chunks.join('\n')
  const lines = blob
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim())
  const interesting = lines.filter((l) =>
    /^(FAIL |LOCKED|运行时依赖: 未通过|Traceback|FileNotFoundError|\w+Error)/.test(l.trim())
  )
  const picked = (interesting.length ? interesting : lines).slice(-16)
  if (picked.length) return `运行时依赖检查失败：\n${picked.join('\n')}`
  const msg = String((err && err.message) || err || '未知错误').replace(/\r?\n/g, ' ')
  return `运行时依赖检查失败：${msg}`
}

ipcMain.handle('workbuddy:pick-folder', async (event, prompt) => {
  const srcUrl = String((event.sender && event.sender.getURL && event.sender.getURL()) || '')
  if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(srcUrl)) {
    return { ok: false, path: '', error: '非法来源' }
  }
  const senderWin = BrowserWindow.fromWebContents(event.sender)
  const opts = {
    title: String(prompt || '选择工程目录'),
    properties: ['openDirectory', 'createDirectory'],
  }
  const result = senderWin
    ? await dialog.showOpenDialog(senderWin, opts)
    : await dialog.showOpenDialog(opts)
  if (result.canceled || !result.filePaths || !result.filePaths.length) {
    return { ok: false, path: '', error: '已取消选择' }
  }
  return { ok: true, path: result.filePaths[0], error: '' }
})

/** 当前一体包引擎口（冷启先开窗 port=0，resolve 后靠此推给 preload）。 */
function currentDesktopEngineInfo() {
  const port = Number(backendEnginePort || bootEnginePort || 0) || 0
  const host = String(bootEngineHost || '127.0.0.1')
  return { host, port }
}

function pushEngineInfoToRenderer(win) {
  const info = currentDesktopEngineInfo()
  if (!info.port || info.port <= 0) return
  const target = win && !win.isDestroyed() ? win : mainWindow
  if (!target || target.isDestroyed()) return
  try {
    target.webContents.send('workbuddy:engine-info', info)
  } catch {
    /* ignore */
  }
  try {
    const inject =
      `try{localStorage.setItem("dsh-mes-engine-host",${JSON.stringify(info.host)});` +
      `localStorage.setItem("dsh-mes-engine-port",${JSON.stringify(String(info.port))});` +
      `window.__APP_ENGINE__=Object.assign({},window.__APP_ENGINE__||{},{host:${JSON.stringify(info.host)},port:${info.port}});` +
      `}catch(e){}`
    target.webContents.executeJavaScript(inject).catch(() => {})
  } catch {
    /* ignore */
  }
}

// preload 同步拉口（避免首屏 fetch 仍用 port=0）
ipcMain.on('workbuddy:engine-info-sync', (event) => {
  event.returnValue = currentDesktopEngineInfo()
})

/**
 * 桌面壳自升级状态机（一期：检查 + 全量下载 + 人确认拉起安装包）。
 * 方案：docs/功能实现/桌面应用版本升级方案.md
 * 渲染层拿不到路径：install 只认本会话内「已下载且 sha256 校验通过」的产物。
 */
const updateFlow = {
  phase: 'idle', // idle | available | downloading | ready | installing
  candidate: null, // { version, notes, file, sha256, size, url }
  filePath: '',
}

function isLoopbackSender(event) {
  const srcUrl = String((event.sender && event.sender.getURL && event.sender.getURL()) || '')
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(srcUrl)
}

/** 安装包版本号（desktop/package.json）；检查更新失败时 UI 仍要能展示当前版本。 */
ipcMain.handle('workbuddy:get-app-version', async (event) => {
  if (!isLoopbackSender(event)) {
    return { ok: false, version: '' }
  }
  return { ok: true, version: String(app.getVersion() || '') }
})

function updateFlowPayload(currentVersion) {
  const c = updateFlow.candidate || {}
  return {
    ok: true,
    checked: true,
    currentVersion,
    updateAvailable: true,
    latestVersion: c.version || '',
    notes: c.notes || '',
    size: c.size || 0,
    file: c.file || '',
    publishedAt: c.publishedAt || '',
    phase: updateFlow.phase,
    message: '',
  }
}

ipcMain.handle('workbuddy:check-update', async (event) => {
  const currentVersion = String(app.getVersion() || '')
  if (!isLoopbackSender(event)) {
    return {
      ok: false,
      checked: false,
      currentVersion,
      updateAvailable: false,
      message: '非法来源',
    }
  }
  // 下载中 / 已就绪：直接回报当前状态，弹窗重开可续看进度，不重复拉清单
  if (
    (updateFlow.phase === 'downloading' ||
      updateFlow.phase === 'ready' ||
      updateFlow.phase === 'installing') &&
    updateFlow.candidate
  ) {
    return updateFlowPayload(currentVersion)
  }
  const base = selfUpdate.feedBase()
  try {
    const latest = await selfUpdate.fetchLatest(base, process.platform)
    if (selfUpdate.compareVersions(latest.version, currentVersion) <= 0) {
      updateFlow.phase = 'idle'
      updateFlow.candidate = null
      updateFlow.filePath = ''
      return {
        ok: true,
        checked: true,
        currentVersion,
        updateAvailable: false,
        latestVersion: latest.version,
        phase: 'idle',
        message: '当前已是最新版本（v' + currentVersion + '）。',
      }
    }
    const url = selfUpdate.resolveArtifactUrl(base, latest.artifact.file)
    if (!url) {
      updateFlow.phase = 'idle'
      updateFlow.candidate = null
      return {
        ok: true,
        checked: false,
        currentVersion,
        updateAvailable: false,
        phase: 'idle',
        message: '更新清单异常：安装包地址不合法。请向管理员索取新安装包覆盖安装。',
      }
    }
    updateFlow.phase = 'available'
    updateFlow.candidate = {
      version: latest.version,
      notes: latest.notes,
      publishedAt: latest.publishedAt || '',
      file: latest.artifact.file,
      sha256: latest.artifact.sha256,
      size: latest.artifact.size,
      url,
    }
    updateFlow.filePath = ''
    return updateFlowPayload(currentVersion)
  } catch (e) {
    const errMsg = String(e && e.message ? e.message : e || '')
    updateFlow.phase = 'idle'
    updateFlow.candidate = null
    updateFlow.filePath = ''
    // 仅「无清单 / 网络不可达」按产品口径视为已是最新；清单格式异常等仍红字，避免掩盖坏包/篡改
    const missingOrUnreachable =
      /^HTTP 404\b/i.test(errMsg) ||
      /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|请求超时|socket hang up|getaddrinfo/i.test(
        errMsg
      )
    if (!missingOrUnreachable) {
      console.warn('[desktop] 检查更新失败:', errMsg)
      return {
        ok: true,
        checked: false,
        currentVersion,
        updateAvailable: false,
        phase: 'idle',
        message:
          '检查更新失败：' +
          (errMsg.length > 160 ? errMsg.slice(0, 160) + '…' : errMsg) +
          '。如需更新请向管理员索取新安装包覆盖安装。',
      }
    }
    console.warn(
      '[desktop] 检查更新：无可用在线清单，按已是最新展示:',
      errMsg
    )
    return {
      ok: true,
      checked: true,
      currentVersion,
      updateAvailable: false,
      latestVersion: currentVersion,
      phase: 'idle',
      message: '当前已是最新版本（v' + currentVersion + '）。',
    }
  }
})

ipcMain.handle('workbuddy:download-update', async (event) => {
  if (!isLoopbackSender(event)) {
    return { ok: false, message: '非法来源' }
  }
  if (updateFlow.phase === 'ready' && updateFlow.filePath) {
    return { ok: true, message: '安装包已就绪。' }
  }
  if (updateFlow.phase !== 'available' || !updateFlow.candidate) {
    return { ok: false, message: '请先检查更新。' }
  }
  const c = updateFlow.candidate
  updateFlow.phase = 'downloading'
  const dir = path.join(app.getPath('temp'), 'workbuddy-update', c.version)
  const dest = path.join(dir, c.file)
  try {
    await selfUpdate.downloadFile(c.url, dest, c.size, (received, total) => {
      try {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('workbuddy:update-progress', { phase: 'downloading', received, total })
        }
      } catch {
        /* 窗口已关 */
      }
    })
    const digest = await selfUpdate.sha256File(dest)
    if (digest !== c.sha256) {
      try {
        fs.rmSync(dest, { force: true })
      } catch {
        /* ignore */
      }
      updateFlow.phase = 'available'
      updateFlow.filePath = ''
      return { ok: false, message: '安装包校验失败（sha256 不符），已删除。请重试或向管理员索取安装包。' }
    }
    updateFlow.phase = 'ready'
    updateFlow.filePath = dest
    return { ok: true, message: '下载完成，校验通过。' }
  } catch (e) {
    updateFlow.phase = 'available'
    updateFlow.filePath = ''
    try {
      fs.rmSync(dest, { force: true })
    } catch {
      /* ignore */
    }
    return { ok: false, message: '下载失败：' + String((e && e.message) || e) }
  }
})

ipcMain.handle('workbuddy:install-update', async (event) => {
  if (!isLoopbackSender(event)) {
    return { ok: false, message: '非法来源' }
  }
  if (updateFlow.phase !== 'ready' || !updateFlow.filePath || !pathExists(updateFlow.filePath)) {
    return { ok: false, message: '没有已校验的安装包，请先下载。' }
  }
  const file = updateFlow.filePath
  // 防御加固：安装包必须落在本会话 temp/workbuddy-update 下（拒绝任意路径）
  const updateRoot = path.resolve(path.join(app.getPath('temp'), 'workbuddy-update'))
  const resolvedFile = path.resolve(file)
  const relToUpdate = path.relative(updateRoot, resolvedFile)
  if (!relToUpdate || relToUpdate.startsWith('..') || path.isAbsolute(relToUpdate)) {
    updateFlow.phase = 'ready'
    return { ok: false, message: '安装包路径异常，已拒绝执行。' }
  }
  updateFlow.phase = 'installing'
  if (process.platform === 'win32') {
    if (!/\.exe$/i.test(resolvedFile)) {
      updateFlow.phase = 'ready'
      return { ok: false, message: '安装包类型异常（需要 .exe）。' }
    }
    // 安装向导需要可见 UI，不走 hideWin；detached 让安装包在本应用退出后继续
    const child = childProcess.spawn(resolvedFile, [], { detached: true, stdio: 'ignore' })
    child.unref()
    setTimeout(() => {
      isQuitting = true
      shuttingDown = true
      app.quit()
    }, 500)
    return { ok: true, message: '安装向导已启动，本应用即将退出。' }
  }
  if (process.platform === 'darwin') {
    // zip 解压到临时目录 → Finder 选中新 .app → 提示拖拽替换 → 退出
    const extractDir = path.join(path.dirname(resolvedFile), 'extracted')
    try {
      fs.rmSync(extractDir, { recursive: true, force: true })
      fs.mkdirSync(extractDir, { recursive: true })
      await new Promise((resolve, reject) => {
        childProcess.execFile('ditto', ['-xk', resolvedFile, extractDir], { timeout: 300000 }, (err) =>
          err ? reject(err) : resolve()
        )
      })
    } catch (e) {
      updateFlow.phase = 'ready'
      return { ok: false, message: '解压失败：' + String((e && e.message) || e) }
    }
    const appPath = path.join(extractDir, DISPLAY_NAME + '.app')
    if (!pathExists(appPath)) {
      updateFlow.phase = 'ready'
      return { ok: false, message: '解压结果异常：未找到 ' + DISPLAY_NAME + '.app。请向管理员索取安装包。' }
    }
    shell.showItemInFolder(appPath)
    try {
      await dialog.showMessageBox({
        type: 'info',
        title: DISPLAY_NAME,
        message: '新版本已解压',
        detail:
          '已在 Finder 中选中新版 ' + DISPLAY_NAME + '.app。\n\n' +
          '点「退出并替换」后，把新版拖进「应用程序」替换旧版即可（首次打开请右键 → 打开）。',
        buttons: ['退出并替换'],
        defaultId: 0,
      })
    } catch {
      /* 窗口可能已关 */
    }
    isQuitting = true
    shuttingDown = true
    app.quit()
    return { ok: true, message: '已解压，按提示替换。' }
  }
  updateFlow.phase = 'ready'
  return { ok: false, message: '当前平台暂不支持应用内升级，请向管理员索取新安装包。' }
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // 必须立刻退出：若继续注册 whenReady/boot，会与首实例各开一窗，并抢加载 splash → ERR_FAILED + 双窗口
  app.exit(0)
} else {
  app.on('second-instance', () => {
    // 已有实例在跑：重开窗口（隐藏的 show / 无窗则连热后端），实现秒开
    showMainWindow().catch((err) => console.error(err))
  })
}

function runtimeRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'runtime')
  }
  return path.join(__dirname, 'runtime')
}

function hostRuntimeRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'host')
  }
  return path.join(__dirname, 'runtime', 'host')
}

function findHostDshTools() {
  const nested = path.join(
    hostRuntimeRoot(),
    'node_modules',
    '@deepseek-ai',
    'dsh',
    'node_modules',
    '@deepseek-ai',
    'dsh-tools'
  )
  const top = path.join(hostRuntimeRoot(), 'node_modules', '@deepseek-ai', 'dsh-tools')
  const npm = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'npm',
    'node_modules',
    '@deepseek-ai',
    'dsh',
    'node_modules',
    '@deepseek-ai',
    'dsh-tools'
  )
  for (const p of [nested, top, npm]) {
    if (fs.existsSync(path.join(p, 'package.json'))) return p
  }
  return ''
}

function alignDshToolsForChat(appRoot) {
  const hostTools = findHostDshTools()
  if (!hostTools) {
    if (app.isPackaged) {
      throw new Error('一体包缺少宿主 dsh-tools，无法对齐（工具会 reading prepare）')
    }
    console.warn('[desktop] 未找到宿主 dsh-tools，跳过对齐')
    return
  }
  const profileTools = path.join(
    dshHome(),
    'profiles',
    'web',
    'node_modules',
    '@deepseek-ai',
    'dsh-tools'
  )
  const bridgeTools = path.join(
    appRoot,
    'apps',
    'zr-workbuddy',
    'plugins',
    'mes-bridge',
    'node_modules',
    '@deepseek-ai',
    'dsh-tools'
  )
  relinkDirToHost(bridgeTools, hostTools)
  if (fs.existsSync(path.dirname(profileTools)) || fs.existsSync(path.join(dshHome(), 'profiles', 'web', 'package.json'))) {
    relinkDirToHost(profileTools, hostTools)
  }
  console.log('[desktop] dsh-tools aligned →', hostTools)
}

function pythonPrefixOf(exe) {
  const parent = path.dirname(exe)
  const base = path.basename(parent).toLowerCase()
  if (base === 'bin' || base === 'scripts') return path.dirname(parent)
  return parent
}

function bootDepsFingerprint(py) {
  const pyStamp = path.join(pythonPrefixOf(py), '.workbuddy-py-modules.stamp')
  if (!fs.existsSync(pyStamp)) return ''
  const chunks = []
  try {
    chunks.push(fs.readFileSync(path.join(runtimeRoot(), 'app', 'version.json'), 'utf8'))
  } catch {
    chunks.push('')
  }
  chunks.push(fs.readFileSync(pyStamp, 'utf8'))
  const nodeExe = path.join(
    runtimeRoot(),
    'node',
    'bin',
    process.platform === 'win32' ? 'node.exe' : 'node'
  )
  try {
    const st = fs.statSync(nodeExe)
    chunks.push(`node:${st.size}:${Math.floor(st.mtimeMs)}`)
  } catch {
    chunks.push('node:missing')
  }
  const prof = path.join(dshHome(), 'profiles', 'web', 'package.json')
  try {
    const st = fs.statSync(prof)
    chunks.push(`profile:${st.size}:${Math.floor(st.mtimeMs)}`)
  } catch {
    chunks.push('profile:missing')
  }
  return chunks.join('\n---\n')
}

function bootDepsStampFile() {
  return path.join(app.getPath('userData'), BOOT_STAMP_NAME)
}

function runtimeDepsStampHit(py) {
  const fp = bootDepsFingerprint(py)
  if (!fp) return false
  let saved = ''
  try {
    saved = fs.readFileSync(bootDepsStampFile(), 'utf8')
  } catch {
    return false
  }
  return canSkipBootDeps(saved, fp)
}

function ensureRuntimeDeps(appRoot, opts) {
  const py = process.env.APP_ENGINE_PYTHON || findPython()
  if (!py) {
    throw new Error('找不到 Python，无法做运行时依赖检查。请安装 Python 3.10+ 或设 APP_ENGINE_PYTHON。')
  }
  if (runtimeDepsStampHit(py)) {
    console.log('[desktop] runtime deps stamp hit', opts && opts.engineOnly ? '(engine)' : '')
    return
  }
  const script = path.join(appRoot, 'scripts', 'lib', 'ensure_runtime.py')
  if (!fs.existsSync(script)) {
    throw new Error(`缺少 ${script}`)
  }
  const args = [script, '--fix', '--require']
  if (opts && opts.engineOnly) {
    args.push('--engine')
  } else {
    args.push('--profile', path.join(dshHome(), 'profiles', 'web'), '--dsh-home', dshHome())
  }
  const env = applyDesktopToolchain({
    ...process.env,
    DSH_HOME: dshHome(),
    APP_ENGINE_PYTHON: py,
    WORKBUDDY_APP_ROOT: appRoot,
  })
  // 内嵌 Node 不带完整 npm，干净机器上 zod dist 修复会「找不到 npm」。
  // 若安装包内带了 zod 修复 tarball（vendor/zod/，由 build_runtime 打入），
  // 经 WORKBUDDY_ZOD_TARBALL 让 ensure_cursor_sdk_zod 离线修复，不依赖运行时 npm。
  const zodTarball = path.join(appRoot, 'vendor', 'zod', 'zod-3.25.67.tgz')
  if (fs.existsSync(zodTarball) && !env.WORKBUDDY_ZOD_TARBALL) {
    env.WORKBUDDY_ZOD_TARBALL = zodTarball
  }
  try {
    execFileSync(py, args, {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300000,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      env,
    })
  } catch (err) {
    throw new Error(formatRuntimeDepsError(err))
  }
  if (!opts || !opts.engineOnly) {
    const fp = bootDepsFingerprint(py)
    if (fp) fs.writeFileSync(bootDepsStampFile(), fp, 'utf8')
  }
  console.log('[desktop] runtime deps OK', opts && opts.engineOnly ? '(engine)' : '')
}

function marketRuntimeRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'market')
  }
  return path.join(__dirname, 'runtime', 'market')
}

function persistRoot() {
  return path.join(app.getPath('userData'), 'persist')
}

function safePersistFeatures(fn, label, args) {
  try {
    return fn(args) || []
  } catch (err) {
    console.error('[desktop]', label, err && err.message ? err.message : err)
    return []
  }
}

function stashEngineUserState(engineDir) {
  if (!engineDir || !fs.existsSync(engineDir)) return
  const persist = persistRoot()
  fs.mkdirSync(persist, { recursive: true })
  const cfg = path.join(engineDir, 'config', 'config.yaml')
  if (fs.existsSync(cfg)) {
    fs.copyFileSync(cfg, path.join(persist, 'config.yaml'))
  }
  // 一体化开关/Run/Epic、用量、资料库等：整棵 data 进 persist/engine-data
  // （仅拷 plugins.json 不够——重新打包刷新 runtime-app 会整树 rm 掉账本）
  try {
    persistEngineData.stashEngineData({
      liveEngineDir: engineDir,
      persistDir: persist,
    })
  } catch (err) {
    console.error(
      '[desktop] stash engine-data failed',
      err && err.message ? err.message : err,
    )
  }
  // 兼容旧逻辑：根级 plugins / last_deploy 仍留一份
  const plugins = path.join(engineDir, 'data', 'plugins.json')
  if (fs.existsSync(plugins)) {
    fs.copyFileSync(plugins, path.join(persist, 'plugins.json'))
  }
  const lastDeploy = path.join(engineDir, 'data', 'code_deploy', 'last_deploy.json')
  if (fs.existsSync(lastDeploy)) {
    fs.mkdirSync(path.join(persist, 'code_deploy'), { recursive: true })
    fs.copyFileSync(lastDeploy, path.join(persist, 'code_deploy', 'last_deploy.json'))
  }
}

function restoreEngineUserState(engineDir, packagePlugins) {
  const persist = persistRoot()
  const persistCfg = path.join(persist, 'config.yaml')
  const cfg = path.join(engineDir, 'config', 'config.yaml')
  if (fs.existsSync(persistCfg)) {
    fs.mkdirSync(path.dirname(cfg), { recursive: true })
    fs.copyFileSync(persistCfg, cfg)
  }
  const durable = persistEngineData.durableDataDir(persist)
  let restoredData = false
  if (fs.existsSync(durable)) {
    try {
      const r = persistEngineData.restoreEngineData({
        liveEngineDir: engineDir,
        persistDir: persist,
        packagePlugins: packagePlugins || null,
      })
      restoredData = Boolean(r && r.ok)
      if (restoredData) {
        console.log(
          '[desktop] restored engine-data (dev_pipeline/usage/…) from persist; plugins enabled=',
          (r.enabled || []).length,
        )
      }
    } catch (err) {
      console.error(
        '[desktop] restore engine-data failed',
        err && err.message ? err.message : err,
      )
    }
  }
  // 无 engine-data 时回退旧单文件（首次升级迁移）
  if (!restoredData) {
    const persistPlugins = path.join(persist, 'plugins.json')
    const destPlugins = path.join(engineDir, 'data', 'plugins.json')
    if (fs.existsSync(persistPlugins)) {
      fs.mkdirSync(path.dirname(destPlugins), { recursive: true })
      fs.copyFileSync(persistPlugins, destPlugins)
    }
    const persistLast = path.join(persist, 'code_deploy', 'last_deploy.json')
    const destLast = path.join(engineDir, 'data', 'code_deploy', 'last_deploy.json')
    if (fs.existsSync(persistLast)) {
      fs.mkdirSync(path.dirname(destLast), { recursive: true })
      fs.copyFileSync(persistLast, destLast)
    }
  }
}

/** 一体包默认隔离；设 WORKBUDDY_USE_SYSTEM_DSH_HOME=1 才用本机 ~/.dsh */
function dshHome() {
  if (process.env.WORKBUDDY_USE_SYSTEM_DSH_HOME === '1') {
    return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  }
  if (process.env.DSH_HOME && process.env.DSH_HOME.length > 0) {
    return process.env.DSH_HOME
  }
  return path.join(app.getPath('userData'), 'dsh-home')
}

function applyDesktopDshHome() {
  const home = dshHome()
  process.env.DSH_HOME = home
  fs.mkdirSync(home, { recursive: true })
  return home
}

function ensureWritableAppCopy() {
  const srcApp = path.join(runtimeRoot(), 'app')
  const dstApp = path.join(app.getPath('userData'), 'runtime-app')
  const marker = path.join(dstApp, '.bundle_ready')
  const bundleVer = path.join(runtimeRoot(), 'app', 'version.json')
  let want = ''
  try {
    want = fs.readFileSync(bundleVer, 'utf8')
  } catch {
    want = 'unknown'
  }
  const needRefresh =
    !fs.existsSync(marker) ||
    (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() !== want.trim())

  if (!fs.existsSync(srcApp)) {
    throw new Error(`缺少运行时 app：${srcApp}（请先 python scripts/lib/package_desktop.py）`)
  }
  const eng = path.join(dstApp, 'apps', 'zr-workbuddy', 'engine')
  // 版本未变：跳过 stash/restore 整树拷贝，冷启可省数秒。
  if (needRefresh) {
    if (fs.existsSync(eng)) stashEngineUserState(eng)
    if (fs.existsSync(dstApp)) {
      safePersistFeatures(persistUserFeatures.stashUserFeatures, 'stash user features', {
        liveAppRoot: dstApp,
        bundleAppRoot: srcApp,
        persistDir: persistRoot(),
      })
    }
    // 安装包可能还在拷贝/解压中（Finder 替换未完成就双击）：先验哨兵文件。
    // 不完整直接报错退出——绝不 rm 掉 userData 里已可用的副本（否则旧版本也被拖垮）。
    const bundleSentinels = [
      'version.json',
      path.join('apps', 'zr-workbuddy', 'engine', 'app', 'main.py'),
      path.join('scripts', 'lib', 'ensure_runtime.py'),
      path.join('scripts', 'lib', 'win_hide.py'),
    ]
    for (const rel of bundleSentinels) {
      if (!fs.existsSync(path.join(srcApp, rel))) {
        throw new Error(
          `安装包文件不完整（缺少 ${rel}）。请等待应用拷贝/解压完成后再启动，或重新安装。`
        )
      }
    }
    fs.mkdirSync(path.dirname(dstApp), { recursive: true })
    if (fs.existsSync(dstApp)) {
      fs.rmSync(dstApp, { recursive: true, force: true })
    }
    fs.cpSync(srcApp, dstApp, { recursive: true })
    fs.writeFileSync(marker, want, 'utf8')
    let packagePlugins = null
    const pkgPluginsPath = path.join(eng, 'data', 'plugins.json')
    if (fs.existsSync(pkgPluginsPath)) {
      try {
        packagePlugins = JSON.parse(fs.readFileSync(pkgPluginsPath, 'utf8'))
      } catch {
        packagePlugins = null
      }
    }
    restoreEngineUserState(eng, packagePlugins)
    safePersistFeatures(persistUserFeatures.restoreUserFeatures, 'restore user features', {
      liveAppRoot: dstApp,
      bundleAppRoot: srcApp,
      persistDir: persistRoot(),
    })
  }
  const cfg = path.join(eng, 'config', 'config.yaml')
  const example = path.join(eng, 'config', 'config.example.yaml')
  if (!fs.existsSync(cfg) && fs.existsSync(example)) {
    fs.copyFileSync(example, cfg)
  }
  persistedEngineDir = eng
  persistedAppRoot = dstApp
  return { appRoot: dstApp, engineDir: eng }
}

// Packaged copies omit feature plugin node_modules; materialize Bridge deps before boot.
function materializeBridgeDeps(appRoot) {
  const bridge = path.join(appRoot, 'apps', 'zr-workbuddy', 'plugins', 'mes-bridge')
  const toolsSrc = path.join(appRoot, 'vendor', '@deepseek-ai', 'dsh-tools')
  const runtimeSrc = path.join(appRoot, 'apps', 'zr-workbuddy', 'plugins', 'mes-runtime')
  const toolsDst = path.join(bridge, 'node_modules', '@deepseek-ai', 'dsh-tools')
  const runtimeDst = path.join(bridge, 'node_modules', '@dsh-external', 'mes-runtime')
  if (!fs.existsSync(bridge)) return
  const hostTools = findHostDshTools()
  if (hostTools) {
    relinkDirToHost(toolsDst, hostTools)
  } else if (fs.existsSync(toolsSrc)) {
    fs.mkdirSync(path.dirname(toolsDst), { recursive: true })
    relinkDirToHost(toolsDst, toolsSrc)
  }
  if (fs.existsSync(runtimeSrc)) {
    relinkDirToHost(runtimeDst, runtimeSrc)
  }

  // dsh-tools 的 peer（cordis 等）在本机靠仓库根 node_modules；安装副本挂 Host 闭包。
  // junction 已接上就跳过。禁止每次启动删掉再复制整棵 @deepseek-ai。
  const hostNested = path.join(
    hostRuntimeRoot(),
    'node_modules',
    '@deepseek-ai',
    'dsh',
    'node_modules'
  )
  const linked = linkHostClosure(appRoot, hostNested)
  if (linked.linked || linked.copied) {
    console.log('[desktop] host closure', linked)
  }
}

function writeEngineRuntime(engineDir, port) {
  const cfgDir = path.join(engineDir, 'config')
  fs.mkdirSync(cfgDir, { recursive: true })
  fs.writeFileSync(
    path.join(cfgDir, 'runtime.yaml'),
    `server:\n  host: 127.0.0.1\n  port: ${port}\npython: ${
      process.platform === 'win32' ? 'python' : 'python3'
    }\n`,
    'utf8'
  )
  const client = path.join(
    engineDir,
    '..',
    'plugins',
    'mes-bridge',
    'lib',
    'client.js'
  )
  if (fs.existsSync(client)) {
    let text = fs.readFileSync(client, 'utf8')
    const block =
      '/*RUNTIME_BEGIN*/\n' +
      `window.__APP_ENGINE__ = { host: "127.0.0.1", port: ${port} };\n` +
      '/*RUNTIME_END*/'
    const next = text.replace(
      /\/\*RUNTIME_BEGIN\*\/[\s\S]*?\/\*RUNTIME_END\*\//,
      block
    )
    if (next !== text) fs.writeFileSync(client, next, 'utf8')
  }
}

function findEngineLauncher() {
  const file = process.platform === 'win32' ? 'workbuddy-engine.cmd' : 'workbuddy-engine'
  const packed = path.join(runtimeRoot(), 'bin', file)
  if (fs.existsSync(packed)) return packed
  return ''
}

function findBundledCliEntry() {
  const cli = path.join(
    hostRuntimeRoot(),
    'node_modules',
    '@deepseek-ai',
    'dsh',
    'lib',
    'bin.js'
  )
  return fs.existsSync(cli) ? cli : ''
}

/** DSH 0.2.1-rc.2 需要 Node≥22（zstd / stripTypeScriptTypes）；禁止用 Electron 内嵌 Node 20 跑宿主。 */
function nodeMajorOf(bin) {
  try {
    const out = execFileSync(bin, ['-p', 'process.versions.node'], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    })
      .trim()
      .split('.')[0]
    return Number(out) || 0
  } catch {
    return 0
  }
}

function findHostNodeBinary() {
  if (process.env.WORKBUDDY_HOST_NODE && fs.existsSync(process.env.WORKBUDDY_HOST_NODE)) {
    const maj = nodeMajorOf(process.env.WORKBUDDY_HOST_NODE)
    if (maj >= 22) return process.env.WORKBUDDY_HOST_NODE
  }
  const bundledNames =
    process.platform === 'win32' ? ['bin/node.exe', 'node.exe'] : ['bin/node']
  for (const rel of bundledNames) {
    const bundled = path.join(runtimeRoot(), 'node', ...rel.split('/'))
    if (fs.existsSync(bundled) && nodeMajorOf(bundled) >= 22) return bundled
  }

  const home = os.homedir()
  const candidates = []
  const nvmDir = path.join(home, '.nvm', 'versions', 'node')
  try {
    if (fs.existsSync(nvmDir)) {
      for (const name of fs.readdirSync(nvmDir)) {
        if (!/^v2[2-9]/.test(name) && !/^v[3-9]/.test(name)) continue
        candidates.push(path.join(nvmDir, name, 'bin', 'node'))
      }
    }
  } catch {
    /* ignore */
  }
  for (const c of [
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
    path.join(home, '.local', 'bin', 'node'),
  ]) {
    candidates.push(c)
  }
  // PATH 上的 node
  const pathEnv = process.env.PATH || ''
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue
    candidates.push(path.join(dir, process.platform === 'win32' ? 'node.exe' : 'node'))
  }

  let best = ''
  let bestMaj = 0
  const seen = new Set()
  for (const c of candidates) {
    if (!c || seen.has(c)) continue
    seen.add(c)
    if (!fs.existsSync(c)) continue
    const maj = nodeMajorOf(c)
    if (maj >= 22 && maj > bestMaj) {
      best = c
      bestMaj = maj
    }
  }
  return best
}

function findBundledPnpmCjs() {
  const cands = [
    path.join(process.resourcesPath, 'pnpm', 'bin', 'pnpm.cjs'),
    path.join(__dirname, 'runtime', 'pnpm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
    path.join(hostRuntimeRoot(), 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
  ]
  for (const c of cands) {
    if (c && fs.existsSync(c)) return c
  }
  return ''
}

function findBundledPnpm() {
  return findBundledPnpmCjs()
}

/** 在可写目录放 pnpm / dsh 包装：插件市场会 spawn("pnpm")，不能往安装目录里 npm i -g。 */
function ensureDesktopPnpmHome() {
  const home = path.join(app.getPath('userData'), 'pnpm-home')
  const nodeBin = findHostNodeBinary()
  const pnpmCjs = findBundledPnpmCjs()
  const cli = findBundledCliEntry()
  if (!nodeBin || !pnpmCjs) {
    console.warn('[desktop] 未内嵌 pnpm/Node，插件市场无法自动装包')
    return { home, ok: false, dshBin: '', nodeBin: nodeBin || '' }
  }
  fs.mkdirSync(home, { recursive: true })
  const qWin = (s) => `"${String(s).replace(/"/g, '')}"`
  const qSh = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  if (process.platform === 'win32') {
    fs.writeFileSync(
      path.join(home, 'pnpm.cmd'),
      `@echo off\r\n${qWin(nodeBin)} ${qWin(pnpmCjs)} %*\r\n`,
      'utf8'
    )
    if (cli) {
      fs.writeFileSync(
        path.join(home, 'dsh.cmd'),
        `@echo off\r\n${qWin(nodeBin)} --expose-internals ${qWin(cli)} %*\r\n`,
        'utf8'
      )
    }
  } else {
    const shim = path.join(home, 'pnpm')
    fs.writeFileSync(shim, `#!/bin/sh\nexec ${qSh(nodeBin)} ${qSh(pnpmCjs)} "$@"\n`, 'utf8')
    try {
      fs.chmodSync(shim, 0o755)
    } catch {
      /* ignore */
    }
    if (cli) {
      const dsh = path.join(home, 'dsh')
      fs.writeFileSync(
        dsh,
        `#!/bin/sh\nexec ${qSh(nodeBin)} --expose-internals ${qSh(cli)} "$@"\n`,
        'utf8'
      )
      try {
        fs.chmodSync(dsh, 0o755)
      } catch {
        /* ignore */
      }
    }
  }
  const dshBin = path.join(home, process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
  return { home, ok: true, dshBin: fs.existsSync(dshBin) ? dshBin : '', nodeBin }
}

function applyDesktopToolchain(env) {
  const nodeBin = findHostNodeBinary()
  const { home, ok, dshBin } = ensureDesktopPnpmHome()
  env.CI = env.CI || 'true'
  if (nodeBin) env.WORKBUDDY_HOST_NODE = nodeBin
  const hostTools = findHostDshTools()
  if (hostTools) env.WORKBUDDY_HOST_DSH_TOOLS = hostTools
  env.WORKBUDDY_HOST_ROOT = hostRuntimeRoot()
  if (dshBin) {
    env.DSH_BIN = dshBin
    env.WORKBUDDY_DSH_BIN = dshBin
  }
  if (ok) {
    env.PNPM_HOME = home
    // 必须与既有 node_modules 的 store 一致，否则插件市场 pnpm add 会报
    // ERR_PNPM_UNEXPECTED_STORE，或被迫全量重拉（含 gh-proxy 皮肤包）。
    env.npm_config_store_dir = path.join(home, 'store')
  }
  const dirs = []
  if (ok) dirs.push(home)
  if (nodeBin) dirs.push(path.dirname(nodeBin))
  try {
    const nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node')
    if (fs.existsSync(nvmDir)) {
      const names = fs.readdirSync(nvmDir).filter((n) => /^v\d/.test(n)).sort()
      for (let i = names.length - 1; i >= 0; i--) {
        const bin = path.join(nvmDir, names[i], 'bin')
        if (fs.existsSync(path.join(bin, 'npm'))) {
          dirs.push(bin)
          break
        }
      }
    }
  } catch {
    /* ignore */
  }
  // 必须收成唯一 PATH。Windows 上 {...process.env} 的键是 Path，
  // 再写 env.PATH 会并存；子进程只保留短的那份，市场重启找不到 powershell.exe。
  assignPath(env, dirs)
  if (ok) {
    console.log('[desktop] toolchain PNPM_HOME=', home)
  }
  return env
}

/** 公司插件市场配置（公司目录为公司插件真相源；官方目录每天最多合并一次） */
const COMPANY_MARKET_DEFAULTS = {
  COMPANY_DSH_MARKET_URL: 'http://175.178.238.31/dsh-plugins/plugins.json',
  OFFICIAL_DSH_MARKET_URL: 'https://awesome-dsh-plugin.com/plugins.json',
  ZHONGRUAN_NPM_REGISTRY: 'http://175.178.238.31/dsh-plugins/npm/',
}

function loadCompanyDshMarketEnv(appRoot) {
  const out = { ...COMPANY_MARKET_DEFAULTS }
  const cfg = appRoot
    ? path.join(appRoot, 'apps', 'zr-workbuddy', 'config', 'company-dsh-market.env')
    : ''
  if (cfg && fs.existsSync(cfg)) {
    try {
      const text = fs.readFileSync(cfg, 'utf8')
      for (const line of text.split('\n')) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        const i = t.indexOf('=')
        if (i < 0) continue
        const key = t.slice(0, i).trim()
        const val = t.slice(i + 1).trim()
        if (
          key === 'DSHM_REGISTRY_URL' ||
          key === 'ZHONGRUAN_NPM_REGISTRY' ||
          key === 'COMPANY_DSH_MARKET_URL' ||
          key === 'OFFICIAL_DSH_MARKET_URL'
        ) {
          out[key] = val
        }
      }
    } catch (e) {
      console.warn('[desktop] 读取 company-dsh-market.env 失败:', e && e.message ? e.message : e)
    }
  }
  if (process.env.DSHM_REGISTRY_URL !== undefined) {
    out.DSHM_REGISTRY_URL = process.env.DSHM_REGISTRY_URL
  }
  if (process.env.COMPANY_DSH_MARKET_URL) {
    out.COMPANY_DSH_MARKET_URL = process.env.COMPANY_DSH_MARKET_URL
  }
  if (process.env.OFFICIAL_DSH_MARKET_URL) {
    out.OFFICIAL_DSH_MARKET_URL = process.env.OFFICIAL_DSH_MARKET_URL
  }
  if (process.env.ZHONGRUAN_NPM_REGISTRY) {
    out.ZHONGRUAN_NPM_REGISTRY = process.env.ZHONGRUAN_NPM_REGISTRY
  }
  return out
}

function findMergePython() {
  return findPython()
}

function readPersistedMarketRegistry() {
  const envf = path.join(dshHome(), '.env')
  if (!fs.existsSync(envf)) return { url: '', npm: '' }
  try {
    const text = fs.readFileSync(envf, 'utf8')
    const m = text.match(/^DSHM_REGISTRY_URL=(.+)$/m)
    const n = text.match(/^DSHM_NPM_MIRROR=(.+)$/m)
    return {
      url: m && m[1] ? m[1].trim() : '',
      npm: n && n[1] ? n[1].trim() : '',
    }
  } catch {
    return { url: '', npm: '' }
  }
}

function portFromLoopbackUrl(url) {
  const m = String(url || '').match(/^https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)\b/i)
  return m ? Number(m[1]) : 0
}

/** 合并市场 serve 健康探测（异步，不挡主线程太久）。 */
function probeMarketMergeHealth(port, timeoutMs = 350) {
  const p = Number(port)
  if (!Number.isFinite(p) || p < 1) return Promise.resolve(false)
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port: p, path: '/health', timeout: timeoutMs },
      (res) => {
        let buf = ''
        res.on('data', (c) => {
          buf += c
          if (buf.length > 2048) res.destroy()
        })
        res.on('end', () => {
          try {
            const j = JSON.parse(buf)
            resolve(!!(j && j.ok === true && j.service === 'workbuddy-market-merge'))
          } catch {
            resolve(false)
          }
        })
      }
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

/**
 * 冷启快路径：合并目录已在听 → 复用，跳过 Python ensure（ensure 会 stop+restart，常白烧数秒）。
 */
async function tryReuseMergedMarketCatalog() {
  const persisted = readPersistedMarketRegistry()
  const fromProc = String(process.env.DSHM_REGISTRY_URL || '').trim()
  const url = fromProc || persisted.url
  if (!url || !/^https?:\/\/(127\.0\.0\.1|localhost):\d+\//i.test(url)) return ''
  const port = portFromLoopbackUrl(url)
  if (!(await probeMarketMergeHealth(port))) return ''
  if (persisted.npm) process.env.DSHM_NPM_MIRROR = persisted.npm
  else if (!process.env.DSHM_NPM_MIRROR) {
    process.env.DSHM_NPM_MIRROR = `http://127.0.0.1:${port}/npm`
  }
  console.log('[desktop] reuse market merge :' + port)
  return url
}

/** 公司插件永远可展示；官方目录后台每天最多拉一次。失败则回退公司原 URL。
 * LOCKED：空 DSHM_REGISTRY_URL 不得掉回官方，除非 WORKBUDDY_ALLOW_OFFICIAL_MARKET=1。
 */
function ensureMergedMarketCatalog(appRoot, market, opts) {
  const companyUrl =
    market.COMPANY_DSH_MARKET_URL || COMPANY_MARKET_DEFAULTS.COMPANY_DSH_MARKET_URL
  const allowOfficial = process.env.WORKBUDDY_ALLOW_OFFICIAL_MARKET === '1'
  const fromEnv = Object.prototype.hasOwnProperty.call(process.env, 'DSHM_REGISTRY_URL')
    ? process.env.DSHM_REGISTRY_URL || ''
    : market.DSHM_REGISTRY_URL
  if (typeof fromEnv === 'string' && fromEnv !== '' && fromEnv !== companyUrl) {
    return fromEnv
  }
  if (fromEnv === '' && allowOfficial) return ''
  if (fromEnv === '' && !allowOfficial) {
    console.warn(
      '[desktop] 忽略空 DSHM_REGISTRY_URL=（交付态锁定合并市场；破窗 WORKBUDDY_ALLOW_OFFICIAL_MARKET=1）'
    )
  }
  const script = path.join(appRoot, 'scripts', 'lib', 'merge_company_dsh_market.py')
  if (!fs.existsSync(script)) return companyUrl
  const py = findMergePython()
  if (!py) return companyUrl
  const cacheDir = path.join(dshHome(), 'market-merge')
  const officialUrl =
    market.OFFICIAL_DSH_MARKET_URL || COMPANY_MARKET_DEFAULTS.OFFICIAL_DSH_MARKET_URL
  try {
    const zhongruanNpm = (
      market.ZHONGRUAN_NPM_REGISTRY || COMPANY_MARKET_DEFAULTS.ZHONGRUAN_NPM_REGISTRY
    ).replace(/\/+$/, '')
    const out = execFileSync(
      py,
      [
        script,
        'ensure',
        '--root',
        appRoot,
        '--cache-dir',
        cacheDir,
        '--company-url',
        companyUrl,
        '--official-url',
        officialUrl,
        '--zhongruan-npm',
        zhongruanNpm,
        '--port',
        String(process.env.WORKBUDDY_MARKET_MERGE_PORT || 18732),
      ],
      { encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024 }
    )
    const m = String(out).match(/^DSHM_REGISTRY_URL=(.+)$/m)
    const npmM = String(out).match(/^DSHM_NPM_MIRROR=(.+)$/m)
    if (npmM && npmM[1].trim()) {
      // dshmarket 更新检测读 DSHM_NPM_MIRROR；本机 /npm 会把 @zhongruan 转到公司私服
      process.env.DSHM_NPM_MIRROR = npmM[1].trim()
    }
    if (m && m[1].trim()) return m[1].trim()
  } catch (e) {
    console.warn('[desktop] 合并插件市场失败，回退公司目录:', e && e.message ? e.message : e)
  }
  return companyUrl
}

/**
 * 启动关键路径用的市场 URL：能复用本地 merge 就复用；否则先用公司目录开壳，
 * Python ensure 放到后台（不挡 UI）。仍锁定公司市场，禁止掉回官方。
 */
async function resolveMarketRegistryForBoot(appRoot) {
  const market = loadCompanyDshMarketEnv(appRoot)
  const companyUrl =
    market.COMPANY_DSH_MARKET_URL || COMPANY_MARKET_DEFAULTS.COMPANY_DSH_MARKET_URL
  const reused = await tryReuseMergedMarketCatalog()
  if (reused) {
    try {
      persistCompanyMarketEnv(reused)
    } catch (e) {
      console.warn('[desktop] 写入复用市场 URL 失败:', e && e.message ? e.message : e)
    }
    return { url: reused, market, deferredEnsure: false }
  }
  // 后台补齐合并 serve（含官方日更）；主路径先公司目录，聊天壳不等。
  setImmediate(() => {
    try {
      const url = ensureMergedMarketCatalog(appRoot, market, { force: true })
      if (url) {
        try {
          persistCompanyMarketEnv(url)
        } catch (e2) {
          console.warn('[desktop] 后台写入市场 URL 失败:', e2 && e2.message ? e2.message : e2)
        }
        console.log('[desktop] market ensure (bg) →', url)
      }
    } catch (e) {
      console.warn('[desktop] 后台市场 ensure 失败:', e && e.message ? e.message : e)
    }
  })
  try {
    persistCompanyMarketEnv(companyUrl)
  } catch (e) {
    console.warn('[desktop] 写入公司市场 URL 失败:', e && e.message ? e.message : e)
  }
  return { url: companyUrl, market, deferredEnsure: true }
}

/**
 * 皮肤包 dsh-whale-musume 若写成 gh-proxy/codeload URL，公司插件安装时 pnpm
 * 会顺带重拉它，UI 卡在「下载中 · https://gh-p...」。改为本地 file: 依赖。
 */
function ensureWhaleMusumeOffline(profileDir) {
  if (!profileDir || !fs.existsSync(profileDir)) return
  const pkgPath = path.join(profileDir, 'package.json')
  if (!fs.existsSync(pkgPath)) return
  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  } catch {
    return
  }
  const dep = pkg.dependencies && pkg.dependencies['dsh-whale-musume']
  if (typeof dep !== 'string') return
  if (!/gh-proxy\.com|codeload\.github\.com/i.test(dep)) return

  const fromNm = path.join(profileDir, 'node_modules', 'dsh-whale-musume')
  const vendorDir = path.join(dshHome(), 'vendor', 'dsh-whale-musume')
  const hasNm = fs.existsSync(path.join(fromNm, 'package.json'))
  const hasVendor = fs.existsSync(path.join(vendorDir, 'package.json'))
  try {
    if (hasNm) {
      fs.mkdirSync(path.dirname(vendorDir), { recursive: true })
      fs.cpSync(fromNm, vendorDir, { recursive: true, dereference: true, force: true })
    } else if (!hasVendor) {
      console.warn('[desktop] whale-musume 仍是远程 URL，且本地无副本，跳过离线化')
      return
    }
    // profiles/web → ../../vendor/dsh-whale-musume
    pkg.dependencies['dsh-whale-musume'] = 'file:../../vendor/dsh-whale-musume'
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
    console.log('[desktop] whale-musume 已改为本地 file:，避免插件安装卡在 gh-proxy')
  } catch (e) {
    console.warn('[desktop] whale-musume 离线化失败:', e && e.message ? e.message : e)
  }
}

/** 只重写标记块，保留 profile .npmrc 其它内容 */
function ensureCompanyMarketNpmrc(profileDir, registry) {
  if (!registry || !profileDir || !fs.existsSync(profileDir)) return
  const npmrc = path.join(profileDir, '.npmrc')
  let body = ''
  if (fs.existsSync(npmrc)) {
    body = fs.readFileSync(npmrc, 'utf8')
    body = body.replace(
      /\n?# --- company-dsh-market ---[\s\S]*?# --- \/company-dsh-market ---\n?/g,
      '\n'
    )
  }
  const block =
    `# --- company-dsh-market ---\n` +
    `@zhongruan:registry=${registry}\n` +
    `strict-ssl=false\n` +
    `# --- /company-dsh-market ---\n`
  const next = (body.trimEnd() ? `${body.trimEnd()}\n` : '') + block
  fs.writeFileSync(npmrc, next, 'utf8')
}

function findPathDshBin() {
  if (process.env.DSH_BIN && fs.existsSync(process.env.DSH_BIN)) {
    return process.env.DSH_BIN
  }
  const pathEnv = process.env.PATH || ''
  for (const dir of pathEnv.split(path.delimiter)) {
    const cand = path.join(dir, process.platform === 'win32' ? 'dsh.cmd' : 'dsh')
    if (fs.existsSync(cand)) return cand
  }
  return ''
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

async function findFreePort(start, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    const p = start + i
    if (await portFree(p)) return p
  }
  throw new Error(`无空闲端口（自 ${start} 起试了 ${attempts} 个）`)
}

/** 已有本机 WorkBuddy 引擎则复用，避免 18000 被残留进程占用后改写 client 到 18001 导致 Failed to fetch。 */
function engineHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/api/runtime', timeout: 1500 },
      (res) => {
        let buf = ''
        res.on('data', (c) => {
          buf += c
          if (buf.length > 4096) res.destroy()
        })
        res.on('end', () => {
          try {
            const d = JSON.parse(buf)
            resolve(!!(d && d.ok && Number(d.port) === Number(port)))
          } catch {
            resolve(false)
          }
        })
      }
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function resolveEnginePort() {
  if (await engineHealth(ENGINE_PORT_START)) return ENGINE_PORT_START
  return findFreePort(ENGINE_PORT_START)
}

/** DSH 0.2 启动日志里的带 token 地址。没有 token 就返回空，禁止退回裸地址。 */
function dshWebEntryUrl(_port, logText) {
  return extractDshTokenUrl(logText)
}

function waitForDshTokenUrl(readLog, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const tick = () => {
      const url = extractDshTokenUrl(readLog())
      if (url) {
        resolve(url)
        return
      }
      if (Date.now() >= deadline) {
        resolve('')
        return
      }
      setTimeout(tick, 100)
    }
    tick()
  })
}

function waitHttpOk(port, probePath, timeoutMs = 90000, okCode = 200) {
  const accept = new Set(Array.isArray(okCode) ? okCode : [okCode])
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (shuttingDown) {
        reject(new Error('已退出'))
        return
      }
      const req = http.get(
        { host: '127.0.0.1', port, path: probePath, timeout: 2000 },
        (res) => {
          res.resume()
          if (accept.has(res.statusCode)) {
            resolve()
            return
          }
          retry()
        }
      )
      req.on('error', retry)
      req.on('timeout', () => {
        req.destroy()
        retry()
      })
    }
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error(`等待 ${probePath} 超时（:${port}）`))
        return
      }
      setTimeout(tick, 100)
    }
    tick()
  })
}

function spawnLogged(label, cmd, args, env, cwd) {
  const opts = {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    // 与宿主一样独立进程组：Electron 退出后引擎可继续跑，供下次冷启复用。
    detached: true,
  }
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(String(cmd))) {
    opts.shell = true
  }
  const child = spawn(cmd, args, opts)
  try {
    child.unref()
  } catch {
    /* ignore */
  }
  const prefix = `[${label}]`
  child.stdout.on('data', (buf) => process.stdout.write(`${prefix} ${buf}`))
  child.stderr.on('data', (buf) => process.stderr.write(`${prefix} ${buf}`))
  child.on('exit', (code, signal) => {
    console.log(`${prefix} exit code=${code} signal=${signal}`)
  })
  children.push(child)
  return child
}

function desktopInstallRoot() {
  return killInstallTree.installTreeRoot({
    packaged: app.isPackaged,
    platform: process.platform,
    execPath: process.execPath,
    resourcesPath: process.resourcesPath,
    devRuntimeRoot: runtimeRoot(),
  })
}

/**
 * @param {{ keepBackend?: boolean }} [opts]
 * keepBackend=true：托盘「退出」仍保留宿主+引擎+市场，下次冷启秒开聊天壳。
 * 安装包升级 / 强杀路径仍会走 keepBackend=false 或 cleanup 探测失败后重建。
 */
function killChildren(opts) {
  const keepBackend = !!(opts && opts.keepBackend)
  if (keepBackend) {
    // 故意不杀 children、不扫安装树：宿主/引擎变守护进程，pid 文件留给下次 reuse。
    children.length = 0
    console.log('[desktop] quit: keep host+engine warm for next launch')
    return
  }
  const pids = []
  for (const child of children.splice(0)) {
    if (child && child.pid) pids.push(child.pid)
    try {
      if (child && !child.killed) child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
  // Windows 上 child.kill 不会带走孙进程（市场 serve / uvicorn）
  for (const pid of pids) {
    killInstallTree.killProcessTree(pid)
  }
  try {
    // 不杀 market-merge：跨进程复用合并目录 serve，下次冷启可跳过 Python ensure。
    killInstallTree.killInstallTreeSync(desktopInstallRoot(), {
      excludePids: [process.pid],
      extraPidDirs: [],
    })
  } catch (e) {
    console.warn('[desktop] kill install tree:', e && e.message ? e.message : e)
  }
  try {
    fs.unlinkSync(hostPidFile())
  } catch {
    /* 不存在无所谓 */
  }
  try {
    fs.unlinkSync(hostPortFile())
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(hostEntryUrlFile())
  } catch {
    /* ignore */
  }
}

// host.pid 路径——供 startBundledHost 写、cleanupStaleOrphans 读
function hostPidFile() {
  return path.join(dshHome(), 'host.pid')
}
function hostPortFile() {
  return path.join(dshHome(), 'host.port')
}
function hostEntryUrlFile() {
  return path.join(dshHome(), 'host.entry-url')
}

function processAlive(pid) {
  const p = Number(pid)
  if (!Number.isFinite(p) || p < 1) return false
  try {
    process.kill(p, 0)
    return true
  } catch {
    return false
  }
}

function persistHostEndpoint(port, entryUrl) {
  const p = Number(port)
  if (!Number.isFinite(p) || p < 1) return
  try {
    fs.writeFileSync(hostPortFile(), String(p), 'utf8')
  } catch (e) {
    console.warn('[desktop] 写 host.port 失败:', e && e.message ? e.message : e)
  }
  const url = String(entryUrl || '').trim()
  if (isSafeDshEntryUrl(url)) {
    try {
      fs.writeFileSync(hostEntryUrlFile(), url, 'utf8')
    } catch (e) {
      console.warn('[desktop] 写 host.entry-url 失败:', e && e.message ? e.message : e)
    }
    return
  }
  if (url) {
    console.warn(
      '[desktop] 拒绝保存非回环或无 token 的宿主地址，避免下次打开登录校验页/中毒入口'
    )
  }
  try {
    fs.unlinkSync(hostEntryUrlFile())
  } catch {
    /* 本来就没有 */
  }
}

/** 上一轮退出保留的宿主仍健康 → 直接复用，跳过 ~14s dsh web 冷启。 */
async function tryReuseBundledHost() {
  let pid = 0
  let port = 0
  try {
    pid = parseInt(String(fs.readFileSync(hostPidFile(), 'utf8')).trim().split(/\s+/)[0], 10)
  } catch {
    return null
  }
  try {
    port = parseInt(String(fs.readFileSync(hostPortFile(), 'utf8')).trim(), 10)
  } catch {
    port = DSH_PORT_START
  }
  if (!(pid > 0 && port > 0)) return null
  if (!processAlive(pid)) return null
  try {
    await waitHttpOk(port, '/', 2000, [200, 303, 401])
  } catch {
    return null
  }
  let url = ''
  try {
    url = String(fs.readFileSync(hostEntryUrlFile(), 'utf8')).trim()
  } catch {
    url = ''
  }
  if (!isSafeDshEntryUrl(url)) {
    console.warn('[desktop] 已运行宿主没有安全的 token 回环地址，放弃复用并冷启')
    return null
  }
  console.log('[desktop] reuse host pid=', pid, 'port=', port)
  return {
    port,
    detail: `复用已运行宿主 pid=${pid}`,
    log: '',
    url,
  }
}

/** 只停聊天壳宿主（释放 node_modules 文件锁）；引擎与托盘保留。 */
function stopBundledHostOnly() {
  let hostPid = 0
  try {
    hostPid = parseInt(fs.readFileSync(hostPidFile(), 'utf8').trim(), 10) || 0
  } catch {
    hostPid = 0
  }
  if (hostPid > 0) {
    try {
      killInstallTree.killProcessTree(hostPid)
    } catch (e) {
      console.warn('[desktop] stop host tree:', e && e.message ? e.message : e)
    }
  }
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i]
    if (!child || !child.pid) continue
    if (hostPid > 0 && child.pid !== hostPid) continue
    // 无 pid 文件时：不误杀引擎；仅当命令行含 dsh web 才清（保守：有 hostPid 才按 pid 剔）
    if (hostPid > 0 && child.pid === hostPid) {
      children.splice(i, 1)
      try {
        if (!child.killed) child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
    }
  }
  try {
    fs.unlinkSync(hostPidFile())
  } catch {
    /* ignore */
  }
  backendHostPort = 0
}

/**
 * Windows 插件市场占文件锁时的离线更新：停宿主 → pnpm add → 再起宿主。
 * 不改 dshmarket；Electron 本身不加载 profile 插件模块。
 */
async function offlineUpdatePluginAndRestart(packageSpec) {
  const profileDir = path.join(dshHome(), 'profiles', 'web')
  const nodeBin = findHostNodeBinary()
  const pnpmCjs = findBundledPnpmCjs()
  const appRoot = persistedAppRoot || path.join(app.getPath('userData'), 'runtime-app')
  const enginePort = backendEnginePort || bootEnginePort
  if (!enginePort) throw new Error('引擎端口未知，请先完整启动一次后再试离线更新')
  if (!nodeBin || !pnpmCjs) throw new Error('安装包缺少 Node/pnpm，无法离线更新插件')

  setBootStatus('正在停止聊天壳以便更新插件…')
  stopBundledHostOnly()
  // Windows：句柄释放有滞后；探测目标目录可改名后再 pnpm，避免仍报 EPERM
  {
    const m = String(packageSpec).match(/^(@[^/]+\/[^@]+|[^@]+)/)
    const pkgName = m ? m[1] : ''
    const target = pkgName
      ? path.join(profileDir, 'node_modules', ...pkgName.split('/'))
      : ''
    const until = Date.now() + 15000
    while (target && fs.existsSync(target) && Date.now() < until) {
      try {
        const probe = `${target}.__unlock_probe__`
        fs.renameSync(target, probe)
        fs.renameSync(probe, target)
        break
      } catch {
        await new Promise((r) => setTimeout(r, 250))
      }
    }
  }

  const market = loadCompanyDshMarketEnv(appRoot)
  const registryUrl = ensureMergedMarketCatalog(appRoot, market)
  const env = applyDesktopToolchain({
    ...process.env,
    DSH_HOME: dshHome(),
    ...(registryUrl ? { DSHM_REGISTRY_URL: registryUrl } : {}),
    ...(market.ZHONGRUAN_NPM_REGISTRY
      ? { ZHONGRUAN_NPM_REGISTRY: market.ZHONGRUAN_NPM_REGISTRY }
      : {}),
  })

  setBootStatus('正在离线更新插件…')
  const result = updatePluginOffline({
    profileDir,
    nodeBin,
    pnpmCjs,
    packageSpec,
    env,
  })

  // pnpm 可能再装回无 dist 的 zod@3.25.0；写码依赖必须立刻补齐
  try {
    const ensureZod = path.join(appRoot, 'scripts', 'lib', 'ensure_cursor_sdk_zod.py')
    const py = process.env.APP_ENGINE_PYTHON || findPython()
    const tgz = path.join(appRoot, 'vendor', 'zod', 'zod-3.25.67.tgz')
    if (py && fs.existsSync(ensureZod)) {
      const zodEnv = { ...env }
      if (fs.existsSync(tgz)) zodEnv.WORKBUDDY_ZOD_TARBALL = tgz
      zodEnv.WORKBUDDY_APP_ROOT = appRoot
      execFileSync(py, [ensureZod, profileDir, '--fix', '--require'], {
        cwd: path.dirname(ensureZod),
        env: zodEnv,
        encoding: 'utf8',
        timeout: 120000,
        windowsHide: true,
      })
      result.zodRepaired = true
    }
  } catch (e) {
    console.warn('[desktop] 离线更新后补齐 zod 失败:', e && e.message ? e.message : e)
    result.zodRepaired = false
  }

  setBootStatus('正在重新启动聊天壳…')
  const host = await startBundledHost(enginePort, appRoot)
  backendHostPort = host.port
  if (host.port > 0 && isSafeDshEntryUrl(host.url) && mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(host.url)
    mainWindow.show()
    mainWindow.focus()
  }
  return result
}

// 启动前清理上一轮残留：桌面壳被 taskkill / 崩溃 / 断电强杀时，
// before-quit → killChildren 不会跑，市场合并助手（httpd.pid）和旧宿主（host.pid）
// 会成孤儿占着 18732 / 3081，导致新轮 dshmarket helper 绑端口失败 → "helper exiting (code 0)"。
// 这里在起宿主/市场之前按 pid 文件精准清掉，不按端口乱杀。
function cleanupStaleOrphans() {
  // 不再无条件杀掉 market-merge：健康实例可被 tryReuseMergedMarketCatalog 复用。
  // 真正退出仍由 killChildren → killInstallTree(extraPidDirs) 收干净。
  try {
    const raw = fs.readFileSync(hostPidFile(), 'utf8')
    const pid = parseInt(String(raw).trim().split(/\s+/)[0], 10)
    if (pid > 0 && pid !== process.pid) {
      try {
        killInstallTree.killProcessTree(pid)
        console.log('[desktop] 清理上一轮残留宿主 pid=', pid)
      } catch {
        /* 进程可能已不在 */
      }
    }
    fs.unlinkSync(hostPidFile())
  } catch {
    /* 无 host.pid：首轮或已清，跳过 */
  }
}

function pathExists(p) {
  try {
    fs.lstatSync(p)
    return true
  } catch {
    return false
  }
}

/** 把内嵌 dshmarket 拷进隔离 profile，设置里才会出现「插件市场」（web 端，不是官方 Desktop 插件中心）。 */
function ensureMarketInProfile(profile) {
  const srcNm = path.join(marketRuntimeRoot(), 'node_modules')
  const result = installMarketIntoProfile(srcNm, profile)
  if (result.reason === 'missing-source') {
    console.warn('[desktop] 未内嵌 dshmarket，设置里不会有「插件市场」')
    return
  }
  if (result.installed) {
    console.log(`[desktop] 已安装内嵌插件市场 ${MARKET_PKG}@${result.wantVer}（含 undici≥7）`)
  }
}

/** 把产品 link 指到安装副本，并确保 profile 含 mes-bridge。 */
function ensureWorkBuddyWire(appRoot) {
  const home = dshHome()
  const linkDir = path.join(home, 'link')
  const linkRepo = path.join(linkDir, LINK_NAME)
  const profile = path.join(home, 'profiles', 'web')
  const profilePkg = path.join(profile, 'package.json')
  const patchPath = path.join(profile, 'cordis.patch.yml')

  fs.mkdirSync(linkDir, { recursive: true })
  relinkDirToHost(linkRepo, appRoot)

  if (!fs.existsSync(profilePkg)) {
    return {
      ok: false,
      detail: `尚未初始化 DSH profile（缺 ${profilePkg}）`,
    }
  }

  const linkSpec = `link:../../link/${LINK_NAME}/apps/zr-workbuddy/plugins/mes-bridge`
  const pkg = JSON.parse(fs.readFileSync(profilePkg, 'utf8'))
  pkg.dependencies = pkg.dependencies || {}
  let changed = false
  if (pkg.dependencies[BRIDGE_PKG] !== linkSpec) {
    pkg.dependencies[BRIDGE_PKG] = linkSpec
    changed = true
  }
  pkg.dsh = pkg.dsh || {}
  pkg.dsh.profile = pkg.dsh.profile || {}
  const bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : []
  if (!pkg.dependencies[MARKET_PKG]) {
    pkg.dependencies[MARKET_PKG] = '1.34.0'
    changed = true
  }
  if (!bundles.includes(MARKET_PKG)) {
    pkg.dsh.profile.bundles = bundles.concat([MARKET_PKG])
    changed = true
  }
  let bundlesNow = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles.slice() : []
  // 中软包未进 node_modules 前不写入依赖、不卸 lemoncat7（与 ensure_dsh_knowledge.py 一致）
  const kbInstalled = fs.existsSync(
    path.join(profile, 'node_modules', ...KB_PKG.split('/'), 'package.json')
  )
  if (kbInstalled) {
    for (const legacy of KB_LEGACY_PKGS) {
      if (legacy === KB_PKG) continue
      if (pkg.dependencies[legacy]) {
        delete pkg.dependencies[legacy]
        changed = true
      }
      if (bundlesNow.includes(legacy)) {
        bundlesNow = bundlesNow.filter((b) => b !== legacy)
        changed = true
      }
    }
    if (!pkg.dependencies[KB_PKG]) {
      pkg.dependencies[KB_PKG] = KB_VERSION
      changed = true
    }
    if (!bundlesNow.includes(KB_PKG)) {
      bundlesNow = bundlesNow.concat([KB_PKG])
      changed = true
    }
  }
  pkg.dsh.profile.bundles = bundlesNow
  if (changed) {
    fs.writeFileSync(profilePkg, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  }

  // 知识库：pnpm install 前写好 allowBuilds + 关回写（与 scripts/lib/ensure_dsh_knowledge.py 一致）
  try {
    const ensureKb = path.join(appRoot, 'scripts', 'lib', 'ensure_dsh_knowledge.py')
    if (fs.existsSync(ensureKb)) {
      const py =
        process.env.APP_ENGINE_PYTHON || findPython() || 'python3'
      execFileSync(py, [ensureKb, profile], {
        cwd: appRoot,
        env: { ...process.env, DSH_HOME: home },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
      })
    }
  } catch (e) {
    console.warn('[desktop] ensure dsh-knowledge:', e && e.message ? e.message : e)
  }

  // 用量计量：只写 cordis 启用配置；未进 node_modules 前不写依赖（与 ensure_dsh_llm_meter.py 一致）
  try {
    const ensureMeter = path.join(appRoot, 'scripts', 'lib', 'ensure_dsh_llm_meter.py')
    if (fs.existsSync(ensureMeter)) {
      const py =
        process.env.APP_ENGINE_PYTHON || findPython() || 'python3'
      execFileSync(py, [ensureMeter, profile], {
        cwd: appRoot,
        env: { ...process.env, DSH_HOME: home },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
      })
    }
  } catch (e) {
    console.warn('[desktop] ensure dsh-llm-meter:', e && e.message ? e.message : e)
  }

  // dsh 首次生成的 cordis.patch.yml 正文是单独的 []；后面再拼 - insert 会变成非法 YAML。
  // name 必须是 npm 包名：client-modules 用 require.resolve(name/package.json) 发现
  // dsh.client，才会把 Bridge 的 client.js 打进设置侧栏（WorkBuddy 配置中心）。
  const bridgeBlock =
    `# --- ${BRIDGE_ID} (WorkBuddy bridge) ---\n` +
    `- insert:\n` +
    `    - id: ${BRIDGE_ID}\n` +
    `      name: '${BRIDGE_PKG}'\n`

  let patch = fs.existsSync(patchPath) ? fs.readFileSync(patchPath, 'utf8') : ''
  const contentLines = patch
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  const withoutComments = contentLines.join('\n')
  const isEmptyArrayDoc = withoutComments === '[]' || withoutComments === ''
  const hasLeadingEmptyArray =
    contentLines.length > 1 && contentLines[0] === '[]'
  const hasBridgeRow = /(?:^|\n)\s*-?\s*id:\s*dsh-mes-bridge\b/.test(patch)
  const hasBridgePkgName = new RegExp(`name:\\s*'${BRIDGE_PKG.replace('/', '\\/')}'`).test(
    patch
  )
  const hasLegacyRel = patch.includes(BRIDGE_REL_LEGACY)
  const needsBridgeRewrite =
    isEmptyArrayDoc ||
    hasLeadingEmptyArray ||
    !hasBridgeRow ||
    !hasBridgePkgName ||
    hasLegacyRel

  if (needsBridgeRewrite) {
    // 保留文件头注释（去掉单独的 [] 与旧 bridge 块），再写入合法列表
    const header = patch
      .split('\n')
      .filter((line) => {
        const t = line.trim()
        if (t === '[]') return false
        if (/^-\s*insert:/.test(t)) return false
        if (/id:\s*dsh-mes-bridge/.test(t)) return false
        if (/name:\s*'@dsh-external\/dsh-mes-bridge'/.test(t)) return false
        if (/name:\s*'?\.\.\/\.\.\/link\/DSH-ZR-WorkBuddy\/apps\/zr-workbuddy\/plugins\/mes-bridge/.test(t))
          return false
        if (/^# --- dsh-mes-bridge/.test(t)) return false
        return true
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()
    patch = `${header}\n\n${bridgeBlock}`
    fs.writeFileSync(patchPath, patch, 'utf8')
    changed = true
  }

  const bridgeLinked = path.join(profile, 'node_modules', ...BRIDGE_PKG.split('/'))
  const needInstall = changed || !fs.existsSync(bridgeLinked)
  if (needInstall) {
    try {
      const pnpm = findBundledPnpm()
      const hostNode = findHostNodeBinary() || process.execPath
      const env = applyDesktopToolchain({ ...process.env, CI: 'true', DSH_HOME: home })
      delete env.ELECTRON_RUN_AS_NODE
      if (pnpm) {
        execFileSync(hostNode, [pnpm, 'install'], {
          cwd: profile,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 300000,
        })
      } else {
        execFileSync('pnpm', ['install'], {
          cwd: profile,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 300000,
        })
      }
    } catch (e) {
      console.warn('[desktop] profile pnpm install:', e.message || e)
      // link 协议兜底：直接把 bridge 链进 profile node_modules
      try {
        const dst = bridgeLinked
        fs.mkdirSync(path.dirname(dst), { recursive: true })
        try {
          fs.lstatSync(dst)
          fs.rmSync(dst, { force: true, recursive: true })
        } catch {
          /* missing */
        }
        const src = path.join(appRoot, 'apps', 'zr-workbuddy', 'plugins', 'mes-bridge')
        fs.symlinkSync(src, dst)
      } catch (e2) {
        return { ok: false, detail: `Bridge 依赖安装失败: ${e2.message || e2}` }
      }
    }
  }

  // 在 pnpm 之后再拷：隔离 profile 通常没有 pnpm，靠内嵌包出现「插件市场」。
  ensureMarketInProfile(profile)

  // 公司插件市场：仅写 @zhongruan 私有源到本 profile（不改其它依赖）
  try {
    const market = loadCompanyDshMarketEnv(appRoot)
    ensureCompanyMarketNpmrc(profile, market.ZHONGRUAN_NPM_REGISTRY)
  } catch (e) {
    console.warn('[desktop] company market npmrc:', e && e.message ? e.message : e)
  }

  // 中软知识库：npmrc 就绪后再试装；失败则回滚依赖登记，不拖垮桌面接线
  try {
    const kbPkgJson = path.join(profile, 'node_modules', ...KB_PKG.split('/'), 'package.json')
    if (!fs.existsSync(kbPkgJson) && fs.existsSync(profilePkg)) {
      const pkgKb = JSON.parse(fs.readFileSync(profilePkg, 'utf8'))
      pkgKb.dependencies = pkgKb.dependencies || {}
      pkgKb.dsh = pkgKb.dsh || {}
      pkgKb.dsh.profile = pkgKb.dsh.profile || {}
      let bundlesKb = Array.isArray(pkgKb.dsh.profile.bundles)
        ? pkgKb.dsh.profile.bundles.slice()
        : []
      pkgKb.dependencies[KB_PKG] = KB_VERSION
      if (!bundlesKb.includes(KB_PKG)) bundlesKb = bundlesKb.concat([KB_PKG])
      pkgKb.dsh.profile.bundles = bundlesKb
      fs.writeFileSync(profilePkg, JSON.stringify(pkgKb, null, 2) + '\n', 'utf8')
      try {
        const pnpm = findBundledPnpm()
        const hostNode = findHostNodeBinary() || process.execPath
        const env = applyDesktopToolchain({ ...process.env, CI: 'true', DSH_HOME: home })
        delete env.ELECTRON_RUN_AS_NODE
        if (pnpm) {
          execFileSync(hostNode, [pnpm, 'install'], {
            cwd: profile,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 300000,
          })
        } else {
          execFileSync('pnpm', ['install'], {
            cwd: profile,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 300000,
          })
        }
        const ensureKb = path.join(appRoot, 'scripts', 'lib', 'ensure_dsh_knowledge.py')
        if (fs.existsSync(ensureKb) && fs.existsSync(kbPkgJson)) {
          const py =
            process.env.APP_ENGINE_PYTHON || findPython() || 'python3'
          execFileSync(py, [ensureKb, profile], {
            cwd: appRoot,
            env: { ...process.env, DSH_HOME: home },
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 60000,
          })
        }
      } catch (kbErr) {
        console.warn(
          '[desktop] 预装知识库失败（包未发布或网络问题可忽略）:',
          kbErr && kbErr.message ? kbErr.message : kbErr
        )
        try {
          const rollback = JSON.parse(fs.readFileSync(profilePkg, 'utf8'))
          if (rollback.dependencies) delete rollback.dependencies[KB_PKG]
          if (rollback.dsh && rollback.dsh.profile && Array.isArray(rollback.dsh.profile.bundles)) {
            rollback.dsh.profile.bundles = rollback.dsh.profile.bundles.filter(
              (b) => b !== KB_PKG
            )
          }
          fs.writeFileSync(profilePkg, JSON.stringify(rollback, null, 2) + '\n', 'utf8')
        } catch {
          /* ignore */
        }
      }
    }
  } catch (e) {
    console.warn('[desktop] knowledge soft-install:', e && e.message ? e.message : e)
  }

  // 中软用量计量：npmrc 就绪后再试装；失败则回滚依赖登记，不拖垮桌面接线
  try {
    const meterPkgJson = path.join(profile, 'node_modules', ...METER_PKG.split('/'), 'package.json')
    if (!fs.existsSync(meterPkgJson) && fs.existsSync(profilePkg)) {
      const pkgMeter = JSON.parse(fs.readFileSync(profilePkg, 'utf8'))
      pkgMeter.dependencies = pkgMeter.dependencies || {}
      pkgMeter.dsh = pkgMeter.dsh || {}
      pkgMeter.dsh.profile = pkgMeter.dsh.profile || {}
      let bundlesMeter = Array.isArray(pkgMeter.dsh.profile.bundles)
        ? pkgMeter.dsh.profile.bundles.slice()
        : []
      pkgMeter.dependencies[METER_PKG] = METER_VERSION
      if (!bundlesMeter.includes(METER_PKG)) bundlesMeter = bundlesMeter.concat([METER_PKG])
      pkgMeter.dsh.profile.bundles = bundlesMeter
      fs.writeFileSync(profilePkg, JSON.stringify(pkgMeter, null, 2) + '\n', 'utf8')
      try {
        const pnpm = findBundledPnpm()
        const hostNode = findHostNodeBinary() || process.execPath
        const env = applyDesktopToolchain({ ...process.env, CI: 'true', DSH_HOME: home })
        delete env.ELECTRON_RUN_AS_NODE
        if (pnpm) {
          execFileSync(hostNode, [pnpm, 'install'], {
            cwd: profile,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 300000,
          })
        } else {
          execFileSync('pnpm', ['install'], {
            cwd: profile,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 300000,
          })
        }
        const ensureMeter = path.join(appRoot, 'scripts', 'lib', 'ensure_dsh_llm_meter.py')
        if (fs.existsSync(ensureMeter) && fs.existsSync(meterPkgJson)) {
          const py =
            process.env.APP_ENGINE_PYTHON || findPython() || 'python3'
          execFileSync(py, [ensureMeter, profile], {
            cwd: appRoot,
            env: { ...process.env, DSH_HOME: home },
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 60000,
          })
        }
      } catch (meterErr) {
        console.warn(
          '[desktop] 预装用量计量失败（包未发布或网络问题可忽略）:',
          meterErr && meterErr.message ? meterErr.message : meterErr
        )
        try {
          const rollback = JSON.parse(fs.readFileSync(profilePkg, 'utf8'))
          if (rollback.dependencies) delete rollback.dependencies[METER_PKG]
          if (rollback.dsh && rollback.dsh.profile && Array.isArray(rollback.dsh.profile.bundles)) {
            rollback.dsh.profile.bundles = rollback.dsh.profile.bundles.filter(
              (b) => b !== METER_PKG
            )
          }
          fs.writeFileSync(profilePkg, JSON.stringify(rollback, null, 2) + '\n', 'utf8')
        } catch {
          /* ignore */
        }
      }
    }
  } catch (e) {
    console.warn('[desktop] llm-meter soft-install:', e && e.message ? e.message : e)
  }

  // 避免市场装公司插件时被 gh-proxy 皮肤包拖死
  try {
    ensureWhaleMusumeOffline(profile)
  } catch (e) {
    console.warn('[desktop] whale offline:', e && e.message ? e.message : e)
  }

  return { ok: true, detail: `link → ${appRoot}` }
}

async function startEngine(engineDir, port) {
  const launcher = findEngineLauncher()
  if (!launcher && !fs.existsSync(path.join(runtimeRoot(), 'python'))) {
    throw new Error('缺少内嵌引擎运行时，请先 python scripts/lib/package_desktop.py')
  }
  writeEngineRuntime(engineDir, port)
  if (await engineHealth(port)) {
    console.log('[desktop] 复用已在监听的引擎 :' + port)
    return port
  }
  const pyHome = path.join(runtimeRoot(), 'python')
  const env = applyDesktopToolchain({
    ...process.env,
    PYTHONUNBUFFERED: '1',
    DSH_HOME: dshHome(),
    WORKBUDDY_DESKTOP: '1',
    WORKBUDDY_ENGINE_DIR: engineDir,
    WORKBUDDY_ENGINE_HOST: '127.0.0.1',
    WORKBUDDY_ENGINE_PORT: String(port),
    APP_ENGINE_HOST: '127.0.0.1',
    APP_ENGINE_PORT: String(port),
    MPLBACKEND: 'Agg',
    VECLIB_MAXIMUM_THREADS: '1',
    OPENBLAS_NUM_THREADS: '1',
  })
  const pyBins =
    process.platform === 'win32'
      ? [path.join(pyHome, 'Scripts'), pyHome]
      : [path.join(pyHome, 'bin')]
  assignPath(env, pyBins)
  const runEngine = path.join(runtimeRoot(), 'app', 'desktop', 'py', 'run_engine.py')
  const pyExec = findPython()
  if (pyExec) env.APP_ENGINE_PYTHON = pyExec
  if (pyExec && fs.existsSync(runEngine)) {
    spawnLogged('engine', pyExec, [runEngine], env, engineDir)
  } else if (launcher) {
    spawnLogged('engine', launcher, [], env, path.dirname(launcher))
  } else {
    throw new Error(
      '无法启动引擎：内嵌 Python 断链或缺失。请重新执行 python scripts/lib/package_desktop.py（勿用坏掉的 runtime/python）。'
    )
  }
  await waitHttpOk(port, '/api/runtime', 120000)
  return port
}

function persistCompanyMarketEnv(registryUrl) {
  if (!registryUrl) return
  const safeUrl = String(registryUrl || '')
    .replace(/[\r\n\t ]+/g, '')
    .trim()
  const okUrl =
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(safeUrl) ||
    /^https:\/\//i.test(safeUrl) ||
    /^http:\/\/175\.178\.238\.31\//i.test(safeUrl)
  if (!okUrl) {
    console.warn('[desktop] 拒绝写入非法 DSHM_REGISTRY_URL:', registryUrl)
    return
  }
  const envf = path.join(dshHome(), '.env')
  let body = ''
  if (fs.existsSync(envf)) {
    body = fs
      .readFileSync(envf, 'utf8')
      .replace(
        /\n?# --- workbuddy-company-market ---[\s\S]*?# --- \/workbuddy-company-market ---\n?/g,
        '\n'
      )
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()
  }
  const block =
    `\n# --- workbuddy-company-market ---\n` +
    `# LOCKED by WorkBuddy — 勿手删；改市场须走 scripts/host.sh + 破窗变量\n` +
    `DSHM_REGISTRY_URL=${safeUrl}\n` +
    `# --- /workbuddy-company-market ---\n`
  fs.writeFileSync(envf, (body ? body + '\n' : '') + block, 'utf8')
}

/**
 * 桌面壳 CLI 传 --port 13080+，但 profile cordis.patch.yml 里 webserver.port
 * 常被首次 dsh web 写成 3081。若本机还有开发壳占着 3081，内嵌 Host 会
 * EADDRINUSE 秒崩，启动页永远停在「正在启动服务…」。启动前把 patch 端口对齐。
 */
function ensureDesktopWebserverPort(port) {
  const p = Number(port)
  if (!Number.isFinite(p) || p < 1) return
  const patchPath = path.join(dshHome(), 'profiles', 'web', 'cordis.patch.yml')
  if (!fs.existsSync(patchPath)) return
  let text = fs.readFileSync(patchPath, 'utf8')
  const re = /(- id:\s*webserver\b[\s\S]*?\bport:\s*)(\d+)/m
  if (!re.test(text)) {
    const block =
      `- id: webserver\n` +
      `  config:\n` +
      `    host: 127.0.0.1\n` +
      `    port: ${p}\n\n`
    text = block + text
    fs.writeFileSync(patchPath, text, 'utf8')
    console.log(`[desktop] 已写入 profile webserver.port=${p}`)
    return
  }
  const next = text.replace(re, `$1${p}`)
  if (next === text) return
  fs.writeFileSync(patchPath, next, 'utf8')
  console.log(`[desktop] profile webserver.port → ${p}（避免与本机 :3081 开发壳冲突）`)
}

async function startBundledHost(enginePort, appRoot, opts) {
  const cli = findBundledCliEntry()
  const port = await findFreePort(DSH_PORT_START)
  ensureDesktopWebserverPort(port)
  const hostNode = findHostNodeBinary()
  const market = loadCompanyDshMarketEnv(appRoot)
  // 优先用 boot 已解析的 registryUrl，禁止在此再跑一遍 Python ensure（曾双计数秒）。
  let registryUrl = opts && opts.registryUrl ? String(opts.registryUrl).trim() : ''
  if (!registryUrl) {
    const reused = await tryReuseMergedMarketCatalog()
    registryUrl = reused || ensureMergedMarketCatalog(appRoot, market)
  }
  const env = applyDesktopToolchain({
    ...process.env,
    DSH_HOME: dshHome(),
    APP_ENGINE_HOST: '127.0.0.1',
    APP_ENGINE_PORT: String(enginePort),
    DSH_DESKTOP: '1',
    WORKBUDDY_DESKTOP: '1',
    // 供 mes-bridge coding-zod-gate 定位包内 ensure_cursor_sdk_zod / vendor/zod
    WORKBUDDY_APP_ROOT: appRoot,
    NODE_COMPILE_CACHE: path.join(app.getPath('userData'), 'v8-compile-cache'),
    ...(registryUrl ? { DSHM_REGISTRY_URL: registryUrl } : {}),
    ...(process.env.DSHM_NPM_MIRROR ? { DSHM_NPM_MIRROR: process.env.DSHM_NPM_MIRROR } : {}),
    ...(market.ZHONGRUAN_NPM_REGISTRY
      ? { ZHONGRUAN_NPM_REGISTRY: market.ZHONGRUAN_NPM_REGISTRY }
      : {}),
  })
  if (registryUrl) {
    console.log('[desktop] 插件市场目录:', registryUrl)
    if (env.DSHM_NPM_MIRROR) {
      console.log('[desktop] 插件 npm 镜像(含公司包更新检测):', env.DSHM_NPM_MIRROR)
    }
    try {
      persistCompanyMarketEnv(registryUrl)
    } catch (e) {
      console.warn('[desktop] 写入 DSH_HOME/.env 市场目录失败:', e && e.message ? e.message : e)
    }
  } else {
    console.log('[desktop] 插件市场目录: dshmarket 默认官方')
  }
  // 切勿把 ELECTRON_RUN_AS_NODE 留给宿主：会误用 Electron 的 Node 20
  delete env.ELECTRON_RUN_AS_NODE

  const hostLog = []
  const note = (buf) => {
    const s = buf.toString()
    process.stderr.write(`[host] ${redactHostSecrets(s)}`)
    hostLog.push(s)
    if (hostLog.length > 80) hostLog.shift()
  }

  const waitHost = async (child, detail) => {
    child.stdout.on('data', note)
    child.stderr.on('data', note)
    let childExit = null
    const onChildExit = (code, signal) => {
      childExit = { code, signal }
    }
    child.once('exit', onChildExit)
    const hostUp = async (ms) => {
      try {
        // 401：DSH 0.2 本机门锁，进程已在听，裸地址要等带 token 的那一次打开。
        await waitHttpOk(port, '/', ms, [200, 303, 401])
        return true
      } catch {
        return false
      }
    }
    const waitHttpOrExit = async (pathName, ms, okCodes) => {
      const deadline = Date.now() + ms
      while (Date.now() < deadline) {
        if (childExit) {
          const tail = redactHostSecrets(hostLog.join('').slice(-1200))
          throw new Error(
            `宿主进程已退出 code=${childExit.code} signal=${childExit.signal || ''}\n` +
              (tail || '(无输出)')
          )
        }
        const slice = Math.min(2000, Math.max(200, deadline - Date.now()))
        try {
          await waitHttpOk(port, pathName, slice, okCodes)
          return
        } catch {
          /* retry until deadline or child exit */
        }
      }
      await waitHttpOk(port, pathName, 1000, okCodes)
    }
    try {
      // DSH 0.2：/` 返回 401 表示壳已在听。裸请求 /plugins/.../client.js 常一直 404
      //（要带启动日志里的 token），再死等只会让启动页停在「正在启动服务…」。
      await waitHttpOrExit('/', 120000, [200, 303, 401])
      // 401 只说明端口在听。必须等到日志里的 token 地址再开窗，否则页面停在 authentication required。
      const url = await waitForDshTokenUrl(() => hostLog.join(''), 20000)
      child.removeListener('exit', onChildExit)
      if (!url) {
        throw new Error(
          '宿主已在听，但启动日志里没有带 token 的打开地址。拒绝打开裸地址，否则会停在登录校验页。'
        )
      }
      persistHostEndpoint(port, url)
      return { port, detail, log: hostLog.join(''), url }
    } catch (e) {
      child.removeListener('exit', onChildExit)
      const msg = e && e.message ? e.message : String(e)
      // 壳已经在听：不要杀掉退回引擎页（资料库预览层曾把登录挡成白屏）
      if (await hostUp(2500)) {
        const url = await waitForDshTokenUrl(() => hostLog.join(''), 5000)
        if (url) {
          console.warn('[desktop] 宿主已响应，插件仍在加载，仍打开带 token 的聊天壳:', msg)
          persistHostEndpoint(port, url)
          return {
            port,
            detail: `${detail}（插件未齐：${msg}）`,
            log: hostLog.join(''),
            url,
          }
        }
        console.warn('[desktop] 宿主已响应但没有 token 地址，拒绝打开登录校验页:', msg)
      }
      try {
        if (child && child.pid) killInstallTree.killProcessTree(child.pid)
        else child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      const tail = redactHostSecrets(hostLog.join('').slice(-1200))
      return {
        port: 0,
        detail: `${msg}\n--- host 日志 ---\n${tail || '(无输出)'}`,
      }
    }
  }

  if (cli && hostNode) {
    console.log('[desktop] host node:', hostNode, 'major=', nodeMajorOf(hostNode))
    const child = spawn(
      hostNode,
      ['--expose-internals', cli, 'web', '--no-open', '--host', '127.0.0.1', '--port', String(port)],
      {
        cwd: app.getPath('home'),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      }
    )
    try {
      child.unref()
    } catch {
      /* ignore */
    }
    children.push(child)
    try {
      fs.writeFileSync(hostPidFile(), String(child.pid), { encoding: 'utf8' })
    } catch (e) {
      console.warn('[desktop] 写 host.pid 失败:', e && e.message ? e.message : e)
    }
    return waitHost(child, `内嵌 Host（dsh web @ Node ${nodeMajorOf(hostNode)}）`)
  }

  if (cli && !hostNode) {
    return {
      port: 0,
      detail:
        '安装包缺少 Node≥22 运行时（DSH 宿主不能跑在 Electron 内嵌 Node 20 上）。\n' +
        '请重装 0.2.8+ 一体包，或设置 WORKBUDDY_HOST_NODE 指向本机 node（≥22）。',
    }
  }

  const dsh = findPathDshBin()
  if (!dsh) {
    return { port: 0, detail: '安装包缺少内嵌 Host，且 PATH 无 dsh' }
  }
  const child = spawn(
    dsh,
    ['web', '--no-open', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: app.getPath('home'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    }
  )
  try {
    child.unref()
  } catch {
    /* ignore */
  }
  children.push(child)
  return waitHost(child, '本机 dsh')
}

/** 启动画面：打包后必须用真实文件 loadFile，且必须 await 完成后再去做引擎/宿主。
 *  根因（已实测）：createWindow 里 fire-and-forget loadSplash，boot 稍后 loadURL(宿主)
 *  会 ERR_ABORTED 打断启动页 → 白屏；show:false 时甚至整窗不出现。
 *  splash.html 同时进 asar(files) 与 resources/(extraResources)，优先窗外路径更稳。 */
function splashHtmlPath() {
  if (app.isPackaged) {
    const outside = path.join(process.resourcesPath, 'splash.html')
    if (fs.existsSync(outside)) return outside
  }
  return path.join(__dirname, 'splash.html')
}

/** boot 早期即可确定的引擎端口（先弹启动页再 await resolve）。 */
let bootEngineHost = '127.0.0.1'
let bootEnginePort = 0

/** 启动画面当前进度文案。 */
let bootStatusText = '正在启动…'

function setBootStatus(text) {
  bootStatusText = text
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents
      .executeJavaScript(
        `var el=document.getElementById('status');if(el){el.textContent=${JSON.stringify(text)};}`
      )
      .catch(() => {})
  }
}

/** 加载启动页：必须 await 完成后再 loadURL(宿主)，否则会 ERR_ABORTED → 白屏。
 *  缺文件/加载失败只打日志并 show 窗口，不拖垮 boot（热启单例问题另案处理）。 */
async function loadSplashHtml(win) {
  if (!win || win.isDestroyed()) return
  const file = splashHtmlPath()
  let loaded = false
  if (fs.existsSync(file)) {
    try {
      await win.loadFile(file)
      loaded = true
      console.log('[desktop] splash loadFile OK', file)
    } catch (e1) {
      console.warn(
        '[desktop] splash loadFile 失败，改 pathToFileURL:',
        e1 && e1.message ? e1.message : e1
      )
      try {
        await win.loadURL(pathToFileURL(file).href)
        loaded = true
        console.log('[desktop] splash loadURL OK', file)
      } catch (e2) {
        console.warn(
          '[desktop] splash 加载失败（继续启动）:',
          e2 && e2.message ? e2.message : e2
        )
      }
    }
  } else {
    console.warn('[desktop] 缺少 splash.html，跳过启动页:', file)
  }
  // 冷启动必须可见：禁止 show:false 空等 ready-to-show（曾导致整窗不出现/白屏）
  if (win && !win.isDestroyed()) {
    if (!win.isVisible()) win.show()
    if (!loaded) {
      win.webContents
        .executeJavaScript(
          `document.body && (document.body.style.background='#f6faf7');` +
            `var el=document.getElementById('status');if(el)el.textContent=${JSON.stringify(bootStatusText)};`
        )
        .catch(() => {})
    }
  }
}

/** 简单探活：宿主/引擎端口是否在 serve（重开时判断后端是否还热）。 */
function httpAlive(port, probePath = '/') {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: probePath, timeout: 1500 }, (res) => {
      res.resume()
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

/** 开机后台自启（带 --workbuddy-background，只起后端+托盘、不弹窗）——开机后第一次开也秒开。
 *  Windows 直接写 Run 注册表，键名用「MOM」——setLoginItemSettings 在未签名 exe 上会取 exe 元数据，
 *  而 exe 元数据因 signAndEditExecutable=false 是 "Electron"，导致启动项显示成 "Electron"。直接写注册表可定名。
 *  测试 win-unpacked 时可用 WORKBUDDY_NO_AUTOSTART=1 关掉，避免污染登录项。 */
function setupAutoStart() {
  if (!app.isPackaged || process.env.WORKBUDDY_NO_AUTOSTART) return
  const runArg = '--workbuddy-background'
  if (process.platform !== 'win32') {
    try {
      app.setLoginItemSettings({ openAtLogin: true, args: [runArg] })
    } catch (e) {
      console.warn('[desktop] 设置开机自启失败:', e && e.message ? e.message : e)
    }
    return
  }
  try {
    const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
    const value = `"${process.execPath}" ${runArg}`
    for (const oldName of ['Mom-x', 'ZR WorkBuddy', '江西中软']) {
      try {
        execFileSync('reg', ['delete', runKey, '/v', oldName, '/f'], { stdio: 'ignore' })
      } catch {
        /* 旧名不存在 */
      }
    }
    execFileSync('reg', ['add', runKey, '/v', DISPLAY_NAME, '/t', 'REG_SZ', '/d', value, '/f'], { stdio: 'ignore' })
  } catch (e) {
    console.warn('[desktop] 开机自启写注册表失败:', e && e.message ? e.message : e)
  }
}

/** 创建系统托盘（关窗不退出、后端常驻的关键）。菜单：打开 / 退出。 */
function createTray() {
  if (tray) return
  try {
    const icon = loadAppIconNativeImage() || nativeImage.createEmpty()
    tray = new Tray(icon)
    tray.setToolTip(DISPLAY_NAME)
    const open = () => {
      showMainWindow().catch((e) => console.error('[desktop] 重开窗口失败:', e))
    }
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开 ' + DISPLAY_NAME, click: open },
        {
          label: '离线更新插件（占文件锁时）…',
          click: () => {
            const specs = [
              '@zhongruan/dsh-cursor-chat@latest',
              '@zhongruan/dsh-cursor-coding@latest',
              '@zhongruan/dsh-knowledge@latest',
            ]
            dialog
              .showMessageBox({
                type: 'question',
                title: DISPLAY_NAME,
                message: '聊天壳占着文件时，市场内更新会失败。将短暂停止聊天壳并离线更新：',
                buttons: ['写码助手 chat', '写码 coding', '知识库', '取消'],
                defaultId: 0,
                cancelId: 3,
              })
              .then(({ response }) => {
                if (response < 0 || response >= specs.length) return
                return offlineUpdatePluginAndRestart(specs[response]).then((r) => {
                  dialog.showMessageBox({
                    type: 'info',
                    title: DISPLAY_NAME,
                    message: '插件已离线更新',
                    detail: `${r.packageName}@${r.version || '?'}\n请到设置 → 插件市场确认版本。`,
                  })
                })
              })
              .catch((e) => {
                dialog.showErrorBox(
                  '离线更新失败',
                  String(e && e.message ? e.message : e)
                )
              })
          },
        },
        { type: 'separator' },
        { label: '退出', click: () => { isQuitting = true; app.quit() } },
      ])
    )
    tray.on('click', open)
  } catch (e) {
    console.warn('[desktop] 托盘创建失败:', e && e.message ? e.message : e)
  }
}

/** 尽量打开已热宿主页（本进程 backendHostPort 或 pid 文件复用）。 */
async function openUiAgainstHotHost() {
  let hostPort = backendHostPort > 0 ? backendHostPort : 0
  let entryUrl = hostPort > 0 ? `http://127.0.0.1:${hostPort}/` : ''
  if (!(hostPort > 0 && (await httpAlive(hostPort)))) {
    const reused = await tryReuseBundledHost()
    if (!reused || !(reused.port > 0)) return false
    hostPort = reused.port
    backendHostPort = hostPort
    entryUrl = reused.url || `http://127.0.0.1:${hostPort}/`
  }
  const engineUp = backendEnginePort > 0 && (await engineHealth(backendEnginePort))
  const engPort = engineUp ? backendEnginePort : bootEnginePort || ENGINE_PORT_START
  await createWindow({ host: '127.0.0.1', port: engPort }, entryUrl)
  pushEngineInfoToRenderer(mainWindow)
  return true
}

/** 重开窗口：隐藏的直接 show（内容已加载，秒开）；窗口不存在则连已热的后端（后端死了就完整 boot）。 */
async function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return
  }
  // 安装预热 / 开机后台：已有实例在 boot 时，second-instance 会进这里。
  // 须 await 同一 bootPromise，结束后若仍无窗则主动开壳（后台启动本身不建窗）。
  if (await openUiAgainstHotHost()) return
  await boot()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return
  }
  if (await openUiAgainstHotHost()) return
}

function createWindow(engineInfo, startUrl) {
  // 禁止叠窗：仅在「将新建」时销毁旧窗（热启直连真实页 / 异常重建）
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.destroy()
    } catch {
      /* ignore */
    }
    mainWindow = null
  }
  const host = (engineInfo && engineInfo.host) || bootEngineHost || '127.0.0.1'
  const port = Number(engineInfo && engineInfo.port) || bootEnginePort || 0
  const extra = []
  if (port > 0) extra.push(`--workbuddy-engine=http://${host}:${port}/`)
  // 冷/热启动一律 show:true。曾用 show:false + ready-to-show 躲错误框，冷启动会白屏/整窗不出现。
  const appIcon = loadAppIconNativeImage()
  if (appIcon && process.platform === 'win32') {
    try {
      app.setIcon(appIcon)
    } catch {
      /* ignore */
    }
  }
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    show: true,
    backgroundColor: '#f6faf7',
    icon: appIcon || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: extra,
    },
    title: DISPLAY_NAME,
  })
  // 引擎口可能在弹窗之后才 resolve：dom-ready 推 IPC + localStorage（preload 热更新 getEngine）
  mainWindow.webContents.on('dom-ready', () => {
    pushEngineInfoToRenderer(mainWindow)
    mainWindow.webContents
      .executeJavaScript(
        `var el=document.getElementById('status');if(el){el.textContent=${JSON.stringify(bootStatusText)};}`
      )
      .catch(() => {})
  })
  mainWindow.webContents.on('did-finish-load', () => {
    const win = mainWindow
    if (!win || win.isDestroyed()) return
    win.webContents
      .executeJavaScript('document.body ? String(document.body.innerText || "") : ""')
      .then((text) => {
        if (!/authentication required/i.test(String(text || ''))) return
        let saved = ''
        try {
          saved = String(fs.readFileSync(hostEntryUrlFile(), 'utf8')).trim()
        } catch {
          saved = ''
        }
        const current = win.webContents.getURL()
        if (isSafeDshEntryUrl(saved) && saved !== current) {
          console.warn('[desktop] 停在登录校验页，改开带 token 的回环地址')
          win.loadURL(saved).catch(() => {})
          return
        }
        console.warn('[desktop] 停在登录校验页，且没有另一条可用的 token 地址')
      })
      .catch(() => {})
  })
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    try {
      const u = new URL(target)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        shell.openExternal(target)
      }
    } catch {
      /* ignore */
    }
    return { action: 'deny' }
  })
  // 返回 Promise：调用方必须 await，禁止与后续 loadURL(真实页) 竞态
  if (startUrl) {
    return mainWindow.loadURL(startUrl).then(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  }
  return loadSplashHtml(mainWindow)
}

/** 首次启动：用内嵌 dsh 生成干净 web profile（仅 base + web-app）。 */
async function bootstrapProfileIfNeeded() {
  const profilePkg = path.join(dshHome(), 'profiles', 'web', 'package.json')
  if (fs.existsSync(profilePkg)) return { bootstrapped: false }

  const cli = findBundledCliEntry()
  const hostNode = findHostNodeBinary()
  if (!cli) throw new Error('缺少内嵌 Host，无法初始化 profile')
  if (!hostNode) {
    throw new Error(
      '缺少 Node≥22，无法初始化 DSH profile（不要用 Electron Node 20）。请使用 0.2.8+ 一体包或设置 WORKBUDDY_HOST_NODE。'
    )
  }

  const port = await findFreePort(DSH_PORT_START + 200)
  const env = applyDesktopToolchain({
    ...process.env,
    DSH_HOME: dshHome(),
    DSH_DESKTOP: '1',
  })
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(
    hostNode,
    ['--expose-internals', cli, 'web', '--no-open', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: app.getPath('home'), env, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  children.push(child)
  try {
    await waitHttpOk(port, '/', 120000)
  } finally {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
    const idx = children.indexOf(child)
    if (idx >= 0) children.splice(idx, 1)
    await new Promise((r) => setTimeout(r, 800))
  }
  if (!fs.existsSync(profilePkg)) {
    throw new Error(`初始化 DSH profile 失败：仍缺少 ${profilePkg}`)
  }
  return { bootstrapped: true }
}

/** 防止 second-instance / 托盘重开与 whenReady 并发 boot → 双起引擎/宿主。失败可重试。 */
let bootPromise = null

async function boot() {
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    const bootT0 = Date.now()
    const bootTracePath = path.join(app.getPath('userData'), 'boot-trace.log')
    try {
      // 追加会话，保留冷启分段（勿每次截断，否则二次 3s 会盖掉首次 20s+ 记录）
      let prev = ''
      try {
        prev = fs.readFileSync(bootTracePath, 'utf8')
      } catch {
        prev = ''
      }
      if (prev.length > 48 * 1024) prev = prev.slice(-32 * 1024)
      const head = (prev && !prev.endsWith('\n') ? prev + '\n' : prev) + `\n[boot] start ${new Date().toISOString()}\n`
      fs.writeFileSync(bootTracePath, head, 'utf8')
    } catch {
      /* ignore */
    }
    const mark = (label) => {
      const line = `[boot] ${label} +${Date.now() - bootT0}ms`
      console.log(line)
      try {
        fs.appendFileSync(bootTracePath, line + '\n', 'utf8')
      } catch {
        /* ignore */
      }
    }
    applyDesktopDshHome()
    if (isBackgroundLaunch) {
      mark('mode=background-prewarm')
    }
    // 优先复用上一轮保留的宿主（跳过 ~14s dsh web）；失败再清残留并冷启。
    let reusedHost = null
    try {
      reusedHost = await tryReuseBundledHost()
    } catch (e) {
      console.warn('[desktop] 复用宿主探测失败:', e && e.message ? e.message : e)
    }
    if (reusedHost) {
      mark(`host reused :${reusedHost.port}`)
    } else {
      cleanupStaleOrphans()
      mark('orphans cleaned')
    }
    // 立刻弹启动页并 await 画完，再去做 resolve/引擎——禁止与真实页 loadURL 竞态
    if (!isBackgroundLaunch) {
      if (!mainWindow || mainWindow.isDestroyed()) {
        await createWindow({ host: '127.0.0.1', port: 0 })
        mark('window(splash) ready')
      }
    }
    const enginePort = await resolveEnginePort()
    bootEngineHost = '127.0.0.1'
    bootEnginePort = enginePort
    mark(`enginePort=${enginePort}`)
    // 冷启窗 argv 仍是 port=0：立刻推给已开的窗口，避免资料库打错口
    pushEngineInfoToRenderer(mainWindow)

    // 宿主已热：跳过 copy/wire/market/host 冷路径，先开聊天壳，环境后台对齐。
    if (reusedHost && reusedHost.port > 0 && isSafeDshEntryUrl(reusedHost.url)) {
      backendHostPort = reusedHost.port
      const url = reusedHost.url
      setBootStatus('即将就绪…')
      if (mainWindow && !mainWindow.isDestroyed()) {
        pushEngineInfoToRenderer(mainWindow)
        await mainWindow.loadURL(url)
        pushEngineInfoToRenderer(mainWindow)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
        }
      } else if (!isBackgroundLaunch) {
        await createWindow({ host: '127.0.0.1', port: enginePort }, url)
      }
      mark('real ui loaded (host reuse)')
      setImmediate(() => {
        try {
          if (app.isPackaged) expandPackagedRuntime(process.resourcesPath)
          const { appRoot, engineDir } = ensureWritableAppCopy()
          materializeBridgeDeps(appRoot)
          ensureWorkBuddyWire(appRoot)
          alignDshToolsForChat(appRoot)
          resolveMarketRegistryForBoot(appRoot).catch(() => {})
          const py = findPython()
          if (py) process.env.APP_ENGINE_PYTHON = py
          if (py && runtimeDepsStampHit(py)) {
            startEngine(engineDir, enginePort)
              .then((port) => {
                backendEnginePort = port
                pushEngineInfoToRenderer(mainWindow)
                mark('engine ready (reuse path)')
              })
              .catch((e) => console.warn('[desktop] reuse 路径引擎:', e && e.message ? e.message : e))
          } else {
            try {
              ensureRuntimeDeps(appRoot, { engineOnly: true })
            } catch (eDep) {
              console.warn('[desktop] reuse 路径依赖:', eDep && eDep.message ? eDep.message : eDep)
            }
            startEngine(engineDir, enginePort)
              .then((port) => {
                backendEnginePort = port
                pushEngineInfoToRenderer(mainWindow)
                mark('engine ready (reuse path)')
              })
              .catch((e) => console.warn('[desktop] reuse 路径引擎:', e && e.message ? e.message : e))
          }
        } catch (e) {
          console.warn('[desktop] reuse 后台对齐失败:', e && e.message ? e.message : e)
        }
      })
      return
    }

    setBootStatus('正在准备运行环境…')
    if (app.isPackaged) {
      const pyZip = path.join(process.resourcesPath, 'runtime', 'python.zip')
      const hostZip = path.join(process.resourcesPath, 'host', 'node_modules.zip')
      if (fs.existsSync(pyZip) || fs.existsSync(hostZip)) {
        setBootStatus('正在展开运行组件…')
        const expanded = expandPackagedRuntime(process.resourcesPath)
        mark(expanded.length ? `expanded ${expanded.join(',')}` : 'expand skipped')
      }
    }
    const { appRoot, engineDir } = ensureWritableAppCopy()
    mark('app copy ready')
    const pyEarly = findPython()
    if (pyEarly) process.env.APP_ENGINE_PYTHON = pyEarly
    // stamp 命中：引擎与聊天壳并行预热。stamp 未命中：先开窗，后台补依赖再启引擎，
    // 避免 ensure_runtime / 缺包导致主路径干等 120s。
    let enginePromise = null
    if (pyEarly && runtimeDepsStampHit(pyEarly)) {
      enginePromise = startEngine(engineDir, enginePort)
      enginePromise.catch(() => {})
      mark('engine kick (stamp hit, 后台)')
    } else {
      mark('engine deferred (stamp miss → UI 后补)')
    }

    setBootStatus('正在准备组件…')
    await bootstrapProfileIfNeeded()
    const wire = ensureWorkBuddyWire(appRoot)
    alignDshToolsForChat(appRoot)
    mark('profile/wire/align done')
    // bridge deps 与市场解析 / 宿主冷启并行，少挡 ~0.5–1s
    const bridgeDepsPromise = Promise.resolve().then(() => {
      materializeBridgeDeps(appRoot)
      mark('bridge deps ready')
    })
    let marketResolved = { url: '', deferredEnsure: true }
    try {
      marketResolved = await resolveMarketRegistryForBoot(appRoot)
      mark(
        marketResolved.deferredEnsure
          ? 'market company (ensure bg)'
          : 'market reused'
      )
    } catch (e) {
      console.warn('[desktop] 启动前市场解析失败:', e && e.message ? e.message : e)
      mark('market resolve failed')
    }
    console.log('[desktop] DSH_HOME=', dshHome(), 'wire:', wire.detail)

    setBootStatus('正在启动服务…')
    let host
    const hostPromise = startBundledHost(enginePort, appRoot, {
      registryUrl: marketResolved.url,
    }).catch((e) => {
      console.warn('[desktop] Host 启动失败:', e && e.message ? e.message : e)
      return { port: 0, detail: String(e && e.message ? e.message : e) }
    })
    await bridgeDepsPromise.catch((e) =>
      console.warn('[desktop] bridge deps:', e && e.message ? e.message : e)
    )
    host = await hostPromise
    mark(host.port > 0 ? `host ready :${host.port}` : 'host failed')
    backendHostPort = host.port

    if (host.port <= 0) {
      try {
        if (!enginePromise) {
          try {
            ensureRuntimeDeps(appRoot, { engineOnly: true })
          } catch (eDep) {
            console.warn('[desktop] 引擎依赖补齐失败:', eDep && eDep.message ? eDep.message : eDep)
          }
          enginePromise = startEngine(engineDir, enginePort)
        }
        const port = await enginePromise
        backendEnginePort = port
        mark('engine ready')
      } catch (err) {
        dialog.showMessageBox({
          type: 'error',
          title: DISPLAY_NAME,
          message: '聊天壳和引擎都没有拉起',
          detail: redactHostSecrets(
            `${host.detail}\n\n${err && err.message ? err.message : err}`
          ),
        })
        return
      }
    }

    setBootStatus('即将就绪…')
    const url = host.port > 0 && isSafeDshEntryUrl(host.url) ? host.url : ''
    if (!url) {
      dialog.showMessageBox({
        type: 'error',
        title: DISPLAY_NAME,
        message: host.port > 0 ? '聊天壳没有拿到登录地址' : '聊天壳没有拉起',
        detail: redactHostSecrets(
          (host.port > 0
            ? '宿主已在听，但日志里没有带 token 的打开地址。已拒绝打开裸地址，避免停在 “authentication required”。请完全退出后重新打开。'
            : '没有可用的聊天壳地址，已拒绝打开裸地址。') +
            '\n\n' +
            String(host.detail || '')
        ),
      })
      return
    }
    // 窗口已在启动早期创建（正显示启动画面），此处切换到真实界面
    if (mainWindow && !mainWindow.isDestroyed()) {
      pushEngineInfoToRenderer(mainWindow)
      await mainWindow.loadURL(url)
      pushEngineInfoToRenderer(mainWindow)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      }
    } else if (!isBackgroundLaunch) {
      await createWindow({ host: '127.0.0.1', port: enginePort }, url)
    }
    mark('real ui loaded')

    // 开窗后再做依赖门禁与引擎就绪通知，不阻塞界面。
    // 客户端 fetchEngineApi / mes-runtime 会在引擎未就绪时自动等待，不丢请求。
    const finishBackend = async () => {
      if (!enginePromise) {
        try {
          ensureRuntimeDeps(appRoot, { engineOnly: true })
          mark('engine deps ok (bg)')
        } catch (e) {
          console.warn('[desktop] 后台引擎依赖检查:', e && e.message ? e.message : e)
        }
        enginePromise = startEngine(engineDir, enginePort)
      }
      try {
        const port = await enginePromise
        backendEnginePort = port
        pushEngineInfoToRenderer(mainWindow)
        mark('engine ready')
      } catch (err) {
        console.warn('[desktop] 引擎首次启动失败，补依赖后重试:', err && err.message ? err.message : err)
        try {
          ensureRuntimeDeps(appRoot, { engineOnly: true })
          const port = await startEngine(engineDir, enginePort)
          backendEnginePort = port
          pushEngineInfoToRenderer(mainWindow)
          mark('engine ready (retry)')
        } catch (err2) {
          console.error('[desktop] 引擎启动失败:', err2 && err2.message ? err2.message : err2)
          if (!shuttingDown && !isQuitting) {
            dialog.showMessageBox({
              type: 'warning',
              title: DISPLAY_NAME,
              message: '聊天已打开，引擎没有就绪',
              detail:
                '问数、写码、审码、提交和部署会等引擎起来后再执行。\n\n' +
                String(err2 && err2.message ? err2.message : err2),
            })
          }
        }
      }
      try {
        ensureRuntimeDeps(appRoot)
        mark('full deps ok (bg)')
      } catch (e) {
        console.warn('[desktop] 后台完整依赖检查:', e && e.message ? e.message : e)
      }
    }
    finishBackend().catch((e) => console.warn('[desktop] 后台环境准备失败:', e && e.message ? e.message : e))

    if (host.port <= 0) {
      dialog.showMessageBox({
        type: 'warning',
        title: DISPLAY_NAME,
        message: '聊天壳未拉起，已打开引擎配置页',
        detail:
          `${host.detail}\n\n` +
          `DSH_HOME: ${dshHome()}\n` +
          `引擎: http://127.0.0.1:${enginePort}/\n接线: ${wire.detail}`,
      })
    } else if (!wire.ok) {
      dialog.showMessageBox({
        type: 'info',
        title: DISPLAY_NAME,
        message: '聊天壳已打开',
        detail:
          `${wire.detail}\n\n` +
          '请在 WorkBuddy 配置中心填写 DeepSeek API Key 并保存，聊天壳会自动同步，不必再去「设置 → 模型」。',
      })
    }
  })().catch((err) => {
    bootPromise = null
    throw err
  })
  return bootPromise
}

function stashDesktopUserState() {
  if (persistedEngineDir) stashEngineUserState(persistedEngineDir)
  if (persistedAppRoot) {
    safePersistFeatures(persistUserFeatures.stashUserFeatures, 'stash user features on quit', {
      liveAppRoot: persistedAppRoot,
      bundleAppRoot: path.join(runtimeRoot(), 'app'),
      persistDir: persistRoot(),
    })
  }
}

if (gotLock) {
  app.whenReady().then(() => {
    setupChineseApplicationMenu()
    // 系统托盘：关窗不退出、后端常驻，重开秒开的关键
    createTray()
    // 开机后台自启（带 --workbuddy-background，只起后端+托盘、不弹窗）——开机后第一次开也秒开。
    setupAutoStart()
    boot().catch((err) => {
      console.error(err)
      dialog.showErrorBox(DISPLAY_NAME + '启动失败', String(err && err.message ? err.message : err))
      isQuitting = true
      shuttingDown = true
      app.quit()
    })
  })

  app.on('window-all-closed', () => {
    // 托盘常驻：有托盘时关窗不退出（窗口被隐藏、后端保持热，重开秒开）。真正退出走托盘「退出」→ app.quit() → before-quit。
    if (tray) return
    // 无托盘（创建失败等异常）时维持原行为：关窗即退出，避免孤儿进程
    shuttingDown = true
    stashDesktopUserState()
    killChildren({ keepBackend: false })
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    // 必须先于关窗逻辑：否则 close 里 preventDefault（藏托盘）会取消 quit，进程僵住
    isQuitting = true
    shuttingDown = true
    stashDesktopUserState()
    // 保留宿主+引擎：下次点图标冷启可复用，不必再等 ~14s dsh web。
    killChildren({ keepBackend: true })
  })

  app.on('activate', () => {
    // macOS 点 Dock 图标重开：走 showMainWindow（隐藏的 show / 无窗则连热后端）
    if (app.isReady()) {
      showMainWindow().catch((err) => console.error(err))
    }
  })
}