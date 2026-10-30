#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.nix-profile/bin:$PATH"
export NIX_CONFIG='experimental-features = nix-command flakes'
cd /home/arkhen/nixpkgs-upstream-arkhe/nixpkgs
nix store prefetch-file --unpack --json https://github.com/rafael-arkhe/nixpkgs-arkhe/archive/228da8e803e9f81041066e3a3a50f61e6ff4201c.tar.gz
