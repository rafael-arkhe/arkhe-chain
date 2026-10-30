#!/usr/bin/env sh
set -eu
if [ "$#" -ne 1 ]; then
    echo 'Usage: benchmark-cost.sh ledger.json (caller-measured costs; no fabricated service pricing)' >&2
    exit 2
fi
cargo run --locked -p agi-coder-cli -- cost "$1"
