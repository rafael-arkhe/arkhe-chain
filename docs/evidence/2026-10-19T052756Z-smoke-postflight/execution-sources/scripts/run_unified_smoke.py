"""Initial candidate smoke only; not a unified runner and never seals runtime."""
import argparse,hashlib,json,re,time
from pathlib import Path
from run_containment_trial import Trial,IMAGE,vm_path
from run_syscall_trial import provision
from run_resource_trial import LIMITS
from containment_probe import ROOT,write_json,decode_observation
from mount_manifest import compare
from runtime_containment import digest

class SmokeTrial(Trial):
    def __init__(self,output,machine,image):
        super().__init__(output,machine,image,['identity'])
        self.spec_source=ROOT/'config/runtime-mounts-candidate.json';self.spec=json.loads(self.spec_source.read_text())
        self.profile_source=ROOT/'config/seccomp/arkhe-unified-x86_64-v1/profile.json'
        contract=json.loads((ROOT/'config/runtime-unified-contract.json').read_text())
        if digest(self.profile_source)!=contract['seccomp_contract']['profile_file_sha256'] or digest(self.spec_source)!=contract['mount_contract']['candidate_manifest']['sha256']:raise ValueError('candidate contract binding mismatch')
        self.profile_hash=digest(self.profile_source);self.spec_hash=digest(self.spec_source)
        self.report['scope']='Candidate startup smoke with explicit mounts and seccomp, 128 MiB/0.5 CPU/16 PIDs. Structural mount comparison only. No full matrix, final mount seal or kernel BPF attestation.'
        self.report['sealed']=False
    def stage(self,source,role,mode):
        expected=digest(source);target='/opt/arkhe-containment/'+role+'-'+expected+source.suffix
        code='''from pathlib import Path
import hashlib,os
source=Path(SOURCE);target=Path(TARGET)
assert hashlib.sha256(source.read_bytes()).hexdigest()==HASH
if target.exists():assert target.stat().st_uid==0 and hashlib.sha256(target.read_bytes()).hexdigest()==HASH
else:target.write_bytes(source.read_bytes());os.chmod(target,MODE)
assert target.stat().st_uid==0 and not target.stat().st_mode & 0o022
print('staged')
'''.replace('SOURCE',repr(vm_path(source))).replace('TARGET',repr(target)).replace('HASH',repr(expected)).replace('MODE',repr(mode))
        self.wsl(code,root=True);return target
    def preflight(self):
        super().preflight()
        self.profile_path=self.stage(self.profile_source,'unified-profile',0o444)
        self.spec_path=self.stage(self.spec_source,'mount-spec',0o444)
        self.snapshot_path=self.stage(ROOT/'scripts/vm_mount_snapshot.py','mount-snapshot',0o500)
        self.report['candidate']={'profile_sha256':self.profile_hash,'mount_spec_sha256':self.spec_hash,'snapshot_reader_sha256':digest(ROOT/'scripts/vm_mount_snapshot.py')}
    def policy(self,name,snapshot,command,arguments=()):
        args=super().policy(name,snapshot,command,arguments)
        if name.endswith('-identity'):
            replace={'--memory=1536m':'--memory=128m','--pids-limit=128':'--pids-limit=16','--cpus=2':'--cpus=0.5'}
            args=[replace.get(a,a) for a in args]
            flags=['--memory-swap=128m','--ipc=private','--shm-size=64m','--tmpfs=/run:rw,noexec,nosuid,nodev,size=4194304,mode=755','--tmpfs=/var/tmp:rw,noexec,nosuid,nodev,size=8388608,mode=1777','--security-opt=seccomp='+self.profile_path]
            args[args.index(self.image):args.index(self.image)]=flags
        return args
    def snapshot(self,pid,identity):
        return json.loads(self.call(['wsl','-d',self.distro,'-u','root','--exec','python3',self.snapshot_path,self.observer,str(pid),identity,self.spec_path],timeout=10))
    def vector(self,vector,binary):
        fixture=self.output/'session/fixtures'/vector;request=json.loads((self.output/'session/requests/identity.json').read_text())
        (fixture/'probe').write_bytes(binary);sentinel=digest(fixture/'arkhe-containment-sentinel')
        command='cp /input/probe /work/probe && chmod 755 /work/probe && while [ ! -f /input/go ] && [ ! -f /input/finish ]; do sleep 0.05; done; if [ -f /input/go ]; then /work/probe "$1" "$2" > /work/observation; echo $? > /work/exit; fi; while [ ! -f /input/finish ]; do sleep 0.05; done'
        identity,policy=self.create('identity',fixture,command,('identity',request['nonce']))
        self.call(self.engine+['start',identity]);created=self.inspect(identity);pid=created['State']['Pid']
        before=self.snapshot(pid,identity);oracle=before['oracle']
        if any(oracle['cgroup'].get(k,'').strip()!=v for k,v in LIMITS.items()):raise ValueError('candidate cgroup enforcement mismatch')
        if oracle['namespaces']['mnt']==oracle['observer_namespaces']['mnt'] or oracle['membership']==oracle['observer_membership']:raise ValueError('observer isolation mismatch')
        receipts=self.output/'host-receipts';receipts.mkdir(exist_ok=True)
        write_json(receipts/'created.json',created);write_json(receipts/'before.json',before)
        check=compare(self.spec,before);write_json(receipts/'mount-comparison.json',check)
        control=None
        if not check['issues']:
            code='''import time,json
from pathlib import Path
root=Path('/proc')/str(PID)/'root/work';start=time.monotonic()
(Path(FIXTURE)/'go').write_text('release')
while not (root/'exit').exists() and time.monotonic()-start<3:time.sleep(0.025)
if not (root/'exit').exists():print(json.dumps({'timeout':True}))
else:
 data=(root/'observation').read_bytes();assert len(data)<=65536
 print(json.dumps({'timeout':False,'exit_code':int((root/'exit').read_text()),'observation':data.decode()}))
'''.replace('PID',repr(oracle['host_pid'])).replace('FIXTURE',repr(vm_path(fixture)))
            control=json.loads(self.wsl(code,root=True,timeout=6));write_json(receipts/'control.json',control)
            if control['timeout']:
                self.call(self.engine+['kill','--signal=KILL',identity],timeout=3,cleanup=True);raise TimeoutError('smoke control exceeded deadline')
            observation=decode_observation(control['observation'].encode(),request)
            if control['exit_code']!=0 or observation['state']!='OBSERVED':raise ValueError('smoke identity control failed')
        after=self.snapshot(pid,identity);write_json(receipts/'after.json',after)
        stable=before['oracle']['mountinfo']==after['oracle']['mountinfo'] and before['device_metadata']==after['device_metadata']
        if digest(fixture/'arkhe-containment-sentinel')!=sentinel:raise ValueError('input sentinel changed')
        (fixture/'finish').write_text('release');self.call(self.engine+['wait',identity],timeout=3)
        final=self.inspect(identity);write_json(receipts/'exited.json',final);self.remove(identity)
        if digest(self.profile_source)!=self.profile_hash or digest(self.spec_source)!=self.spec_hash:raise ValueError('candidate source changed during smoke')
        self.report['smoke']={'startup':'PASS','effective_cgroups':'PASS','mount_comparison':check,'before_after_mounts_devices_unchanged':stable,'identity_control':'WITHHELD_MOUNT_MISMATCH' if control is None else 'OBSERVED','kernel_filter_capture':before['kernel_filter_capture'],'final_manifest_promoted':False,'compiled_filter_evidence_bound':False}
        self.report['trial']['vectors'].append({'vector_id':'identity','container_id':identity,'verdict':'FAIL' if check['issues'] or not stable else 'UNASSESSED','profile':'arkhe-unified-target-128m/candidate-smoke','cleanup_confirmed':True,'policy':policy,'note':'Smoke is incomplete without source/device binding review and loaded-filter evidence; no 22-vector approval.'})

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);p.add_argument('--machine',default='arkhe-containment');p.add_argument('--image',default=IMAGE);a=p.parse_args()
    if not re.fullmatch(r'arkhe-containment(?:-[a-z0-9]+)?',a.machine):raise ValueError('dedicated machine required')
    provision(a.machine)
    return SmokeTrial(a.output,a.machine,a.image).run()
if __name__=='__main__':raise SystemExit(main())
