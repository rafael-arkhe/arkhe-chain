"""Prepare small JSON Git tree batches from the explicit E02 CI projection."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / 'output/e02-ci-snapshot'
OUT = ROOT / 'tmp/e02-ci-publish'
OUT.mkdir(parents=True, exist_ok=True)
entries = []
for file in sorted(SNAPSHOT.rglob('*')):
    if not file.is_file():
        continue
    relative = file.relative_to(SNAPSHOT)
    if any(part in {'node_modules', 'target', '.next', 'pkg'} for part in relative.parts):
        continue
    if file.name.startswith('.env'):
        raise RuntimeError('Environment file is not a CI source')
    entries.append({'path': 'environments/e02-audit/' + relative.as_posix(), 'mode': '100644', 'type': 'blob', 'content': file.read_text(encoding='utf-8-sig')})
workflow = '.github/workflows/e02-m3-m20.yml'
entries.append({'path': workflow, 'mode': '100644', 'type': 'blob', 'content': (ROOT / workflow).read_text(encoding='utf-8')})
batches = []
current, size = [], 0
for entry in entries:
    count = len(json.dumps(entry, ensure_ascii=False))
    if current and size + count > 35000:
        batches.append(current)
        current, size = [], 0
    current.append(entry)
    size += count
if current:
    batches.append(current)
for index, batch in enumerate(batches):
    (OUT / f'batch-{index:03}.json').write_text(json.dumps(batch, ensure_ascii=False), encoding='utf-8')
(OUT / 'index.json').write_text(json.dumps({'batches': len(batches), 'files': len(entries), 'scope': 'environments/e02-audit plus one workflow'}), encoding='utf-8')
print(json.dumps({'batches': len(batches), 'files': len(entries)}))
