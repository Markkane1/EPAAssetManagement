$ErrorActionPreference = "Stop"

$mongoExe = "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe"
$mongoShell = "C:\Program Files\MongoDB\Server\8.2\bin\mongosh.exe"
$configPath = "C:\ProgramData\MongoDB\mongod-ams-rs0-27018.yml"
$port = 27018

function Test-PortOpen {
  param(
    [string]$HostName,
    [int]$PortNumber
  )

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($HostName, $PortNumber, $null, $null)
    $connected = $async.AsyncWaitHandle.WaitOne(1200, $false) -and $client.Connected
    return $connected
  } catch {
    return $false
  } finally {
    try { $client.Close() } catch {}
  }
}

if (-not (Test-Path $mongoExe)) {
  Write-Error "mongod binary not found at $mongoExe"
}

if (-not (Test-Path $configPath)) {
  Write-Error "MongoDB config not found at $configPath"
}

if (-not (Test-PortOpen -HostName "127.0.0.1" -PortNumber $port)) {
  Start-Process -FilePath $mongoExe -ArgumentList @("--config", $configPath) -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 2
}

if (-not (Test-PortOpen -HostName "127.0.0.1" -PortNumber $port)) {
  Write-Error "MongoDB is not listening on 127.0.0.1:$port after start attempt."
}

if (Test-Path $mongoShell) {
  $helloJson = & $mongoShell --quiet --port $port --eval "const h=db.hello(); print(JSON.stringify({setName:h.setName||null,isWritablePrimary:!!h.isWritablePrimary}));"
  if ($LASTEXITCODE -eq 0 -and $helloJson) {
    $hello = $helloJson | ConvertFrom-Json
    if (-not $hello.setName) {
      & $mongoShell --quiet --port $port --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27018'}]})" | Out-Null
    }
  }
}

Write-Output "MongoDB RS0 bootstrap check complete."
