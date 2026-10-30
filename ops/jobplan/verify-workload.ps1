param(
    [string]$Connection = "arkhe-runtime",
    [int]$AskPort = 56591,
    [int]$KeycloakPort = 8180,
    [int]$PrometheusPort = 59095,
    [ValidateRange(1,200)][int]$AuthenticatedRequests = 40,
    [ValidateRange(0,40)][int]$UnauthorizedRequests = 8,
    [ValidateRange(1,8)][int]$Concurrency = 4,
    [string]$OutputPath = "apps/arkhe-ask/verification-workload.json"
)
$ErrorActionPreference = "Stop"
# Inspect configuration without printing environment values or credential material.
$configuration = (& podman --connection $Connection inspect arkhe-jobplan-ask --format '{{json .Config.Env}}') | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "Cannot inspect the local demo configuration" }
foreach ($entry in $configuration) {
    $pair = $entry -split '=',2
    if ($pair[0] -in @("AZURE_OPENAI_ENDPOINT","AZURE_OPENAI_DEPLOYMENT","AZURE_OPENAI_EMBEDDING_DEPLOYMENT","AZURE_OPENAI_API_KEY") -and -not [string]::IsNullOrWhiteSpace($pair[1])) {
        throw "This bounded workload is restricted to the local Echo/demo configuration"
    }
}
$base = "http://127.0.0.1:$AskPort"
$health = Invoke-WebRequest -Uri "$base/healthz" -TimeoutSec 5
if ($health.StatusCode -ne 200) { throw "Demo service is not healthy" }
$token = (Invoke-RestMethod -Uri "http://127.0.0.1:$KeycloakPort/realms/arkhe/protocol/openid-connect/token" -Method Post -Body @{
    grant_type="client_credentials";client_id="ask-smoke";client_secret="local-smoke-only"
} -TimeoutSec 10).access_token
if (-not $token) { throw "Keycloak did not issue a token" }
$warmup = Invoke-WebRequest -Uri "$base/v1/ask" -Method Post -Headers @{Authorization="Bearer $token"} -ContentType "application/json" -Body '{"query":"evidence"}' -SkipHttpErrorCheck -TimeoutSec 15
if ($warmup.StatusCode -ne 200) { throw "Demo warmup failed" }
function Get-Counter([string]$Text,[string]$Name,[string[]]$Labels) {
    $sum = 0.0
    foreach ($line in ($Text -split '\r?\n')) {
        if (-not $line.StartsWith($Name + "{")) { continue }
        $matchesAll = $true
        foreach ($label in $Labels) { if (-not $line.Contains($label)) { $matchesAll = $false } }
        if ($matchesAll) { $sum += [double]::Parse(($line -split '\s+')[-1],[cultureinfo]::InvariantCulture) }
    }
    return $sum
}
function Get-Prom([string]$Expression) {
    $encoded = [uri]::EscapeDataString($Expression)
    $reply = Invoke-RestMethod -Uri "http://127.0.0.1:$PrometheusPort/api/v1/query?query=$encoded" -TimeoutSec 10
    if ($reply.status -ne "success") { throw "Prometheus query failed" }
    return $reply.data.result
}
$before = (Invoke-WebRequest -Uri "$base/metrics" -TimeoutSec 10).Content
$baselineSuccess = Get-Counter $before "axum_http_requests_total" @('endpoint="/v1/ask"','method="POST"','status="200"')
$baselineUnauthorized = Get-Counter $before "axum_http_requests_total" @('endpoint="/v1/ask"','method="POST"','status="401"')
$baselineGate = Get-Counter $before "arkhe_gate_decisions_total" @('decision="accepted"')
# Establish a scraped baseline before the burst, so rate/quantile can observe a change.
for ($attempt=0; $attempt -lt 20; $attempt++) {
    $baselineSample = @(Get-Prom 'sum(axum_http_requests_total{endpoint="/v1/ask",method="POST",status="200"})')
    if ($baselineSample.Count -and [double]::Parse($baselineSample[0].value[1],[cultureinfo]::InvariantCulture) -ge $baselineSuccess) { break }
    Start-Sleep -Milliseconds 500
}
if (-not $baselineSample.Count -or [double]::Parse($baselineSample[0].value[1],[cultureinfo]::InvariantCulture) -lt $baselineSuccess) { throw "No current scraped success counter baseline" }
$traceId = [guid]::NewGuid().ToString("N")
$clock = [Diagnostics.Stopwatch]::StartNew()
$total = $AuthenticatedRequests + $UnauthorizedRequests
$results = @(1..$total | ForEach-Object -Parallel {
    $authorized = $_ -le $using:AuthenticatedRequests
    $headers = @{traceparent="00-$($using:traceId)-0123456789abcdef-01"}
    if ($authorized) { $headers.Authorization = "Bearer $($using:token)" }
    $timer = [Diagnostics.Stopwatch]::StartNew()
    try {
        $reply = Invoke-WebRequest -Uri "$($using:base)/v1/ask" -Method Post -Headers $headers -ContentType "application/json" -Body '{"query":"evidence"}' -SkipHttpErrorCheck -TimeoutSec 15
        $status = [int]$reply.StatusCode
    } catch { $status = 0 }
    $timer.Stop()
    [pscustomobject]@{ index=$_;expected_status=$(if($authorized){200}else{401});status=$status;client_elapsed_ms=$timer.Elapsed.TotalMilliseconds }
} -ThrottleLimit $Concurrency)
$clock.Stop()
$bad = @($results | Where-Object { $_.status -ne $_.expected_status })
if ($bad.Count) { throw "$($bad.Count) bounded-workload requests returned unexpected statuses" }
$after = (Invoke-WebRequest -Uri "$base/metrics" -TimeoutSec 10).Content
$successDelta = (Get-Counter $after "axum_http_requests_total" @('endpoint="/v1/ask"','method="POST"','status="200"')) - $baselineSuccess
$unauthorizedDelta = (Get-Counter $after "axum_http_requests_total" @('endpoint="/v1/ask"','method="POST"','status="401"')) - $baselineUnauthorized
$gateDelta = (Get-Counter $after "arkhe_gate_decisions_total" @('decision="accepted"')) - $baselineGate
if ($successDelta -lt $AuthenticatedRequests -or $unauthorizedDelta -lt $UnauthorizedRequests -or $gateDelta -lt $AuthenticatedRequests) { throw "HTTP/gate counter deltas do not cover observed requests: success=$successDelta unauthorized=$unauthorizedDelta gate=$gateDelta" }
$rateExpression = 'sum(rate(axum_http_requests_total{endpoint="/v1/ask"}[5m]))'
$p95Expression = 'histogram_quantile(0.95,sum by(le)(rate(axum_http_requests_duration_seconds_bucket{endpoint="/v1/ask"}[5m])))'
for ($attempt=0; $attempt -lt 30; $attempt++) {
    $rateSample = @(Get-Prom $rateExpression)
    $p95Sample = @(Get-Prom $p95Expression)
    if ($rateSample.Count -and $p95Sample.Count) {
        $rate = [double]::Parse($rateSample[0].value[1],[cultureinfo]::InvariantCulture)
        $p95 = [double]::Parse($p95Sample[0].value[1],[cultureinfo]::InvariantCulture)
        if ($rate -gt 0 -and -not [double]::IsNaN($p95) -and -not [double]::IsInfinity($p95) -and $p95 -gt 0) { break }
    }
    Start-Sleep -Milliseconds 500
}
if (-not ($rate -gt 0 -and $p95 -gt 0) -or [double]::IsNaN($p95) -or [double]::IsInfinity($p95)) { throw "Prometheus did not observe a finite positive p95 and request rate" }
# The group trace ID is generated locally as 32 hex digits; no arbitrary SQL input.
for ($attempt=0; $attempt -lt 30; $attempt++) {
    $state = & podman --connection $Connection exec arkhe-jobplan-postgres psql -U arkhe -d arkhe -Atc "SELECT count(*), count(*) FILTER (WHERE o.published_at IS NOT NULL), count(a.event_id) FROM ask_verified_outbox o LEFT JOIN ask_proof_anchors a USING(event_id) WHERE o.trace_context->>'traceparent' LIKE '00-$traceId-%';"
    if ($LASTEXITCODE -ne 0) { throw "Cannot inspect workload projection state" }
    if ($state -eq "$AuthenticatedRequests|$AuthenticatedRequests|$AuthenticatedRequests") { break }
    Start-Sleep -Milliseconds 500
}
if ($state -ne "$AuthenticatedRequests|$AuthenticatedRequests|$AuthenticatedRequests") { throw "Workload proof backlog did not drain: $state" }
$latencies = @($results.client_elapsed_ms | Sort-Object)
[ordered]@{
    scenario = "bounded local demo workload; EchoProvider/InMemoryStore plus real JWT, outbox, Kafka and Postgres"
    warmup_requests = 1
    measured_requests = $total
    authenticated_200 = @($results | Where-Object status -eq 200).Count
    unauthorized_401 = @($results | Where-Object status -eq 401).Count
    unexpected_statuses = $bad.Count
    concurrency = $Concurrency
    client_wall_seconds = $clock.Elapsed.TotalSeconds
    client_sample_p95_ms = $latencies[[math]::Ceiling(0.95*$latencies.Count)-1]
    server_success_counter_delta = $successDelta
    server_unauthorized_counter_delta = $unauthorizedDelta
    citation_gate_accepted_delta = $gateDelta
    prometheus_rate_window = "5m"
    prometheus_request_rate_per_second = $rate
    prometheus_http_histogram_p95_seconds = $p95
    workload_trace_id = $traceId
    workload_outbox_published_anchored = "$state"
    observations = $results
    limitations = "Not production load, capacity, stress or SLO evidence. Counter windows can include other traffic; client durations include driver/network overhead. Server p95 is a histogram estimate over all HTTP outcomes."
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath
Write-Output "Bounded workload verified: $total requests, finite positive Prometheus rate/p95, $AuthenticatedRequests proofs drained"
