"""Prepare a reviewable deployment request locally. No API call or paid action."""
import base64
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import yaml

ROOT = Path(__file__).resolve().parent
PILOT = ROOT.parent
snapshot = json.loads((ROOT / "resource-query.json").read_text())
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
out = ROOT / ("prepared-" + stamp)
out.mkdir()
exporter = PILOT / "target/release" / ("export-package.exe" if sys.platform == "win32" else "export-package")
subprocess.run([str(exporter), str(out / "local-demo")], check=True)
artifact = json.loads((out / "local-demo/artifact.json").read_text())
server = (ROOT / "catalog_server.py").read_bytes()
startup = "exec(__import__('base64').b64decode(" + repr(base64.b64encode(server).decode()) + "))"
payload = base64.b64encode(json.dumps(artifact, separators=(",", ":")).encode()).decode()
placement = {"attributes": {"organization": "Akash Palmito"}, "signedBy": {"anyOf": ["akash1365yvmc4s7awdyj3n2sav7xfx76adc6dnmlx63"]}, "pricing": {"catalog": {"denom": "uact", "amount": 20}}}
sdl = {"version": "2.0", "services": {"catalog": {"image": snapshot["image"], "command": ["python", "-u", "-c"], "args": [startup], "env": ["ARKHE_PUBLIC_ARTIFACT_B64=" + payload, "PYTHONDONTWRITEBYTECODE=1"], "expose": [{"port": 8080, "as": 80, "to": [{"global": True}]}]}}, "profiles": {"compute": {"catalog": {"resources": {"cpu": {"units": 0.25}, "memory": {"size": "256Mi"}, "storage": [{"size": "512Mi"}]}}}, "placement": {"akash": placement}}, "deployment": {"catalog": {"akash": {"profile": "catalog", "count": 1}}}}
sdl_text = yaml.safe_dump(sdl, sort_keys=False, width=100000)
request = {"data": {"sdl": sdl_text, "runtimeLimitHours": 1}}
(out / "deploy.yaml").write_text(sdl_text, encoding="utf-8")
(out / "create-request.json").write_text(json.dumps(request, indent=2), encoding="utf-8")
proposal = {"status": "prepared-not-submitted", "provider": "Akash Palmito", "providerAddress": "akash15ksejj7g4su7ljufsg0a8eglvkje94z8qsh68a", "resources": {"cpu": 0.25, "memory": "256Mi", "storage": "512Mi", "replicas": 1}, "runtimeLimitHours": 1, "priceCeilingUactPerBlock": 20, "approximateCeilingUsdPerHourAt6SecondBlocks": 0.012, "estimateUsdPerMonthFromAPI": snapshot["pricing"]["akash"], "note": "Estimate is not a bid. ACT conversion and block timing can affect USD totals; runtime limit is an automatic-close setting, not a prepaid hard-dollar cap.", "fundingConfig": snapshot["funding"], "sdlSha256": hashlib.sha256(sdl_text.encode()).hexdigest(), "publishedContent": "public fixture artifact + catalog server; no trust file or signing keys", "freshness": "300-second checkpoint; regenerate immediately before submission; stale artifacts remain non-executable", "existingDeployment": "tidy-pebble is not modified"}
(out / "proposal.json").write_text(json.dumps(proposal, indent=2), encoding="utf-8")
(ROOT / "PREPARED.txt").write_text(str(out.relative_to(PILOT)), encoding="utf-8")
print("PREPARED_ONLY", out)
