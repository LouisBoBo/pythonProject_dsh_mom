'use strict'

const assert = require('assert')
  const {
  isSafeInstallRoot,
  isUnderRoot,
  isInstallerImageName,
  isProductAppName,
  selectPidsToKill,
  installTreeRoot,
  killPidFiles,
} = require('../lib/kill-install-tree')

// --- 纯字符串 / POSIX 路径断言：全平台可跑 ---
assert.strictEqual(isInstallerImageName('ZR WorkBuddy.exe'), false)
assert.strictEqual(isInstallerImageName('ZR WorkBuddy-0.2.21.exe'), true)
assert.strictEqual(isInstallerImageName('old-uninstaller.exe'), false)
assert.strictEqual(isInstallerImageName('MOM.exe'), false)
assert.strictEqual(isInstallerImageName('MOM-0.2.65.exe'), true)
assert.strictEqual(isInstallerImageName('Mom-x.exe'), false)
assert.strictEqual(isInstallerImageName('Mom-x-0.2.56.exe'), true)
assert.strictEqual(isProductAppName('MOM.exe'), true)
assert.strictEqual(isProductAppName('MOM'), true)
assert.strictEqual(isProductAppName('Mom-x.exe'), true)
assert.strictEqual(isProductAppName('Mom-x'), true)
assert.strictEqual(isProductAppName('ZR WorkBuddy.exe'), true)
assert.strictEqual(isProductAppName('江西中软.exe'), true)
assert.strictEqual(isProductAppName('江西中软'), true)
assert.strictEqual(isProductAppName('ZR WorkBuddy-0.2.54.exe'), false)
assert.strictEqual(isSafeInstallRoot('/Applications/ZR WorkBuddy.app'), true)
assert.strictEqual(isSafeInstallRoot('/Applications/MOM.app'), true)
assert.strictEqual(isSafeInstallRoot('/Applications/Mom-x.app'), true)
assert.strictEqual(isSafeInstallRoot('C:\\Users\\Yu\\AppData\\Local\\Programs\\MOM'), true)
assert.strictEqual(isSafeInstallRoot('C:\\Users\\Yu\\AppData\\Local\\Programs\\Mom-x'), true)
assert.strictEqual(isSafeInstallRoot('C:\\Users\\Yu\\AppData\\Local\\Programs\\momentum'), false)
assert.strictEqual(isSafeInstallRoot('/usr'), false)
assert.ok(
  installTreeRoot({
    packaged: true,
    platform: 'darwin',
    execPath: '/Applications/ZR WorkBuddy.app/Contents/MacOS/ZR WorkBuddy',
  }).endsWith('ZR WorkBuddy.app')
)

