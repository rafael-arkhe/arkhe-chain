# Local realm smoke test; access tokens are never written to disk.
param(
    [string]$Connection = "arkhe-runtime",
    [int]$AskPort = 3000,
    [int]$KeycloakPort = 8180,
    [string]$OutputPath = "apps/arkhe-ask/verification-keycloak.json"
)
$ErrorActionPreference = "Stop"
$askBase = "http://127.0.0.1:$AskPort"
$tokenUrl = "http://127.0.0.1:$KeycloakPort/realms/arkhe/protocol/openid-connect/token"
function Get-SmokeToken([string]$ClientId) {
    $reply = Invoke-RestMethod -Uri $tokenUrl -Method Post -TimeoutSec 15 -Body @{
        grant_type = "client_credentials"
        client_id = $ClientId
        client_secret = "local-smoke-only"
    }
    if (-not $reply.access_token) { throw "No access token for $ClientId" }
    return $reply.access_token
}
function Invoke-AskCheck([string]$Label, [string]$Token, [int]$Expected) {
    $headers = @{ "x-tenant-id" = "spoofed-tenant" }
    if ($Token) { $headers.Authorization = "Bearer $Token" }
    $response = Invoke-WebRequest -Uri "$askBase/v1/ask" -Method Post -Headers $headers -ContentType "application/json" -Body '{"query":"evidence"}' -SkipHttpErrorCheck -TimeoutSec 15
    if ([int]$response.StatusCode -ne $Expected) {
        throw "$Label returned $($response.StatusCode), expected $Expected"
    }
    $body = $response.Content | ConvertFrom-Json
    if ($Expected -eq 200 -and (-not $body.citation_proof -or $body.citation_proof.record_digest.Count -ne 32)) { throw "$Label lacks citation proof" }
    if ($Expected -ne 200 -and ($body.answer -or $body.claims)) { throw "$Label leaked an answer" }
    if ($Expected -eq 200 -and $body.citation_proof.tenant_id -ne "tenant-a") {
        throw "$Label used the wrong tenant in the citation proof"
    }
    return @{ case = $Label; status = [int]$response.StatusCode }
}
$health = Invoke-WebRequest -Uri "$askBase/healthz" -TimeoutSec 10
if ($health.StatusCode -ne 200 -or $health.Content -ne "ok") { throw "Health failed" }
$valid = Get-SmokeToken "ask-smoke"
$noTenant = Get-SmokeToken "ask-no-tenant"
$wrongAudience = Get-SmokeToken "ask-wrong-audience"
$tenantB = Get-SmokeToken "ask-smoke-b"
$parts = $valid.Split(".")
$tampered = $parts[0] + "." + $parts[1] + "." + ("a" * $parts[2].Length)
$cases = @(
    (Invoke-AskCheck "valid token with spoofed tenant header" $valid 200)
    (Invoke-AskCheck "header only" "" 401)
    (Invoke-AskCheck "malformed JWT" "not-a-jwt" 401)
    (Invoke-AskCheck "tampered signature" $tampered 401)
    (Invoke-AskCheck "signed token without tenant plus spoofed header" $noTenant 401)
    (Invoke-AskCheck "signed token for another audience" $wrongAudience 401)
    (Invoke-AskCheck "tenant-b cannot see tenant-a development corpus" $tenantB 502)
)
$vector = & podman --connection $Connection exec arkhe-jobplan-postgres psql -U arkhe -d arkhe -Atc "SELECT extversion FROM pg_extension WHERE extname='vector'"
if ($LASTEXITCODE -ne 0 -or -not $vector) { throw "Vector check failed" }
$states = @(& podman --connection $Connection inspect arkhe-jobplan-postgres arkhe-jobplan-keycloak --format '{{.Name}} {{.State.Health.Status}}')
if ($LASTEXITCODE -ne 0 -or ($states | Where-Object { $_ -notmatch ' healthy$' })) { throw "Dependencies unhealthy" }
[ordered]@{
    authentication = "real Keycloak client_credentials tokens; signature via discovered JWKS"
    health_status = [int]$health.StatusCode
    cases = $cases
    dependencies = $states
    vector_version = "$vector"
    generation = "EchoProvider + InMemoryStore; Azure unverified"
    tenant_scope = "authenticated JWT tenant filters application storage; no PostgreSQL RLS"
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath
Write-Output "Keycloak smoke checks passed; evidence: $OutputPath"
