param([switch]$Check, [switch]$Once)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskData = Join-Path $taskRoot 'ops/local/near-agent-market'
$taskSecretPath = Join-Path $taskData 'agent-token.xml'
if (-not (Test-Path -LiteralPath $taskSecretPath)) { throw 'Configure agent-token.xml with a DPAPI-encrypted PSCredential first. See README.' }
$taskCredential = Import-Clixml -LiteralPath $taskSecretPath
$env:NEAR_MARKET_AGENT_TOKEN = $taskCredential.GetNetworkCredential().Password
$env:ARKHE_MARKET_DATA_DIR = $taskData
$taskConfigPath = Join-Path $taskData 'host.json'
$taskNode = if (Test-Path -LiteralPath $taskConfigPath) { (Get-Content -Raw -LiteralPath $taskConfigPath | ConvertFrom-Json).nodePath } else { (Get-Command node -ErrorAction Stop).Source }
try {
  do {
    $taskArgs = @((Join-Path $PSScriptRoot 'src/cli.mjs'))
    if ($Check) { $taskArgs += '--check' }
    & $taskNode @taskArgs
    $taskExit = $LASTEXITCODE
    if ($Check -or $Once -or $taskExit -eq 78) { break }
    Start-Sleep -Seconds 60
  } while ($true)
  exit $taskExit
} finally { Remove-Item Env:NEAR_MARKET_AGENT_TOKEN -ErrorAction SilentlyContinue }
