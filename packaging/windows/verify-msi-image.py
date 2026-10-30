"""Verify every installed payload file from an MSI administrative image."""
import hashlib
import json
from pathlib import Path
import sys
image = Path(sys.argv[1]).resolve()
manifests = list(image.rglob('manifest.sha256.json'))
assert len(manifests) == 1, 'Expected exactly one package manifest'
root = manifests[0].parent
manifest = json.loads(manifests[0].read_text(encoding='utf-8'))
for name, expected in manifest.items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, name
report = {'status': 'PASS', 'files': len(manifest), 'image': str(root), 'checks': ['MSI payload matches portable package SHA256 manifest']}
if len(sys.argv) > 2: Path(sys.argv[2]).write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
