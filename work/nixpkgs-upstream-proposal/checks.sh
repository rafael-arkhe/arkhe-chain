#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.nix-profile/bin:$PATH"
export NIX_CONFIG='experimental-features = nix-command flakes'
cd /home/arkhen/nixpkgs-upstream-arkhe/nixpkgs
formatter=$(nix-build -A nixfmt --no-out-link)
"$formatter/bin/nixfmt" pkgs/by-name/ar/arkhe-verify/package.nix maintainers/maintainer-list.nix
nix-build lib/tests/maintainers.nix --no-out-link 2>&1 | tee ../maintainers.log
git diff --check
cp pkgs/by-name/ar/arkhe-verify/package.nix /mnt/d/arkhe/work/nixpkgs-upstream-proposal/pkgs/by-name/ar/arkhe-verify/package.nix
