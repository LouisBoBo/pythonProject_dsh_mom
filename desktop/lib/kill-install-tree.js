'use strict'

/**
 * 关掉安装目录树里的进程（引擎 Python、宿主 Node、市场 serve、主程序）。
 * 只按「可执行文件路径在安装根下」杀，禁止按 python.exe 全名误杀 Cursor / 系统 Python。
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

/** 现行 productName = MOM.exe；历史：Mom-x / 江西中软 / ZR WorkBuddy */
const APP_EXE_ALIASES = new Set([
  'mom.exe',
  'mom',
  'mom-x.exe',
  'mom-x',
  'zr workbuddy.exe',
  '江西中软.exe',
  '江西中软',
])
const INSTALLER_NAME_RE = /^(?:mom-x|zr workbuddy|mom)-\d/i

function normalizeRoot(p) {
  if (!p) return ''
  let n = String(p).trim()
  if (!n) return ''
  try {
    n = path.resolve(n)
  } catch {
    return ''
  }
  if (n.length > 1 && (n.endsWith('\\') || n.endsWith('/'))) {
    n = n.slice(0, -1)
  }
  return n
}

function isSafeInstallRoot(root) {
  const n = normalizeRoot(root)
  if (!n || n.length < 12) return false
  if (/^[a-z]:\\?$/i.test(n) || n === '/' || /^\/(usr|bin|etc|System|Windows)?$/i.test(n)) {
    return false
  }
  if (/(^|[\\/])windows([\\/]|$)/i.test(n) || /[\\/]system32([\\/]|$)/i.test(n)) return false
  if (/[\\/]program files( \(x86\))?$/i.test(n)) return false
  return /workbuddy|mom-x|(^|[\\/])mom(\.app)?([\\/]|$)/i.test(n)
}

function isUnderRoot(exePath, root) {
  const e = normalizeRoot(exePath)
  const r = normalizeRoot(root)
  if (!e || !r) return false
  const el = e.toLowerCase()
  const rl = r.toLowerCase()
  if (el === rl) return true
  const sep = r.includes('\\') || e.includes('\\') ? '\\' : path.sep
  const prefix = rl.endsWith(sep) ? rl : rl + sep
  return el.startsWith(prefix)
}

function isInstallerImageName(name) {
  return INSTALLER_NAME_RE.test(String(name || '').trim())
}

function isProductAppName(name) {
  const n = String(name || '').trim()
  if (!n) return false
  const lower = n.toLowerCase()
  if (APP_EXE_ALIASES.has(lower)) return true
  // Get-Process Name 无 .exe；WMI Name 带 .exe
  if (APP_EXE_ALIASES.has(lower + '.exe')) return true
  return false
}

function commandMentionsRoot(cmd, root) {
  const c = String(cmd || '').toLowerCase()
  const r = normalizeRoot(root).toLowerCase()
  if (!c || !r) return false
  return c.includes(r)
}

function isDesktopMarketOrphan(cmd) {
  const c = String(cmd || '').toLowerCase()
  return c.includes('merge_company_dsh_market') && c.includes('zr-workbuddy-desktop')
}

function selectPidsToKill(processes, { root, excludePids } = {}) {
  if (!isSafeInstallRoot(root)) return []
  const skip = new Set((excludePids || []).map((n) => Number(n)).filter((n) => n > 0))
  const r = normalizeRoot(root)
  const out = []
  for (const proc of processes || []) {
    const pid = Number(proc && proc.pid)
    if (!pid || skip.has(pid)) continue
    const name = String((proc && proc.name) || '')
    if (isInstallerImageName(name)) continue
    const exe = String((proc && proc.exe) || '')
    const cmd = String((proc && proc.commandLine) || '')
    let hit = isUnderRoot(exe, r) || commandMentionsRoot(cmd, r)
    if (!hit && isProductAppName(name)) hit = true
    if (!hit && /^old-uninstaller\.exe$/i.test(name) && /workbuddy/i.test(cmd)) hit = true
    if (!hit && isDesktopMarketOrphan(cmd)) hit = true
    if (hit) out.push(pid)
  }
  return out
}

function installTreeRoot({ packaged, platform, execPath, resourcesPath, devRuntimeRoot } = {}) {
  if (!packaged) return normalizeRoot(devRuntimeRoot || '')
  const plat = platform || process.platform
  if (plat === 'win32') return normalizeRoot(path.dirname(execPath || ''))
  // ZR WorkBuddy.app/Contents/MacOS/<exe> → .app
  return normalizeRoot(path.resolve(execPath || resourcesPath || '', '..', '..', '..'))
}

