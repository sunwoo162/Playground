param(
  [int]$Port = 7421
)

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataPath = Join-Path $root 'tracker-data.json'
$iconDir = Join-Path $root 'tracker-icons'
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
$noticeCooldown = @{}
$excludedTrackApps = @(
  'ApplicationFrameHost',
  'TextInputHost',
  'ShellExperienceHost',
  'StartMenuExperienceHost',
  'SearchHost',
  'RuntimeBroker',
  'SystemSettings',
  'RtkUWP'
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class Win32Focus {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
'@

function Today-Key {
  return (Get-Date).ToString('yyyy-MM-dd')
}

function Empty-Store {
  return [ordered]@{
    usage = [ordered]@{}
    limits = [ordered]@{}
    blocks = @()
    tracking = $true
    current = ''
    title = ''
  }
}

function Load-Store {
  if (!(Test-Path $dataPath)) { return Empty-Store }
  try {
    $raw = Get-Content -LiteralPath $dataPath -Raw
    if (!$raw) { return Empty-Store }
    $obj = $raw | ConvertFrom-Json
    $store = Empty-Store
    foreach ($prop in $obj.PSObject.Properties) { $store[$prop.Name] = $prop.Value }
    return $store
  } catch {
    return Empty-Store
  }
}

function Save-Store($store) {
  $store | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $dataPath -Encoding UTF8
}

function Ensure-Day($store, $day) {
  if (!$store.usage) { $store.usage = [ordered]@{} }
  if (!$store.usage.$day) {
    $store.usage | Add-Member -NotePropertyName $day -NotePropertyValue ([ordered]@{}) -Force
  }
}

function Get-Foreground-App {
  $hwnd = [Win32Focus]::GetForegroundWindow()
  if ($hwnd -eq [IntPtr]::Zero) { return @{ name = ''; title = '' } }

  $procId = 0
  [void][Win32Focus]::GetWindowThreadProcessId($hwnd, [ref]$procId)
  if (!$procId) { return @{ name = ''; title = '' } }

  $proc = Get-Process -Id $procId
  $titleBuf = New-Object System.Text.StringBuilder 512
  [void][Win32Focus]::GetWindowText($hwnd, $titleBuf, $titleBuf.Capacity)

  return @{
    name = $proc.ProcessName
    title = $titleBuf.ToString()
  }
}

function Get-Running-Tracked-Apps {
  $apps = @{}
  foreach ($proc in (Get-Process | Where-Object {
    $_.ProcessName -and
    $_.MainWindowHandle -ne 0 -and
    $_.MainWindowTitle -and
    $script:excludedTrackApps -notcontains $_.ProcessName
  })) {
    $name = $proc.ProcessName
    if (!$apps.ContainsKey($name)) {
      $apps[$name] = @{
        name = $name
        title = $proc.MainWindowTitle
      }
    }
  }
  return @($apps.Values)
}

function Add-App-Usage($store, $day, $name, $elapsed) {
  if (!$name -or $elapsed -le 0) { return }
  Ensure-Day $store $day
  $dayObj = $store.usage.$day
  $prev = 0
  if ($dayObj.PSObject.Properties.Name -contains $name) { $prev = [int64]$dayObj.$($name) }
  $dayObj | Add-Member -NotePropertyName $name -NotePropertyValue ($prev + $elapsed) -Force
}

function Normalize-Icon-Path($value) {
  if (!$value) { return $null }
  $s = [string]$value
  $s = $s.Trim().Trim('"')
  if ($s.Contains(',')) { $s = $s.Split(',')[0].Trim().Trim('"') }
  if ($s.StartsWith('@')) { $s = $s.Substring(1) }
  if ($s -match '^(.+\.exe)\b') { $s = $Matches[1] }
  if ($s -match '^(.+\.ico)\b') { $s = $Matches[1] }
  $expanded = [Environment]::ExpandEnvironmentVariables($s)
  if (Test-Path -LiteralPath $expanded) { return $expanded }
  return $null
}

function App-Key($name) {
  return ([string]$name).ToLowerInvariant().Replace('\', '_').Replace('/', '_').Replace(':', '_').Replace('*', '_').Replace('?', '_').Replace('"', '_').Replace('<', '_').Replace('>', '_').Replace('|', '_')
}

function Export-App-Icon($name, $sourcePath) {
  $source = Normalize-Icon-Path $sourcePath
  if (!$name -or !$source) { return $false }
  $out = Join-Path $iconDir ((App-Key $name) + '.png')
  if (Test-Path -LiteralPath $out) { return $true }
  try {
    if ($source.ToLowerInvariant().EndsWith('.ico')) {
      $icon = New-Object Drawing.Icon($source)
    } else {
      $icon = [Drawing.Icon]::ExtractAssociatedIcon($source)
    }
    if (!$icon) { return $false }
    $bmp = $icon.ToBitmap()
    $bmp.Save($out, [Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $icon.Dispose()
    return $true
  } catch {
    return $false
  }
}

function Get-Installed-Apps {
  $map = @{}

  foreach ($proc in (Get-Process | Where-Object { $_.ProcessName })) {
    $path = $proc.Path
    $name = $proc.ProcessName
    $key = $name.ToLowerInvariant()
    if (!$map.ContainsKey($key)) {
      $hasIcon = Export-App-Icon $name $path
      $map[$key] = [ordered]@{
        name = $name
        display = $name
        running = $true
        hasIcon = $hasIcon
        path = $path
      }
    } else {
      $map[$key].running = $true
    }
  }

  $regPaths = @(
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  foreach ($regPath in $regPaths) {
    foreach ($item in (Get-ItemProperty $regPath)) {
      if (!$item.DisplayName) { continue }
      $display = [string]$item.DisplayName
      $name = $display
      $iconPath = Normalize-Icon-Path $item.DisplayIcon
      if (!$iconPath -and $item.InstallLocation) {
        $exe = Get-ChildItem -LiteralPath $item.InstallLocation -Filter *.exe -File | Select-Object -First 1
        if ($exe) { $iconPath = $exe.FullName }
      }
      $key = $name.ToLowerInvariant()
      if (!$map.ContainsKey($key)) {
        $hasIcon = Export-App-Icon $name $iconPath
        $map[$key] = [ordered]@{
          name = $name
          display = $display
          running = $false
          hasIcon = $hasIcon
          path = $iconPath
        }
      }
    }
  }

  foreach ($shortcutRoot in @(
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
    "$env:AppData\Microsoft\Windows\Start Menu\Programs"
  )) {
    if (!(Test-Path -LiteralPath $shortcutRoot)) { continue }
    foreach ($lnk in (Get-ChildItem -LiteralPath $shortcutRoot -Filter *.lnk -Recurse)) {
      $display = [IO.Path]::GetFileNameWithoutExtension($lnk.Name)
      $key = $display.ToLowerInvariant()
      if ($map.ContainsKey($key)) { continue }
      $target = $null
      try {
        $shell = New-Object -ComObject WScript.Shell
        $sc = $shell.CreateShortcut($lnk.FullName)
        $target = Normalize-Icon-Path $sc.TargetPath
      } catch {}
      $hasIcon = Export-App-Icon $display $target
      $map[$key] = [ordered]@{
        name = $display
        display = $display
        running = $false
        hasIcon = $hasIcon
        path = $target
      }
    }
  }

  return @($map.Values | Sort-Object @{ Expression = 'hasIcon'; Descending = $true }, @{ Expression = 'running'; Descending = $true }, @{ Expression = 'display'; Ascending = $true })
}

function Is-Blocked-App($store, $name) {
  if (!$name -or !$store.blocks) { return $false }
  return @($store.blocks) -contains $name
}

function Is-Limited-App($store, $name, $used) {
  if (!$name -or !$store.limits) { return $false }
  $limitProp = $store.limits.PSObject.Properties[$name]
  if (!$limitProp) { return $false }
  $limitMs = [int64]$limitProp.Value * 60000
  return $limitMs -gt 0 -and $used -ge $limitMs
}

function Show-Blocked-App-Notice($name, $reason) {
  $now = Get-Date
  if ($script:noticeCooldown[$name] -and (($now - $script:noticeCooldown[$name]).TotalSeconds -lt 5)) {
    return
  }
  $script:noticeCooldown[$name] = $now

  $message = if ($reason -eq 'limit') {
    "$name 앱의 오늘 사용 시간을 모두 사용했습니다."
  } else {
    "$name 앱은 차단된 앱입니다."
  }

  [System.Windows.Forms.MessageBox]::Show(
    $message,
    'FocusTime',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Warning
  ) | Out-Null
}

function Json-Response($ctx, $obj, [int]$status = 200) {
  $json = $obj | ConvertTo-Json -Depth 20
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = 'application/json; charset=utf-8'
  $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}

function Text-Response($ctx, $text, [int]$status = 200) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = 'text/plain; charset=utf-8'
  $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}

function Parse-Query($queryString) {
  $result = @{}
  $q = [string]$queryString
  if ($q.StartsWith('?')) { $q = $q.Substring(1) }
  if (!$q) { return $result }
  foreach ($part in $q.Split('&')) {
    if (!$part) { continue }
    $pair = $part.Split('=', 2)
    $key = [Uri]::UnescapeDataString($pair[0].Replace('+', ' '))
    $value = ''
    if ($pair.Count -gt 1) { $value = [Uri]::UnescapeDataString($pair[1].Replace('+', ' ')) }
    $result[$key] = $value
  }
  return $result
}

$store = Load-Store
$lastTick = Get-Date
$updating = $false

function Update-Usage {
  if ($script:updating) { return }
  $script:updating = $true
  try {
  $script:store = Load-Store
  $now = Get-Date
  $elapsed = [Math]::Max(0, [int](($now - $script:lastTick).TotalMilliseconds))
  $script:lastTick = $now

  $fg = Get-Foreground-App
  $script:store.current = $fg.name
  $script:store.title = $fg.title

  $runningApps = Get-Running-Tracked-Apps

  # 전경(포그라운드) 앱에만 시간 누적 — 이전엔 모든 실행 중 앱에 더해 과다 집계됨
  if ($script:store.tracking -and $elapsed -gt 0 -and $elapsed -lt 10000 -and $fg.name) {
    $day = Today-Key
    Add-App-Usage $script:store $day $fg.name $elapsed
  }

  Save-Store $script:store

  $todayObj = $script:store.usage.$(Today-Key)
  foreach ($app in $runningApps) {
    $usedNow = 0
    if ($todayObj -and $app.name -and ($todayObj.PSObject.Properties.Name -contains $app.name)) {
      $usedNow = [int64]$todayObj.$($app.name)
    }
    if ($app.name -and (Is-Blocked-App $script:store $app.name)) {
      Stop-Process -Name $app.name -Force
      Show-Blocked-App-Notice $app.name 'block'
    } elseif ($app.name -and (Is-Limited-App $script:store $app.name $usedNow)) {
      Stop-Process -Name $app.name -Force
      Show-Blocked-App-Notice $app.name 'limit'
    }
  }
  } finally {
    $script:updating = $false
  }
}

$usageTimer = New-Object Timers.Timer
$usageTimer.Interval = 1000
$usageTimer.AutoReset = $true
$usageTimer.add_Elapsed({ Update-Usage })
$usageTimer.Start()

$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "FocusTimeTracker running at http://localhost:$Port/"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      Update-Usage
      $path = $ctx.Request.Url.AbsolutePath
      $query = Parse-Query $ctx.Request.Url.Query
      $store = Load-Store

      switch ($path) {
        '/' {
          Text-Response $ctx "FocusTimeTracker running"
        }
        '/app-usage' {
          Json-Response $ctx @{
            today = Today-Key
            days = $store.usage
            tracking = [bool]$store.tracking
            current = [string]$store.current
            title = [string]$store.title
          }
        }
        '/app-limits' {
          Json-Response $ctx @{ limits = $store.limits; blocks = @($store.blocks) }
        }
        '/app-blocks' {
          Json-Response $ctx @{ blocks = @($store.blocks) }
        }
        '/set-app-limit' {
          $name = $query['name']
          $minutes = [int]($query['minutes'])
          if (!$store.limits) { $store.limits = [ordered]@{} }
          if ($name) {
            if ($minutes -gt 0) {
              $store.limits | Add-Member -NotePropertyName $name -NotePropertyValue $minutes -Force
            } else {
              $store.limits.PSObject.Properties.Remove($name)
            }
            Save-Store $store
          }
          Json-Response $ctx @{ ok = $true; limits = $store.limits }
        }
        '/set-app-block' {
          $name = $query['name']
          $blocked = [string]$query['blocked']
          if (!$store.blocks) { $store.blocks = @() }
          if ($name) {
            $arr = @($store.blocks | Where-Object { $_ -ne $name })
            if ($blocked -eq '1' -or $blocked -eq 'true') { $arr += $name }
            $store.blocks = @($arr | Select-Object -Unique)
            Save-Store $store
          }
          Json-Response $ctx @{ ok = $true; blocks = @($store.blocks) }
        }
      '/apps' {
        $apps = Get-Installed-Apps
        Json-Response $ctx @{ apps = @($apps) }
      }
      '/app-icon' {
        $name = $query['name']
        $file = Join-Path $iconDir ((App-Key $name) + '.png')
        if (!(Test-Path -LiteralPath $file)) {
          Json-Response $ctx @{ error = 'icon not found' } 404
          break
        }
        $bytes = [IO.File]::ReadAllBytes($file)
        $ctx.Response.StatusCode = 200
        $ctx.Response.ContentType = 'image/png'
        $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $ctx.Response.Close()
      }
        default {
          Json-Response $ctx @{ error = 'not found' } 404
        }
      }
    } catch {
      Json-Response $ctx @{ error = $_.Exception.Message } 500
    }
  }
} finally {
  $usageTimer.Stop()
  $listener.Stop()
}
