#!/usr/bin/env bash
set -u
export PATH=/home/arkhen/.nix-profile/bin:/usr/bin:/bin
export NIX_CONFIG='experimental-features = nix-command flakes'
r=/mnt/d/arkhe/work/nixpkgs-arkhe-integration/arkhe
mkdir -p "$r/docs/validation/full"
for attr in arkhe-runtime arkhe-sql-migrate arkhe-twin arkhe-ollama arkhe-crm-bridge arkhe-python-gate arkhe-ask arkhe; do
  nix build "path:$r#$attr" --no-link --no-update-lock-file --print-out-paths -L --cores 4 --max-jobs 1 > "$r/docs/validation/full/$attr.log" 2>&1
  printf '%s %s\n' "$attr" "$?" | tee -a "$r/docs/validation/full/status.txt"
done