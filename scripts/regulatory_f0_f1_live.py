"""Exercise real versioned HTTP handlers against disposable PostgreSQL 16.

Uses the existing arkhe-runtime Podman connection, never an existing DB/volume.
No Pix/PSP/BCB network calls. All credentials are ephemeral and redacted.
"""
from pathlib import Path
import json
import os
import secrets
import socket
import subprocess
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/evidence/2026-10-24-regulatory-f0-f1'
OUT.mkdir(parents=True, exist_ok=True)
engine = ['podman', '--connection', 'arkhe-runtime']
name = 'arkhe-regulatory-test-' + uuid.uuid4().hex[:12]
password, runtime_password, token = [secrets.token_hex(32) for _ in range(3)]
runtime_role = 'audit_' + uuid.uuid4().hex[:12]
process = None
created = False
checks = []
report = {'scope': 'Disposable local PostgreSQL 16 and actual Rust HTTP server; no PSP, ICP-Brasil or production deployment', 'status': 'RUNNING', 'checks': checks}


def redacted(text):
    for secret in [password, runtime_password, token]:
        text = text.replace(secret, '<redacted>')
    return text


def command(args, **kwargs):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, **kwargs)
    if result.returncode:
        raise RuntimeError(redacted(result.stdout + result.stderr))
    return result.stdout.strip()


def request(path, authenticated=True, method='GET', data=None):
    headers = {'Authorization': 'Bearer ' + token} if authenticated else {}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(origin + path, headers=headers, method=method, data=None if data is None else json.dumps(data).encode())
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()


try:
    image = command(engine + ['image', 'inspect', 'docker.io/library/postgres:16', '--format', '{{.Id}}'])
    report['postgres_image'] = image
    command(engine + ['run', '-d', '--pull=never', '--name', name, '--label', 'io.arkhe.audit=regulatory-f0-f1',
                      '-e', 'POSTGRES_PASSWORD', '-p', '127.0.0.1::5432', image], env={**os.environ, 'POSTGRES_PASSWORD': password})
    created = True
    port = command(engine + ['port', name, '5432']).rsplit(':', 1)[1]
    for _ in range(60):
        ready = subprocess.run(engine + ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], capture_output=True)
        if ready.returncode == 0:
            break
        time.sleep(.5)
    else:
        raise RuntimeError('Disposable PostgreSQL did not become ready')
    psql = engine + ['exec', name, 'psql', '-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c']
    version_num = int(command(psql + ["SELECT current_setting('server_version_num')"]))
    assert 160000 <= version_num < 170000
    report['postgres_version_num'] = version_num
    binary = ROOT / ('target/debug/arkhe-runtime.exe' if os.name == 'nt' else 'target/debug/arkhe-runtime')
    admin_url = f'postgresql://postgres:{password}@127.0.0.1:{port}/postgres'
    migration = command([str(binary), 'migrate'], env={**os.environ, 'DATABASE_URL': admin_url})
    (OUT / 'live-migration.log').write_text(redacted(migration) + '\nexit_code: 0\n')
    migration_count = int(command(psql + ['SELECT count(*) FROM _sqlx_migrations WHERE success']))
    assert migration_count == len(list((ROOT / 'storage/sql/migrations').glob('*.sql')))
    report['migration_count'] = migration_count
    checks.append('Actual compiled runtime applied and verified all current SQL migrations on empty PostgreSQL 16')
    sql = f"CREATE ROLE {runtime_role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT PASSWORD '{runtime_password}'; GRANT arkhe_append,arkhe_read TO {runtime_role};"
    command(engine + ['exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], input=sql)
    permissions = command(psql + [f"SELECT has_table_privilege('{runtime_role}', 'wormgraph_records','UPDATE'),has_table_privilege('{runtime_role}', 'wormgraph_records','DELETE'),has_table_privilege('{runtime_role}', 'wormgraph_records','TRUNCATE')"])
    assert permissions == 'f|f|f'
    checks.append('Restricted runtime role has no UPDATE, DELETE or TRUNCATE privilege on WormGraph records')
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0)); http_port = probe.getsockname()[1]
    origin = f'http://127.0.0.1:{http_port}'
    env = {**os.environ, 'DATABASE_URL': f'postgresql://{runtime_role}:{runtime_password}@127.0.0.1:{port}/postgres',
           'ARKHE_API_TOKEN': token, 'ARKHE_ACTOR': 'synthetic-auditor', 'ARKHE_TENANT_ID': 'synthetic-tenant',
           'ARKHE_LISTEN': f'127.0.0.1:{http_port}', 'ARKHE_EVIDENCE_RETENTION_DAYS': '366', 'ARKHE_EVIDENCE_IMMEDIATE_DAYS': '92'}
    with (OUT / 'live-server.log').open('w') as log:
        process = subprocess.Popen([str(binary)], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
        for _ in range(80):
            if process.poll() is not None:
                raise RuntimeError('HTTP server exited before readiness')
            try:
                if request('/v1/health')[0] == 200:
                    break
            except (OSError, urllib.error.URLError):
                pass
            time.sleep(.25)
        else:
            raise RuntimeError('HTTP server readiness timeout')
        assert request('/health')[0] == request('/v1/health')[0] == 200
        for path in ['/health', '/v1/health', '/v1/retention', '/v1/evidence/' + '0' * 64]:
            assert request(path, authenticated=False)[0] == 401, path
        checks.append('Legacy and /v1/health return 200 with actual DB; versioned health/retention/evidence reject unauthenticated requests')
        status, body = request('/v1/retention')
        policy = json.loads(body)
        assert status == 200 and policy['policy'] == {'retention_days': 366, 'immediate_access_days': 92}
        assert policy['automatic_deletion'] is False and policy['operational_retention_evidence'] == 'NOT_MEASURED'
        report['retention_response'] = policy
        checks.append('Authenticated /v1/retention reports conservative minimum and no automatic purge; no fabricated retention history')
        assert request('/v1/evidence/' + '0' * 64)[0] == request('/evidence/' + '0' * 64)[0] == 404
        checks.append('Both evidence namespaces return 404 for absent evidence under the restricted runtime role')
        invalid = subprocess.run([str(binary)], cwd=ROOT, env={**env, 'ARKHE_EVIDENCE_RETENTION_DAYS': '365'}, capture_output=True, text=True, timeout=10)
        assert invalid.returncode != 0 and 'retention' in invalid.stderr
        checks.append('Server rejects below-minimum retention at startup')
    report['status'] = 'PASS'
except Exception as error:
    report['status'] = 'FAIL'
    report['error'] = redacted(str(error))
finally:
    if process is not None:
        process.terminate()
        process.wait(timeout=10)
    if created:
        label = command(engine + ['inspect', name, '--format', '{{index .Config.Labels "io.arkhe.audit"}}'])
        if label == 'regulatory-f0-f1':
            command(engine + ['rm', '-f', name])
            report['disposable_container_removed'] = True
    (OUT / 'live-result.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report), flush=True)
if report['status'] != 'PASS':
    raise SystemExit(1)
