param(
  [Parameter(Mandatory = $true)]
  [string] $ExtensionId
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $root 'dist\SiteMacroNativeBridge.exe'
if (!(Test-Path $exe)) {
  throw "브리지 EXE가 없습니다. 먼저 apps\site-macro-native-bridge\build.ps1을 실행하세요."
}

$manifestPath = Join-Path $root 'com.playground.site_macro_bridge.json'
$manifest = @{
  name = 'com.playground.site_macro_bridge'
  description = 'Playground Site Macro native app bridge'
  path = $exe
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 5

Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8
$key = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.playground.site_macro_bridge'
New-Item -Path $key -Force -Value $manifestPath | Out-Null
Write-Host "Installed native messaging host: $manifestPath"
