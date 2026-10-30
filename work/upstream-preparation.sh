#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.nix-profile/bin:$PATH"
mkdir -p /home/arkhen/nixpkgs-upstream-arkhe
cd /home/arkhen/nixpkgs-upstream-arkhe
if [ ! -d nixpkgs/.git ]; then
  git clone --filter=blob:none --depth=1 --single-branch https://github.com/NixOS/nixpkgs.git nixpkgs
fi
git -C nixpkgs rev-parse HEAD
nix --version
