#!/usr/bin/env bash
# =============================================================================
# Turnkey TLAPS runner for DetInferProof.tla
#
# Installs tlapm into $PREFIX (default $HOME/tlaps, so no sudo is needed) and
# proves SpecSafety. Writes the full backend log to tlapm.out.
#
# VERIFIED: this flow proved all 133 obligations on 2026-11-18 with both
#   TLAPM_CHANNEL=pre    -> tlapm 1.6.0-pre (rev bf665f4), tarball
#   TLAPM_CHANNEL=stable -> tlapm 1.5.0, self-extracting installer
# on Ubuntu/WSL2 (x86_64). See README_tlapm.md for the recorded output.
#
# Usage:
#   bash run_tlapm.sh                      # 1.6.0-pre tarball (fast, ~52 MB)
#   TLAPM_CHANNEL=stable bash run_tlapm.sh # 1.5.0 installer   (~152 MB)
#   PREFIX=/opt/tlaps bash run_tlapm.sh    # install elsewhere
#
# On Windows, run it inside WSL:
#   wsl -d Ubuntu -- bash /mnt/d/arkhe/formal/proof/detinfer/run_tlapm.sh
# =============================================================================
set -euo pipefail

TLAPM_CHANNEL="${TLAPM_CHANNEL:-pre}"
PREFIX="${PREFIX:-$HOME/tlaps}"
DL="${DL:-$HOME/tlaps-dl}"
REL="https://github.com/tlaplus/tlapm/releases/download"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKDIR="${WORKDIR:-$SRC_DIR}"

case "$TLAPM_CHANNEL" in
  pre)    TARBALL="tlapm-1.6.0-pre-x86_64-linux-gnu.tar.gz"
          URL="$REL/1.6.0-pre/$TARBALL"
          BIN="$PREFIX/tlapm/bin" ;;
  stable) INSTBIN="tlaps-1.5.0-x86_64-linux-gnu-inst.bin"
          URL="$REL/202210041448/$INSTBIN"
          BIN="$PREFIX/bin" ;;
  *) echo "TLAPM_CHANNEL must be 'pre' or 'stable'" >&2; exit 2 ;;
esac

# ---------------------------------------------------------------------------
# A SANY-only TLAPS.tla stub would shadow the real TLAPS standard module that
# tlapm ships. Remove it before proving, or every TLAPS-specific proof
# directive (PTL, Zenon hints) silently resolves against the stub.
# ---------------------------------------------------------------------------
if [ -f "$WORKDIR/TLAPS.tla" ] && grep -qi "stub" "$WORKDIR/TLAPS.tla" 2>/dev/null; then
  echo "[*] Removing SANY-only TLAPS.tla stub so tlapm uses its real library."
  rm -f "$WORKDIR/TLAPS.tla"
fi

# ---------------------------------------------------------------------------
# Install (idempotent: skips if tlapm is already on PATH or in $BIN).
# ---------------------------------------------------------------------------
if command -v tlapm >/dev/null 2>&1; then
  echo "[*] Using tlapm already on PATH: $(command -v tlapm)"
elif [ -x "$BIN/tlapm" ]; then
  echo "[*] Using previously installed tlapm: $BIN/tlapm"
  export PATH="$BIN:$PATH"
else
  echo "[*] Installing tlapm (channel=$TLAPM_CHANNEL) into $PREFIX ..."
  mkdir -p "$DL" "$PREFIX"
  if [ "$TLAPM_CHANNEL" = "pre" ]; then
    [ -f "$DL/$TARBALL" ] || wget -q --show-progress -O "$DL/$TARBALL" "$URL"
    tar -xzf "$DL/$TARBALL" -C "$PREFIX"
  else
    [ -f "$DL/$INSTBIN" ] || wget -q --show-progress -O "$DL/$INSTBIN" "$URL"
    chmod +x "$DL/$INSTBIN"
    # -d sets the install prefix; installing under $HOME avoids needing sudo.
    ( cd "$DL" && "./$INSTBIN" -d "$PREFIX" )
  fi
  export PATH="$BIN:$PATH"
fi

echo "[*] tlapm version: $(tlapm --version)"

# ---------------------------------------------------------------------------
# Prove. tlapm must run in a directory holding the module; CRLF line endings
# from a Windows checkout are stripped into a scratch copy first.
# ---------------------------------------------------------------------------
RUN="${RUN:-$(mktemp -d)}"
tr -d '\r' < "$SRC_DIR/DetInferProof.tla" > "$RUN/DetInferProof.tla"
cd "$RUN"

echo "[*] Proving DetInferProof.tla (Zenon / Isabelle / SMT backends) ..."
# --cleanfp ignores cached fingerprints, so a PASS is never inherited from an
# earlier run of a different module body. Drop it only for fast re-runs.
set +e
tlapm --cleanfp DetInferProof.tla 2>&1 | tee "$SRC_DIR/tlapm.out"
STATUS=${PIPESTATUS[0]}
set -e

echo
if [ "$STATUS" -eq 0 ] && grep -q "All .* obligations proved" "$SRC_DIR/tlapm.out"; then
  echo "[OK] $(grep -o 'All .* obligations proved' "$SRC_DIR/tlapm.out")"
  echo "     SpecSafety is machine-checked: THEOREM, non-bounded."
else
  echo "[FAIL] tlapm exit $STATUS. The first failing step is the map of what to"
  echo "       adjust; see README_tlapm.md for the two historical sticking points."
fi
echo "[*] Full log: $SRC_DIR/tlapm.out"
exit "$STATUS"
