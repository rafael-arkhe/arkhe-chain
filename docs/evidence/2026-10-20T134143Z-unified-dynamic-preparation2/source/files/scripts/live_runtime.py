"""Provision and verify the local persistent runtime (Docker or Podman).
All generated secrets stay under ignored ops/local; application DB role has no admin powers.
"""
import argparse, json, os, re, secrets, subprocess, sys, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SQL=ROOT/'storage/sql'
LABEL='io.arkhe.environment'
DB='arkhe-live-postgres'
APP='arkhe-live-runtime'
IMAGE='localhost/arkhe-runtime:dev'

def run(args, **kw):
    return subprocess.run([str(x) for x in args],check=True,**kw)
def wait_ready(engine):
    for _ in range(60):
        # The image entrypoint starts a temporary Unix-socket-only server while
        # initializing. TCP readiness identifies the final published server.
        p=subprocess.run(engine+['exec',DB,'pg_isready','-h','127.0.0.1','-U','postgres','-d','arkhe'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if p.returncode==0: return
        time.sleep(1)
    raise RuntimeError('PostgreSQL did not become ready')
def inspect(engine, name):
    p=subprocess.run(engine+['container','inspect',name],capture_output=True,text=True)
    if p.returncode: return None
    data=json.loads(p.stdout)[0]
    if data['Config'].get('Labels',{}).get(LABEL)!='live-v1':
        raise RuntimeError('Refusing to modify an unrelated container: '+name)
    return data

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['up','verify','down','status'])
    parser.add_argument('--engine',default='podman',choices=['podman','docker'])
    parser.add_argument('--connection',default='arkhe-runtime')
    args=parser.parse_args()
    engine=[args.engine]+(['--connection',args.connection] if args.engine=='podman' else [])
    if args.action=='status':
        run(engine+['ps','-a','--filter','label='+LABEL+'=live-v1'])
        return
    if args.action=='down':
        for name in [APP,DB]:
            if inspect(engine,name): run(engine+['stop',name])
        print('Stopped application and PostgreSQL; data volume preserved')
        return
    config_path=ROOT/'ops/local/live.json'
    if config_path.exists(): cfg=json.loads(config_path.read_text())
    else:
        if args.action=='verify': raise RuntimeError('Run up before verify')
        config_path.parent.mkdir(parents=True,exist_ok=True)
        cfg={k:secrets.token_hex(32) for k in ['admin_password','runtime_password','token']}
        config_path.write_text(json.dumps(cfg,indent=2)+'\n')
        if os.name!='nt': config_path.chmod(0o600)
    if not all(re.fullmatch('[a-f0-9]{64}',cfg[k]) for k in ['admin_password','runtime_password','token']):
        raise RuntimeError('Invalid local credential file')
    app_url='postgresql://arkhe_live:'+cfg['runtime_password']+'@127.0.0.1:55432/arkhe'
    env={**os.environ,'DATABASE_URL':app_url,'ARKHE_TEST_DATABASE_URL':app_url, 'ARKHE_TEST_ADMIN_DATABASE_URL':'postgresql://postgres:'+cfg['admin_password']+'@127.0.0.1:55432/arkhe'}
    if args.action=='up':
        for command in [[sys.executable,'scripts/check_architecture.py'],['cargo','check','--workspace','--locked'],['cargo','test','--workspace','--locked'],['cargo','nextest','run','--workspace','--locked'],[sys.executable,'scripts/cognition_conformance.py']]:
            run(command,cwd=ROOT)
        # The existing shared migration helpers are used from Rust; no ORM-created schema.
        if subprocess.run(engine+['network','inspect','arkhe-live'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
            run(engine+['network','create','--label',LABEL+'=live-v1','arkhe-live'])
        if not inspect(engine,DB):
            run(engine+['volume','create','--label',LABEL+'=live-v1','arkhe-live-pgdata'])
            run(engine+['run','-d','--name',DB,'--label',LABEL+'=live-v1','--network','arkhe-live','--network-alias','postgres',
                '-p','127.0.0.1:55432:5432','-v','arkhe-live-pgdata:/var/lib/postgresql/data',
                '-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=arkhe','docker.io/library/postgres:16'],env={**os.environ,'POSTGRES_PASSWORD':cfg['admin_password']})
        elif not inspect(engine,DB)['State']['Running']: run(engine+['start',DB])
        wait_ready(engine)
        run(['cargo','build','-p','arkhe-runtime','--locked'],cwd=ROOT)
        binary=ROOT/'target/debug'/('arkhe-runtime.exe' if os.name=='nt' else 'arkhe-runtime')
        run([binary,'migrate'],env={**os.environ,'DATABASE_URL':'postgresql://postgres:'+cfg['admin_password']+'@127.0.0.1:55432/arkhe'})
        audit_env={**os.environ,'DATABASE_URL':'postgresql://postgres:'+cfg['admin_password']+'@127.0.0.1:55432/arkhe','CARGO_TARGET_DIR':str(ROOT/'target')}
        for audit in ['checksum-verify','rls-audit','append-only-audit']:
            run(['cargo','run','--locked','-p','arkhe-sql-migrate','--',audit],cwd=SQL,env=audit_env)
        # Passwords are random hex, validated above; SQL is sent on stdin, never command lines.
        provision="DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='arkhe_live') THEN CREATE ROLE arkhe_live LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT PASSWORD '"+cfg['runtime_password']+"'; END IF; END $$; GRANT arkhe_append,arkhe_read,arkhe_operations TO arkhe_live;"
        run(engine+['exec','-i',DB,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','arkhe'],input=provision.encode())
        # Apply the real security suite in an independent fresh DB; persistent application data is untouched.
        command=[sys.executable,'scripts/postgres_conformance.py','--engine',args.engine,'--container',DB]
        if args.engine=='podman': command+=['--connection',args.connection]
        run(command,cwd=ROOT)
    run(['cargo','nextest','run','--workspace','--features','arkhe-runtime/postgres-integration,arkhe-bugbounty/postgres-integration,arkhe-sql/postgres-integration','--run-ignored','all','--locked'],cwd=ROOT,env=env)
    if args.action=='up':
        run(engine+['build','-t',IMAGE,'-f',ROOT/'ops/runtime/Dockerfile',ROOT])
        if inspect(engine,APP):
            run(engine+['stop',APP]); run(engine+['rm',APP])
        service_env={**os.environ,'DATABASE_URL':'postgresql://arkhe_live:'+cfg['runtime_password']+'@postgres:5432/arkhe',
            'ARKHE_API_TOKEN':cfg['token'],'ARKHE_ACTOR':'local-operator','ARKHE_TENANT_ID':'local', 'ARKHE_LISTEN':'0.0.0.0:8080'}
        run(engine+['run','-d','--name',APP,'--label',LABEL+'=live-v1','--network','arkhe-live',
            '-p','127.0.0.1:8788:8080']+sum((['-e',k] for k in ['DATABASE_URL','ARKHE_API_TOKEN','ARKHE_ACTOR','ARKHE_TENANT_ID','ARKHE_LISTEN']),[])+[IMAGE],env=service_env)
    command=[sys.executable,'scripts/live_http_conformance.py','--engine',args.engine]
    if args.engine=='podman': command+=['--connection',args.connection]
    run(command,cwd=ROOT)
    print('PASS persistent live runtime: http://127.0.0.1:8788 (credentials in ops/local/live.json)')
if __name__=='__main__': main()
