param([string]$OutputDirectory = (Join-Path $env:TEMP ('arkhe-crm-v2-' + [guid]::NewGuid())))
$ErrorActionPreference = 'Stop'
$bridgeRoot = Split-Path $PSScriptRoot -Parent
$workspaceRoot = Split-Path (Split-Path $bridgeRoot -Parent) -Parent
New-Item -ItemType Directory -Path $OutputDirectory -ErrorAction Stop | Out-Null
$OutputDirectory = (Resolve-Path -LiteralPath $OutputDirectory).Path
$exe = Join-Path $workspaceRoot 'target/debug/arkhe-crm-bridge-cli.exe'
Push-Location $workspaceRoot
try {
    cargo build -q -p arkhe-crm-bridge-cli
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    function Invoke-Bridge([string[]]$Arguments) {
        $result = & $exe @Arguments
        if ($LASTEXITCODE -ne 0) { throw "Bridge command failed: $($Arguments[0])" }
        return $result
    }
    $producerSecret = Join-Path $OutputDirectory 'producer.key'
    $bridgeSecret = Join-Path $OutputDirectory 'bridge.key'
    $producerPublic = Invoke-Bridge @('keygen', '--secret', $producerSecret)
    $bridgePublic = Invoke-Bridge @('keygen', '--secret', $bridgeSecret)
    $record = Get-Content -Raw (Join-Path $bridgeRoot 'fixtures/lead.json') | ConvertFrom-Json
    $policyPath = Join-Path $OutputDirectory 'policy.json'
    $eventPath = Join-Path $OutputDirectory 'event.json'
    $requestPath = Join-Path $OutputDirectory 'request.json'
    $proofPath = Join-Path $OutputDirectory 'proof.json'
    $database = Join-Path $OutputDirectory 'bridge.db'
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    @{
        schema = 2; log_id = 'demo-log'; bridge_public_key = "$bridgePublic"
        max_age_secs = 300; max_ttl_secs = 300; future_skew_secs = 5
        producers = @(@{ id = 'demo-producer'; public_key = "$producerPublic"; org_id = $record.org_id
            source_system = $record.source_system; object = $record.object; fields = @($record.field) })
    } | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 $policyPath
    @{
        schema = 2; log_id = 'demo-log'; event_id = 'demo-event-1'; producer_id = 'demo-producer'
        issued_at = $now; expires_at = $now + 300; record = $record
    } | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 $eventPath
    Invoke-Bridge @('sign', '--input', $eventPath, '--secret', $producerSecret) | Set-Content -Encoding utf8 $requestPath
    $anchorArgs = @('anchor', '--input', $requestPath, '--database', $database, '--policy', $policyPath, '--secret', $bridgeSecret)
    Invoke-Bridge $anchorArgs | Set-Content -Encoding utf8 $proofPath
    $verified = Invoke-Bridge @('verify', '--proof', $proofPath, '--policy', $policyPath)
    $retry = Invoke-Bridge $anchorArgs
    if (($retry -join "`n") -ne ((Get-Content $proofPath) -join "`n")) { throw 'Retry changed the committed proof' }
    $exported = Invoke-Bridge @('export', '--event-id', 'demo-event-1', '--database', $database, '--policy', $policyPath)
    if (($exported -join "`n") -ne ((Get-Content $proofPath) -join "`n")) { throw 'Export differs from committed proof' }
    Write-Output "Verification: $verified; exact retry and export matched. Artifacts: $OutputDirectory"
} finally { Pop-Location }
