#!/usr/bin/env python3
from pathlib import Path
import json, sys

p = Path(sys.argv[1] if len(sys.argv) > 1 else "registry/domain-registry.json")
data = json.loads(p.read_text(encoding="utf-8"))
failed = False
for group in ("domains","signature_domains"):
    for row in data[group]:
        hx = row["hex"]
        raw = bytes.fromhex(hx)
        ok_len = len(raw) == row["length"]
        literal = row["ascii_literal"].replace("\\0","\0").encode("utf-8")
        ok_literal = raw == literal
        print(("PASS" if ok_len and ok_literal else "FAIL"),
              group, row["object"], "len=", len(raw), "declared=", row["length"])
        failed |= not (ok_len and ok_literal)
sys.exit(1 if failed else 0)
