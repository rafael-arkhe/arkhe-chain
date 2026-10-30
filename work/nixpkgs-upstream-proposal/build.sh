#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.nix-profile/bin:$PATH"
export NIX_CONFIG='experimental-features = nix-command flakes'
cd /home/arkhen/nixpkgs-upstream-arkhe/nixpkgs
cp /mnt/d/arkhe/work/nixpkgs-upstream-proposal/pkgs/by-name/ar/arkhe-verify/package.nix pkgs/by-name/ar/arkhe-verify/package.nix
nix-build -A arkhe-verify --no-out-link 2>&1 | tee ../build.log
