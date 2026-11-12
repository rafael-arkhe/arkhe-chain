set -eu
export PATH="$HOME/.cargo/bin:$PATH"
test -d "$HOME/arkhe-chain-rerun"
cp /mnt/d/arkhe/kernel/arkhe-chain/src/p2p.rs "$HOME/arkhe-chain-rerun/src/p2p.rs"
cd "$HOME/arkhe-chain-rerun"
echo "USER=$(id -un) HOST=$(hostname) DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cargo test -p arkhe-chain --test block_sync sync_keeps_the_cursor_past_1024_headers -- --exact
