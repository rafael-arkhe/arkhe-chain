# Confere o gênese, anuncia cada nó uma vez e recolhe peers.txt.
# Não sobe a rede em persistência (use run-background depois).
$ErrorActionPreference = "Stop"
$Here = $PSScriptRoot
$Net = Resolve-Path (Join-Path $Here "..")
$Local = Join-Path $Net "local"
$Genesis = Join-Path $Local "genesis.txt"
$Root = Resolve-Path (Join-Path $Here "..\..\..\..")

if (-not (Test-Path $Genesis)) {
    Write-Host "=== gen-keys ==="
    & (Join-Path $Here "gen-keys.ps1")
}

Set-Location $Root
Write-Host "=== show-genesis ==="
cargo run -q -p arkhe-chain -- --show-genesis --genesis $Genesis
Write-Host "=== show-peers ==="
cargo run -q -p arkhe-chain -- --show-peers --genesis $Genesis

Write-Host "=== announce once ==="
# Stale chain files from an older genesis refuse open with Genesis.
foreach ($Name in @("node1", "node2", "node3", "observer")) {
    $Data = Join-Path $Local "data\$Name"
    if (Test-Path $Data) { Remove-Item -Recurse -Force $Data }
}
foreach ($Node in @("node2", "node3", "observer", "node1")) {
    & (Join-Path $Here "start-node.ps1") -Node $Node -Once
}
& (Join-Path $Here "collect-peers.ps1")
Write-Host "init-local ok. Seguinte: run-background.ps1"
