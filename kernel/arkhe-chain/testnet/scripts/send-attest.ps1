param(
    [Parameter(Mandatory = $true)][uint64]$Run
)
$ErrorActionPreference = "Continue"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
Set-Location $Root
& cargo run -p arkhe-chain --example testnet_attest -- $Run 2>&1 | ForEach-Object {
    if ($_ -is [System.Management.Automation.ErrorRecord]) { Write-Host $_.ToString() } else { Write-Host $_ }
}
if ($LASTEXITCODE -ne 0) { throw "testnet_attest exited $LASTEXITCODE" }
