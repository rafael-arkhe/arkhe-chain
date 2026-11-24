<#
.SYNOPSIS
Starts arkhe-solana-swap-gateway in strict shadow read-only mode (zero real signatures, zero broadcast).

.EXAMPLE
$env:ARKHE_SOLANA_SWAP_TOKEN = '<strong-bearer-token>'
$env:ZEROX_API_KEY = '<rotated-0x-api-key>'
.\orchestration\arkhe-runtime\scripts\start-solana-swap-shadow.ps1 `
  -PolicyPath orchestration\arkhe-runtime\config\solana-swap-policy.example.json `
  -SolanaRpcUrl https://api.mainnet-beta.solana.com
#>
param(
  [string]$Bind = "127.0.0.1:8090",
  [string]$DbPath = "ops/local/solana-swap/state.sqlite",
  [string]$KeysDir = "ops/local/solana-swap/keys",
  [string]$PolicyPath = "orchestration/arkhe-runtime/config/solana-swap-policy.example.json",
  [string]$ZeroXBaseUrl = "https://api.0x.org",
  [string[]]$SolanaRpcUrl = @(),
  [int]$AltQuorumMin = 1,
  [string]$AltObserverKeyId = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:ARKHE_SOLANA_SWAP_TOKEN)) {
  Write-Error "ARKHE_SOLANA_SWAP_TOKEN must be set before starting the gateway (fail-closed)."
  exit 1
}

$Bin = "target/debug/arkhe-solana-swap-gateway.exe"
if (-not (Test-Path $Bin)) {
  Write-Host "Building arkhe-solana-swap-gateway..."
  cargo build -p arkhe-runtime --features sqlite-activation --bin arkhe-solana-swap-gateway --locked
}

Write-Host "Validating policy $PolicyPath ..."
& $Bin validate-policy --policy $PolicyPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$argsList = @(
  "serve",
  "--bind", $Bind,
  "--db", $DbPath,
  "--policy", $PolicyPath,
  "--keys-dir", $KeysDir,
  "--zerox-base-url", $ZeroXBaseUrl
)

foreach ($rpc in $SolanaRpcUrl) {
  if (-not [string]::IsNullOrWhiteSpace($rpc)) {
    $argsList += @("--solana-rpc-url", $rpc)
  }
}
if ($AltQuorumMin -gt 1) {
  $argsList += @("--alt-quorum-min", "$AltQuorumMin")
}
if (-not [string]::IsNullOrWhiteSpace($AltObserverKeyId)) {
  $argsList += @("--alt-observer-key-id", $AltObserverKeyId)
}

Write-Host "Starting arkhe-solana-swap-gateway in DRY-RUN shadow read-only mode on $Bind ..."
& $Bin @argsList
