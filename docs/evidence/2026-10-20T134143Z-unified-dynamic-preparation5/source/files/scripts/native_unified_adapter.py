"""Native rootless candidate adapter. Observes runtime; never grants a seal."""
import json
import shutil
import time
import secrets
from pathlib import Path

from containment_probe import ROOT, write_json, decode_observation, manifest
from runtime_containment import digest
from runtime_source_snapshot import canonical, sha
from unified_containment_runner import VECTORS, context
from run_containment_trial import Trial, vm_path, bounded
from run_captured_smoke import CapturedSmoke
from run_filesystem_trial import FilesystemTrial
from run_network_trial import NetworkTrial
from containment_filesystem import FILESYSTEM_VECTORS, CASES
from containment_network import NETWORK_VECTORS, parse_events, positive_response
from run_resource_trial import LIMITS
from native_candidate_assessors import baseline, control_baseline, evaluate, seccomp_dynamic
from mount_manifest import compare
from assess_runtime_smoke import assess_mounts
from seccomp_load_capture import assess as assess_load


def parse_dynamic_cases(text):
    cases = []
    for line in text.splitlines():
        if not line:
            continue
        fields = line.split('|')
        if len(fields) != 13:
            raise ValueError('dynamic seccomp case arity mismatch')
        cases.append({'id': fields[0], 'rule_id': fields[1], 'number': int(fields[2]),
                      'expected': fields[3], 'errno': int(fields[4]),
                      'operands': [int(value) for value in fields[5:11]],
                      'handling': fields[11], 'variant': fields[12]})
    return cases


class NativeTrial(CapturedSmoke):
    """Reuse fixed VM readers and lifecycle code, with one target policy for 22 IDs."""
    # These helpers have no super() calls and operate on the single trial lease.
    session_nonce = NetworkTrial.session_nonce
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
            if 'exec /work/canary "$1"' not in command:raise ValueError('unexpected oracle entrypoint')
            command = command.replace('exec /work/canary "$1"','exec /work/canary "$1" "$2"')
            command += ' > /work/events.jsonl'
            arguments = (*arguments, '900')
        args = Trial.policy(self, name, snapshot, command, arguments)
        target = role in VECTORS or role.startswith('positive-') or role == 'seccomp-control'
        if target:
            replacements = {'--memory=1536m': '--memory=128m', '--pids-limit=128': '--pids-limit=16', '--cpus=2': '--cpus=0.5'}
            args = [replacements.get(a, a) for a in args]
            flags = ['--memory-swap=128m', '--ipc=private', '--shm-size=64m',
                     '--tmpfs=/run:rw,noexec,nosuid,nodev,size=4194304,mode=755',
                     '--tmpfs=/var/tmp:rw,noexec,nosuid,nodev,size=8388608,mode=1777',
                     '--tmpfs=/run/secrets:ro,noexec,nosuid,nodev,size=4096,mode=700',
                     '--security-opt=seccomp='+self.profile_path]
            args[args.index(self.image):args.index(self.image)] = flags
        if role == 'seccomp-control':
            index = next(i for i, a in enumerate(args) if a.startswith('--security-opt=seccomp='))
            args[index] = '--security-opt=seccomp=unconfined'
        if role == 'oracle' or role.startswith('positive-'):
            if not self.network_id:
                raise ValueError('private network missing')
            args[args.index('--network=none')] = '--network='+self.network_id
        return args

    def positive(self, vector, phase):
        nonce = secrets.token_hex(32)
        self.allowed_nonces.add(nonce)
        fixture = self.output/'positive-input'/f'{vector}-{phase}'
        fixture.mkdir(parents=True)
        (fixture/'probe').write_bytes(self.binary)
        (fixture/'arkhe-containment-fixture').write_bytes((nonce+'\n').encode())
        (fixture/'network-endpoint').write_bytes((self.canary_address+'\n').encode())
        command = ('cp /input/probe /work/probe && chmod 755 /work/probe && '
                   'while [ ! -f /input/go ]; do sleep 0.05; done; '
                   '/work/probe "$1" "$2" > /work/observation; echo $? > /work/exit; '
                   'while [ ! -f /input/finish ]; do sleep 0.05; done')
        identity, policy = self.create('positive-'+vector+'-'+phase, fixture, command, (vector, nonce))
        try:
            self.call(self.engine+['start',identity])
            state = self.inspect(identity)
            if len(state['NetworkSettings']['Networks']) != 1 or state['HostConfig'].get('PortBindings'):
                raise ValueError('positive control network exception escaped its fixture')
            before = json.loads(self.call(['wsl','-d',self.distro,'-u','root','--exec','python3',self.observer,str(state['State']['Pid']),identity]))
            if not baseline(before):raise ValueError('positive candidate hardening mismatch')
            control = self.workload(fixture,before,identity,3)
            if control['deadline_exceeded']:
                self.call(self.engine+['kill','--signal=KILL',identity],timeout=3,cleanup=True)
                raise TimeoutError('positive workload exceeded three seconds')
            observation = decode_observation(control['observation'].encode(),{'protocol':'arkhe-containment-probe/v1','vector_id':vector,'nonce':nonce})
            if control['exit_code'] != 0 or not positive_response(observation,nonce):
                raise ValueError('positive control response mismatch')
            (fixture/'finish').write_text('release\n')
            self.call(self.engine+['wait',identity],timeout=10)
            folder=self.output/'positive-receipts';folder.mkdir(exist_ok=True)
            path=folder/f'{vector}-{phase}.json';path.write_text(control['observation'],encoding='utf-8')
            write_json(folder/f'{vector}-{phase}.host.json',{'before':before,'control':control,'final':self.inspect(identity)})
        finally:
            if identity in self.ids:self.remove(identity)
        return {'nonce':nonce,'response_valid':True,'container_id':identity,'policy':policy,
                'receipt_sha256':digest(path),'network_exception':'positive only; candidate target retains network none'}

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
  s=p.lstat();assert stat.S_ISREG(s.st_mode) and not p.is_symlink() and s.st_size<=1048576
  data=p.read_bytes();assert len(data)<=1048576
  if data and data.endswith(b'\\n'):break
 time.sleep(0.05)
