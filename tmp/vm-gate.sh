set -eu
SRC=/mnt/d/arkhe/kernel/arkhe-chain
PUB=/mnt/d/arkhe-chain-pub
DEST="$HOME/arkhe-chain-rerun"
rm -rf "$DEST"
mkdir -p "$DEST"
# The published tree carries vendor/. Skip the Windows build directory.
tar -C "$PUB" --exclude target -cf - . | tar -C "$DEST" -xf -
cp "$SRC/README.md" "$DEST/README.md"
cp "$SRC/src/error.rs" "$DEST/src/error.rs"
cp "$SRC/src/lib.rs" "$DEST/src/lib.rs"
cp "$SRC/src/persist.rs" "$DEST/src/persist.rs"
cp "$SRC/tests/native_token.rs" "$DEST/tests/native_token.rs"
cp "$SRC/tests/persist.rs" "$DEST/tests/persist.rs"
cp "$SRC/tests/limits.rs" "$DEST/tests/limits.rs"
cp "$SRC/docs/consenso.md" "$DEST/docs/consenso.md"
cp "$SRC/docs/erros.md" "$DEST/docs/erros.md"
cp "$SRC/docs/homologacao.md" "$DEST/docs/homologacao.md"
cp "$SRC/docs/seguranca_chaves.md" "$DEST/docs/seguranca_chaves.md"
cd "$DEST"
echo "USER=$(id)"
echo "HEAD=$(git rev-parse --short HEAD 2>/dev/null || echo no-git)"
echo "OVERLAY=working tree from /mnt/d/arkhe/kernel/arkhe-chain"
cargo test -p arkhe-chain -- --test-threads=8
