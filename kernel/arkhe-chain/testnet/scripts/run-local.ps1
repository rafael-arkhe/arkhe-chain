# Sobe seguidores e depois o sealer (node1) com --inbox. Só um selador.
$ErrorActionPreference = "Stop"
$Here = $PSScriptRoot
& (Join-Path $Here "start-node.ps1") -Node node2 -Once
& (Join-Path $Here "start-node.ps1") -Node node3 -Once
& (Join-Path $Here "start-node.ps1") -Node observer -Once
& (Join-Path $Here "start-node.ps1") -Node node1 -Once
& (Join-Path $Here "collect-peers.ps1")
Write-Host "peers recolhidos. Suba cada nó num terminal:"
Write-Host "  .\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node2"
Write-Host "  .\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node3"
Write-Host "  .\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node observer"
Write-Host "  .\kernel\arkhe-chain\testnet\scripts\start-node.ps1 -Node node1"
Write-Host "Faucet: .\kernel\arkhe-chain\testnet\scripts\faucet-tx.ps1 -Nonce 0 -Recipient alice -Value 100"