// --- Windows 盘符路径语义：仅 win32 可跑 ---
// POSIX 的 path.resolve/dirname 不认 \ 分隔符，盘符路径会被拼到 cwd，断言必挂。
if (process.platform === 'win32') {
  const root = 'C:\\Users\\Yu\\AppData\\Local\\Programs\\ZR WorkBuddy'

  assert.strictEqual(isSafeInstallRoot(root), true)
  assert.strictEqual(isSafeInstallRoot(root + '\\'), true)
  assert.strictEqual(isSafeInstallRoot('C:\\'), false)
  assert.strictEqual(isSafeInstallRoot('C:\\Windows'), false)
  assert.strictEqual(isSafeInstallRoot('C:\\Program Files'), false)

  assert.strictEqual(isUnderRoot(root + '\\resources\\runtime\\python\\python.exe', root), true)
  assert.strictEqual(isUnderRoot(root + '\\ZR WorkBuddy.exe', root), true)
  assert.strictEqual(isUnderRoot('C:\\Python311\\python.exe', root), false)
  assert.strictEqual(
    isUnderRoot('C:\\Users\\Yu\\AppData\\Local\\Programs\\ZR WorkBuddy Extra\\python.exe', root),
    false
  )

  const procs = [
    { pid: 100, name: 'python.exe', exe: root + '\\resources\\runtime\\python\\python.exe' },
    { pid: 101, name: 'node.exe', exe: root + '\\resources\\host\\node_modules\\.bin\\node.exe' },
    { pid: 102, name: 'ZR WorkBuddy.exe', exe: root + '\\ZR WorkBuddy.exe' },
    { pid: 103, name: 'python.exe', exe: 'C:\\Python311\\python.exe' },
    { pid: 104, name: 'Cursor.exe', exe: 'C:\\Users\\Yu\\AppData\\Local\\Programs\\cursor\\Cursor.exe' },
    {
      pid: 105,
      name: 'ZR WorkBuddy-0.2.21.exe',
      exe: 'D:\\AICodes\\DSH_WorkBuddy\\desktop\\release\\ZR WorkBuddy-0.2.21.exe',
    },
    {
      pid: 106,
      name: 'old-uninstaller.exe',
      exe: 'C:\\Users\\Yu\\AppData\\Local\\Temp\\nss4679.tmp\\old-uninstaller.exe',
      commandLine: `"old-uninstaller.exe" /S /KEEP_APP_DATA /currentuser --updated _?=${root}`,
    },
    {
      pid: 107,
      name: 'old-uninstaller.exe',
      exe: 'C:\\Users\\Yu\\AppData\\Local\\Temp\\other.tmp\\old-uninstaller.exe',
      commandLine: '"old-uninstaller.exe" /S _?=C:\\OtherApp',
    },
    {
      pid: 108,
      name: 'python.exe',
      exe: '',
      commandLine: `"C:\\Users\\Yu\\AppData\\Local\\Programs\\ZR WorkBuddy\\resources\\runtime\\python\\python.exe" run_engine.py`,
    },
    {
      pid: 109,
      name: 'ZR WorkBuddy.exe',
      exe: 'D:\\AICodes\\DSH_WorkBuddy\\desktop\\release\\win-unpacked\\ZR WorkBuddy.exe',
    },
    {
      pid: 110,
      name: 'python.exe',
      exe: 'C:\\Python311\\python.exe',
      commandLine:
        '"C:\\Python311\\python.exe" C:\\Users\\Yu\\AppData\\Roaming\\zr-workbuddy-desktop\\runtime-app\\scripts\\lib\\merge_company_dsh_market.py serve',
    },
    {
      pid: 111,
      name: 'python.exe',
      exe: 'C:\\Python311\\python.exe',
      commandLine:
        '"C:\\Python311\\python.exe" D:\\AICodes\\DSH_WorkBuddy\\scripts\\lib\\merge_company_dsh_market.py serve --cache-dir C:\\Users\\Yu\\.dsh\\market-merge',
    },
    {
      pid: 112,
      name: '江西中软.exe',
      exe: root + '\\zr-workbuddy-desktop\\江西中软.exe',
    },
    {
      pid: 113,
      name: '江西中软',
      exe: '',
    },
  ]

  const killed = selectPidsToKill(procs, { root, excludePids: [105] }).sort((a, b) => a - b)
  assert.deepStrictEqual(killed, [100, 101, 102, 106, 108, 109, 110, 112, 113])

  const none = selectPidsToKill(procs, { root: 'C:\\', excludePids: [] })
  assert.deepStrictEqual(none, [])

  assert.strictEqual(
    installTreeRoot({
      packaged: true,
      platform: 'win32',
      execPath: root + '\\ZR WorkBuddy.exe',
    }),
    root
  )
  assert.strictEqual(
    installTreeRoot({
      packaged: false,
      devRuntimeRoot: 'D:\\AICodes\\DSH_WorkBuddy\\desktop\\runtime',
    }),
    'D:\\AICodes\\DSH_WorkBuddy\\desktop\\runtime'
  )
  console.log('ok: kill-install-tree (win32 path semantics)')
} else {
  console.log('ok: kill-install-tree (skip win32-only path assertions on ' + process.platform + ')')
}

const fs = require('fs')
const os = require('os')
const path = require('path')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-pid-'))
fs.writeFileSync(path.join(tmp, 'httpd.pid'), '9999999\n')
const killedFiles = killPidFiles(tmp)
assert.deepStrictEqual(killedFiles.killed, [9999999])
assert.ok(!fs.existsSync(path.join(tmp, 'httpd.pid')))
console.log('ok: killPidFiles')

