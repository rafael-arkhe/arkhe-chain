"""Run frozen root-workspace Rust gates and retain outputs and scoped identities."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import subprocess
import time
import tomllib

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/evidence/2026-10-24-production-check'
OUT.mkdir(parents=True, exist_ok=True)
manifest = tomllib.loads((ROOT / 'Cargo.toml').read_text())


def identity():
    paths = {ROOT / name for name in ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', '.cargo/config.toml']}
    paths.add(Path(__file__).resolve())
    for member in manifest['workspace']['members']:
        for path in (ROOT / member).rglob('*'):
            relative = path.relative_to(ROOT / member)
            if any(part in {'target', 'node_modules', 'pkg', '.git'} for part in relative.parts):
                continue
            if path.is_file() and path.suffix in {'.rs', '.toml', '.json', '.sql', '.yaml', '.yml', '.txt'}:
                paths.add(path)
    return {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}


commands = [
    ('build', ['cargo', 'build', '--workspace', '--locked']),
    ('test', ['cargo', 'test', '--workspace', '--locked']),
    ('clippy', ['cargo', 'clippy', '--workspace', '--all-targets', '--locked', '--', '-D', 'warnings']),
]
before = identity()
(OUT / 'inputs.json').write_text(json.dumps(before, indent=2) + '\n')
report = {'scope': 'Root Cargo workspace, default features, local host. No production deployment or full security audit.',
          'source_identity_scope': 'Root Cargo/lock/toolchain/config, this runner, and member Rust/manifests/JSON/SQL/YAML/TXT sources and fixtures; other root resources are not included.',
          'workspace_members': manifest['workspace']['members'], 'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'versions': {name: subprocess.run([name, '--version'], capture_output=True, text=True).stdout.strip() for name in ['cargo', 'rustc']},
          'gates': []}
for index, (name, command) in enumerate(commands, start=1):
    log_path = OUT / f'{index:02}-{name}.log'
    print(f'RUN {name}: {" ".join(command)}', flush=True)
    start = time.monotonic()
    with log_path.open('w', encoding='utf-8') as log:
        log.write(f'cwd: {ROOT}\nargv: {json.dumps(command)}\n\n')
        log.flush()
        result = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        log.write(f'\nexit_code: {result.returncode}\n')
    output = log_path.read_text(encoding='utf-8')
    summaries = re.findall(r'test result: \w+\. (\d+) passed; (\d+) failed; (\d+) ignored;', output)
    entry = {'name': name, 'argv': command, 'exit_code': result.returncode, 'seconds': round(time.monotonic() - start, 3),
             'log': log_path.name, 'log_sha256': hashlib.sha256(log_path.read_bytes()).hexdigest()}
    if summaries:
        entry['test_totals'] = dict(zip(['passed', 'failed', 'ignored'], [sum(int(s[i]) for s in summaries) for i in range(3)]))
    report['gates'].append(entry)
    report['source_changed'] = identity() != before
    report['status'] = 'PASS' if len(report['gates']) == len(commands) and all(g['exit_code'] == 0 for g in report['gates']) else 'INCOMPLETE' if result.returncode == 0 else 'FAIL'
    (OUT / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(entry), flush=True)
    if result.returncode:
        print('\n'.join(output.splitlines()[-35:]), flush=True)
        raise SystemExit(result.returncode)
report['finished_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
(OUT / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
