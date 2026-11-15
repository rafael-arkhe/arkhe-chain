# Apaga material gerado em testnet/local/ (chaves, dados, inbox, logs, pids). Irreversível.
$ErrorActionPreference = "Stop"
$Local = Resolve-Path (Join-Path $PSScriptRoot "..\local") -ErrorAction SilentlyContinue
if (-not $Local) {
    Write-Host "nada a limpar"
    exit 0
}
Remove-Item -Recurse -Force $Local
Write-Host "removed $Local"
