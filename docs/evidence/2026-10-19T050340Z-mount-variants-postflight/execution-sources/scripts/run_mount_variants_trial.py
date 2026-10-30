"""Three mount-family denials, reduced candidate; independent before/after mount views."""
import argparse
import hashlib
import json
from pathlib import Path
from run_containment_trial import Trial, IMAGE, vm_path
from run_syscall_trial import provision
from run_resource_trial import LIMITS
from containment_mounts import evaluate
from containment_probe import write_json,decode_observation
from runtime_containment import digest

class MountTrial(Trial):
    def __init__(self,output,machine,image):
        super().__init__(output,machine,image,['mount-capability'])
        self.report['scope']='One vector with mount/umount2/pivot_root subchecks on reduced 128 MiB candidate. EPERM observations with independent mount snapshots, no exclusive seccomp attribution. No full-suite or production verification.'
    def policy(self,name,snapshot,command,arguments=()):
        args=super().policy(name,snapshot,command,arguments)
        if name.endswith('-mount-capability'):
            replacements={'--memory=1536m':'--memory=128m','--pids-limit=128':'--pids-limit=16','--cpus=2':'--cpus=0.5'}
            args=[replacements.get(a,a) for a in args];args.insert(args.index(self.image),'--memory-swap=128m')
        return args
    def vector(self,vector,binary):
        fixture=self.output/'session/fixtures'/vector
        request=json.loads((self.output/'session/requests'/(vector+'.json')).read_text())
        sentinel=fixture/'arkhe-containment-sentinel';original=digest(sentinel)
        (fixture/'probe').write_bytes(binary)
        command='cp /input/probe /work/probe && chmod 755 /work/probe && while [ ! -f /input/go ]; do sleep 0.05; done; /work/probe "$1" "$2" > /work/observation; echo $? > /work/exit; while [ ! -f /input/finish ]; do sleep 0.05; done'
        identity,policy=self.create(vector,fixture,command,(vector,request['nonce']))
        self.call(self.engine+['start',identity])
        created=self.inspect(identity);pid=created['State']['Pid']
        before=json.loads(self.call(['wsl','-d',self.distro,'-u','root','--exec','python3',self.observer,str(pid),identity]))
        if any(before['cgroup'].get(k,'').strip()!=v for k,v in LIMITS.items()):raise ValueError('candidate limits mismatch; refusing release')
        if before['namespaces']['mnt']==before['observer_namespaces']['mnt'] or before['membership']==before['observer_membership']:raise ValueError('observer isolation mismatch')
        receipts=self.output/'host-receipts';receipts.mkdir(exist_ok=True)
        write_json(receipts/(vector+'.before.json'),before);write_json(receipts/(vector+'.created.json'),created)
        code='''import time,json,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('observer',OBSERVER);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
root=Path('/proc')/str(HOSTPID)/'root/work'
start=time.monotonic();(Path(FIXTURE)/'go').write_text('release')
while not (root/'exit').exists() and time.monotonic()-start<3:time.sleep(0.025)
if not (root/'exit').exists():print(json.dumps({'timeout':True}))
else:
 observation=(root/'observation').read_bytes();assert len(observation)<=65536
 print(json.dumps({'timeout':False,'exit_code':int((root/'exit').read_text()),'observation':observation.decode(),'after':module.observe(ENGINEPID,IDENTITY),'duration_seconds':time.monotonic()-start}))
'''.replace('OBSERVER',repr(self.observer)).replace('HOSTPID',repr(before['host_pid'])).replace('FIXTURE',repr(vm_path(fixture))).replace('ENGINEPID',repr(pid)).replace('IDENTITY',repr(identity))
        receipt=json.loads(self.wsl(code,root=True,timeout=6))
        write_json(receipts/(vector+'.execution.json'),receipt)
        if receipt['timeout']:
            self.call(self.engine+['kill','--signal=KILL',identity],timeout=3,cleanup=True)
            raise TimeoutError('mount subchecks exceeded deadline; exact target killed')
        observation=decode_observation(receipt['observation'].encode(),request)
        write_json(receipts/(vector+'.after.json'),receipt['after'])
        verdict=evaluate(observation,before,receipt['after'])
        if receipt['exit_code']!=0:verdict='FAIL'
        if digest(sentinel)!=original:verdict='FAIL'
        (fixture/'finish').write_text('release')
        self.call(self.engine+['wait',identity],timeout=3)
        final=self.inspect(identity);write_json(receipts/(vector+'.exited.json'),final)
        if final['State']['ExitCode']!=0:verdict='FAIL'
        self.remove(identity)
        self.report['trial']['vectors'].append({'vector_id':vector,'container_id':identity,'profile':'arkhe-unified-target-128m/default-seccomp-development','subchecks':json.loads(observation['observations'])['cases'],'verdict':verdict,'cleanup_confirmed':True,'runtime_verified':False,'binary_sha256':hashlib.sha256(binary).hexdigest(),'before_sha256':digest(receipts/(vector+'.before.json')),'after_sha256':digest(receipts/(vector+'.after.json')),'execution_sha256':digest(receipts/(vector+'.execution.json')),'policy':policy})

def main():
    import re
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);p.add_argument('--machine',default='arkhe-containment');p.add_argument('--image',default=IMAGE)
    a=p.parse_args()
    if not re.fullmatch(r'arkhe-containment(?:-[a-z0-9]+)?',a.machine):raise ValueError('dedicated machine required')
    provision(a.machine)
    return MountTrial(a.output,a.machine,a.image).run()
if __name__=='__main__':raise SystemExit(main())
