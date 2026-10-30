"""Restart an explicitly named Arkhe test PostgreSQL container between probe processes.
Requires DATABASE_URL for a migrated, non-administrative runtime role.
"""
import argparse,json,os,subprocess,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--container',required=True);p.add_argument('--engine',choices=['docker','podman'],default='podman');p.add_argument('--connection',default='arkhe-runtime');a=p.parse_args()
 if not os.environ.get('DATABASE_URL'):raise ValueError('DATABASE_URL required')
 engine=[a.engine]+(['--connection',a.connection] if a.engine=='podman' else [])
 data=json.loads(subprocess.check_output(engine+['inspect',a.container],text=True))[0]
 if data['Config'].get('Labels',{}).get('io.arkhe.environment')!='live-v1':raise ValueError('only an explicitly labelled Arkhe test container may be restarted')
 if not data['State']['Running']:raise ValueError('test database must be running')
 binary=ROOT/'target/debug/examples'/('persistence_probe.exe' if os.name=='nt' else 'persistence_probe')
 env={**os.environ,'ARKHE_PROBE_TENANT':'restart-probe-'+uuid.uuid4().hex}
 subprocess.run([str(binary),'seed'],env=env,check=True)
 subprocess.run(engine+['restart',a.container],check=True)
 deadline=time.monotonic()+60
 while time.monotonic()<deadline:
  result=subprocess.run(engine+['exec',a.container,'pg_isready','-h','127.0.0.1','-U','postgres','-d','arkhe'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  if result.returncode==0:break
  time.sleep(1)
 else:raise RuntimeError('PostgreSQL did not recover')
 subprocess.run([str(binary),'check'],env=env,check=True)
 print('PASS separate-process replay and evidence recovery after PostgreSQL container restart')
if __name__=='__main__':main()
