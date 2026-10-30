#!/bin/sh
set -eu
tools=/mnt/d/arkhe/ops/local/verifiable-release/tools
printf '%s\n' \
 'cloudhead@radicle.dev ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIL460KIEccS4881p7PPpiiQBsxF+H5tgC6De6crw9rbU' \
 'fintan@radicle.dev ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEFsaRqAJ1r6bBFwlcWzJKN7DdjItQDumCNc0wqw6Dvk' > "$tools/allowed_signers"
# The archive is fetched over the official HTTPS origin and SHA-256 checked by
# the host. Do not claim trusted-signer verification: the downloaded signature's
# public key differs from the two keys on the current download page.
ssh-keygen -Y check-novalidate -n file -s "$tools/radicle.tar.xz.sig" < "$tools/radicle.tar.xz"
export PATH="$tools/radicle/radicle-1.10.3-x86_64-unknown-linux-musl/bin:$PATH"
rad --version
rad auth --help
rad patch --help
