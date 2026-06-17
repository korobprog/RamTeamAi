param(
  [string] $KeyPath = "$env:USERPROFILE\.tauri\RamTeamAi-updater.key",
  [string] $Password = "",
  [switch] $Force
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$tauriConfigPath = Join-Path $root "src-tauri\tauri.conf.json"

$keyDir = Split-Path -Parent $KeyPath
New-Item -ItemType Directory -Force -Path $keyDir | Out-Null

$publicKeyPath = "$KeyPath.pub"

if ((Test-Path $KeyPath) -and -not $Force) {
  Write-Host "Using existing updater key at $KeyPath"
} else {
  $args = @("run", "tauri", "--", "signer", "generate", "--ci", "--write-keys", $KeyPath)
  if ($Password) {
    $args += @("--password", $Password)
  }
  if ($Force) {
    $args += "--force"
  }

  & npm @args
  if ($LASTEXITCODE -ne 0) {
    throw "Tauri signer failed with exit code $LASTEXITCODE"
  }
}

if (-not (Test-Path $publicKeyPath)) {
  throw "Public key file not found: $publicKeyPath"
}

$publicKey = (Get-Content -Raw $publicKeyPath).Trim()

$config = Get-Content -Raw $tauriConfigPath | ConvertFrom-Json
if (-not $config.plugins) {
  $config | Add-Member -NotePropertyName plugins -NotePropertyValue ([pscustomobject]@{})
}
if (-not $config.plugins.updater) {
  $config.plugins | Add-Member -NotePropertyName updater -NotePropertyValue ([pscustomobject]@{})
}
$config.plugins.updater.pubkey = $publicKey
$config | ConvertTo-Json -Depth 100 | Set-Content -Path $tauriConfigPath -Encoding utf8

Write-Host "Updater public key written to src-tauri/tauri.conf.json"
Write-Host "Private key: $KeyPath"
Write-Host "Public key:  $publicKeyPath"
Write-Host "Keep the private key secret and back it up."
