"""Harmless syscall controls and an explicitly pinned, distinct seccomp test profile."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from containment_probe import ROOT, write_json, manifest, no_duplicates, reject_constant
from run_containment_trial import Trial, IMAGE, vm_path, bounded
from runtime_containment import digest

VECTORS=['subprocess-control','ffi-control','mount-capability','seccomp-inventory']
PINNED_PROFILE='arkhe-seccomp-getppid-x86_64/v1'

def pin_profile(baseline):
    policy=json.loads(json.dumps(baseline))
    if policy.get('defaultAction')!='SCMP_ACT_ERRNO':
        raise ValueError('expected deny-by-default baseline')
    rules=[]
    for rule in policy['syscalls']:
        rule['names']=[name for name in rule['names'] if name!='getppid']
        if rule['names']:rules.append(rule)
    rules.append({'names':['getppid'],'action':'SCMP_ACT_ERRNO','errnoRet':133})
    policy['syscalls']=rules
    return policy

def body(observation):
    return json.loads(observation['observations'],object_pairs_hook=no_duplicates,parse_constant=reject_constant)

def assess_syscall(vector, observation, oracle, pinned=None, positive=False):
    if observation['state']!='OBSERVED':return 'ERROR'
    fields=dict(line.split(':',1) for line in oracle['status'].splitlines() if ':' in line)
    if fields.get('NoNewPrivs','').strip()!='1' or fields.get('CapEff','').strip()!='0000000000000000' or fields.get('Seccomp','').strip()!='2':return 'FAIL'
    if vector=='subprocess-control':return 'PASS' if observation['observations']=='child_exit=Some(0)' else 'FAIL'
    data=body(observation)
    if vector=='mount-capability':return 'PASS' if data=={'mount_result':-1,'mount_errno':1} else 'FAIL'
    identity=data.get('arch')=='x86_64' and all(type(data.get(k)) is int and data[k]==1 for k in ['rust_pid','libc_pid','raw_pid'])
    if not identity:return 'FAIL'
    if vector=='ffi-control':return 'PASS' if type(data.get('getppid')) is int and data['getppid']>=0 and data.get('getppid_errno')==0 else 'FAIL'
    if not positive or not pinned or not pinned.get('hash_verified') or not pinned.get('explicit_oci_profile') or pinned.get('profile')!=PINNED_PROFILE:return 'ERROR'
    return 'PASS' if data.get('getppid')==-1 and data.get('getppid_errno')==133 else 'FAIL'

class SyscallTrial(Trial):
    def __init__(self,output,machine,image,baseline):
        super().__init__(output,machine,image,VECTORS)
        self.baseline=baseline;self.pinned=pin_profile(baseline)
        write_json(self.output/'seccomp-baseline.json',baseline)
        write_json(self.output/'seccomp-pinned.json',self.pinned)
        self.profile_sha=digest(self.output/'seccomp-pinned.json')
        self.profile_path='/opt/arkhe-containment/seccomp-'+self.profile_sha+'.json'
        self.positive=False
        self.report['scope']='Subprocess/FFI allowed and mount denied on build-current; one paired getppid syscall denied by a separate explicit x86_64 seccomp profile. No full-table verification or default-profile approval.'
        self.report['seccomp_test_profile']={'id':PINNED_PROFILE,'sha256':self.profile_sha,'baseline_sha256':digest(self.output/'seccomp-baseline.json'),'denied_syscall':'getppid','errno':133,'runtime_verified':False}
    def preflight(self):
        super().preflight()
        if self.report['preflight']['arch'] not in ('amd64','x86_64'):raise ValueError('unsupported syscall architecture')
        source=vm_path(self.output/'seccomp-pinned.json')
        code='''from pathlib import Path
import hashlib,os
source=Path(SOURCE);target=Path(TARGET)
assert hashlib.sha256(source.read_bytes()).hexdigest()==EXPECTED
if target.exists():assert target.stat().st_uid==0 and hashlib.sha256(target.read_bytes()).hexdigest()==EXPECTED
else:target.write_bytes(source.read_bytes());os.chmod(target,0o444)
assert target.stat().st_uid==0 and not target.stat().st_mode & 0o222
print('pinned')
'''.replace('SOURCE',repr(source)).replace('TARGET',repr(self.profile_path)).replace('EXPECTED',repr(self.profile_sha))
        self.wsl(code,root=True)
    def policy(self,name,snapshot,command,arguments=()):
        args=super().policy(name,snapshot,command,arguments)
        if name.endswith('-seccomp-inventory'):
            args.insert(args.index(self.image),'--security-opt=seccomp='+self.profile_path)
        return args
    def before_vector(self,vector,fixture,request):
        if vector=='seccomp-inventory':(fixture/'seccomp-active').write_text(self.profile_sha)
        return None
    def judge_vector(self,vector,observation,oracle,request,fixture,context):
        pinned=None
        if vector=='seccomp-inventory':
            created=json.loads((self.output/'host-receipts'/f'{vector}.created.json').read_text())
            code='''from pathlib import Path
import hashlib,json
p=Path(PROFILE)
print(json.dumps({'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'uid':p.stat().st_uid,'mode':p.stat().st_mode}))
'''.replace('PROFILE',repr(self.profile_path))
            current=json.loads(self.wsl(code,root=True))
            pinned={'profile':PINNED_PROFILE,'hash_verified':current['sha256']==self.profile_sha and current['uid']==0 and not current['mode']&0o222,'explicit_oci_profile':any(s=='seccomp='+self.profile_path for s in created['HostConfig']['SecurityOpt']),'host_file':current}
            write_json(self.output/'host-receipts'/f'{vector}.pinned.json',pinned)
        verdict=assess_syscall(vector,observation,oracle,pinned,self.positive)
        if vector=='ffi-control':self.positive=verdict=='PASS'
        return verdict
    def vector(self,vector,binary):
        super().vector(vector,binary)
        self.report['trial']['vectors'][-1]['profile']=PINNED_PROFILE if vector=='seccomp-inventory' else 'build-current'

def provision(machine):
    code='''import os,json
from pathlib import Path
r=Path('/sys/fs/cgroup');(r/'cgroup.subtree_control').write_text('+cpu +memory +pids')
p=r/'arkhe-sandbox';p.mkdir(exist_ok=True);(p/'cgroup.subtree_control').write_text('+cpu +memory +pids')
for f in [r/'cgroup.procs',p,p/'cgroup.procs',p/'cgroup.subtree_control']:os.chown(f,1000,1000)
print((Path('/usr/share/containers/seccomp.json')).read_text())
'''
    code,out,err=bounded(['wsl','-d','podman-'+machine,'-u','root','--exec','python3','-c',code],10)
    if code:raise RuntimeError(err.decode(errors='replace'))
    return json.loads(out)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);p.add_argument('--machine',default='arkhe-containment');p.add_argument('--image',default=IMAGE)
    a=p.parse_args()
    # Reject a non-dedicated machine before any provisioning.
    import re
    if not re.fullmatch(r'arkhe-containment(?:-[a-z0-9]+)?',a.machine):raise ValueError('dedicated machine required')
    baseline=provision(a.machine)
    return SyscallTrial(a.output,a.machine,a.image,baseline).run()
if __name__=='__main__':raise SystemExit(main())
