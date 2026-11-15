# Para os PIDs gravados por run-background.ps1.
$ErrorActionPreference = "Stop"
$Local = Join-Path $PSScriptRoot "..\local"
$PidFile = Join-Path $Local "testnet.pids"
if (-not (Test-Path $PidFile)) {
    Write-Host "no pid file"
    exit 0
}
Get-Content $PidFile | ForEach-Object {
    $pidText = $_.Trim()
    if ($pidText -match '^\d+$') {
        $procId = [int]$pidText
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "Stopping PID $procId"
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
}
Remove-Item -Force $PidFile -ErrorAction SilentlyContinue
Write-Host "stopped"
