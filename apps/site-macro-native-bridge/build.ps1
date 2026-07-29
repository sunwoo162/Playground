$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
dotnet publish $root -c Release -r win-x64 --self-contained false -o (Join-Path $root 'dist')
