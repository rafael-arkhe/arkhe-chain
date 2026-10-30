$ErrorActionPreference = 'Stop'
$ritualRoot = Split-Path -Parent $PSScriptRoot
if (-not $env:STRIPE_TEST_SECRET_KEY) {
    $env:STRIPE_TEST_SECRET_KEY = [Environment]::GetEnvironmentVariable('STRIPE_TEST_SECRET_KEY','User')
}
if (-not $env:STRIPE_TEST_SECRET_KEY -or -not $env:STRIPE_TEST_SECRET_KEY.StartsWith('sk_test_')) {
    throw 'Configure STRIPE_TEST_SECRET_KEY locally with an sk_test_ key. Never paste it in chat.'
}
if (-not $env:DATABASE_URL) { throw 'Set DATABASE_URL to an isolated PostgreSQL test database for this Stripe sandbox.' }
# Explicit invocation authorizes test-mode object creation. No live credentials are accepted.
$env:ARKHE_RUN_STRIPE_TEST = '1'
New-Item -ItemType Directory -Path "$ritualRoot/artifacts" -Force | Out-Null
cargo run --manifest-path "$ritualRoot/Cargo.toml" --example stripe_test |
    Tee-Object -FilePath "$ritualRoot/artifacts/stripe-provider-test.json"
exit $LASTEXITCODE
