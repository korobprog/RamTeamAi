$ErrorActionPreference = "Stop"

$vsDevCmd = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
if (-not (Test-Path -LiteralPath $vsDevCmd)) {
  Write-Host "Visual Studio Build Tools not found: $vsDevCmd"
  Write-Host "Install Microsoft.VisualStudio.2022.BuildTools with Microsoft.VisualStudio.Workload.VCTools."
  exit 1
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$cmd = @(
  "call `"$vsDevCmd`" -arch=x64 -host_arch=x64",
  "set `"PATH=$env:USERPROFILE\.cargo\bin;$env:PATH`"",
  "cd /d `"$repoRoot`"",
  "npm run tauri -- dev"
) -join " && "

cmd.exe /d /s /c $cmd
exit $LASTEXITCODE
