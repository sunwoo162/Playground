# FocusTime Tracker 빌드 스크립트 (.NET Framework csc 사용)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$csc = @(
  "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $csc) { Write-Host "csc.exe 를 찾을 수 없습니다." ; exit 1 }

$out = Join-Path $here "FocusTimeTracker.exe"
& $csc /nologo /target:winexe /platform:anycpu `
  /r:System.Windows.Forms.dll `
  /r:System.Drawing.dll `
  /r:System.Web.Extensions.dll `
  /out:"$out" `
  (Join-Path $here "Tracker.cs")

if ($LASTEXITCODE -eq 0) { Write-Host "빌드 성공: $out" } else { Write-Host "빌드 실패(exit $LASTEXITCODE)" }
