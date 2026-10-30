param(
    [int]$GrafanaPort = 59096,
    [int]$PrometheusPort = 59095,
    [string]$OutputPath = "apps/arkhe-ask/verification-grafana.json"
)
$ErrorActionPreference = "Stop"
$dashboardReply = Invoke-RestMethod -Uri "http://127.0.0.1:$GrafanaPort/api/dashboards/uid/arkhe-ask-ops" -TimeoutSec 10
$dashboard = $dashboardReply.dashboard
if ($dashboard.uid -ne "arkhe-ask-ops" -or $dashboard.panels.Count -ne 8) { throw "Provisioned dashboard is incomplete" }
$latencyPanel = @($dashboard.panels | Where-Object { $_.title -like "*Latency p95" })[0]
$nanMapping = @($latencyPanel.fieldConfig.defaults.mappings | Where-Object { $_.type -eq "special" -and $_.options.match -eq "nan" })
if ($latencyPanel.fieldConfig.defaults.noValue -ne "Sem tráfego" -or $nanMapping.Count -ne 1 -or $nanMapping[0].options.result.text -ne "Sem tráfego") {
    throw "Latency absence/NaN presentation mapping was not provisioned"
}
$results = @()
foreach ($panel in $dashboard.panels) {
    if ($panel.datasource.uid -ne "arkhe-prometheus") { throw "Wrong panel datasource" }
    $expression = $panel.targets[0].expr
    $query = [uri]::EscapeDataString($expression)
    $reply = Invoke-RestMethod -Uri "http://127.0.0.1:$PrometheusPort/api/v1/query?query=$query" -TimeoutSec 10
    if ($reply.status -ne "success" -or $reply.data.result.Count -eq 0) {
        throw "Panel has no measured series: $($panel.title)"
    }
    $results += [pscustomobject]@{
        title = $panel.title
        expression = $expression
        series_count = $reply.data.result.Count
        current_values = @($reply.data.result | ForEach-Object { $_.value[1] })
    }
}
[ordered]@{
    uid = $dashboard.uid
    title = $dashboard.title
    url = "http://127.0.0.1:$GrafanaPort/d/arkhe-ask-ops"
    access = "local anonymous Viewer"
    datasource = "arkhe-prometheus"
    panels = $results
    p95_display = @{ missing_value_text=$latencyPanel.fieldConfig.defaults.noValue; nan_mapping_text=$nanMapping[0].options.result.text; zero_latency_imputed=$false }
    note = "Postgres USE proxies: connection usage, waiting locks and deadlocks. NaN p95 is possible during zero traffic."
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath
Write-Output "Grafana provisioning and all panel queries verified: $OutputPath"
