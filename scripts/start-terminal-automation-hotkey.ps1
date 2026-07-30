$ErrorActionPreference = 'SilentlyContinue'

$scriptPath = Join-Path $PSScriptRoot 'terminal-automation-hotkey.ps1'

Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -like '*terminal-automation-hotkey.ps1*' -and
    $_.CommandLine -notlike '*start-terminal-automation-hotkey.ps1*' -and
    $_.ProcessId -ne $PID
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Start-Process -FilePath powershell.exe -ArgumentList @(
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  $scriptPath
) -WindowStyle Hidden
