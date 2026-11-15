param(
    [Parameter(Mandatory = $true)][uint64]$Nonce,
    [Parameter(Mandatory = $true)][string]$Recipient,
    [Parameter(Mandatory = $true)][uint64]$Value
)
$ErrorActionPreference = "Continue"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
Set-Location $Root
& cargo run -p arkhe-chain --example testnet_faucet_tx -- $Nonce $Recipient $Value 2>&1 | ForEach-Object {
    if ($_ -is [System.Management.Automation.ErrorRecord]) { Write-Host $_.ToString() } else { Write-Host $_ }
}
if ($LASTEXITCODE -ne 0) { throw "testnet_faucet_tx exited $LASTEXITCODE" }
