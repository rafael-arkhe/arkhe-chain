#!/bin/sh
set -eu
export PATH="/home/arkhen/.cargo/bin:$PATH"
export CARGO_TARGET_DIR=/home/arkhen/arkhe-release-verifier-target
cargo build --manifest-path /mnt/d/arkhe/Cargo.toml -p arkhe-verify-cli --locked
