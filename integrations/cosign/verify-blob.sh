#!/usr/bin/env bash
set -euo pipefail
: "${1:?artifact path}"
: "${2:?Sigstore bundle path}"
: "${3:?trusted root path}"
: "${4:?exact identity/issuer policy path}"
exec node "$(dirname "$0")/cli.mjs" verify-blob "$1" --bundle "$2" --trusted-root "$3" --policy "$4"
