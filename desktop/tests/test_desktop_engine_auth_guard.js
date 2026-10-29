/**
 * 桌面登录态门禁：引擎口不得被探测拐到 :8000；401 不得无确认就清会话；
 * 冷启 port=0 必须 IPC 热更新。纯源码契约（不启 Electron）。
 */
'use strict'

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const preamble = path.join(
  root,
  'apps/zr-workbuddy/plugins/mes-bridge/client-src/shared-preamble.js',
)
const space = path.join(root, 'apps/zr-workbuddy/plugins/mes-bridge/client-src/space.js')
const usage = path.join(
  root,
  'apps/zr-workbuddy/plugins/mes-bridge/client-src/usage-section.js',
)
const mainJs = path.join(root, 'desktop/main.js')
const preload = path.join(root, 'desktop/preload.js')

function mustInclude(file, needle, label) {
  const t = fs.readFileSync(file, 'utf8')
  if (!t.includes(needle)) {
    throw new Error(`${label}: missing ${JSON.stringify(needle)} in ${path.basename(file)}`)
  }
}

function mustNotMatch(file, re, label) {
  const t = fs.readFileSync(file, 'utf8')
  if (re.test(t)) {
    throw new Error(`${label}: forbidden pattern ${re} in ${path.basename(file)}`)
  }
}

mustInclude(preamble, 'desktopEngine()', 'engineBase prefers desktop')
mustInclude(preamble, 'isDesktopShell()', 'desktop shell detect')
mustInclude(preamble, 'getEngine', 'prefer getEngine')
mustInclude(preamble, 'confirmAuthExpiredAndClear', 'confirm before clear')
mustInclude(preamble, '绝对禁止掺 :8000', 'no desktop→8000 probe')
mustInclude(preamble, '禁止探测把 UI 锁到开发壳', 'markEngineResolved desktop pin')
mustInclude(preamble, 'port: "18000"', 'desktop port=0 falls back 18000')

mustInclude(space, 'fetchEngineApi', 'space uses fetchEngineApi')
mustInclude(space, 'confirmAuthExpiredAndClear', 'space soft 401')
mustNotMatch(
  space,
  /writeAuthSession\(null\);\s*\n\s*notifyAuthChanged\(\)/,
  'space no eager clear+notify',
)

mustInclude(usage, 'fetchEngineApi(path', 'usage summary via fetchEngineApi')
mustInclude(usage, 'onUsageAuth401', 'usage soft 401')
mustNotMatch(usage, /function writeSession\(/, 'usage no private writeSession')

mustInclude(mainJs, 'pushEngineInfoToRenderer', 'main pushes engine info')
mustInclude(mainJs, 'workbuddy:engine-info-sync', 'main sync IPC')
mustInclude(preload, 'workbuddy:engine-info', 'preload listens engine info')
mustInclude(preload, 'getEngine:', 'preload exposes getEngine')

console.log('OK desktop engine auth guard')
