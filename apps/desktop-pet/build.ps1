$ErrorActionPreference = "Stop"

Push-Location $PSScriptRoot
try {
  dotnet restore
  dotnet build -c Release
  dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
} finally {
  Pop-Location
}
