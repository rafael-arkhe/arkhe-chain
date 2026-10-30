"""Repeatable local release checks; retain dated logs without touching application data."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--group', choices=['rust', 'node', 'aux'], required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
out = Path(args.output).resolve()
out.mkdir(parents=True, exist_ok=True)
node = ['node']
groups = {
    'aux': [
        ('preflight-tests', node + ['node_modules/@angular/cli/bin/ng.js', 'test', '--watch=false'], 'apps/preflight'),
        ('melodic-tests', node + ['node_modules/@angular/cli/bin/ng.js', 'test', '--watch=false'], 'apps/melodic-lab'),
        ('preflight-api', node + ['--experimental-strip-types', '--test'] + [str(p.relative_to(ROOT)) for p in sorted((ROOT / 'apps/preflight/tests').glob('*.test.ts'))]),
        ('melodic-api', node + ['--experimental-strip-types', '--test'] + [str(p.relative_to(ROOT)) for p in sorted((ROOT / 'apps/melodic-lab/tests').glob('*.test.ts'))]),
        ('health-mcp', node + ['--test'], 'integrations/mcp-server'),
        ('chladni', node + ['--test'] + [str(p.relative_to(ROOT)) for p in sorted((ROOT / 'apps/chladni-dashboard/tests').glob('*.test.mjs'))]),
        ('cosign', node + ['--import', './test/deny-network.mjs', '--test'] + [str(p.relative_to(ROOT / 'integrations/cosign')) for p in sorted((ROOT / 'integrations/cosign/test').glob('*.test.mjs'))], 'integrations/cosign'),
        ('solana-proof', node + ['--test'] + [str(p.relative_to(ROOT)) for p in sorted((ROOT / 'integrations/solana-proof/test').glob('*.test.mjs'))]),
    ],
    'rust': [
        ('architecture', ['python', 'scripts/check_architecture.py']),
        ('build', ['cargo', 'build', '--workspace', '--locked']),
        ('test', ['cargo', 'test', '--workspace', '--locked']),
        ('clippy', ['cargo', 'clippy', '--workspace', '--all-targets', '--locked', '--', '-D', 'warnings']),
        ('vectors', ['python', 'verification/scripts/verify-vectors.py']),
    ],
    'node': [
        ('intra-tests', node + ['--test', '--test-reporter=tap'] +
         [str(p.relative_to(ROOT)) for p in sorted((ROOT / 'apps/arkhe-intra/tests').glob('*.test.mjs'))]),
        ('intra-types', node + ['apps/arkhe-intra/node_modules/typescript/bin/tsc', '-p', 'apps/arkhe-intra/tsconfig.json', '--noEmit', '--incremental', 'false']),
        ('intra-build', node + ['scripts/build.mjs'], 'apps/arkhe-intra'),
        ('intra-http', node + ['apps/arkhe-intra/scripts/http-smoke.mjs']),
        ('mcp-tests', node + ['--test'] + [str(p.relative_to(ROOT)) for p in sorted((ROOT / 'integrations/verify-mcp/tests').glob('*.test.mjs'))]),
        ('e02-tests', node + ['--test'] + [str(p.relative_to(ROOT)) for p in sorted((ROOT / 'scripts').glob('e02_*.test.mjs'))]),
    ]
}
report = {'group': args.group, 'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'scope': 'Local root workspace and Intra; isolated test data; external services are not implicitly qualified.', 'gates': []}
for spec in groups[args.group]:
    name, command = spec[:2]
    cwd = ROOT / spec[2] if len(spec) > 2 else ROOT
    path = out / f'{args.group}-{name}.log'
    print(f'RUN {name}', flush=True)
    started = time.monotonic()
    with path.open('w', encoding='utf-8') as log:
        log.write(json.dumps({'argv': command, 'cwd': str(cwd)}) + '\n')
        log.flush()
        result = subprocess.run(command, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
    output = path.read_text(encoding='utf-8', errors='replace')
    gate = {'name': name, 'exit_code': result.returncode, 'seconds': round(time.monotonic() - started, 2),
            'log': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    totals = re.findall(r'test result: \w+\. (\d+) passed; (\d+) failed; (\d+) ignored;', output)
    if totals:
        gate['tests'] = dict(zip(['passed', 'failed', 'ignored'], [sum(int(s[i]) for s in totals) for i in range(3)]))
    for key in ['tests', 'pass', 'fail', 'skipped']:
        match = re.search(r'^# ' + key + r' (\d+)$', output, re.MULTILINE)
        if match:
            gate['node_' + key] = int(match[1])
    report['gates'].append(gate)
    report['status'] = 'PASS' if all(g['exit_code'] == 0 for g in report['gates']) else 'FAIL'
    (out / f'{args.group}-results.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(gate), flush=True)
    if result.returncode:
        print('\n'.join(output.splitlines()[-18:]), flush=True)
report['finished_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
(out / f'{args.group}-results.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
sys.exit(0 if report['status'] == 'PASS' else 1)
