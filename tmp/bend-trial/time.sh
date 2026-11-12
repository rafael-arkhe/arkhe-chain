cd /home/arkhen/bend-src
BUN=/home/arkhen/bend-tools/node_modules/.bin/bun
SRC=/mnt/d/arkhe/tmp/bend-trial
/usr/bin/time -f "good_sec %e" "$BUN" bend2/main.ts "$SRC/add_zero.bend" --check-only
/usr/bin/time -f "bad_sec %e" "$BUN" bend2/main.ts "$SRC/add_zero_bad.bend" --check-only
