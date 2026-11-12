set -eu
export PATH="$HOME/.cargo/bin:$PATH"
command -v cargo
command -v git || true
test -f "$HOME/arkhe-chain-rerun/Cargo.toml"
test -d "$HOME/arkhe-chain-rerun/vendor"
cd "$HOME/arkhe-chain-rerun"
cargo test -p arkhe-chain -- --test-threads=8
