$ErrorActionPreference = 'Stop'
if (-not $env:DATABASE_URL) { throw 'Set DATABASE_URL to an isolated PostgreSQL test cluster. sqlx tests create disposable databases.' }
$ritualRoot = Split-Path -Parent $PSScriptRoot
cargo fmt --manifest-path "$ritualRoot/Cargo.toml" -- --check
if ($LASTEXITCODE) { exit $LASTEXITCODE }
cargo test --manifest-path "$ritualRoot/Cargo.toml" -- --test-threads=4
if ($LASTEXITCODE) { exit $LASTEXITCODE }
cargo clippy --manifest-path "$ritualRoot/Cargo.toml" --all-targets -- -D warnings
exit $LASTEXITCODE
