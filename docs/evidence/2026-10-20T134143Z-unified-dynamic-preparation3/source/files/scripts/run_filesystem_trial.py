"""Bounded filesystem trial with independent VM and host fixture checks."""
import argparse
import hashlib
import json
from pathlib import Path

from containment_probe import write_json
from containment_filesystem import FILESYSTEM_VECTORS, CASES, snapshot, evaluate
from run_containment_trial import Trial, IMAGE
from runtime_containment import digest


class FilesystemTrial(Trial):
    def __init__(self, output, machine, image):
        super().__init__(output, machine, image, FILESYSTEM_VECTORS)
        self.canaries = set()
        self.image_bytes = b''
        self.report['scope'] = 'Filesystem controls and denials on rootless Podman/WSL2 only; no egress, syscall-filter or resource stress certification.'
        self.report['trial']['profile'] = 'filesystem-v1'

    def after_build_container(self, identity):
        destination = self.output / 'image-read-reference'
        self.call(self.engine + ['cp', identity + ':/etc/debian_version', str(destination)])
        self.image_bytes = destination.read_bytes()
        if not self.image_bytes or len(self.image_bytes) > 256:
            raise ValueError('image read reference exceeds declared budget')
        self.report['build']['image_reference_sha256'] = digest(destination)

    def external_snapshot(self, nonce, create=False):
        # Fixed VM-native suite fixture path; never accepts a caller-supplied path.
        code = '''from pathlib import Path
import hashlib,json,stat,os
nonce=NONCE
assert len(nonce)==64 and all(c in '0123456789abcdef' for c in nonce)
p=Path.home()/'.local/state/arkhe-containment/fixtures'/nonce
if CREATE:
 p.mkdir(parents=True,exist_ok=False);p.chmod(0o755)
 (p/'sentinel').write_bytes(('outside:'+nonce+'\\n').encode());(p/'sentinel').chmod(0o666)
f=p/'sentinel';s=f.lstat()
assert stat.S_ISREG(s.st_mode) and not f.is_symlink() and s.st_size<=256
print(json.dumps({'path':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),
 'inode':s.st_ino,'mode':s.st_mode,'size':s.st_size,'mtime_ns':s.st_mtime_ns,
 'entries':sorted(x.name for x in p.iterdir())}))
'''.replace('NONCE', repr(nonce)).replace('CREATE', repr(create))
        return json.loads(self.wsl(code))

    def before_vector(self, vector, fixture, request):
        nonce = request['nonce']
        self.canaries.add(nonce)
        external = self.external_snapshot(nonce, create=True)
        return {'nonce': nonce, 'input_before': snapshot(fixture), 'external_before': external}

    def judge_vector(self, vector, observation, oracle, request, fixture, context):
        after = snapshot(fixture)
        external_after = self.external_snapshot(context['nonce'])
        receipts = self.output/'host-receipts'
        evidence = {**context, 'input_after': after, 'external_after': external_after,
                    'source': 'host file metadata/hash plus VM-native sentinel, never probe-provided'}
        write_json(receipts/(vector+'.filesystem.json'), evidence)
        same_input = {k:v for k,v in after.items() if k!='go'} == context['input_before']
        same_external = context['external_before'] == external_after
        if not same_input or not same_external:
            return 'FAIL'
        if vector not in CASES:
            return super().judge_vector(vector,observation,oracle,request,fixture,context)
        request = {**request, 'sentinel_bytes': (fixture/'arkhe-containment-sentinel').read_bytes()}
        return evaluate(vector, observation, oracle, request, context['input_before'], after,
                        context['external_before'], external_after, self.image_bytes)

    def after_vector_cleanup(self, context):
        self.delete_canary(context['nonce'])

    def delete_canary(self, nonce):
        code = '''from pathlib import Path
import json,stat
nonce=NONCE
assert len(nonce)==64 and all(c in '0123456789abcdef' for c in nonce)
p=Path.home()/'.local/state/arkhe-containment/fixtures'/nonce
assert sorted(x.name for x in p.iterdir())==['sentinel']
f=p/'sentinel';assert stat.S_ISREG(f.lstat().st_mode) and not f.is_symlink()
f.unlink();p.rmdir();print('owned canary removed')
'''.replace('NONCE',repr(nonce))
        self.call(['wsl','-d',self.distro,'-u','user','--exec','python3','-c',code],cleanup=True)
        self.canaries.remove(nonce)
        self.report.setdefault('canary_cleanup',[]).append({'nonce':nonce,'absent':True})

    def cleanup_auxiliary(self):
        for nonce in list(self.canaries):
            self.delete_canary(nonce)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--machine',default='arkhe-containment')
    parser.add_argument('--image',default=IMAGE)
    args=parser.parse_args()
    return FilesystemTrial(args.output,args.machine,args.image).run()


if __name__=='__main__':
    raise SystemExit(main())
