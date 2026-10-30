"""Prepare the local Arkhe development sandbox; never execute model output on the host."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

def run(args, **kwargs):
    return subprocess.run([str(arg) for arg in args], check=True, cwd=ROOT, **kwargs)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=ROOT/'ops/local/intra')
    parser.add_argument('--existing-image', help='Reuse a locally prepared immutable sha256 image ID')
    args = parser.parse_args()
    machines = json.loads(run(['podman','machine','inspect','arkhe-runtime'],capture_output=True,text=True).stdout)
    if machines[0]['State'] != 'running': run(['podman','machine','start','arkhe-runtime'])
    if os.name == 'nt':
        # Transient delegation inside the dedicated Linux VM, reset by VM reboot.
        # No Windows host ACL or protected application policy is changed.
        delegation = 'printf "+cpu +memory +pids" > /sys/fs/cgroup/cgroup.subtree_control && mkdir -p /sys/fs/cgroup/arkhe-sandbox && printf "+cpu +memory +pids" > /sys/fs/cgroup/arkhe-sandbox/cgroup.subtree_control && chown 1000:1000 /sys/fs/cgroup/cgroup.procs /sys/fs/cgroup/arkhe-sandbox /sys/fs/cgroup/arkhe-sandbox/cgroup.procs /sys/fs/cgroup/arkhe-sandbox/cgroup.subtree_control'
        run(['wsl','-d','podman-arkhe-runtime','-u','root','--exec','sh','-c',delegation])
    image = args.existing_image
    if not image:
        context = Path(tempfile.mkdtemp(prefix='arkhe-development-image-'))
        environment = {**os.environ,'ARKHE_SNAPSHOT_DESTINATION':str(context)}
        run(['node','--input-type=module','-e',"import {sourceSnapshot} from './apps/arkhe-intra/lib/development.mjs'; sourceSnapshot(process.env.ARKHE_SNAPSHOT_DESTINATION);"],env=environment)
        shutil.copyfile(ROOT/'packaging/sandbox/Containerfile',context/'Containerfile')
        run(['podman','--connection','arkhe-runtime','build','--pull=never','-t','localhost/arkhe-development:0.1',context])
        image = 'sha256:' + run(['podman','--connection','arkhe-runtime','image','inspect','localhost/arkhe-development:0.1','--format','{{.Id}}'],capture_output=True,text=True).stdout.strip().removeprefix('sha256:')
    environment = {**os.environ,'ARKHE_SANDBOX_IMAGE':image,'ARKHE_SANDBOX_CONNECTION':'arkhe-runtime'}
    run(['node','--input-type=module','-e',"import {sandboxReady} from './apps/arkhe-intra/lib/development.mjs'; await sandboxReady();"],env=environment)
    args.data_dir.mkdir(parents=True,exist_ok=True)
    config = args.data_dir.resolve()/'development.json'
    config.write_text(json.dumps({'sourceRoot':str(ROOT),'image':image,'connection':'arkhe-runtime'},indent=2),encoding='utf-8')
    print(json.dumps({'status':'PASS','config':str(config),'image':image,'restartIntraRequired':True},indent=2))

if __name__ == '__main__': main()
