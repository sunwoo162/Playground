$ErrorActionPreference = "Stop"

$extensionDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $extensionDir "..\..")
$outDir = Join-Path $repoRoot "dist-webstore"
$zipPath = Join-Path $outDir "school-meal-extension.zip"

if (!(Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath
}

$items = @(
  "manifest.json",
  "background.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "options.html",
  "options.css",
  "options.js",
  "README.md",
  "icons"
)

$paths = $items | ForEach-Object { Join-Path $extensionDir $_ }
Compress-Archive -Path $paths -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Created $zipPath"
