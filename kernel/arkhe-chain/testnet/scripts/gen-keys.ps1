$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
Set-Location $Root
cargo run -p arkhe-chain --example testnet_gen_keys
