$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logsRoot = Join-Path $repoRoot "logs\dev"
New-Item -ItemType Directory -Force -Path $logsRoot | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd-HH-mm-ss"
$outLog = Join-Path $logsRoot "tauri-dev-$stamp.out.log"
$errLog = Join-Path $logsRoot "tauri-dev-$stamp.err.log"
$metaLog = Join-Path $logsRoot "tauri-dev-$stamp.meta.log"

@(
  "Started: $(Get-Date -Format o)",
  "Repo: $repoRoot",
  "PID: $PID",
  "Stdout: $outLog",
  "Stderr: $errLog"
) | Set-Content -LiteralPath $metaLog -Encoding UTF8

Write-Host "Writing dev logs to:"
Write-Host "  $outLog"
Write-Host "  $errLog"
Write-Host "  $metaLog"

Push-Location $repoRoot
try {
  & npm run tauri:dev 1> $outLog 2> $errLog
  exit $LASTEXITCODE
} finally {
  Pop-Location
  Add-Content -LiteralPath $metaLog -Value "Finished: $(Get-Date -Format o)" -Encoding UTF8
}
