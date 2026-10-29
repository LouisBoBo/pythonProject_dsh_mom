#Requires -Version 5.1
<#
.SYNOPSIS
  WorkBuddy: align knowledge + restart chat shell on :3081.

.NOTES
  - Always uses Git Bash (not WSL `bash` on PATH).
  - Do not set DSH_HOME=/mnt/c/... from PowerShell.
  - Run:  powershell -NoProfile -File scripts\restart-web.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$GitBash = Join-Path $env:ProgramFiles 'Git\bin\bash.exe'
if (-not (Test-Path -LiteralPath $GitBash)) {
    Write-Error "Git Bash not found: $GitBash`nInstall Git for Windows. Do not use WSL bash."
}

if ($env:DSH_HOME -like '/mnt/*') {
    Remove-Item Env:DSH_HOME -ErrorAction SilentlyContinue
}

$ProfileWeb = Join-Path $env:USERPROFILE '.dsh\profiles\web'

Write-Host '[1/3] MES sidecar + WORKBUDDY_CONFIG_YAML (.env)...'
& py -3 (Join-Path $Root 'scripts\lib\ensure_workbuddy_config_yaml_env.py') --repo $Root
# exit 0 even on SKIP (no MES yet)

Write-Host '[2/3] Knowledge pack link + peers...'
& py -3 (Join-Path $Root 'scripts\lib\ensure_dsh_core_bundles.py') --fix --require $ProfileWeb
if ($LASTEXITCODE -ne 0) {
    Write-Error "ensure_dsh_core_bundles failed"
}
& py -3 (Join-Path $Root 'scripts\lib\ensure_dsh_knowledge.py') --fix $ProfileWeb
if ($LASTEXITCODE -ne 0) {
    Write-Error "ensure_dsh_knowledge failed"
}

Write-Host '[3/4] zod dist for @cursor/sdk (before host restart)...'
$zodTb = Join-Path $Root 'vendor\zod\zod-3.25.67.tgz'
if (Test-Path -LiteralPath $zodTb) {
    $env:WORKBUDDY_ZOD_TARBALL = $zodTb
}
& py -3 (Join-Path $Root 'scripts\lib\ensure_cursor_sdk_zod.py') --fix --require $ProfileWeb
if ($LASTEXITCODE -ne 0) {
    Write-Error "ensure_cursor_sdk_zod failed (zod/dist missing → 写码会 ERR_MODULE_NOT_FOUND)"
}

Write-Host '[4/4] Git Bash: scripts/host.sh restart-web ...'
$gitBin = Join-Path $env:ProgramFiles 'Git\bin'
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $GitBash
$psi.Arguments = './scripts/host.sh restart-web'
$psi.WorkingDirectory = $Root
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $false
$psi.EnvironmentVariables['PATH'] = ($gitBin + ';' + $psi.EnvironmentVariables['PATH'])
if ($env:WORKBUDDY_ZOD_TARBALL) {
    $psi.EnvironmentVariables['WORKBUDDY_ZOD_TARBALL'] = $env:WORKBUDDY_ZOD_TARBALL
}

$proc = [System.Diagnostics.Process]::Start($psi)
$proc.WaitForExit()
if ($proc.ExitCode -ne 0) {
    Write-Error "host.sh restart-web failed (exit $($proc.ExitCode))"
}

Write-Host 'Done. Open http://127.0.0.1:3081 and Ctrl+F5.'
exit 0
