@echo off
setlocal
set "VSDEVCMD=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
if not exist "%VSDEVCMD%" (
  echo Visual Studio Build Tools not found: %VSDEVCMD%
  echo Install Microsoft.VisualStudio.2022.BuildTools with Microsoft.VisualStudio.Workload.VCTools.
  exit /b 1
)
call "%VSDEVCMD%" -arch=x64 -host_arch=x64
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
cd /d "%~dp0.."
npm run tauri -- dev