else:raise RuntimeError('external oracle readiness deadline')
import sys;sys.stdout.buffer.write(data)
'''.replace('PID', repr(observed['host_pid'])).replace('CID', repr(self.canary_id))
        raw = self.call(['wsl','-d',self.distro,'-u','root','--exec','python3','-c',code], timeout=5, limit=1048576, cleanup=cleanup)
        events = parse_events(raw, self.run_id, max_bytes=1048576)
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
        self.cleanup_network()
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

    def cleanup_network(self):
        if not self.network_name:return
        # Network control operations have their own transport budget. The
        # legacy 3/5 second CLI deadlines are too short for this WSL transport.
        code, raw, _ = bounded(self.engine+['network','inspect',self.network_name],10,1048576)
        if code != 0:
            exists, _, _ = bounded(self.engine+['network','exists',self.network_name],10,65536)
            if exists != 1:raise ValueError('cannot reconcile owned network')
            self.report['network_cleanup']={'network_id':self.network_id,'absent':True,'already_absent':True}
            return
        net=json.loads(raw)[0]
        if net.get('labels',{}).get('io.arkhe.containment.run') != self.run_id or (self.network_id and net['id'] != self.network_id):
            raise ValueError('refuse cleanup of a foreign network')
        self.call(self.engine+['network','rm',net['id']],timeout=10,cleanup=True)
        exists, _, _ = bounded(self.engine+['network','exists',net['id']],10,65536)
        if exists != 1:raise ValueError('network removal not confirmed')
        self.report['network_cleanup']={'network_id':net['id'],'absent':True}

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

    def dynamic_seccomp(self, request, raw_request, target_observation, load):
        control_fixture = self.output/'session/fixtures/seccomp-control'
        shutil.rmtree(control_fixture, ignore_errors=True)
        control_fixture.mkdir(parents=True)
        (control_fixture/'probe').write_bytes(self.binary)
        (control_fixture/'arkhe-containment-fixture').write_bytes((request['nonce']+'\n').encode())
        cases_path = ROOT/'config/seccomp/arkhe-unified-x86_64-v1/dynamic-cases.txt'
        (control_fixture/'seccomp-cases').write_bytes(cases_path.read_bytes())
        command = ('cp /input/probe /work/probe && chmod 755 /work/probe && '
                   'while [ ! -f /input/go ]; do sleep 0.05; done; '
                   '/work/probe "$1" "$2" > /work/observation; echo $? > /work/exit; '
                   'while [ ! -f /input/finish ]; do sleep 0.05; done')
        control_identity = None
        try:
            control_identity, control_policy = self.create(
                'seccomp-control', control_fixture, command, ('seccomp-inventory', request['nonce']))
            self.call(self.engine+['start', control_identity])
            created = self.inspect(control_identity)
            pid = created['State']['Pid']
            before = self.snapshot(pid, control_identity)
            if not control_baseline(before['oracle']):
                raise ValueError('unconfined control hardening mismatch')
            control = self.workload(control_fixture, before['oracle'], control_identity, 20)
            if control['deadline_exceeded']:
                self.call(self.engine+['kill', '--signal=KILL', control_identity], timeout=3, cleanup=True)
                raise TimeoutError('seccomp control deadline exceeded')
            if control['exit_code'] != 0 or not control['observation']:
                raise ValueError('seccomp control did not observe the case table')
            control_observation = decode_observation(control['observation'].encode(), raw_request)
            (control_fixture/'finish').write_text('release\n')
            self.call(self.engine+['wait', control_identity], timeout=3)
            final = self.inspect(control_identity)
            self.remove(control_identity)
            control_identity = None
        finally:
            if control_identity is not None and control_identity in self.ids:
                self.remove(control_identity)
        target_report = json.loads(target_observation['observations'])
        control_report = json.loads(control_observation['observations'])
        cases = parse_dynamic_cases(cases_path.read_text())
        rules = json.loads((ROOT/'config/seccomp/arkhe-unified-x86_64-v1/rules.json').read_text())['rules']
        program = (ROOT/'config/seccomp/arkhe-unified-x86_64-v1/candidate.bpf').read_bytes()
        assessment = dict(load['assessment'])
        assessment['program_sha256'] = load['program_sha256']
        result = seccomp_dynamic(target_report, control_report, cases, rules, assessment, program)
        receipt = self.output/'host-receipts'/'seccomp-dynamic.json'
        write_json(receipt, {'schema': 1, 'case_file_sha256': digest(cases_path),
                             'target': target_report, 'control': control_report,
                             'control_before': before, 'control_final': final,
                             'control_policy': control_policy, 'result': result,
                             'runtime_verified': False,
                             'scope': 'dynamic argument cases against a paired unconfined control; no seal'})
        return result

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
            if vector == 'seccomp-inventory':
                cases = ROOT/'config/seccomp/arkhe-unified-x86_64-v1/dynamic-cases.txt'
                (fixture/'seccomp-cases').write_bytes(cases.read_bytes())
                trial.session['seccomp_case_file_sha256'] = digest(cases)
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
        dynamic = None
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
            control = trial.workload(fixture, before['oracle'], identity, 20 if vector == 'seccomp-inventory' else 8 if vector.endswith('-bounded') else 3)
            if control['deadline_exceeded']:
                trial.call(trial.engine+['kill', '--signal=KILL', identity], timeout=3, cleanup=True)
                raise TimeoutError('native workload deadline; exact target killed')
            observation = decode_observation(control['observation'].encode(), raw_request) if control['observation'] else None
            if vector == 'seccomp-inventory':
                if observation is None:
                    raise ValueError('seccomp target did not observe the case table')
                dynamic = trial.dynamic_seccomp(request, raw_request, observation, load)
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
            else:
                verdict = evaluate(vector, observation, before['oracle'], after['oracle'], raw_request,
                                   (fixture/'arkhe-containment-sentinel').read_text(), control)
            if vector != 'memory-bounded' and control['exit_code'] != 0:
                verdict = 'FAIL'
            if dynamic is not None:
                verdict = dynamic['status']
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
            if vector == 'seccomp-inventory':
                if dynamic is None:
                    raise ValueError('dynamic seccomp result missing')
                checks = {}
                for name in request['required_subchecks']:
                    key = name.replace('-', '_')
                    body = canonical({'artifact': 'host-receipts/seccomp-dynamic.json',
                                      'sha256': digest(receipts/'seccomp-dynamic.json'),
                                      'subcheck': name, 'result': dynamic[key]}).decode()
                    checks[name] = {'status': dynamic[key]['status'], 'evidence': body,
                                    'sha256': sha(body.encode())}
            else:
                checks = {name: {'status': verdict, 'evidence': body, 'sha256': sha(body.encode())}
                          for name in request['required_subchecks']}
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
