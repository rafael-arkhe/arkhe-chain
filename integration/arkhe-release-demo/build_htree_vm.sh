#!/bin/sh
set -eu
export PATH="/home/arkhen/.cargo/bin:$PATH"
cargo install hashtree-cli --version 0.2.157 --locked --root /home/arkhen/arkhe-release-tools --no-default-features --features lmdb