function listProcesses() {
  if (process.platform === 'win32') {
    const parse = (raw) => {
      const data = JSON.parse(raw || '[]')
      const arr = Array.isArray(data) ? data : data ? [data] : []
      return arr.map((p) => ({
        pid: p.ProcessId,
        name: p.Name || '',
        exe: p.ExecutablePath || '',
        commandLine: p.CommandLine || '',
      }))
    }
    try {
      // 只查候选映像，禁止扫全机。要 CommandLine 才能识别系统 Python 拉起的市场 serve。
      const raw = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-WindowStyle',
          'Hidden',
          '-Command',
          "Get-CimInstance Win32_Process -Filter \"Name='python.exe' OR Name='pythonw.exe' OR Name='python3.exe' OR Name='node.exe' OR Name='MOM.exe' OR Name='Mom-x.exe' OR Name='ZR WorkBuddy.exe' OR Name='江西中软.exe' OR Name='old-uninstaller.exe'\" | Select-Object ProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress",
        ],
        { encoding: 'utf8', timeout: 8000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
      )
      return parse(raw)
    } catch {
      const raw = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-WindowStyle',
          'Hidden',
          '-Command',
          [
            "Get-Process -Name 'MOM','Mom-x','江西中软','ZR WorkBuddy','python','pythonw','python3','node','old-uninstaller' -ErrorAction SilentlyContinue |",
            'ForEach-Object {',
            "  $path = ''; try { $path = [string]$_.Path } catch {};",
            '  if (-not $path) { try { $path = [string]$_.MainModule.FileName } catch {} };',
            "  $n = [string]$_.Name; if ($n -notmatch '\\.exe$') { $n = $n + '.exe' };",
            "  [pscustomobject]@{ ProcessId = $_.Id; Name = $n; ExecutablePath = $path; CommandLine = $path }",
            '} | ConvertTo-Json -Compress',
          ].join(' '),
        ],
        { encoding: 'utf8', timeout: 8000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
      )
      return parse(raw)
    }
  }
  const raw = execFileSync('ps', ['-axo', 'pid=,args='], {
    encoding: 'utf8',
    timeout: 8000,
    maxBuffer: 8 * 1024 * 1024,
  })
  return String(raw)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+)\s+(.*)$/)
      if (!m) return null
      const args = m[2]
      const exe = args.split(/\s+/)[0] || ''
      return { pid: Number(m[1]), name: path.basename(exe), exe, commandLine: args }
    })
    .filter(Boolean)
}

function killProcessTree(pid) {
  const n = Number(pid)
  if (!n || n === process.pid) return
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill.exe', ['/F', '/T', '/PID', String(n)], {
        timeout: 8000,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      })
      return
    }
    try {
      process.kill(-n, 'SIGTERM')
    } catch {
      /* not a group leader */
    }
    try {
      process.kill(n, 'SIGTERM')
    } catch {
      /* gone */
    }
  } catch {
    /* already exited */
  }
}

function killPidFiles(dir) {
  const killed = []
  if (!dir) return { killed }
  let names = []
  try {
    names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.pid'))
  } catch {
    return { killed }
  }
  for (const name of names) {
    const file = path.join(dir, name)
    let pid = 0
    try {
      pid = parseInt(String(fs.readFileSync(file, 'utf8')).trim().split(/\s+/)[0], 10)
    } catch {
      pid = 0
    }
    try {
      fs.unlinkSync(file)
    } catch {
      /* gone */
    }
    if (pid > 0) {
      killProcessTree(pid)
      killed.push(pid)
    }
  }
  return { killed }
}

function killInstallTreeSync(root, { excludePids, extraPidDirs } = {}) {
  const skipped = [...(excludePids || []), process.pid]
  for (const dir of extraPidDirs || []) {
    try {
      killPidFiles(dir)
    } catch {
      /* ignore */
    }
  }
  if (!isSafeInstallRoot(root)) return { killed: [] }
  let procs = []
  try {
    procs = listProcesses()
  } catch {
    return { killed: [] }
  }
  const pids = selectPidsToKill(procs, { root, excludePids: skipped })
  for (const pid of pids) killProcessTree(pid)
  return { killed: pids }
}

module.exports = {
  APP_EXE_ALIASES,
  isSafeInstallRoot,
  isUnderRoot,
  isInstallerImageName,
  isProductAppName,
  isDesktopMarketOrphan,
  commandMentionsRoot,
  selectPidsToKill,
  installTreeRoot,
  killProcessTree,
  killPidFiles,
  killInstallTreeSync,
}
