# --status de cada nó com local/*.env
$ErrorActionPreference = "Stop"
$Here = $PSScriptRoot
foreach ($Node in @("node1", "node2", "node3", "observer")) {
    Write-Host "=== $Node ==="
    & (Join-Path $Here "status.ps1") -Node $Node
}
