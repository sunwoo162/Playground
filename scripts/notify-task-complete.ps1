$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$trackPath = Join-Path $PSScriptRoot '..\assets\notify\ncs-link.mp3'

Add-Type -AssemblyName System.Windows.Forms
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = [System.Drawing.SystemIcons]::Information
$notifyIcon.BalloonTipTitle = 'Codex task complete'
$notifyIcon.BalloonTipText = 'Your requested work is done.'
$notifyIcon.Visible = $true
$notifyIcon.ShowBalloonTip(5000)

if (Test-Path $trackPath) {
  Add-Type -AssemblyName PresentationCore
  $player = New-Object System.Windows.Media.MediaPlayer
  $player.Open([Uri](Resolve-Path $trackPath).Path)
  $player.Volume = 0.35
  Start-Sleep -Milliseconds 600
  $player.Position = [TimeSpan]::FromSeconds(60)
  $player.Play()
  Start-Sleep -Seconds 5
  $player.Stop()
  $player.Close()
  $notifyIcon.Dispose()
  exit 0
}

$tones = @(
  @{ Frequency = 660; Duration = 220 },
  @{ Frequency = 784; Duration = 220 },
  @{ Frequency = 880; Duration = 260 }
)

foreach ($tone in $tones) {
  [Console]::Beep($tone.Frequency, $tone.Duration)
  Start-Sleep -Milliseconds 90
}

[System.Windows.Forms.SystemSounds]::Asterisk.Play()
$notifyIcon.Dispose()
