"""Capture real command results with logs and source identities; never infers PASS from configuration."""
import argparse,datetime,hashlib,json,os,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
RUN=(ROOT/os.environ.get('ARKHE_EVIDENCE_DIR','docs/evidence/2026-10-17-execution')).resolve()
if not RUN.is_relative_to(ROOT): raise ValueError('Evidence directory leaves workspace')
PRUNE={'target','node_modules','__pycache__','dist','pkg','.git','.angular','.next','.venv','archive','design','docs'}
def source_identity():
    identities={}
    for folder,dirs,names in os.walk(ROOT):
        dirs[:]=[d for d in dirs if d not in PRUNE and Path(folder)/d!=ROOT/'ops/local']
        for name in sorted(names):
            path=Path(folder)/name
            if name=='MANIFEST.sha256' or name.startswith('.env') or name.endswith(('.sqlite','.pyc','.tsbuildinfo')): continue
            identities[path.relative_to(ROOT).as_posix()]=hashlib.sha256(path.read_bytes()).hexdigest()
    payload=json.dumps(identities,sort_keys=True,separators=(',',':')).encode()
    return hashlib.sha256(payload).hexdigest(),identities

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('gate');parser.add_argument('--cwd',default='.')
    parser.add_argument('--db-role',choices=['runtime','admin'])
    parser.add_argument('--live-tests',action='store_true')
    if '--' not in sys.argv: parser.error('separate the command with --')
    split=sys.argv.index('--');args=parser.parse_args(sys.argv[1:split]);command=sys.argv[split+1:]
    if not command: raise SystemExit('A real command is required')
    cwd=(ROOT/args.cwd).resolve()
    if not cwd.is_relative_to(ROOT): raise SystemExit('Command cwd leaves workspace')
    env={**os.environ,'CI':'true','NG_CLI_ANALYTICS':'false','NO_COLOR':'1'}
    cfgpath=ROOT/'ops/local/live.json'
    cfg=json.loads(cfgpath.read_text()) if cfgpath.exists() else {}
    if args.db_role or args.live_tests:
        runtime='postgresql://arkhe_live:'+cfg['runtime_password']+'@127.0.0.1:55432/arkhe'
        admin='postgresql://postgres:'+cfg['admin_password']+'@127.0.0.1:55432/arkhe'
        env['DATABASE_URL']=admin if args.db_role=='admin' else runtime
        if args.live_tests: env.update(ARKHE_TEST_DATABASE_URL=runtime,ARKHE_TEST_ADMIN_DATABASE_URL=admin)
    before,inputs=source_identity();started=datetime.datetime.now(datetime.timezone.utc).isoformat();clock=time.monotonic()
    print('RUN '+args.gate+': '+subprocess.list2cmdline(command),flush=True)
    try:
        process=subprocess.run(command,cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        code=process.returncode;output=process.stdout.decode('utf-8',errors='replace')
    except OSError as error: code=127;output=str(error)+'\n'
    cfg=json.loads(cfgpath.read_text()) if cfgpath.exists() else cfg
    for secret in cfg.values():
        if isinstance(secret,str) and len(secret)>=24: output=output.replace(secret,'<REDACTED>')
    after,_=source_identity()
    RUN.mkdir(parents=True,exist_ok=True);report=RUN/'results.json'
    remote=os.environ.get('GITHUB_ACTIONS')=='true'
    data=json.loads(report.read_text()) if report.exists() else dict(
        scope='GitHub Actions execution; no protocol freeze or production attestation' if remote else 'Local execution only; no remote CI, protocol freeze or production attestation',
        context={k:os.environ[k] for k in ['GITHUB_REPOSITORY','GITHUB_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_JOB','RUNNER_OS','RUNNER_ARCH'] if k in os.environ},attempts=[])
    number=len(data['attempts'])+1;name=f'{number:02}-{args.gate}'
    log=RUN/(name+'.log');log.write_text(output,encoding='utf-8')
    snapshot=RUN/(name+'.inputs.json');snapshot.write_text(json.dumps(inputs,indent=2,sort_keys=True)+'\n')
    entry=dict(gate=args.gate,command=command,cwd=str(cwd.relative_to(ROOT)),started_at_utc=started,duration_seconds=round(time.monotonic()-clock,3),exit_code=code,status='PASS' if code==0 else 'FAIL',source_before_sha256=before,source_after_sha256=after,source_changed_during_execution=before!=after,log=log.name,log_sha256=hashlib.sha256(log.read_bytes()).hexdigest(),inputs=snapshot.name)
    data['attempts'].append(entry);report.write_text(json.dumps(data,indent=2)+'\n')
    latest={v['gate']:v for v in data['attempts']}
    lines=['# Execution results','',data['scope'],'','Latest attempt per gate; earlier failures remain in results.json.','','| Gate | Result | Exit | Log |','|---|---|---|---|']
    for gate,v in latest.items(): lines.append(f"| {gate} | {v['status']} | {v['exit_code']} | [{v['log']}]({v['log']}) |")
    (RUN/'RESULTS.md').write_text('\n'.join(lines)+'\n')
    print(f"{entry['status']} {args.gate}: exit={code}, duration={entry['duration_seconds']}s, log={log.relative_to(ROOT)}",flush=True)
    if code: print('\n'.join(output.splitlines()[-35:]))
    raise SystemExit(code)
if __name__=='__main__':main()
