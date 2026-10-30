#!/usr/bin/env bash
set -euo pipefail
task_root=/mnt/c/Users/Lemes/Downloads/Arkhe_AGI_Environment_v0.1
task_tools="$task_root/ops/local/starknet-cairo-tools"
export PATH="$task_tools/scarb/scarb-v2.12.0-x86_64-unknown-linux-gnu/bin:$task_tools/starknet-foundry/starknet-foundry-v0.48.0-x86_64-unknown-linux-gnu/bin:$task_tools/usc/universal-sierra-compiler-v2.10.2-x86_64-unknown-linux-gnu/bin:$PATH"
cd "$task_root/ops/local/starknet-staking-scope"
scarb --version
snforge --version
if [ "${1:-}" = all ]; then
    snforge test --fuzzer-runs 32 --fuzzer-seed 20261018 --color never
else
    snforge test reward_supplier::test --fuzzer-runs 32 --fuzzer-seed 20261018 --color never
fi
