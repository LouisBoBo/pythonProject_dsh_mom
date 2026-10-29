param(
  [string] $InstallDir = '',
  [string] $InstallDirFile = '',
  [int] $ExcludePid = 0
)

# Kill leftover processes under the MOM / legacy Mom-x / WorkBuddy install dir.
# Do NOT Get-CimInstance-scan all processes (WMI can hang for minutes).
# Do NOT taskkill /IM python.exe (would kill Cursor / system Python).
# Do NOT kill installer images MOM-0.2.xx.exe / Mom-x-0.2.xx.exe / ZR WorkBuddy-0.2.xx.exe.
# Pass install dir via -InstallDirFile when the path contains spaces.

$ErrorActionPreference = 'SilentlyContinue'

function Normalize([string] $p) {
  if ([string]::IsNullOrWhiteSpace($p)) { return '' }
  try {
    $full = [IO.Path]::GetFullPath($p.Trim().Trim('"'))
  } catch {
    return ''
  }
  return $full.TrimEnd('\', '/')
}

function UnderRoot([string] $exe, [string] $root) {
  if ([string]::IsNullOrWhiteSpace($exe) -or [string]::IsNullOrWhiteSpace($root)) { return $false }
  $e = Normalize $exe
  if (-not $e) { return $false }
  if ($e.Equals($root, [StringComparison]::OrdinalIgnoreCase)) { return $true }
  return $e.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function IsSafeRoot([string] $root) {
  if ($root.Length -lt 8) { return $false }
  if ($root -notmatch '(?i)workbuddy|mom-x|(^|[\\/])mom(\.app)?([\\/]|$)') { return $false }
  if ($root -match '(?i)(^|[\\/])windows([\\/]|$)|[\\/]system32([\\/]|$)|^[a-z]:\\?$') { return $false }
  if ($root -match '(?i)[\\/]program files( \(x86\))?$') { return $false }
  return $true
}

function IsDesktopMarketOrphan([string] $cmd) {
  if ([string]::IsNullOrWhiteSpace($cmd)) { return $false }
  return ($cmd -match '(?i)merge_company_dsh_market') -and ($cmd -match '(?i)zr-workbuddy-desktop')
}

$roots = New-Object 'System.Collections.Generic.List[string]'
function AddRoot([string] $p) {
  $n = Normalize $p
  if (-not (IsSafeRoot $n)) { return }
  foreach ($existing in $roots) {
    if ($existing.Equals($n, [StringComparison]::OrdinalIgnoreCase)) { return }
  }
  $roots.Add($n)
}

if ($InstallDirFile -and (Test-Path -LiteralPath $InstallDirFile)) {
  $InstallDir = [string](Get-Content -LiteralPath $InstallDirFile -Raw -ErrorAction SilentlyContinue)
}
AddRoot $InstallDir
AddRoot (Join-Path $env:LOCALAPPDATA 'Programs\MOM')
AddRoot (Join-Path $env:LOCALAPPDATA 'Programs\Mom-x')
AddRoot (Join-Path $env:LOCALAPPDATA 'Programs\ZR WorkBuddy')
if ($env:ProgramFiles) {
  AddRoot (Join-Path $env:ProgramFiles 'MOM')
  AddRoot (Join-Path $env:ProgramFiles 'Mom-x')
  AddRoot (Join-Path $env:ProgramFiles 'ZR WorkBuddy')
}
$pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
if ($pf86) {
  AddRoot (Join-Path $pf86 'MOM')
  AddRoot (Join-Path $pf86 'Mom-x')
  AddRoot (Join-Path $pf86 'ZR WorkBuddy')
}

$exclude = New-Object 'System.Collections.Generic.HashSet[int]'
if ($ExcludePid -gt 0) { [void]$exclude.Add($ExcludePid) }
[void]$exclude.Add($PID)

function ProcPath($p) {
  try {
    $v = [string]$p.Path
    if ($v) { return $v }
  } catch {}
  try {
    $v = [string]$p.MainModule.FileName
    if ($v) { return $v }
  } catch {}
  return ''
}

function ShouldKill([string] $procName, [string] $exe, [string] $cmd) {
  if ($procName -match '^(MOM|Mom-x|ZR WorkBuddy)-\d') { return $false }
  if ($procName -eq 'MOM' -or $procName -eq 'MOM.exe') { return $true }
  if ($procName -eq 'Mom-x' -or $procName -eq 'Mom-x.exe') { return $true }
  if ($procName -eq '江西中软' -or $procName -eq '江西中软.exe') { return $true }
  if ($procName -eq 'ZR WorkBuddy' -or $procName -eq 'ZR WorkBuddy.exe') { return $true }
  if ($procName -eq 'old-uninstaller' -or $procName -eq 'old-uninstaller.exe') { return $true }
  if (IsDesktopMarketOrphan $cmd) { return $true }
  foreach ($root in $roots) {
    if (UnderRoot $exe $root) { return $true }
    if ($cmd -and $cmd.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
  }
  return $false
}

$toKill = New-Object 'System.Collections.Generic.HashSet[int]'

$names = @('MOM', 'Mom-x', '江西中软', 'ZR WorkBuddy', 'python', 'pythonw', 'python3', 'node', 'dsh', 'old-uninstaller')
Get-Process -Name $names -ErrorAction SilentlyContinue | ForEach-Object {
  $id = [int]$_.Id
  if ($exclude.Contains($id)) { return }
  $exe = ProcPath $_
  if (ShouldKill ([string]$_.Name) $exe $exe) { [void]$toKill.Add($id) }
}

foreach ($img in @('MOM.exe', 'Mom-x.exe', '江西中软.exe', 'ZR WorkBuddy.exe', 'python.exe', 'pythonw.exe', 'python3.exe', 'node.exe', 'dsh.exe', 'old-uninstaller.exe')) {
  Get-CimInstance Win32_Process -Filter "Name='$img'" -ErrorAction SilentlyContinue | ForEach-Object {
    $id = [int]$_.ProcessId
    if ($exclude.Contains($id)) { return }
    if (ShouldKill ([string]$_.Name) ([string]$_.ExecutablePath) ([string]$_.CommandLine)) {
      [void]$toKill.Add($id)
    }
  }
}

$pidDir = Join-Path $env:APPDATA 'zr-workbuddy-desktop\dsh-home\market-merge'
if (Test-Path -LiteralPath $pidDir) {
  Get-ChildItem -LiteralPath $pidDir -Filter '*.pid' -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $id = [int](([string](Get-Content -LiteralPath $_.FullName -Raw)).Trim().Split()[0])
    } catch { $id = 0 }
    if ($id -gt 0 -and -not $exclude.Contains($id)) { [void]$toKill.Add($id) }
    Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
  }
}

foreach ($id in $toKill) {
  & taskkill.exe /F /T /PID $id | Out-Null
}

& taskkill.exe /F /T /IM "MOM.exe" | Out-Null
& taskkill.exe /F /T /IM "Mom-x.exe" | Out-Null
& taskkill.exe /F /T /IM "江西中软.exe" | Out-Null
& taskkill.exe /F /T /IM "ZR WorkBuddy.exe" | Out-Null
& taskkill.exe /F /IM "old-uninstaller.exe" | Out-Null

foreach ($root in $roots) {
  foreach ($unName in @('Uninstall MOM.exe', 'Uninstall Mom-x.exe', 'Uninstall ZR WorkBuddy.exe', 'Uninstall 江西中软.exe')) {
    $un = Join-Path $root $unName
    if (Test-Path -LiteralPath $un) {
      Rename-Item -LiteralPath $un -NewName ($unName + '.preupdate') -Force
    }
  }
}

exit 0
