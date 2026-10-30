from pathlib import Path
import json, tomllib
root=Path(__file__).resolve().parents[1]
with open(root/"config/environment.toml","rb") as f: env=tomllib.load(f)
assert env["environment"]["fail_closed"] is True
assert env["cognition"]["direct_wormgraph_write"] is False
assert env["cognition"]["signing_keys"] is False
assert env["cognition"]["policy_authority"] is False
reg=json.loads((root/"config/transition-registry.json").read_text())
assert set(reg["protected"]).isdisjoint(reg["unprotected"])
print("PASS fail-closed environment config")
print("PASS cognition authority disabled")
print("PASS transition registry partitions protected/unprotected")
