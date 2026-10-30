#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
cargo test --locked -p agi-coder-tests --test golden_vectors --test security
pnpm --filter @agi-coder/sdk test
