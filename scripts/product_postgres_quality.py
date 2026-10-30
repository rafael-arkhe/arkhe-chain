"""Run destructive recovery checks only in a new, labelled, disposable PG16 container."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/evidence/2026-10-28-product-quality/postgres'
OUT.mkdir(parents=True, exist_ok=True)
engine = ['podman', '--connection', 'arkhe-runtime']
name = 'arkhe-quality-' + uuid.uuid4().hex[:12]
runtime = None
runtime_log = None
report = {'scope': 'Disposable PG16 cluster, trust auth on local test port, synthetic identities only.', 'gates': [], 'container': name}


def run(label, command, env=None, input=None):
    print('RUN ' + label, flush=True)
    with (OUT / (label + '.log')).open('w', encoding='utf-8') as log:
        result = subprocess.run(command, cwd=ROOT, env=env, input=input, text=True, stdout=log, stderr=subprocess.STDOUT)
    report['gates'].append({'name': label, 'exit_code': result.returncode})
    (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    if result.returncode:
        raise RuntimeError(label + ' failed; see scoped log')


try:
    run('create-container', engine + ['run', '-d', '--rm', '--name', name, '--label', 'io.arkhe.quality=20261028',
        '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-p', '127.0.0.1::5432', 'docker.io/library/postgres:16'])
    port = subprocess.check_output(engine + ['port', name, '5432'], text=True).strip().rsplit(':', 1)[1]
    for _ in range(60):
        ready = subprocess.run(engine + ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], capture_output=True)
        if ready.returncode == 0:
            break
        time.sleep(.5)
    else:
        raise RuntimeError('PG16 readiness timeout')
    admin = f'postgresql://postgres@127.0.0.1:{port}/postgres'
    restricted = f'postgresql://quality_runtime@127.0.0.1:{port}/postgres'
    env = {**os.environ, 'DATABASE_URL': admin}
    run('build-native', ['cargo', 'build', '--locked', '-p', 'arkhe-runtime', '-p', 'arkhe-core', '--bins', '--examples'])
    run('build-memo', ['cargo', 'build', '--locked', '-p', 'arkhe-wormgraph', '--example', 'memo_persistence'])
    exe = '.exe' if os.name == 'nt' else ''
    run('migrate', [str(ROOT / ('target/debug/arkhe-runtime' + exe)), 'migrate'], env)
    sql = '''CREATE ROLE quality_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT;
GRANT arkhe_append,arkhe_read TO quality_runtime;
CREATE ROLE aws_writer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT;
CREATE ROLE azure_writer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT;
GRANT arkhe_append,arkhe_read TO aws_writer,azure_writer;
'''
    run('restricted-roles', engine + ['exec', '-i', name, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], input=sql)
    env.update({'ARKHE_TEST_PREVIEW_ADMIN_DATABASE_URL': admin,
                'ARKHE_TEST_RUNTIME_DATABASE_URL': restricted,
                'ARKHE_MEMO_DATABASE_URL': restricted, 'ARKHE_MEMO_TEST_ADMIN_URL': admin,
                'ARKHE_MEMO_EXAMPLE_BINARY': str(ROOT / ('target/debug/examples/memo_persistence' + exe)),
                'ARKHE_TEST_FENCE_ADMIN_URL': admin,
                'ARKHE_TEST_FENCE_AWS_URL': restricted.replace('quality_runtime@', 'aws_writer@'),
                'ARKHE_TEST_FENCE_AZURE_URL': restricted.replace('quality_runtime@', 'azure_writer@'),
                'ARKHE_TEST_DATABASE_URL': restricted, 'ARKHE_TEST_ADMIN_DATABASE_URL': admin})
    run('preview-recovery', ['cargo', 'test', '--locked', '-p', 'arkhe-runtime', '--test', 'preview_postgres', '--', '--ignored', '--nocapture', '--test-threads=1'], env)
    run('graph-recovery', ['cargo', 'test', '--locked', '-p', 'arkhe-wormgraph', '--test', 'memo_postgres', '--test', 'postgres_regenerate', '--test', 'fencing_postgres', '--', '--ignored', '--nocapture', '--test-threads=1'], env)
    run('runtime-admission', ['cargo', 'test', '--locked', '-p', 'arkhe-runtime', '--features', 'postgres-integration', '--test', 'postgres_live', '--', '--nocapture', '--test-threads=1'], env)
    # Wait for the separately captured production build, retaining its independent results.
    print('WAIT production build before browser journey', flush=True)
    for _ in range(600):
        post_fix = OUT.parent / 'post-fix-build.json'
        if post_fix.exists():
            fixed = json.loads(post_fix.read_text())
            if fixed['status'] == 'FAIL':
                raise RuntimeError('Production build after accessibility fix failed')
            if fixed['status'] != 'PASS':
                time.sleep(1)
                continue
        results_path = OUT.parent / 'node-results.json'
        if results_path.exists():
            gates = json.loads(results_path.read_text())['gates']
            build = next((g for g in gates if g['name'] == 'intra-build'), None)
            if build:
                if build['exit_code']:
                    raise RuntimeError('Production Next build failed')
                break
        time.sleep(1)
    else:
        raise RuntimeError('Production build did not finish in bounded wait')
    token = secrets.token_hex(32)
    runtime_env = {**env, 'DATABASE_URL': restricted, 'ARKHE_TENANT_ID': 'quality-browser',
                   'ARKHE_ACTOR': 'quality-service', 'ARKHE_API_TOKEN': token, 'ARKHE_LISTEN': '127.0.0.1:8797'}
    runtime_log = (OUT / 'runtime.log').open('w', encoding='utf-8')
    runtime = subprocess.Popen([str(ROOT / ('target/debug/arkhe-runtime' + exe))], cwd=ROOT, env=runtime_env, stdout=runtime_log, stderr=subprocess.STDOUT)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(60):
        try:
            request = urllib.request.Request('http://127.0.0.1:8797/health', headers={'Authorization': 'Bearer ' + token})
            with opener.open(request, timeout=2) as response:
                if response.status == 200:
                    break
        except OSError:
            pass
        time.sleep(.5)
    else:
        raise RuntimeError('Isolated native runtime readiness failed')
    browser_env = {**os.environ, 'ARKHE_QUALITY_RUNTIME_URL': 'http://127.0.0.1:8797/', 'ARKHE_QUALITY_TOKEN': token}
    run('browser-journey', ['node', 'scripts/product_browser_quality.mjs'], browser_env)
    runtime.terminate()
    runtime.wait(timeout=10)
    runtime = subprocess.Popen([str(ROOT / ('target/debug/arkhe-runtime' + exe))], cwd=ROOT, env=runtime_env, stdout=runtime_log, stderr=subprocess.STDOUT)
    for _ in range(60):
        try:
            request = urllib.request.Request('http://127.0.0.1:8797/health', headers={'Authorization': 'Bearer ' + token})
            with opener.open(request, timeout=2) as response:
                if response.status == 200:
                    break
        except OSError:
            pass
        time.sleep(.5)
    else:
        raise RuntimeError('Runtime restart readiness failed')
    run('native-after-restart', ['node', 'scripts/product_native_acceptance.mjs'], browser_env)
    report['status'] = 'PASS'
except Exception as error:
    report['status'] = 'FAIL'
    report['error'] = str(error)
    print(str(error), flush=True)
finally:
    if runtime:
        runtime.terminate()
        try:
            runtime.wait(timeout=10)
        except subprocess.TimeoutExpired:
            runtime.kill()
            runtime.wait()
    if runtime_log:
        runtime_log.close()
    # Only the exact random container created above is eligible for cleanup.
    label = subprocess.run(engine + ['inspect', name, '--format', '{{index .Config.Labels "io.arkhe.quality"}}'], capture_output=True, text=True)
    if label.returncode == 0 and label.stdout.strip() == '20261028':
        result = subprocess.run(engine + ['stop', name], capture_output=True)
        report['disposable_container_removed'] = result.returncode == 0
    (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
raise SystemExit(0 if report['status'] == 'PASS' else 1)
