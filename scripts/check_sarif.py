"""Fail closed on missing SARIF or any security finding under kernel/arkhe-chain."""
import json
import sys
from pathlib import Path

SCOPE = "kernel/arkhe-chain/"
files = list(Path(sys.argv[1]).rglob("*.sarif"))
if not files:
    raise SystemExit("FAIL: no SAST results")

findings = []
for file in files:
    for run in json.loads(file.read_text(encoding="utf-8"))["runs"]:
        rules = {rule.get("id"): rule for rule in run.get("tool", {}).get("driver", {}).get("rules", [])}
        for result in run.get("results", []):
            locations = result.get("locations") or []
            uri = ""
            if locations:
                uri = (
                    locations[0]
                    .get("physicalLocation", {})
                    .get("artifactLocation", {})
                    .get("uri", "")
                    .replace("\\", "/")
                )
            if not uri.startswith(SCOPE):
                continue
            rule_id = result.get("ruleId") or result.get("rule", {}).get("id") or "unknown"
            level = result.get("level") or rules.get(rule_id, {}).get("defaultConfiguration", {}).get("level") or "warning"
            message = result.get("message", {}).get("text", "").split("\n", 1)[0][:160]
            findings.append((level, rule_id, uri, message))

print(f"SAST findings under {SCOPE}: {len(findings)}")
for level, rule_id, uri, message in findings[:50]:
    print(f"  [{level}] {rule_id} {uri}: {message}")
if len(findings) > 50:
    print(f"  ... {len(findings) - 50} more")
raise SystemExit(1 if findings else 0)
