"""Instrument only this smoke's crun target; capture load-call arguments and return."""
import argparse,hashlib,json,re
from pathlib import Path
from run_unified_smoke import SmokeTrial
from run_containment_trial import IMAGE
from run_syscall_trial import provision
from containment_probe import ROOT,write_json
from runtime_containment import digest

class CapturedSmoke(SmokeTrial):
    def __init__(self,output,machine,image):
        self.wrapper=None
        super().__init__(output,machine,image)
        self.tool=json.loads((ROOT/'ops/local/containment-vm/strace-tool.json').read_text())
        self.trace_root='/home/user/.local/state/arkhe-containment/runtime-traces/'+self.run_id
    def call(self,command,*args,**kwargs):
        if self.wrapper and command[:3]==['podman','--connection',self.machine]:
            tail=command[3:]
            runtime='/usr/sbin/crun' if '--name' in tail and tail[tail.index('--name')+1].endswith('-build') else self.wrapper
            command=['wsl','-d',self.distro,'-u','user','--exec','env','XDG_RUNTIME_DIR=/run/user/1000','podman','--remote=false','--runtime='+runtime,*tail]
        return super().call(command,*args,**kwargs)
    def preflight(self):
        super().preflight()
        source=self.output/'crun-capture.py'
        source.write_text('''#!/usr/bin/python3
import os,sys,re
from pathlib import Path
args=sys.argv[1:]
if 'create' not in args and 'run' not in args:os.execv('/usr/sbin/crun',['/usr/sbin/crun',*args])
container=args[-1]
if not re.fullmatch('[0-9a-f]{64}',container):raise SystemExit('invalid suite container ID')
os.umask(0o077)
p=Path(TRACE)/container;p.mkdir(parents=True,exist_ok=False)
os.execv(STRACE,[STRACE,'--daemonize=grandchild','-ff','-ttt','-v','-s','65535','-X','raw','-e','trace=seccomp,prctl','-o',str(p/'trace'),'/usr/sbin/crun',*args])
'''.replace('TRACE',repr(self.trace_root)).replace('STRACE',repr(self.tool['binary'])),encoding='utf-8')
        self.wrapper=self.stage(source,'arkhe-crun-capture',0o555)
        # Local Podman uses the same dedicated rootless storage; no global runtime setting changes.
        local=json.loads(self.call(self.engine+['info','--format','json']))
        if not local['host']['security']['rootless'] or local['store']['graphRoot']!='/home/user/.local/share/containers/storage':raise ValueError('local dedicated engine storage identity mismatch')
        write_json(self.output/'capture-tool.json',self.tool)
        self.report['capture_runtime']={'wrapper':self.wrapper,'wrapper_sha256':digest(source),'tool':self.tool,'log_root':self.trace_root,'default_runtime_changed':False,'kernel_dump_after_load':False,'method':'trace actual crun load-call arguments and result, not PTRACE_SECCOMP_GET_FILTER'}
    def vector(self,vector,binary):
        super().vector(vector,binary)
        code='''from pathlib import Path
import json,re
root=Path(ROOT)
result=[];total=0
for p in sorted(root.glob('*/trace.*')):
 assert p.is_file() and not p.is_symlink()
 assert re.fullmatch('[0-9a-f]{64}',p.parent.name) and re.fullmatch('trace.[0-9]+',p.name)
 data=p.read_bytes();total+=len(data);assert total<=1048576
 result.append({'container_id':p.parent.name,'pid':int(p.name.split('.')[-1]),'text':data.decode(),'uid':p.stat().st_uid,'mode':oct(p.stat().st_mode & 0o777)})
print(json.dumps(result))
'''.replace('ROOT',repr(self.trace_root))
        traces=json.loads(self.wsl(code,root=True,timeout=10));write_json(self.output/'runtime-traces.json',traces)
        self.report['runtime_trace_files']=len(traces)
        self.report['capture_runtime']['load_capture_assessed']=False

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--machine',default='arkhe-containment');p.add_argument('--image',default=IMAGE);a=p.parse_args()
    if not re.fullmatch(r'arkhe-containment(?:-[a-z0-9]+)?',a.machine):raise ValueError('dedicated machine required')
    provision(a.machine)
    return CapturedSmoke(a.output,a.machine,a.image).run()
if __name__=='__main__':raise SystemExit(main())
