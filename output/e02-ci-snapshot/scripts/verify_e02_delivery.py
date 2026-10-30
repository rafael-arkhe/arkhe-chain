"""Capture reproducible local E02 delivery logs, exit codes and source hashes."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'apps/arkhe-intra'
OUT = Path(os.environ.get('ARKHE_E02_EVIDENCE_DIR', ROOT / 'docs/evidence/2026-10-24-m3-m20'))
OUT.mkdir(parents=True, exist_ok=True)
node = shutil.which('node')
env = dict(os.environ)
runtime_packages = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
env.setdefault('ARKHE_BROWSER_NODE_MODULES', str(ROOT / 'ops/local/e02-browser-tools/node_modules'))
commands = [
    ('native-wasm', ROOT, [node, 'scripts/e02_native_wasm_parity.mjs']),
    ('test', ROOT, [node, '--test', '--test-reporter=tap', 'apps/arkhe-intra/tests/e02.test.mjs']),
    ('typecheck', APP, [node, 'node_modules/typescript/bin/tsc', '--noEmit']),
    ('build', APP, [node, 'scripts/build.mjs']),
    ('ui', ROOT, [node, 'scripts/e02_ui_review.mjs']),
]
report = {'scope': 'execution evidence, not formal proof', 'provider': {key: env.get(key) for key in ['GITHUB_REPOSITORY', 'GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']}, 'started_at': datetime.now(timezone.utc).isoformat(), 'commands': []}
for name, cwd, command in commands:
    print(f'Running {name}', flush=True)
    with (OUT / f'{name}.log').open('w', encoding='utf-8') as log:
        log.write(f'cwd: {cwd}\nargv: {json.dumps(command)}\n\n')
        log.flush()
        result = subprocess.run(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
        log.write(f'\nexit_code: {result.returncode}\n')
    report['commands'].append({'name': name, 'cwd': str(cwd), 'argv': command, 'exit_code': result.returncode, 'log': f'{name}.log'})
    (OUT / 'results.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'{name}: exit {result.returncode}', flush=True)
    if result.returncode:
        break
paths = [p for p in (APP / 'components').glob('e02-*.tsx')]
paths += list((APP / 'lib').glob('e02*')) + [APP / 'tests/e02.test.mjs', APP / 'app/globals.css', ROOT / 'scripts/e02_ui_review.mjs', ROOT / 'scripts/e02_native_wasm_parity.mjs', ROOT / 'verification/crates/arkhe-verify-core/examples/e02_mmr_oracle.rs', APP / 'app/verificar/e02/page.tsx', Path(__file__), ROOT / 'specs/mmr/spec/mmr-profile-v1.md']
paths += [ROOT / 'verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm_bg.wasm', APP / 'public/verifier/arkhe_verify_wasm_bg.wasm']
paths += list((APP / 'public/e02/fixtures').glob('*.json'))
report['sha256'] = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths))}
report['finished_at'] = datetime.now(timezone.utc).isoformat()
report['status'] = 'PASS' if len(report['commands']) == len(commands) and all(c['exit_code'] == 0 for c in report['commands']) else 'FAIL'
(OUT / 'results.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
raise SystemExit(0 if report['status'] == 'PASS' else 1)
