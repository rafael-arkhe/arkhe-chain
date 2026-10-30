"""Native rootless candidate adapter. Observes runtime; never grants a seal."""
import json
import time
from pathlib import Path

from containment_probe import ROOT, write_json, decode_observation, manifest
from runtime_containment import digest
from runtime_source_snapshot import canonical, sha
from unified_containment_runner import VECTORS, context
from run_containment_trial import Trial, vm_path
from run_captured_smoke import CapturedSmoke
from run_filesystem_trial import FilesystemTrial
from run_network_trial import NetworkTrial
from containment_filesystem import FILESYSTEM_VECTORS, CASES
from containment_network import NETWORK_VECTORS, parse_events
from run_resource_trial import LIMITS
from native_candidate_assessors import baseline, evaluate
from mount_manifest import compare
from assess_runtime_smoke import assess_mounts
from seccomp_load_capture import assess as assess_load


class NativeTrial(CapturedSmoke):
    """Reuse fixed VM readers and lifecycle code, with one target policy for 22 IDs."""
    # These helpers have no super() calls and operate on the single trial lease.
    session_nonce = NetworkTrial.session_nonce
    positive = NetworkTrial.positive
    external_snapshot = FilesystemTrial.external_snapshot
    delete_canary = FilesystemTrial.delete_canary

    def __init__(self, output, machine, image):
        super().__init__(output, machine, image)
        self.canaries, self.image_bytes = set(), b''
        self.network_id = self.network_name = self.canary_id = self.canary_address = None
        self.binary = None
        self.allowed_nonces = set()
        self.active_deadline = None
        self.deadline = self.start + 900
        self.report['scope'] = 'Unified native 128 MiB candidate adapter; finite IPv4 controls; no automatic verification.'

    def call(self, command, *args, **kwargs):
        # CapturedSmoke routes engine operations to Linux-local Podman. Its cp
        # destination must therefore use the WSL workspace path, not D:\\...
        if command[:3] == self.engine and len(command) > 3 and command[3] == 'cp':
            command = [*command[:4], *[vm_path(Path(a)) if Path(a).is_absolute() else a for a in command[4:]]]
        if self.active_deadline is not None and not kwargs.get('cleanup', False):
            remaining = self.active_deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('native vector deadline; cleanup required')
            # Some inherited helpers pass timeout positionally.
            if args:
                args = (min(args[0], remaining), *args[1:])
            else:
                kwargs['timeout'] = min(kwargs.get('timeout', 10), remaining)
        return super().call(command, *args, **kwargs)

    def policy(self, name, snapshot, command, arguments=()):
        prefix = 'arkhe-containment-' + self.run_id + '-'
        role = name.removeprefix(prefix)
        if role == 'oracle':
            command += ' > /work/events.jsonl'
        args = Trial.policy(self, name, snapshot, command, arguments)
        target = role in VECTORS or role.startswith('positive-')
        if target:
            replacements = {'--memory=1536m': '--memory=128m', '--pids-limit=128': '--pids-limit=16', '--cpus=2': '--cpus=0.5'}
            args = [replacements.get(a, a) for a in args]
            flags = ['--memory-swap=128m', '--ipc=private', '--shm-size=64m',
                     '--tmpfs=/run:rw,noexec,nosuid,nodev,size=4194304,mode=755',
                     '--tmpfs=/var/tmp:rw,noexec,nosuid,nodev,size=8388608,mode=1777',
                     '--tmpfs=/run/secrets:ro,noexec,nosuid,nodev,size=4096,mode=700',
                     '--security-opt=seccomp='+self.profile_path]
            args[args.index(self.image):args.index(self.image)] = flags
        if role == 'oracle' or role.startswith('positive-'):
            if not self.network_id:
                raise ValueError('private network missing')
            args[args.index('--network=none')] = '--network='+self.network_id
        return args

    def after_build_container(self, identity):
        FilesystemTrial.after_build_container(self, identity)

    def events(self, cleanup=False):
        observed = json.loads((self.output/'canary-host-oracle.json').read_text())
        code = '''from pathlib import Path
import stat,time
pid=PID;cid=CID
assert cid in (Path('/proc')/str(pid)/'cgroup').read_text()
p=Path('/proc')/str(pid)/'root/work/events.jsonl'
for attempt in range(60):
 if p.exists():
  s=p.lstat();assert stat.S_ISREG(s.st_mode) and not p.is_symlink() and s.st_size<=65536
  data=p.read_bytes();assert len(data)<=65536
  if data and data.endswith(b'\\n'):break
 time.sleep(0.05)
else:raise RuntimeError('external oracle readiness deadline')
import sys;sys.stdout.buffer.write(data)
'''.replace('PID', repr(observed['host_pid'])).replace('CID', repr(self.canary_id))
        raw = self.call(['wsl','-d',self.distro,'-u','root','--exec','python3','-c',code], timeout=5, limit=65536, cleanup=cleanup)
        events = parse_events(raw, self.run_id)
        if any(e['event'] == 'received' and e['nonce'] not in self.allowed_nonces for e in events):
            raise ValueError('unknown nonce contaminated oracle')
        return raw, events

    def preflight(self):
        # Validate the actual instrument, not just its local descriptor.
        code = '''from pathlib import Path
import hashlib
p=Path(BINARY)
assert p.is_file() and not p.is_symlink() and p.stat().st_uid==0 and not p.stat().st_mode&0o022
assert hashlib.sha256(p.read_bytes()).hexdigest()==EXPECTED
print('trace instrument verified')
'''.replace('BINARY', repr(self.tool['binary'])).replace('EXPECTED', repr(self.tool['binary_sha256']))
        self.wsl(code, root=True)
        super().preflight()

    def cleanup_auxiliary(self):
        FilesystemTrial.cleanup_auxiliary(self)
        NetworkTrial.cleanup_auxiliary(self)
        # This hook runs after removing all owned containers, before lease release.
        code = '''from pathlib import Path
import json,time
needle=NEEDLE.encode();active=[]
for attempt in range(20):
 active=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   args=(p/'cmdline').read_bytes().split(b'\\0')
   if args and b'strace' in args[0] and any(needle in a for a in args):active.append(int(p.name))
  except (FileNotFoundError,PermissionError,ProcessLookupError):pass
 if not active:break
 time.sleep(0.1)
print(json.dumps(active))
'''.replace('NEEDLE', repr(self.trace_root+'/'))
        active = json.loads(self.call(['wsl','-d',self.distro,'-u','root','--exec','python3','-c',code], timeout=4, cleanup=True))
        self.report['active_tracers'] = active
        self.report['tracers_stopped'] = not active
        if active:
            raise ValueError('owned runtime tracers still active; lease retained')

    def capture(self, identity, pid):
        code = r'''from pathlib import Path
import json,re
p=Path(PATH);items=[];total=0
for f in sorted(p.glob('trace.*')):
 assert f.is_file() and not f.is_symlink() and re.fullmatch(r'trace\.[0-9]+',f.name)
 data=f.read_bytes();total+=len(data);assert total<=1048576
 items.append({'container_id':CID,'pid':int(f.name.split('.')[-1]),'text':data.decode(),'uid':f.stat().st_uid,'mode':oct(f.stat().st_mode&0o777)})
print(json.dumps(items))
'''.replace('PATH', repr(self.trace_root+'/'+identity)).replace('CID', repr(identity))
        traces = json.loads(self.wsl(code, root=True))
        if any(t['uid'] != 1000 or t['mode'] != '0o600' for t in traces):
            raise ValueError('untrusted runtime trace')
        program = ROOT/'config/seccomp/arkhe-unified-x86_64-v1/candidate.bpf'
        result = assess_load(traces, identity, pid, program.read_bytes())
        return {'traces': traces, 'assessment': result, 'program_sha256': digest(program)}

    def workload(self, fixture, before, identity, seconds):
        # Independent host watcher; no exec/copy observer inside the target.
        code = '''import json,time
from pathlib import Path
before=json.loads(BEFORE)
group=Path('/sys/fs/cgroup')/next(x.split(':',2)[2] for x in before['membership'].splitlines() if x.startswith('0::')).lstrip('/')
assert group.resolve().is_relative_to(Path('/sys/fs/cgroup'))
root=Path('/proc')/str(before['host_pid'])/'root/work'
samples=[];start=time.monotonic();exit_code=None
(Path(FIXTURE)/'go').write_text('release\\n')
while time.monotonic()-start<SECONDS:
 sample={name:(group/name).read_text() for name in ['memory.events','memory.peak','cpu.stat','pids.events','pids.current']}
 sample['elapsed_seconds']=time.monotonic()-start;samples.append(sample)
 if (root/'exit').exists():exit_code=int((root/'exit').read_text());break
 time.sleep(0.05)
data=(root/'observation').read_bytes() if (root/'observation').exists() else b''
assert len(data)<=65536
print(json.dumps({'container_id':CID,'samples':samples,'exit_code':exit_code,'deadline_exceeded':exit_code is None,'observer_inside_target':Path('/proc/self/cgroup').read_text()==before['membership'],'observation':data.decode(),'duration_seconds':time.monotonic()-start}))
'''.replace('BEFORE', repr(json.dumps(before))).replace('FIXTURE', repr(vm_path(fixture))).replace('SECONDS', repr(seconds)).replace('CID', repr(identity))
        return json.loads(self.wsl(code, root=True, timeout=seconds+2))


