"""Fixed read-only VM oracle for one suite-owned rootless container PID."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import time


def observe(pid, container_id):
    if not re.fullmatch('[0-9a-f]{64}', container_id) or type(pid) is not int or pid < 2:
        raise ValueError('invalid PID/container identity')
    engine_pid = pid
    candidates = []
    # The SSH engine can live in a nested PID namespace relative to WSL exec.
    # Bind both views using cgroup identity and the namespace PID chain.
    for process in Path('/proc').iterdir():
        if not process.name.isdigit():
            continue
        try:
            membership = (process / 'cgroup').read_text()
            if container_id not in membership:
                continue
            status = (process / 'status').read_text()
            chain = next(line.split()[1:] for line in status.splitlines() if line.startswith('NSpid:'))
            if str(engine_pid) in chain and chain[-1] == '1':
                candidates.append((process, membership))
        except (OSError, StopIteration):
            continue
    if len(candidates) != 1:
        raise ValueError('cannot uniquely correlate engine PID, target init and cgroup')
    process, membership = candidates[0]
    pid = int(process.name)
    relative = next(line.split(':', 2)[2] for line in membership.splitlines() if line.startswith('0::'))
    group = Path('/sys/fs/cgroup') / relative.lstrip('/')
    if '..' in Path(relative).parts or not group.resolve().is_relative_to(Path('/sys/fs/cgroup')):
        raise ValueError('cgroup path escaped expected root')
    values = {}
    for name in ['memory.max', 'memory.swap.max', 'memory.events', 'memory.peak',
                 'cpu.max', 'cpu.stat', 'pids.max', 'pids.current', 'pids.events']:
        try:
            values[name] = (group / name).read_text()
        except OSError as error:
            values[name] = {'error': str(error), 'errno': error.errno}
    profile = Path('/usr/share/containers/seccomp.json')
    return {
        'observer': 'VM-side host reader outside target namespace/cgroup',
        'observer_euid': os.geteuid(), 'container_id': container_id, 'host_pid': pid, 'engine_pid': engine_pid,
        'monotonic_ns': time.monotonic_ns(), 'membership': membership,
        'observer_membership': Path('/proc/self/cgroup').read_text(),
        'status': (process / 'status').read_text(), 'uid_map': (process / 'uid_map').read_text(),
        'stat': (process / 'stat').read_text(),
        'network': {name: (process/'net'/name).read_text() for name in ['dev','route','ipv6_route']}, 'mountinfo': (process / 'mountinfo').read_text(),
        'namespaces': {name: os.readlink(process / 'ns' / name)
                       for name in ['pid', 'mnt', 'net', 'user', 'cgroup']},
        'observer_namespaces': {name: os.readlink(Path('/proc/self/ns') / name)
                               for name in ['pid', 'mnt', 'net', 'user', 'cgroup']},
        'cgroup': values, 'boot_id': Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
        'seccomp_default_profile_sha256': hashlib.sha256(profile.read_bytes()).hexdigest(),
        'seccomp_claim': 'default profile inventory, not syscall-filter conformance',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pid', type=int)
    parser.add_argument('container_id')
    args = parser.parse_args()
    print(json.dumps(observe(args.pid, args.container_id)))


if __name__ == '__main__':
    main()
