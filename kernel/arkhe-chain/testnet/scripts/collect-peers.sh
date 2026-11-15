#!/usr/bin/env bash
set -euo pipefail
NET="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="$NET/local"
ANNOUNCE="$LOCAL/announce"
GENESIS="$LOCAL/genesis.txt"
OUT="$LOCAL/peers.txt"
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
test -f "$GENESIS" || { echo "missing $GENESIS — run gen-keys first" >&2; exit 1; }
BLAKE="$(cargo run -q -p arkhe-chain --manifest-path "$ROOT/Cargo.toml" -- --show-genesis --genesis "$GENESIS" | awk '/^blake3 /{print $2}')"
{
  echo "# genesis $BLAKE"
  if [ -d "$ANNOUNCE" ]; then
    for f in "$ANNOUNCE"/*.peer; do
      [ -f "$f" ] || continue
      grep -v '^#' "$f" | grep -v '^[[:space:]]*$' || true
    done
  fi
} >"$OUT"
echo "peers=$OUT"
cat "$OUT"
