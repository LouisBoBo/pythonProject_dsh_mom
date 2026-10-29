'use strict'
/**
 * 开发态模拟冷启动：停掉本仓 desktop 的 Electron 壳 + runtime 下引擎/宿主残留。
 * 不杀 Cursor 自带的 electron（只杀路径在 desktop\node_modules\electron 下的进程）。
 */
const path = require('path')
const { execFileSync } = require('child_process')
const killInstallTree = require('../lib/kill-install-tree')

const desktopRoot = path.resolve(__dirname, '..')
const runtimeRoot = path.join(desktopRoot, 'runtime')
const electronDist = path.join(desktopRoot, 'node_modules', 'electron', 'dist').toLowerCase()

function killDevElectron() {
  if (process.platform !== 'win32') return []
  const distPrefix = electronDist.replace(/\\/g, '\\\\').replace(/'/g, "''")
  const ps = [
    '-NoProfile',
    '-WindowStyle',
    'Hidden',
    '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath.ToLower().StartsWith('${distPrefix}')) } | ForEach-Object { $_.ProcessId } | ConvertTo-Json -Compress`,
  ]
  let raw = '[]'
  try {
    raw = execFileSync('powershell.exe', ps, {
      encoding: 'utf8',
      timeout: 12000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    }).trim()
  } catch {
    return []
  }
  let ids = []
  try {
    const parsed = JSON.parse(raw || '[]')
    ids = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
  } catch {
    ids = []
  }
  for (const pid of ids) {
    killInstallTree.killProcessTree(pid)
  }
  return ids
}

const electronPids = killDevElectron()
const { killed } = killInstallTree.killInstallTreeSync(runtimeRoot, {
  excludePids: [process.pid],
})

console.log(
  '[kill-dev-session] 已停 dev Electron:',
  electronPids.length ? electronPids.join(', ') : '无',
  '| runtime 进程:',
  killed.length ? killed.join(', ') : '无'
)
console.log('[kill-dev-session] 接下来 npm run dev 即为冷启动（先缓冲页，再真实界面）')
