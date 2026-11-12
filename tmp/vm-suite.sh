set -eu
export PATH="$HOME/.cargo/bin:$PATH"
cp /mnt/d/arkhe/kernel/arkhe-chain/src/p2p.rs "$HOME/arkhe-chain-rerun/src/p2p.rs"
cd "$HOME/arkhe-chain-rerun"
echo "USER=$(id) HOST=$(hostname) DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cargo test -p arkhe-chain --no-fail-fast
