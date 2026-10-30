param(
    [string]$InputFixture = 'ops/local/e01/fixtures.json',
    [string]$OutputDirectory = ('ops/local/e01/controlled-loss-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Windows DPAPI is required.' }
$secretPath = Join-Path $env:LOCALAPPDATA 'Arkhe\wallets\solana-testnet\private-key.dpapi'
$secure = ConvertTo-SecureString -String ([IO.File]::ReadAllText($secretPath))
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $plaintext = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $plaintext | & node (Join-Path $PSScriptRoot 'poc_e01_controlled_loss.mjs') $InputFixture $OutputDirectory
    $resultCode = $LASTEXITCODE
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $plaintext = $null
}
if ($resultCode -ne 0) { throw "E01 controlled trial failed; inspect public report in $OutputDirectory." }
