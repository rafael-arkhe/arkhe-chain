set -eu
export PATH="$HOME/.cargo/bin:$PATH"
SRC=/mnt/d/arkhe/kernel/arkhe-chain
DST=$HOME/arkhe-chain-rerun
cp "$SRC/src/lib.rs" "$DST/src/lib.rs"
cp "$SRC/src/ethereum.rs" "$DST/src/ethereum.rs"
cp "$SRC/tests/ethereum_link.rs" "$DST/tests/ethereum_link.rs"
cd "$DST"
echo "USER=$(id)"
echo "HOST=$(hostname)"
echo "DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "NPROC=$(nproc)"
cargo test -p arkhe-chain --no-fail-fast
