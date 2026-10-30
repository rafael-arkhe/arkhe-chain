param(
    [string]$InputFixture = 'ops/local/e01/fixtures.json',
    [string]$OutputDirectory = ('ops/local/e01/funded-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')),
    [switch]$Matrix,
    [ValidateSet(1,2)][int]$ProtocolVersion = 1
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Windows DPAPI is required.' }
$secretPath = Join-Path $env:LOCALAPPDATA 'Arkhe\wallets\solana-testnet\private-key.dpapi'
$secure = ConvertTo-SecureString -String ([IO.File]::ReadAllText($secretPath))
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $plaintext = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    # Secret travels through stdin only, never command arguments, logs or disk.
    $runFlag = if ($Matrix) { '--wallet-stdin-matrix' } else { '--wallet-stdin-send' }
    if ($ProtocolVersion -eq 2) { $runFlag += '-v2' }
    $plaintext | & node (Join-Path $PSScriptRoot 'poc_e01_devnet.mjs') $InputFixture $OutputDirectory $runFlag
    $resultCode = $LASTEXITCODE
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $plaintext = $null
}
if ($resultCode -ne 0) { throw "E01 run failed (exit $resultCode); inspect public report in $OutputDirectory." }