const nsh = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8')
assert.ok(nsh.includes('InstallDirFile'), 'nsh must pass INSTDIR via file (spaces)')
assert.ok(nsh.includes('customInit'), 'must kill leftovers when installer starts')
assert.ok(nsh.includes('workbuddyKillInstallTree'), 'shared kill macro')
assert.ok(nsh.includes('taskkill.exe'), 'also taskkill product exe name')
assert.ok(nsh.includes('MOM.exe'), 'must taskkill MOM product exe')
assert.ok(nsh.includes('Mom-x.exe'), 'must still kill legacy Mom-x.exe')
assert.ok(nsh.includes('江西中软.exe'), 'must still kill legacy 江西中软.exe')
assert.ok(nsh.includes('APP_EXECUTABLE_FILENAME'), 'must also kill APP_EXECUTABLE_FILENAME')
assert.ok(nsh.includes('DeleteRegValue'), 'nsh must skip old uninstaller via UninstallString')
assert.ok(!/UninstallTimeoutSec/.test(nsh), 'must not ExecWait old uninstaller')
const firstTaskkill = nsh.indexOf('taskkill.exe')
const powershellAt = nsh.indexOf('powershell.exe')
assert.ok(firstTaskkill >= 0 && powershellAt > firstTaskkill, 'taskkill product exe before powershell')
assert.ok(nsh.includes('ESTIMATED_SIZE'), 'skip GetSize walk of python/host tree')
const ps1 = fs.readFileSync(path.join(__dirname, '..', 'build', 'kill-install-tree.ps1'), 'utf8')
assert.ok(ps1.includes('InstallDirFile'), 'ps1 must accept InstallDirFile')
assert.ok(ps1.includes('Get-Process'), 'ps1 must use Get-Process, not full WMI scan')
assert.ok(ps1.includes('MOM'), 'ps1 must target productName MOM')
assert.ok(ps1.includes('Mom-x'), 'ps1 must still kill legacy Mom-x')
assert.ok(ps1.includes('江西中软'), 'ps1 must still kill legacy 江西中软')
assert.ok(/^\s*param\s*\(/m.test(ps1), 'ps1 param() must be at top for Windows PowerShell')
assert.ok(!/\$INSTDIR/.test(ps1), 'ps1 must not mention $INSTDIR (breaks parse before param)')
assert.ok(ps1.includes('LOCALAPPDATA'), 'ps1 must fall back to default per-user install dir')
assert.ok(ps1.includes('market-merge'), 'ps1 must kill desktop market pid files')
assert.ok(ps1.includes("Name="), 'ps1 may filter WMI by image name')
assert.ok(!/Get-CimInstance\s+Win32_Process\s*\|/.test(ps1), 'ps1 must not enumerate all Win32_Process')
assert.ok(!/Start-Process/.test(ps1), 'ps1 must not launch old uninstaller')
assert.ok(nsh.includes('Sleep 1500'), 'wait for file locks after kill')
assert.ok(nsh.includes('workbuddyStashAppExes'), 'must stash old exes before extract')
assert.ok(nsh.includes('.preupdate'), 'stash uses Rename to .preupdate')
assert.ok(nsh.includes('workbuddySyncAppTree'), 'must robocopy/sync from short 7z-out')
assert.ok(nsh.includes('workbuddyExpandPackArchives'), 'expand python/host zips once after copy')
assert.ok(nsh.includes('customInstall'), 'NSIS must expand archives during install')
assert.ok(nsh.includes('tar.exe'), 'expand with system tar, not a second full-tree copy')
assert.ok(nsh.includes('python.zip'), 'python payload is one zip')
assert.ok(nsh.includes('node_modules.zip'), 'host payload is one zip')
assert.ok(nsh.includes('workbuddyPostInstallPrewarm'), 'post-install must prewarm host')
assert.ok(nsh.includes('--workbuddy-background'), 'prewarm uses background argv')
assert.ok(nsh.includes('ExecShellAsUser'), 'prewarm must run as user (not elevated)')
assert.ok(nsh.includes('sync-install-tree.ps1'), 'fallback long-path sync script')
assert.ok(nsh.includes('preInit'), 'force short InstallLocation MOM')
assert.ok(nsh.includes('$LOCALAPPDATA\\Programs\\MOM'), 'default install dir without spaces')
assert.ok(
  nsh.includes('ensure_nsis_install_kill_hooks'),
  'nsh must point to safe-extract NSIS ensure script',
)
const syncPs1 = fs.readFileSync(path.join(__dirname, '..', 'build', 'sync-install-tree.ps1'), 'utf8')
assert.ok(syncPs1.includes('robocopy'), 'sync ps1 prefers robocopy')
assert.ok(/\\\\?\\/.test(syncPs1) || syncPs1.includes('\\\\?\\'), 'sync ps1 supports long paths')
console.log('ok: installer.nsh skip old uninstaller')
