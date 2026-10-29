# Windows 桌面一体包发版入口（抬版本 + NSIS + 强制上传）
# 本机 PowerShell 执行（禁止在 Agent 终端阻塞跑）:
#   powershell -NoProfile -File scripts\pack-desktop.ps1
#   powershell -NoProfile -File scripts\pack-desktop.ps1 -- --no-bump
# 日志: tmp\_pack_desktop.out / .stdout ；控制台每 15s heartbeat，勿因「没刷字」Ctrl+C
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "scripts\lib\package_desktop.py"))) {
  throw "找不到 scripts\lib\package_desktop.py（Root=$Root）"
}
$Out = Join-Path $Root "tmp\_pack_desktop.out"
$Stdout = Join-Path $Root "tmp\_pack_desktop.stdout"
$Err = Join-Path $Root "tmp\_pack_desktop.err"
Set-Location $Root
New-Item -ItemType Directory -Force -Path (Join-Path $Root "tmp") | Out-Null
Remove-Item $Stdout, $Err -ErrorAction SilentlyContinue
"==== pack start $(Get-Date -Format o) ====" | Set-Content -Encoding utf8 $Out

$userArgs = @($MyInvocation.UnboundArguments | Where-Object { $_ -ne "--" })
$exe = if (Get-Command py -ErrorAction SilentlyContinue) { "py" } else { "python" }
$allArgs = @()
if ($exe -eq "py") { $allArgs += "-3" }
$allArgs += "scripts\lib\package_desktop.py"
$allArgs += $userArgs

Write-Host "打包已启动（stdout 进文件，终端可能长时间无业务新行，属正常）。"
Write-Host "另窗盯进度: Get-Content tmp\_pack_desktop.stdout -Tail 20 -Wait"

$p = Start-Process -FilePath $exe -ArgumentList $allArgs `
  -WorkingDirectory $Root -NoNewWindow -PassThru `
  -RedirectStandardOutput $Stdout -RedirectStandardError $Err

while (-not $p.HasExited) {
  Start-Sleep -Seconds 15
  $len = 0
  if (Test-Path $Stdout) { $len = (Get-Item $Stdout).Length }
  $childNames = @(
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.ParentProcessId -eq $p.Id } |
      Select-Object -ExpandProperty Name -Unique
  )
  # 再看一层孙进程（python → robocopy / npm）
  $pyKids = @(
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.ParentProcessId -in @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($p.Id)" -ErrorAction SilentlyContinue | ForEach-Object { $_.ProcessId }) } |
      Select-Object -ExpandProperty Name -Unique
  )
  $names = @($childNames + $pyKids | Select-Object -Unique)
  $tail = ""
  if (Test-Path $Stdout) { $tail = (Get-Content $Stdout -Tail 1 -ErrorAction SilentlyContinue) }
  Write-Host ("[pack alive] {0:HH:mm:ss} stdout={1}KB kids={2} | {3}" -f (Get-Date), [math]::Round($len / 1KB), ($names -join ","), $tail)
}

if (Test-Path $Stdout) { Get-Content $Stdout | Add-Content -Encoding utf8 $Out }
if (Test-Path $Err) {
  "`n==== stderr ====" | Add-Content -Encoding utf8 $Out
  Get-Content $Err | Add-Content -Encoding utf8 $Out
}
$code = $p.ExitCode
"==== pack exit=$code $(Get-Date -Format o) ====" | Add-Content -Encoding utf8 $Out
Write-Host "pack exit=$code  (log: tmp\_pack_desktop.out)"
if ($code -eq 0) {
  Write-Host "成功：托盘完全退出旧 MOM → 安装 desktop\release\MOM-*.exe → 再开。"
}
exit $code
