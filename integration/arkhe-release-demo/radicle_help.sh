#!/bin/sh
set -eu
export PATH="/mnt/d/arkhe/ops/local/verifiable-release/tools/radicle/radicle-1.10.3-x86_64-unknown-linux-musl/bin:$PATH"
rad init --help
rad patch review --help
rad patch show --help
rad cob --help
rad inspect --help
