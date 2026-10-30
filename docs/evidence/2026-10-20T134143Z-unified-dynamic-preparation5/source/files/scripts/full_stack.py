"""Build/adopt the local six-service Compose stack; preserve PostgreSQL data."""
import argparse, base64, json, os, re, secrets, subprocess, sys, time, urllib.request
from pathlib import Path
from live_runtime import ROOT, inspect, DB, APP

ENGINE=['podman','--connection','arkhe-runtime']
COMPOSE=[sys.executable,str(ROOT/'scripts/compose_local.py'),
         '--env-file',str(ROOT/'ops/local/compose.env'),'-p','arkhe_environment',
         '-f',str(ROOT/'docker-compose.yml')]

def run(command):
    subprocess.run(command,cwd=ROOT,check=True,env={**os.environ,'CONTAINER_CONNECTION':'arkhe-runtime'})

def request(url,headers=None):
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(urllib.request.Request(url,headers=headers or {}),timeout=10) as response:
        return response.read().decode()

def verify(cfg):
    for port,path in [(8788,'/health'),(8787,'/health'),(9090,'/-/ready'),(3002,'/api/health')]:
        for attempt in range(90):
            try:
                body=request(f'http://127.0.0.1:{port}{path}',
                             {'Authorization':'Bearer '+cfg['token']} if port==8788 else None)
                if port==8787: assert json.loads(body)['authority']=='none'
                if port==3002: assert json.loads(body)['database']=='ok'
                break
            except Exception:
                if attempt==89: raise
                time.sleep(1)
        print(f'PASS service health localhost:{port}')
    assert subprocess.check_output(ENGINE+['exec','arkhe-live-redis','redis-cli','PING'],text=True).strip()=='PONG'
    assert 'arkhe_mcp_http_requests_total' in request('http://127.0.0.1:8787/metrics')
    auth=base64.b64encode(('arkhe-admin:'+cfg['grafana_password']).encode()).decode()
    for attempt in range(30):
        try:
            url='http://127.0.0.1:9090/api/v1/query?query=up%7Bjob%3D%22arkhe%22%7D'
            result=json.loads(request(url))['data']['result']
            assert result and all(row['value'][1]=='1' for row in result)
            proxy='http://127.0.0.1:3002/api/datasources/proxy/uid/arkhe-prometheus/api/v1/query?query=up'
            assert json.loads(request(proxy,{'Authorization':'Basic '+auth}))['status']=='success'
            break
        except Exception:
            if attempt==29: raise
            time.sleep(2)
    print('PASS Redis PING; Prometheus scraped MCP; Grafana datasource proxy queried Prometheus')
    run([sys.executable,'scripts/live_http_conformance.py','--engine',ENGINE[0]]+
        (['--connection',ENGINE[2]] if ENGINE[0]=='podman' else []))
    run(ENGINE+['ps','--filter','label=io.arkhe.environment=live-v1','--format','{{.Names}} {{.Status}}'])

def main():
    global ENGINE, COMPOSE
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine',choices=['podman','docker'],default='podman')
    parser.add_argument('--verify',action='store_true')
    args=parser.parse_args()
    if args.engine=='docker':
        ENGINE=['docker']
        COMPOSE=['docker','compose','--env-file',str(ROOT/'ops/local/compose.env'),
                 '-p','arkhe_environment','-f',str(ROOT/'docker-compose.yml')]
    cfgpath=ROOT/'ops/local/live.json'
    if not cfgpath.exists(): raise RuntimeError('Run scripts/live_runtime.py up first to apply and audit migrations')
    cfg=json.loads(cfgpath.read_text())
    cfg.setdefault('grafana_password',secrets.token_hex(32))
    for key in ['admin_password','runtime_password','token','grafana_password']:
        if not re.fullmatch('[a-f0-9]{64}',cfg[key]): raise ValueError('Invalid local credential')
    cfgpath.write_text(json.dumps(cfg,indent=2)+'\n')
    values={'ARKHE_POSTGRES_PASSWORD':cfg['admin_password'],
            'ARKHE_RUNTIME_DATABASE_URL':'postgresql://arkhe_live:'+cfg['runtime_password']+'@postgres:5432/arkhe',
            'ARKHE_API_TOKEN':cfg['token'],'ARKHE_GRAFANA_PASSWORD':cfg['grafana_password']}
    envpath=ROOT/'ops/local/compose.env'
    envpath.write_text(''.join(k+'='+v+'\n' for k,v in values.items()))
    if os.name!='nt':
        cfgpath.chmod(0o600); envpath.chmod(0o600)
    if args.verify:
        verify(cfg); return
    # Build succeeds before replacing the existing owned application containers.
    run(COMPOSE+['build'])
    db=inspect(ENGINE,DB)
    if db and not any(m.get('Name')=='arkhe-live-pgdata' and m.get('Destination')=='/var/lib/postgresql/data' for m in db['Mounts']):
        raise RuntimeError('Unexpected PostgreSQL storage; refusing adoption')
    for name in [APP,DB]:
        data=inspect(ENGINE,name)
        labels=data['Config'].get('Labels',{}) if data else {}
        if data and not (labels.get('io.podman.compose.project') or labels.get('com.docker.compose.project')):
            run(ENGINE+['stop',name]); run(ENGINE+['rm',name])
    run(COMPOSE+['up','-d'])
    verify(cfg)

if __name__=='__main__': main()
