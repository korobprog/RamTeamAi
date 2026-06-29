param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$')]
  [string] $Version
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Save-Utf8NoBomFile {
  param(
    [Parameter(Mandatory = $true)] [string] $Path,
    [Parameter(Mandatory = $true)] [string] $Value
  )

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Value, $utf8NoBom)
}

function Save-JsonFile {
  param(
    [Parameter(Mandatory = $true)] [string] $Path,
    [Parameter(Mandatory = $true)] $Value
  )

  $json = $Value | ConvertTo-Json -Depth 100
  Save-Utf8NoBomFile -Path $Path -Value ($json + "`n")
}

function Replace-First {
  param(
    [Parameter(Mandatory = $true)] [string] $Text,
    [Parameter(Mandatory = $true)] [string] $Pattern,
    [Parameter(Mandatory = $true)] [string] $Replacement
  )

  $regex = [System.Text.RegularExpressions.Regex]::new(
    $Pattern,
    [System.Text.RegularExpressions.RegexOptions]::Singleline,
    [TimeSpan]::FromSeconds(5)
  )
  $match = $regex.Match($Text)
  if (-not $match.Success) {
    return $Text
  }

  return $Text.Substring(0, $match.Index) + $regex.Replace($match.Value, $Replacement, 1) + $Text.Substring($match.Index + $match.Length)
}

$packagePath = Join-Path $root "package.json"
$packageLockPath = Join-Path $root "package-lock.json"
$tauriConfigPath = Join-Path $root "src-tauri\tauri.conf.json"
$cargoTomlPath = Join-Path $root "src-tauri\Cargo.toml"

$package = Get-Content -Raw $packagePath | ConvertFrom-Json
$package.version = $Version
Save-JsonFile -Path $packagePath -Value $package

if (Test-Path $packageLockPath) {
  $packageLock = Get-Content -Raw $packageLockPath
  $packageLock = Replace-First -Text $packageLock -Pattern '("version"\s*:\s*")[^"]+(")' -Replacement "`${1}$Version`${2}"
  $packageLock = Replace-First -Text $packageLock -Pattern '(""\s*:\s*\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"version"\s*:\s*")[^"]+(")' -Replacement "`${1}$Version`${2}"
  Save-Utf8NoBomFile -Path $packageLockPath -Value $packageLock
}

$tauriConfig = Get-Content -Raw $tauriConfigPath | ConvertFrom-Json
$tauriConfig.version = $Version
Save-JsonFile -Path $tauriConfigPath -Value $tauriConfig

$cargoToml = Get-Content -Raw $cargoTomlPath
$cargoToml = $cargoToml -replace '(?m)^version = ".*"$', "version = `"$Version`""
Save-Utf8NoBomFile -Path $cargoTomlPath -Value $cargoToml

Write-Host "Version set to $Version"
