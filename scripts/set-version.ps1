param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$')]
  [string] $Version
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Save-JsonFile {
  param(
    [Parameter(Mandatory = $true)] [string] $Path,
    [Parameter(Mandatory = $true)] $Value
  )

  $json = $Value | ConvertTo-Json -Depth 100
  Set-Content -Path $Path -Value ($json + "`n") -Encoding utf8
}

$packagePath = Join-Path $root "package.json"
$packageLockPath = Join-Path $root "package-lock.json"
$tauriConfigPath = Join-Path $root "src-tauri\tauri.conf.json"
$cargoTomlPath = Join-Path $root "src-tauri\Cargo.toml"

$package = Get-Content -Raw $packagePath | ConvertFrom-Json
$package.version = $Version
Save-JsonFile -Path $packagePath -Value $package

if (Test-Path $packageLockPath) {
  $packageLock = Get-Content -Raw $packageLockPath | ConvertFrom-Json
  $packageLock.version = $Version
  if ($packageLock.packages -and $packageLock.packages.PSObject.Properties.Name -contains "") {
    $packageLock.packages."".version = $Version
  }
  Save-JsonFile -Path $packageLockPath -Value $packageLock
}

$tauriConfig = Get-Content -Raw $tauriConfigPath | ConvertFrom-Json
$tauriConfig.version = $Version
Save-JsonFile -Path $tauriConfigPath -Value $tauriConfig

$cargoToml = Get-Content -Raw $cargoTomlPath
$cargoToml = $cargoToml -replace '(?m)^version = ".*"$', "version = `"$Version`""
Set-Content -Path $cargoTomlPath -Value $cargoToml -Encoding utf8

Write-Host "Version set to $Version"
