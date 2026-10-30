#!/usr/bin/env bash
set -u
mkdir -p /root/validation
for attr in arkhe-verify-wasm arkhe-python-gate arkhe-twin arkhe-crm-bridge; do
  nix build "path:/root/arkhe#$attr" --no-link --no-update-lock-file --print-out-paths --option substitute false --option builders '' --cores 1 --max-jobs 1 -L > "/root/validation/prebuild-$attr.log" 2>&1
  printf '%s %s\n' "$attr" "$?"
done