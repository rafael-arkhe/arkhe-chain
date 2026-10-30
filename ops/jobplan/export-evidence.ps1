param(
    [int]$GrafanaPort = 59096,
    [int]$PrometheusPort = 59095,
    [string]$OutputPath = "apps/arkhe-ask/verification-portfolio.json"
)
$ErrorActionPreference = "Stop"
& ./ops/jobplan/verify-dashboard.ps1 -GrafanaPort $GrafanaPort -PrometheusPort $PrometheusPort
$reply = Invoke-RestMethod -Uri "http://127.0.0.1:$GrafanaPort/api/dashboards/uid/arkhe-ask-ops" -TimeoutSec 10
$measurements = Get-Content -LiteralPath apps/arkhe-ask/verification-grafana.json -Raw | ConvertFrom-Json
$trace = Get-Content -LiteralPath apps/arkhe-ask/verification-telemetry-compose.json -Raw | ConvertFrom-Json
$workload = Get-Content -LiteralPath apps/arkhe-ask/verification-workload.json -Raw | ConvertFrom-Json
$crash = Get-Content -LiteralPath apps/arkhe-ask/verification-process-crash.json -Raw | ConvertFrom-Json
if ($reply.dashboard.uid -ne $measurements.uid -or $reply.dashboard.panels.Count -ne $measurements.panels.Count) { throw "Dashboard evidence differs from live export" }
foreach ($panel in $reply.dashboard.panels) {
    $measurement = @($measurements.panels | Where-Object title -eq $panel.title)
    if ($measurement.Count -ne 1 -or $measurement[0].expression -ne $panel.targets[0].expr) { throw "Panel query mismatch" }
}
if (-not $trace.parent_child_verified -or $crash.child_exit_code -ne 73 -or $crash.durable_anchors_after_recovery -ne 1) {
    throw "Required trace/crash validation is absent"
}
if ($workload.unexpected_statuses -ne 0 -or $workload.prometheus_request_rate_per_second -le 0 -or $workload.prometheus_http_histogram_p95_seconds -le 0) {
    throw "Bounded-workload evidence is incomplete"
}
$nanCases = @()
foreach ($expression in @('(vector(0) / vector(0)) or vector(0)', 'clamp_min(vector(0) / vector(0), 0)')) {
    $encoded = [uri]::EscapeDataString($expression)
    $nanReply = Invoke-RestMethod -Uri "http://127.0.0.1:$PrometheusPort/api/v1/query?query=$encoded" -TimeoutSec 10
    $nanCases += [pscustomobject]@{ expression=$expression; observed_value=$nanReply.data.result[0].value[1] }
}
if (-not $reply.dashboard -or $reply.dashboard.panels.Count -ne 8) { throw "Cannot export an incomplete dashboard" }
[ordered]@{
    schema_version = 1
    captured_at_utc = [DateTimeOffset]::UtcNow.ToString("o")
    evidence_kind = "Runtime snapshot and executed test results; not a signed attestation"
    dashboard = $reply.dashboard
    dashboard_metadata = @{ uid=$reply.dashboard.uid; url=$measurements.url; access=$measurements.access; panel_count=$reply.dashboard.panels.Count }
    panel_query_validation = $measurements.panels
    collector_trace_validation = $trace
    enqueue_process_crash_validation = $crash
    bounded_workload_validation = $workload
    p95_display_validation = $measurements.p95_display
    promql_nan_demonstration = $nanCases
    limitations = @(
        "Dashboard JSON is included for offline inspection; its live URL is not required to inspect panel definitions."
        "Prometheus measurements are a point-in-time snapshot, not a load benchmark."
        "Crash helper exits without Rust drops/SDK shutdown; PostgreSQL and Kafka remain running."
        "Context recovery does not guarantee export of pre-crash span data."
        "Azure generation, global PgWormGraph/MMR and real broker outage remain unverified."
    )
} | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $OutputPath
Write-Output "Self-contained evidence exported: $OutputPath"
