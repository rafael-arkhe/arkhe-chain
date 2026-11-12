set -u
cd "$HOME"
if [ ! -x "$HOME/bend-tools/node_modules/.bin/bun" ]; then
  npm install bun --prefix "$HOME/bend-tools"
fi
if [ ! -f "$HOME/bend-src/bend2/main.ts" ]; then
  rm -rf "$HOME/bend-src"
  git clone --depth 1 https://github.com/bendlang/bend.git "$HOME/bend-src"
fi
BUN="$HOME/bend-tools/node_modules/.bin/bun"
SRC=/mnt/d/arkhe/tmp/bend-trial
cd "$HOME/bend-src"
echo "=== good ==="
"$BUN" bend2/main.ts "$SRC/add_zero.bend" --check-only
echo "exit_good $?"
echo "=== bad ==="
"$BUN" bend2/main.ts "$SRC/add_zero_bad.bend" --check-only
echo "exit_bad $?"