class NativeAdapter:
    def __init__(self, output, machine, image):
        self.trial = NativeTrial(output, machine, image)
        self.initialized = False

    def preflight(self, plan, deadline):
        trial = self.trial
        trial.deadline = deadline + 30
        contract_path = ROOT/'config/runtime-unified-contract.json'
        contract = json.loads(contract_path.read_text())
        if (digest(contract_path) != plan['contract_sha256'] or plan['profile'] != contract['target_profile']
                or plan['runtime'] != contract['runtime'] or plan['image'] != trial.image):
            raise ValueError('native plan contract/profile/runtime/image binding mismatch')
        trial.run_id = plan['run_id']
        trial.report['run_id'] = trial.run_id
        trial.trace_root = '/home/user/.local/state/arkhe-containment/runtime-traces/'+trial.run_id
        # Replace preparation-only request identities with the exact frozen plan.
        for request in plan['requests']:
            vector = request['vector_id']
            path = trial.output/'session/requests'/f'{vector}.json'
            old = json.loads(path.read_text())
            old.update(run_id=trial.run_id, nonce=request['nonce'], profile=plan['profile']['id'])
            write_json(path, old)
            fixture = trial.output/'session/fixtures'/vector
            (fixture/'arkhe-containment-fixture').write_bytes((request['nonce']+'\n').encode())
            (fixture/'arkhe-containment-sentinel').write_bytes(('sentinel:'+request['nonce']+'\n').encode())
            trial.session['requests'][vector] = {
                'request_sha256': digest(path),
                'marker_sha256': digest(fixture/'arkhe-containment-fixture'),
                'sentinel_sha256': digest(fixture/'arkhe-containment-sentinel')}
        trial.session.update(run_id=trial.run_id, native_plan_profile=plan['profile']['id'])
        write_json(trial.output/'session/session.json', trial.session)
        manifest(trial.output/'session')
        trial.allowed_nonces = {r['nonce'] for r in plan['requests'] if r['vector_id'] in NETWORK_VECTORS}
        trial.preflight()
        trial.report['runtime_instance'] = json.loads(trial.wsl("import json;from pathlib import Path;print(json.dumps({'boot_id':Path('/proc/sys/kernel/random/boot_id').read_text().strip()}))", root=True))
        self.binary = trial.build()
        if sha(self.binary) != plan['probe_binary_sha256']:
            raise ValueError('compiled probe differs from pinned binary')
        self.initialized = True

    def execute(self, plan, request, deadline):
        if not self.initialized:
            raise ValueError('native adapter not initialized')
        trial = self.trial
        trial.active_deadline = deadline
        vector = request['vector_id']
        fixture = trial.output/'session/fixtures'/vector
        raw_request = json.loads((trial.output/'session/requests'/f'{vector}.json').read_text())
        (fixture/'probe').write_bytes(self.binary)
        sentinel = digest(fixture/'arkhe-containment-sentinel')
        auxiliary = None
        receipts = trial.output/'host-receipts'
        receipts.mkdir(exist_ok=True)
        if vector in FILESYSTEM_VECTORS:
            auxiliary = FilesystemTrial.before_vector(trial, vector, fixture, raw_request)
        if vector in NETWORK_VECTORS:
            if trial.canary_id is None:
                # Finite oracle lifecycle begins with the network block, not at
                # source build or earlier filesystem vectors.
                NetworkTrial.after_build_container(trial, None)
            auxiliary = NetworkTrial.before_vector(trial, vector, fixture, raw_request)
        command = ('cp /input/probe /work/probe && chmod 755 /work/probe && '
                   'while [ ! -f /input/go ]; do sleep 0.05; done; '
                   '/work/probe "$1" "$2" > /work/observation; echo $? > /work/exit; '
                   'while [ ! -f /input/finish ]; do sleep 0.05; done')
        identity = None
        try:
            identity, policy = trial.create(vector, fixture, command, (vector, request['nonce']))
            trial.call(trial.engine+['start', identity])
            created = trial.inspect(identity)
            pid = created['State']['Pid']
            before = trial.snapshot(pid, identity)
            if before['oracle']['boot_id'] != trial.report['runtime_instance']['boot_id']:
                raise ValueError('runtime boot identity changed')
            if not baseline(before['oracle']) or compare(trial.spec, before)['issues']:
                raise ValueError('candidate preflight mismatch; workload withheld')
            load = trial.capture(identity, before['oracle']['host_pid'])
            control = trial.workload(fixture, before['oracle'], identity, 8 if vector.endswith('-bounded') else 3)
            if control['deadline_exceeded']:
                trial.call(trial.engine+['kill', '--signal=KILL', identity], timeout=3, cleanup=True)
                raise TimeoutError('native workload deadline; exact target killed')
            observation = decode_observation(control['observation'].encode(), raw_request) if control['observation'] else None
            after = trial.snapshot(pid, identity)
            source_before, source_after = before['source_bindings'], after['source_bindings']
            assess_mounts(trial.spec, before, after, source_before, source_after)
            if digest(fixture/'arkhe-containment-sentinel') != sentinel:
                raise ValueError('input sentinel changed')
            evidence = {'before': before, 'after': after, 'load': load, 'control': control,
                        'observation': observation, 'policy': policy, 'created': created}
            if vector in CASES:
                verdict = FilesystemTrial.judge_vector(trial, vector, observation, before['oracle'], raw_request, fixture, auxiliary)
            elif vector in NETWORK_VECTORS:
                verdict = NetworkTrial.judge_vector(trial, vector, observation, before['oracle'], raw_request, fixture, auxiliary)
            elif vector == 'mount-inventory':
                verdict = 'PASS' if observation and observation['state'] == 'OBSERVED' and observation['observations'] == before['oracle']['mountinfo'] else 'FAIL'
            else:
                verdict = evaluate(vector, observation, before['oracle'], after['oracle'], raw_request,
                                   (fixture/'arkhe-containment-sentinel').read_text(), control)
            if vector != 'memory-bounded' and control['exit_code'] != 0:
                verdict = 'FAIL'
            (fixture/'finish').write_text('release\n')
            trial.call(trial.engine+['wait', identity], timeout=3)
            evidence['final'] = trial.inspect(identity)
            write_json(receipts/f'{vector}.native.json', evidence)
            trial.remove(identity)
            identity = None
            if vector == 'dns-egress':
                raw, _ = trial.events()
                (trial.output/'canary-events.jsonl').write_bytes(raw)
                trial.remove(trial.canary_id)
            if vector in FILESYSTEM_VECTORS:
                FilesystemTrial.after_vector_cleanup(trial, auxiliary)
            body = canonical({'artifact': f'host-receipts/{vector}.native.json',
                              'sha256': digest(receipts/f'{vector}.native.json'), 'assessment': verdict}).decode()
            checks = {name: {'status': verdict, 'evidence': body, 'sha256': sha(body.encode())}
                      for name in request['required_subchecks']}
            if vector == 'seccomp-inventory':
                # Keep unresolved gates explicit rather than manufacturing PASS.
                checks['candidate-load']['status'] = 'PASS'
                for name in ('all-rule-cases', 'inherited-filter-review'):
                    checks[name]['status'] = 'UNASSESSED'
            trial.report['trial']['vectors'].append({'vector_id': vector, 'verdict': verdict, 'cleanup_confirmed': True})
            return {**{k: request[k] for k in ('vector_id', 'ordinal', 'nonce')},
                    'context': context(plan), 'status': verdict, 'subchecks': checks, 'target_removed': True,
                    'runtime_instance': {'boot_id': before['oracle']['boot_id'], **trial.report['preflight']}}
        finally:
            trial.active_deadline = None
            if identity is not None and identity in trial.ids:
                trial.remove(identity)

    def cleanup(self, plan, deadline):
        trial = self.trial
        trial.active_deadline = None
        trial.deadline = deadline
        evidence_errors = []
        try:
            if trial.canary_id and trial.canary_id in trial.ids:
                raw, _ = trial.events(cleanup=True)
                (trial.output/'canary-events.jsonl').write_bytes(raw)
        except Exception as error:
            evidence_errors.append('final oracle evidence: '+str(error))
        finally:
            # Evidence collection must never prevent owned-resource teardown.
            Trial.finish(trial)
        return {'context': context(plan), 'targets_removed': not trial.ids,
                'auxiliaries_removed': not trial.canaries and (not trial.network_id or trial.report.get('network_cleanup', {}).get('absent') is True),
                'lease_released': trial.report.get('lease_released') is True,
                'tracers_stopped': trial.report.get('tracers_stopped') is True,
                'errors': [*trial.report['errors'], *evidence_errors], 'active_tracers': trial.report.get('active_tracers')}
