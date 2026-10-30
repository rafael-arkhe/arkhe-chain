"""Capture F0/F1 regression gates without claiming regulatory compliance."""
from pathlib import Path
import datetime
import hashlib
import json
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/evidence/2026-10-24-regulatory-f0-f1'
OUT.mkdir(parents=True, exist_ok=True)
commands = [
    ('root-format', ROOT, ['cargo', 'fmt', '--all', '--check']),
    ('root-tests', ROOT, ['cargo', 'test', '--workspace', '--locked']),
    ('root-clippy', ROOT, ['cargo', 'clippy', '--workspace', '--all-targets', '--locked', '--', '-D', 'warnings']),
    ('pix-tests', ROOT / 'integration/arkhe-pix', ['cargo', 'test', '--workspace', '--locked']),
    ('pix-clippy', ROOT / 'integration/arkhe-pix', ['cargo', 'clippy', '--workspace', '--all-targets', '--locked', '--', '-D', 'warnings']),
    ('runtime-build', ROOT, ['cargo', 'build', '--locked', '-p', 'arkhe-runtime', '--bin', 'arkhe-runtime']),
    ('live-http-postgres', ROOT, ['python', 'scripts/regulatory_f0_f1_live.py']),
]
report = {'scope': 'Local regression gates and disposable PostgreSQL; no production certificate validation, compliance attestation or remote CI', 'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'gates': []}
for name, cwd, args in commands:
    start = time.monotonic()
    path = OUT / f'{name}.log'
    print(f'RUN {name}', flush=True)
    with path.open('w', encoding='utf-8') as log:
        log.write(f'cwd: {cwd}\nargv: {json.dumps(args)}\n\n'); log.flush()
        result = subprocess.run(args, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
        log.write(f'\nexit_code: {result.returncode}\n')
    text = path.read_text()
    totals = re.findall(r'test result: \w+\. (\d+) passed; (\d+) failed; (\d+) ignored;', text)
    entry = {'name': name, 'argv': args, 'cwd': str(cwd.relative_to(ROOT)), 'exit_code': result.returncode, 'seconds': round(time.monotonic()-start, 3), 'log': path.name, 'log_sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    if totals:
        entry['tests'] = dict(zip(['passed', 'failed', 'ignored'], [sum(int(row[i]) for row in totals) for i in range(3)]))
    report['gates'].append(entry)
    report['status'] = 'PASS' if len(report['gates']) == len(commands) and all(g['exit_code'] == 0 for g in report['gates']) else 'INCOMPLETE' if result.returncode == 0 else 'FAIL'
    (OUT / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(entry), flush=True)
    if result.returncode:
        print('\n'.join(text.splitlines()[-25:]), flush=True)
        raise SystemExit(result.returncode)
report['source_sha256'] = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in [
    'Cargo.toml','Cargo.lock','orchestration/arkhe-runtime/Cargo.toml','orchestration/arkhe-runtime/src/main.rs',
    'orchestration/arkhe-runtime/src/http_routes.rs','orchestration/arkhe-runtime/tests/http_versioning.rs',
    'evidence/arkhe-wormgraph/src/retention.rs','integration/arkhe-pix/crates/arkhe-pix-bcb/src/certificates.rs',
    'integration/arkhe-pix/crates/arkhe-pix-bcb/src/lib.rs','integration/arkhe-pix/crates/arkhe-pix-bcb/tests/certificates.rs',
    'scripts/regulatory_f0_f1_live.py','scripts/regulatory_f0_f1_checks.py']}
report['finished_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
(OUT / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
