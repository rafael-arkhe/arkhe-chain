#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.nix-profile/bin:$PATH"
export NIX_CONFIG='experimental-features = nix-command flakes'
cd /home/arkhen/nixpkgs-upstream-arkhe/nixpkgs
nix-build -A arkhe-verify.tests --no-out-link 2>&1 | tee ../package-tests.log
output=$(nix-build -A arkhe-verify --no-out-link)
nix hash path "$output" > ../output-hash-before.txt
nix-build -A arkhe-verify --check --keep-failed --no-out-link 2>&1 | tee ../rebuild.log
nix hash path "$output" > ../output-hash-after.txt
diff -u ../output-hash-before.txt ../output-hash-after.txt
nix path-info --json "$output" > ../path-info.json
nix-instantiate --eval --strict -A rustc.version > ../rustc-version.txt
