"""Bounded resource trial; independent VM cgroup observations, never full certification."""
import argparse
import hashlib
import json
from pathlib import Path
import time
from run_containment_trial import Trial, IMAGE, vm_path
from containment_probe import write_json, decode_observation
from runtime_containment import digest

VECTORS = ['memory-bounded', 'cpu-bounded', 'pids-bounded']
LIMITS = {'memory.max':'134217728', 'memory.swap.max':'0', 'pids.max':'16', 'cpu.max':'50000 100000'}

def counters(value):
    return {k:int(v) for k,v in (line.split() for line in value.splitlines())}

def assess_resource(vector, before, receipt, observation):
    if any(before['cgroup'].get(k, '').strip() != v for k,v in LIMITS.items()):
        return 'FAIL'
    if receipt.get('deadline_exceeded') or receipt.get('observer_inside_target'):
        return 'ERROR'
    samples = receipt['samples']
    if not samples or receipt['exit_code'] is None:
        return 'ERROR'
    def delta(file, key):
        return max(counters(s[file]).get(key,0) for s in samples) - counters(before['cgroup'][file]).get(key,0)
    if vector == 'memory-bounded':
        return 'PASS' if receipt['exit_code'] == 137 and delta('memory.events','oom_kill') > 0 else 'FAIL'
    if receipt['exit_code'] != 0 or observation is None or observation['state'] != 'OBSERVED':
        return 'FAIL'
    data = json.loads(observation['observations'])
    if vector == 'cpu-bounded':
        return 'PASS' if data['threads']==2 and 2900 <= data['elapsed_ms'] <= 8000 and data['iterations']>0 and delta('cpu.stat','nr_throttled')>0 and delta('cpu.stat','throttled_usec')>0 else 'FAIL'
    return 'PASS' if data['attempts']==24 and data['eagain']>0 and data['other_errors']==0 and data['reaped']==data['spawned'] and data['spawned']+data['eagain']==24 and delta('pids.events','max')>0 else 'FAIL'

class ResourceTrial(Trial):
    def __init__(self, output, machine, image):
        super().__init__(output,machine,image,VECTORS)
        self.report['scope']='Three bounded resource vectors on rootless Podman/WSL2 only. Independent host cgroup counters; no transfer to gVisor/WASM. Full suite INCOMPLETE.'
    def policy(self,name,snapshot,command,arguments=()):
        args=super().policy(name,snapshot,command,arguments)
        if any(name.endswith('-'+v) for v in VECTORS):
            replacements={'--memory=1536m':'--memory=128m','--pids-limit=128':'--pids-limit=16','--cpus=2':'--cpus=0.5'}
            args=[replacements.get(a,a) for a in args]
            args.insert(args.index(self.image),'--memory-swap=128m')
        return args
    def vector(self,vector,binary):
        fixture=self.output/'session/fixtures'/vector
        request=json.loads((self.output/'session/requests'/(vector+'.json')).read_text())
        sentinel=fixture/'arkhe-containment-sentinel'; original=digest(sentinel)
        (fixture/'probe').write_bytes(binary)
        command='cp /input/probe /work/probe && chmod 755 /work/probe && while [ ! -f /input/go ]; do sleep 0.05; done; /work/probe "$1" "$2" > /work/observation; echo $? > /work/exit; while [ ! -f /input/finish ]; do sleep 0.05; done'
        identity,policy=self.create(vector,fixture,command,(vector,request['nonce']))
        self.call(self.engine+['start',identity])
        created=self.inspect(identity); pid=created['State']['Pid']
        before=json.loads(self.call(['wsl','-d',self.distro,'-u','root','--exec','python3',self.observer,str(pid),identity]))
        if any(before['cgroup'].get(k,'').strip()!=v for k,v in LIMITS.items()):
            raise ValueError('reduced cgroup limits not effective; refusing load')
        if before['membership']==before['observer_membership']:
            raise ValueError('observer shares target cgroup')
        receipts=self.output/'host-receipts';receipts.mkdir(exist_ok=True)
        write_json(receipts/(vector+'.before.json'),before)
        # Fixed bounded external watcher. It only reads the cgroup correlated by the trusted observer.
        code='''import json,time
from pathlib import Path
before=json.loads(BEFORE)
group=Path('/sys/fs/cgroup')/next(x.split(':',2)[2] for x in before['membership'].splitlines() if x.startswith('0::')).lstrip('/')
assert group.resolve().is_relative_to(Path('/sys/fs/cgroup'))
root=Path('/proc')/str(before['host_pid'])/'root/work'
fixture=Path(FIXTURE)
samples=[]
start=time.monotonic()
(fixture/'go').write_text('release')
exit_code=None
while time.monotonic()-start<8:
    sample={name:(group/name).read_text() for name in ['memory.events','memory.peak','cpu.stat','pids.events','pids.current']}
    sample['elapsed_seconds']=time.monotonic()-start
    samples.append(sample)
    if (root/'exit').exists():
        exit_code=int((root/'exit').read_text());break
    time.sleep(0.05)
observation=(root/'observation').read_text() if (root/'observation').exists() else ''
assert len(observation.encode())<=65536
print(json.dumps({'container_id':IDENTITY,'samples':samples,'exit_code':exit_code,'deadline_exceeded':exit_code is None,'observer_inside_target':Path('/proc/self/cgroup').read_text()==before['membership'],'observation':observation,'duration_seconds':time.monotonic()-start}))
'''.replace('BEFORE',repr(json.dumps(before))).replace('FIXTURE',repr(vm_path(fixture))).replace('IDENTITY',repr(identity))
        receipt=json.loads(self.wsl(code,root=True,timeout=10))
        receipt.update(run_id=self.run_id,vector_id=vector,nonce=request['nonce'],binary_sha256=hashlib.sha256(binary).hexdigest(),policy=policy)
        write_json(receipts/(vector+'.resource.json'),receipt)
        observation=decode_observation(receipt['observation'].encode(),request) if receipt['observation'] else None
        verdict=assess_resource(vector,before,receipt,observation)
        state=self.inspect(identity)
        write_json(receipts/(vector+'.held.json'),state)
        (fixture/'finish').write_text('release')
        self.call(self.engine+['wait',identity],timeout=3)
        final=self.inspect(identity)
        write_json(receipts/(vector+'.exited.json'),final)
        if original!=digest(sentinel):raise ValueError('input sentinel modified')
        self.remove(identity)
        self.report['trial']['vectors'].append({'vector_id':vector,'container_id':identity,'verdict':verdict,'cleanup_confirmed':True,'resource_receipt_sha256':digest(receipts/(vector+'.resource.json')),'engine_oom_killed':final['State'].get('OOMKilled'),'probe_exit_code':receipt['exit_code']})
        if receipt['deadline_exceeded']:raise TimeoutError('resource workload exceeded eight seconds')

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--machine',default='arkhe-containment');p.add_argument('--image',default=IMAGE)
    a=p.parse_args();return ResourceTrial(a.output,a.machine,a.image).run()
if __name__=='__main__':raise SystemExit(main())
