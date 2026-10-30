param(
    [string]$Connection = "arkhe-runtime",
    [int]$AskPort = 3000,
    [int]$KeycloakPort = 8180,
    [int]$PrometheusPort = 59095,
    [string]$OutputPath = "apps/arkhe-ask/verification-telemetry-compose.json"
)
$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:$AskPort"
$tokenReply = Invoke-RestMethod -Uri "http://127.0.0.1:$KeycloakPort/realms/arkhe/protocol/openid-connect/token" -Method Post -TimeoutSec 15 -Body @{
    grant_type = "client_credentials"
    client_id = "ask-smoke"
    client_secret = "local-smoke-only"
}
$traceId = [guid]::NewGuid().ToString("N")
$response = Invoke-WebRequest -Uri "$base/v1/ask" -Method Post -ContentType "application/json" -TimeoutSec 15 -Headers @{
    Authorization = "Bearer $($tokenReply.access_token)"
    traceparent = "00-$traceId-0123456789abcdef-01"
} -Body '{"query":"evidence"}'
if ($response.StatusCode -ne 200) { throw "Authenticated request failed" }
$unauthorized = Invoke-WebRequest -Uri "$base/v1/ask" -Method Post -ContentType "application/json" -Body '{"query":"evidence"}' -SkipHttpErrorCheck -TimeoutSec 10
if ($unauthorized.StatusCode -ne 401) { throw "Missing token did not return 401" }
$metrics = Invoke-WebRequest -Uri "$base/metrics" -TimeoutSec 10
if ($metrics.StatusCode -ne 200 -or $metrics.Content -notmatch 'axum_http_requests_total' -or $metrics.Content -notmatch 'axum_http_requests_duration_seconds_bucket') {
    throw "Prometheus exposition missing request metrics"
}
$upQuery = [uri]::EscapeDataString('up{job="arkhe-ask"}')
$expectedSpans = @("POST /v1/ask","arkhe.ask.rag.retrieve","arkhe.ask.rag.generate","arkhe.ask.rag.verify","arkhe.ask.proof.enqueue","arkhe.ask.proof.publish","arkhe.ask.proof.consume","arkhe.ask.proof.anchor")
$names = @()
$up = $null
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $up = Invoke-RestMethod -Uri "http://127.0.0.1:$PrometheusPort/api/v1/query?query=$upQuery" -TimeoutSec 10
    $collectorLog = (& podman --connection $Connection logs --since 2m arkhe-jobplan-otel 2>&1) -join [Environment]::NewLine
    if ($LASTEXITCODE -ne 0) { throw "Collector log read failed" }
    $blocks = $collectorLog -split 'Span #'
    $tree = @($blocks | Where-Object { $_ -match $traceId } | ForEach-Object {
        $name = $null; $spanId = $null; $parentId = $null
        if ($_ -match '(?m)^\s*Name\s*:\s*(.+)$') { $name = $Matches[1].Trim() }
        if ($_ -match '(?m)^\s*ID\s*:\s*([a-fA-F0-9]{16})') { $spanId = $Matches[1] }
        if ($_ -match '(?m)^\s*Parent ID\s*:\s*([a-fA-F0-9]{16})') { $parentId = $Matches[1] }
        if ($name -and $spanId) { [pscustomobject]@{ name=$name; span_id=$spanId; parent_span_id=$parentId } }
    } | Sort-Object span_id -Unique)
    $names = @($tree.name | Sort-Object -Unique)
    $missing = @($expectedSpans | Where-Object { $_ -notin $names })
    if ($up.data.result.Count -gt 0 -and $up.data.result[0].value[1] -eq "1" -and $missing.Count -eq 0) { break }
    Start-Sleep -Milliseconds 500
}
if ($missing.Count -gt 0) { throw "Collector is missing spans for trace ${traceId}: $missing" }
if ($up.data.result.Count -eq 0 -or $up.data.result[0].value[1] -ne "1") { throw "Prometheus scrape target is not up" }
$root = @($tree | Where-Object name -eq "POST /v1/ask")[0]
if ($root.parent_span_id -ne "0123456789abcdef") { throw "Wrong HTTP parent" }
foreach ($child in @("arkhe.ask.rag.retrieve","arkhe.ask.rag.generate","arkhe.ask.rag.verify","arkhe.ask.proof.enqueue")) {
    $stage = @($tree | Where-Object name -eq $child)[0]
    if ($stage.parent_span_id -ne $root.span_id) { throw "$child must be an HTTP child" }
}
$enqueue = @($tree | Where-Object name -eq "arkhe.ask.proof.enqueue")[0]
$publish = @($tree | Where-Object { $_.name -eq "arkhe.ask.proof.publish" -and $_.parent_span_id -eq $enqueue.span_id })
$consume = @($tree | Where-Object { $_.name -eq "arkhe.ask.proof.consume" -and $_.parent_span_id -in $publish.span_id })
$anchor = @($tree | Where-Object { $_.name -eq "arkhe.ask.proof.anchor" -and $_.parent_span_id -in $consume.span_id })
if (-not $publish.Count -or -not $consume.Count -or -not $anchor.Count) { throw "Broken Kafka parent-child chain" }
[ordered]@{
    authenticated_status = 200
    unauthorized_status = 401
    metrics_status = 200
    prometheus_target_up = 1
    collector_trace_id = $traceId
    collector_span_names = $names
    collector_span_tree = $tree
    parent_child_verified = $true
    transport = "OTLP HTTP/protobuf to OpenTelemetry Collector"
    providers = "EchoProvider + tenant-scoped InMemoryStore"
    scope = "HTTP -> durable outbox context -> Kafka headers -> consumer -> anchor; parent IDs verified"
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $OutputPath
Write-Output "Metrics scrape and real collector spans verified: $OutputPath"
