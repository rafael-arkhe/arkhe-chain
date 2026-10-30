$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    & cargo build --locked --workspace
    if ($LASTEXITCODE -ne 0) { throw 'Rust build failed' }
    & cargo nextest run --locked --workspace
    if ($LASTEXITCODE -ne 0) { throw 'Rust tests failed' }
    & cargo clippy --locked --workspace --all-targets -- -D warnings
    if ($LASTEXITCODE -ne 0) { throw 'Clippy failed' }
    & cargo fmt --all --check
    if ($LASTEXITCODE -ne 0) { throw 'Formatting failed' }
    & python -m unittest discover -s integrations/deepinfer -p test_bridge.py -v
    if ($LASTEXITCODE -ne 0) { throw 'DeepInfer Python bridge contract tests failed' }
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Frozen install failed' }
    & pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed' }
    & pnpm test
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript tests failed' }
    & cargo run --locked -p agi-coder-cli -- run --demo
    if ($LASTEXITCODE -ne 0) { throw 'Offline demo failed' }
} finally {
    Pop-Location
}
