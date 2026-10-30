"""Bounded first observation trial in a dedicated Podman WSL machine; never verifies the full suite."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time

from containment_probe import ROOT, prepare, decode_observation, manifest, write_json
from runtime_containment import digest

IMAGE = 'sha256:1cc4af95eb5e7d6caf30aefda71f4c8f8de78eae425a1d773c5490f5b66c19ab'
VECTORS = ['identity', 'cgroup-enforcement', 'mount-inventory', 'seccomp-inventory',
           'subprocess-control', 'input-read-control']


def vm_path(path):
    path = path.resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError('path leaves workspace')
    drive = path.drive.rstrip(':').lower()
    return '/mnt/' + drive + '/' + '/'.join(path.parts[1:])


def bounded(command, timeout, limit=1048576, input_bytes=None):
    child = subprocess.Popen(command, stdin=subprocess.PIPE if input_bytes is not None else subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    buffers = [bytearray(), bytearray()]
    exceeded = threading.Event()
    def drain(pipe, index):
        while block := pipe.read(4096):
            if len(buffers[index]) + len(block) > limit:
                exceeded.set()
                child.kill()
                break
            buffers[index].extend(block)
    threads = [threading.Thread(target=drain, args=(child.stdout, 0), daemon=True),
               threading.Thread(target=drain, args=(child.stderr, 1), daemon=True)]
    for thread in threads:
        thread.start()
    if input_bytes is not None:
        child.stdin.write(input_bytes)
        child.stdin.close()
    try:
        code = child.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait(timeout=2)
        raise TimeoutError('command deadline exceeded')
    finally:
        for thread, pipe in zip(threads, (child.stdout, child.stderr)):
            thread.join(timeout=2)
            if not thread.is_alive():
                pipe.close()
    if exceeded.is_set() or any(thread.is_alive() for thread in threads):
        raise ValueError('command output exceeded limit or stream did not close')
    return code, bytes(buffers[0]), bytes(buffers[1])


def assess(vector, observation, oracle, sentinel):
    if observation['state'] != 'OBSERVED':
        return observation['state']
    status = oracle['status']
    fields = dict(line.split(':', 1) for line in status.splitlines() if ':' in line)
    if fields.get('NoNewPrivs', '').strip() != '1' or fields.get('CapEff', '').strip() != '0000000000000000':
        return 'FAIL'
    if vector == 'identity':
        # Observer reads the VM-side UID and the user-namespace mapping.
        mapping = [list(map(int, line.split())) for line in oracle['uid_map'].splitlines()]
        expected = next((host + 10001 - inside for inside, host, size in mapping if inside <= 10001 < inside + size), None)
        host_uid = int(fields['Uid'].split()[0])
        return 'PASS' if expected == host_uid and 'Uid:\t10001\t' in observation['observations'] else 'FAIL'
    if vector == 'cgroup-enforcement':
        expected = {'memory.max': '1610612736', 'pids.max': '128', 'cpu.max': '200000 100000'}
        return 'PASS' if all(oracle['cgroup'][k].strip() == value and k + '=' + value in observation['observations']
                             for k, value in expected.items()) else 'FAIL'
    if vector == 'subprocess-control':
        return 'PASS' if observation['observations'] == 'child_exit=Some(0)' else 'FAIL'
    if vector == 'input-read-control':
        return 'PASS' if observation['observations'] == sentinel else 'FAIL'
    return 'UNASSESSED'  # Mount/default-seccomp inventories are not enforcement proofs.


class Trial:
    def __init__(self, output, machine, image, vectors=None):
        if os.name != 'nt' or not re.fullmatch(r'arkhe-containment(?:-[a-z0-9]+)?', machine):
            raise ValueError('this adapter requires an explicitly dedicated Podman WSL machine')
        if not re.fullmatch('sha256:[0-9a-f]{64}', image):
            raise ValueError('immutable image required')
        self.output, self.machine, self.image = output.resolve(), machine, image
        self.engine = ['podman', '--connection', machine]
        self.distro = 'podman-' + machine
        self.vectors = list(vectors or VECTORS)
        self.ids = []
        self.names = []
        self.known_names = set()
        self.commands = []
        self.start = time.monotonic()
        self.deadline = self.start + 180
        self.lease = False
        self.session = prepare(self.output / 'session')
        self.run_id = self.session['run_id']
        self.report = {'schema': 1, 'run_id': self.run_id, 'runtime_verified': False,
            'suite': {'status': 'INCOMPLETE', 'catalog_vectors': 22},
            'trial': {'execution_state': 'INCOMPLETE', 'verdict': 'ERROR', 'vectors': []},
            'machine': machine, 'image': image, 'errors': [], 'cleanup': [],
            'scope': 'Six observations on rootless Podman/WSL2; no stress, egress or escape verification. WSL2 shares its utility-VM kernel across distributions.'}

    def call(self, command, timeout=10, limit=1048576, input_bytes=None, expected=(0,), cleanup=False):
        remaining = self.deadline - time.monotonic() - (0 if cleanup else 15)
        if remaining <= 0:
            raise TimeoutError('global deadline reached; cleanup reserve preserved')
        started = time.monotonic()
        code, out, err = bounded(command, min(timeout, remaining), limit, input_bytes)
        self.commands.append({'command': command, 'exit_code': code,
            'duration_seconds': round(time.monotonic() - started, 4),
            'stdout_sha256': hashlib.sha256(out).hexdigest(),
            'stderr': err.decode('utf-8', errors='replace')[:32768]})
        if code not in expected:
            raise RuntimeError(f'command failed ({code}): ' + err.decode('utf-8', errors='replace')[-2000:])
        return out

    def wsl(self, code, root=False, timeout=10):
        return self.call(['wsl', '-d', self.distro, '-u', 'root' if root else 'user',
                          '--exec', 'python3', '-c', code], timeout)

    def inspect(self, identity):
        return json.loads(self.call(self.engine + ['inspect', identity]))[0]

    def policy(self, name, snapshot, command, arguments=()):
        value = {'image': self.image, 'name': name, 'snapshot': vm_path(snapshot), 'connection': self.machine}
        args = json.loads(self.call(['node', str(ROOT / 'scripts/export_sandbox_policy.mjs')],
                                   input_bytes=json.dumps(value).encode()))
        args[args.index('run')] = 'create'
        image_index = args.index(self.image)
        args[image_index + 1:] = ['-c', command, 'arkhe-containment', *arguments]
        # Label only; no hardening flag is removed or relaxed.
        args[args.index('create') + 1:args.index('create') + 1] = ['--label', 'io.arkhe.containment.run=' + self.run_id]
        return args

    def create(self, role, snapshot, command, arguments=()):
        name = 'arkhe-containment-' + self.run_id + '-' + role
        self.names.append(name)
        args = self.policy(name, snapshot, command, arguments)
        identity = self.call(['podman', *args]).decode().strip()
        if not re.fullmatch('[0-9a-f]{64}', identity):
            raise ValueError('invalid created container identity')
        self.ids.append(identity)
        self.known_names.add(name)
        return identity, args

    def remove(self, identity):
        self.call(self.engine + ['rm', '-f', '--time=0', identity], timeout=8, cleanup=True)
        code, out, err = bounded(self.engine + ['container', 'exists', identity], 3, 65536)
        if code != 1:
            raise RuntimeError('container removal not confirmed')
        self.report['cleanup'].append({'container_id': identity, 'absent': True})
        self.ids.remove(identity)

    def preflight(self):
        info = json.loads(self.call(self.engine + ['info', '--format', 'json']))
        host = info['host']
        if not host['security']['rootless'] or host['cgroupVersion'] != 'v2':
            raise ValueError('rootless/cgroup-v2 precondition failed')
        if host.get('memFree', 0) < 2147483648:
            raise ValueError('insufficient VM memory reserve')
        if json.loads(self.call(self.engine + ['ps', '--all', '--format', 'json'])):
            raise ValueError('dedicated engine is not empty; reconcile before trial')
        inspected = json.loads(self.call(self.engine + ['image', 'inspect', self.image]))[0]
        if inspected['Id'].removeprefix('sha256:') != self.image.removeprefix('sha256:'):
            raise ValueError('image identity mismatched')
        self.report['preflight'] = {'rootless': True, 'kernel': host['kernel'], 'arch': host['arch'],
            'ociRuntime': host['ociRuntime'], 'cgroupVersion': host['cgroupVersion'],
            'engine_version': info['version'], 'memory_free_bytes': host['memFree']}
        lease_code = '''import json,os
from pathlib import Path
p=Path.home()/'.local/state/arkhe-containment/lease'
p.parent.mkdir(parents=True,exist_ok=True)
p.mkdir()
(p/'owner.json').write_text(json.dumps({'run_id':RUN}))
print('leased')'''.replace('RUN', repr(self.run_id))
        self.wsl(lease_code)
        self.lease = True
        source = ROOT / 'scripts/containment_vm_observer.py'
        self.observer = '/opt/arkhe-containment/observer-' + digest(source) + '.py'
        code = '''from pathlib import Path
import shutil,os,hashlib
source=Path(SOURCE);target=Path(TARGET)
assert hashlib.sha256(source.read_bytes()).hexdigest()==EXPECTED
assert not target.exists()
target.parent.mkdir(parents=True,exist_ok=True)
shutil.copyfile(source,target);os.chmod(target,0o500)
print('observer staged')'''.replace('SOURCE', repr(vm_path(source))).replace('TARGET', repr(self.observer)).replace('EXPECTED', repr(digest(source)))
        # A root-owned fixed read-only helper, not a privileged container.
        # Reuse is permitted only when bytes and ownership match.
        code = code.replace('assert not target.exists()', "assert not target.exists() or (target.stat().st_uid==0 and hashlib.sha256(target.read_bytes()).hexdigest()==EXPECTED)".replace('EXPECTED', repr(digest(source))))
        self.wsl(code, root=True)
        self.report['oracle_source_sha256'] = digest(source)
        self.report['policy_source_sha256'] = digest(ROOT / 'apps/arkhe-intra/lib/sandbox-policy.mjs')
        if time.monotonic() - self.start > 20:
            raise TimeoutError('preflight exceeded 20 seconds')

    def build(self):
        folder = self.output / 'build-input'
        folder.mkdir()
        (folder / 'probe.rs').write_bytes((self.output / 'session/probe.rs').read_bytes())
        identity, policy = self.create('build', folder,
            'rustc --edition=2021 -C opt-level=s -C strip=symbols /input/probe.rs -o /work/probe && cat /work/probe')
        binary = self.call(self.engine + ['start', '--attach', identity], timeout=60)
        state = self.inspect(identity)
        if state['State']['ExitCode'] != 0 or not binary.startswith(b'\x7fELF'):
            raise ValueError('isolated build failed or invalid Linux executable')
        self.report['build'] = {'container_id': identity, 'policy': policy,
            'binary_sha256': hashlib.sha256(binary).hexdigest(), 'exit_code': state['State']['ExitCode']}
        (self.output / 'probe-linux').write_bytes(binary)  # Artifact only; never executed on Windows.
        self.after_build_container(identity)
        self.remove(identity)
        return binary

    def after_build_container(self, identity):
        pass

    def before_vector(self, vector, fixture, request):
        return None

    def judge_vector(self, vector, observation, oracle, request, fixture, context):
        return assess(vector, observation, oracle, (fixture/'arkhe-containment-sentinel').read_bytes().decode('utf-8'))

    def after_vector_cleanup(self, context):
        pass

    def cleanup_auxiliary(self):
        pass

    def vector(self, vector, binary):
        request = json.loads((self.output / 'session/requests' / (vector + '.json')).read_text())
        fixture = self.output / 'session/fixtures' / vector
        sentinel = fixture / 'arkhe-containment-sentinel'
        before = digest(sentinel)
        (fixture / 'probe').write_bytes(binary)
        context = self.before_vector(vector, fixture, request)
        command = 'cp /input/probe /work/probe && chmod 755 /work/probe && while [ ! -f /input/go ]; do sleep 0.05; done; exec /work/probe "$1" "$2"'
        identity, policy = self.create(vector, fixture, command, (vector, request['nonce']))
        self.call(self.engine + ['start', identity], timeout=10)
        state = self.inspect(identity)
        pid = state['State']['Pid']
        if not state['State']['Running'] or pid <= 1:
            raise ValueError('target did not start')
        oracle = json.loads(self.call(['wsl', '-d', self.distro, '-u', 'root', '--exec', 'python3',
                                      self.observer, str(pid), identity], timeout=10))
        oracle.update(run_id=self.run_id, vector_id=vector, nonce=request['nonce'],
                      probe_binary_sha256=hashlib.sha256(binary).hexdigest(),
                      policy_sha256=hashlib.sha256(json.dumps(policy).encode()).hexdigest())
        expected = {'memory.max': '1610612736', 'pids.max': '128', 'cpu.max': '200000 100000'}
        if any(not isinstance(oracle['cgroup'][k], str) or oracle['cgroup'][k].strip() != v for k,v in expected.items()):
            raise ValueError('effective cgroup enforcement mismatched; do not release probe')
        if oracle['namespaces']['mnt'] == oracle['observer_namespaces']['mnt'] or oracle['namespaces']['net'] == oracle['observer_namespaces']['net']:
            raise ValueError('oracle shares target namespaces')
        receipts = self.output / 'host-receipts'
        receipts.mkdir(exist_ok=True)
        write_json(receipts / (vector + '.oracle.json'), oracle)
        write_json(receipts / (vector + '.created.json'), state)
        # Host releases the target only after independent preconditions are recorded.
        (fixture / 'go').write_bytes(b'release\n')
        self.call(self.engine + ['wait', identity], timeout=3, limit=65536)
        observation_bytes = self.call(self.engine + ['logs', identity], limit=65536)
        observation = decode_observation(observation_bytes, request)
        final = self.inspect(identity)
        if final['State']['ExitCode'] != 0:
            raise ValueError('probe exited unsuccessfully')
        after = digest(sentinel)
        if before != after:
            raise ValueError('sentinel integrity changed')
        observations = self.output / 'observations'
        observations.mkdir(exist_ok=True)
        path = observations / (vector + '.json')
        path.write_bytes(observation_bytes)
        write_json(receipts / (vector + '.exited.json'), final)
        verdict = self.judge_vector(vector, observation, oracle, request, fixture, context)
        self.remove(identity)
        self.after_vector_cleanup(context)
        self.report['trial']['vectors'].append({'vector_id': vector, 'container_id': identity,
            'observation_state': observation['state'], 'verdict': verdict,
            'observation_sha256': digest(path), 'oracle_sha256': digest(receipts / (vector + '.oracle.json')),
            'sentinel_before_sha256': before, 'sentinel_after_sha256': after, 'cleanup_confirmed': True})

    def finish(self):
        # Resolve timed-out creations only by exact UUID names and matching labels.
        for name in self.names:
            if name in self.known_names:
                continue
            try:
                code, out, err = bounded(self.engine + ['inspect', name], 3, 1048576)
                if code != 0:
                    continue
                item = json.loads(out)[0]
                if item['Config']['Labels'].get('io.arkhe.containment.run') != self.run_id:
                    raise ValueError('refuse cleanup of foreign container')
                if item['Id'] not in self.ids:
                    self.ids.append(item['Id'])
            except Exception as error:
                self.report['errors'].append('cleanup reconciliation: ' + str(error))
        for identity in list(self.ids):
            try:
                self.remove(identity)
            except Exception as error:
                self.report['errors'].append('cleanup: ' + str(error))
        if self.lease and not self.ids:
            try:
                self.cleanup_auxiliary()
            except Exception as error:
                self.report['errors'].append('auxiliary cleanup: ' + str(error))
        if self.lease and not self.ids and not self.report['errors']:
            code = '''from pathlib import Path
import json
p=Path.home()/'.local/state/arkhe-containment/lease'
assert json.loads((p/'owner.json').read_text())['run_id']==RUN
(p/'owner.json').unlink();p.rmdir()
'''.replace('RUN', repr(self.run_id))
            try:
                self.call(['wsl', '-d', self.distro, '-u', 'user', '--exec', 'python3', '-c', code], cleanup=True)
                self.report['lease_released'] = True
            except Exception as error:
                self.report['lease_released'] = False
                self.report['errors'].append('lease cleanup: ' + str(error))
        else:
            self.report['lease_released'] = False
        self.report['duration_seconds'] = round(time.monotonic() - self.start, 3)
        self.report['commands'] = self.commands
        write_json(self.output / 'results.json', self.report)
        lines = ['# First runtime observation trial', '',
                 'Execution: ' + self.report['trial']['execution_state'],
                 'Suite: INCOMPLETE; runtime_verified=false.', '', self.report['scope'], '',
                 '| Vector | Verdict | Cleanup |', '| --- | --- | --- |']
        lines.extend(f"| {v['vector_id']} | {v['verdict']} | confirmed |" for v in self.report['trial']['vectors'])
        lines.extend(['', *self.report['errors']])
        (self.output / 'REPORT.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
        manifest(self.output)
        print('REPORT ' + str(self.output / 'REPORT.md'))

    def run(self):
        try:
            self.preflight()
            binary = self.build()
            for vector in self.vectors:
                self.vector(vector, binary)
            self.report['trial']['execution_state'] = 'COMPLETE'
            self.report['trial']['verdict'] = ('FAIL' if any(v['verdict'] in ('FAIL','ERROR') for v in self.report['trial']['vectors']) else 'OBSERVATIONS_COLLECTED')
        except Exception as error:
            self.report['errors'].append(str(error))
        finally:
            self.finish()
        return 0 if self.report['trial']['execution_state'] == 'COMPLETE' and not self.report['errors'] and self.report['trial']['verdict'] != 'FAIL' else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--machine', default='arkhe-containment')
    parser.add_argument('--image', default=IMAGE)
    args = parser.parse_args()
    return Trial(args.output, args.machine, args.image).run()


if __name__ == '__main__':
    raise SystemExit(main())
