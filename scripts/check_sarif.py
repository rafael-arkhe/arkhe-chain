"""Fail closed on missing SARIF or any finding from security-extended queries."""
import json, sys
from pathlib import Path
files = list(Path(sys.argv[1]).rglob('*.sarif'))
if not files:
    raise SystemExit('FAIL: no SAST results')
count = sum(len(run.get('results', [])) for file in files for run in json.loads(file.read_text())['runs'])
print(f'SAST findings: {count}')
raise SystemExit(1 if count else 0)
