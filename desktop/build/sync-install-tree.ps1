#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)][string]$SrcDirFile,
  [Parameter(Mandatory = $true)][string]$DstDirFile
)
$ErrorActionPreference = "Stop"
$src = (Get-Content -LiteralPath $SrcDirFile -Raw -Encoding UTF8).Trim()
$dst = (Get-Content -LiteralPath $DstDirFile -Raw -Encoding UTF8).Trim()
if (-not (Test-Path -LiteralPath $src)) { throw "src missing: $src" }
New-Item -ItemType Directory -Force -Path $dst | Out-Null
# Prefer robocopy (long-path friendly on Win10+); fall back to \\?\ Copy-Item.
$robocopy = Join-Path $env:SystemRoot "System32\robocopy.exe"
if (Test-Path -LiteralPath $robocopy) {
  & $robocopy $src $dst /E /IS /IT /R:2 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
  $code = $LASTEXITCODE
  if ($code -ge 8) { throw "robocopy failed code=$code" }
  exit 0
}
function Win-Long([string]$p) {
  if ($p.StartsWith("\\?\")) { return $p }
  if ($p.StartsWith("\\")) { return "\\?\UNC\" + $p.Substring(2) }
  return "\\?\" + $p
}
Get-ChildItem -LiteralPath $src -Recurse -Force -File | ForEach-Object {
  $rel = $_.FullName.Substring($src.Length).TrimStart("\", "/")
  $target = Join-Path $dst $rel
  $parent = Split-Path -Parent $target
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  Copy-Item -LiteralPath (Win-Long $_.FullName) -Destination (Win-Long $target) -Force
}
exit 0
