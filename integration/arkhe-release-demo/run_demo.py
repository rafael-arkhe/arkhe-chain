"""Run the Windows publisher -> Linux WSL consumer demonstration.

Local fixture servers are ephemeral; exported packages and reports are durable.
The optional public upload sends only the allowlisted synthetic package.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile
from blossom_lab import LabStore
from cryptography.hazmat.primitives.serialization import load_pem_private_key

ROOT = Path(__file__).resolve().parents[2]
HTREE = ROOT / 'ops/local/hashtree-tools/bin/htree.exe'
VM_SCRIPT = '/mnt/d/arkhe/integration/arkhe-release-demo/receive.py'


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--run', type=Path, required=True)
    p.add_argument('--receiver', required=True, help='New absolute Linux directory; state is never reset')
    p.add_argument('--publish-public', action='store_true')
    args = p.parse_args()
    folder = args.run.resolve()
    reports = folder / 'reports'
    reports.mkdir(exist_ok=True)
    log = []
    results = []
    sources = []
    config = folder / 'hashtree-publisher'
    config.mkdir(exist_ok=False)
    (config / 'config.toml').write_text('[storage]\ndata_dir = ' + json.dumps(str(config / 'data').replace('\\', '/')) + '\n[nostr]\nrelays = []\n[blossom]\nread_servers = []\nwrite_servers = []\n[updater]\nauto_check = false\nauto_install = false\n')
    env = dict(os.environ, HTREE_CONFIG_DIR=str(config), HTREE_DATA_DIR=str(config / 'data'))

    def save():
        (folder / 'transport-commands.json').write_text(json.dumps(log, indent=2) + '\n')
        (folder / 'demo-results.json').write_text(json.dumps({'results': results, 'sources': sources}, indent=2) + '\n')

    def run(command, environment=None, timeout=90, expected=0):
        p = subprocess.run([str(x) for x in command], env=environment, capture_output=True, timeout=timeout)
        out = p.stdout.decode('utf-8', errors='replace')
        err = p.stderr.decode('utf-8', errors='replace')
        log.append({'command': [str(x) for x in command], 'exit_code': p.returncode, 'stdout': out, 'stderr': err})
        save()
        if expected is not None and p.returncode != expected:
            raise RuntimeError(f'{command}: exit {p.returncode}, expected {expected}: {out[-1000:]} {err[-1000:]}')
        return p.returncode, out + '\n' + err

    def vm_path(path):
        path = path.resolve()
        return '/mnt/' + path.drive[0].lower() + '/' + path.as_posix().split(':', 1)[1].lstrip('/')

    # Explicit laboratory provisioning channel, separate from the distribution.
    # Only public trust and signed approvals cross; publisher keys do not.
    provision = "from pathlib import Path; import shutil,sys; s=Path(sys.argv[1]); d=Path(sys.argv[2]); d.mkdir(parents=True,exist_ok=False); names=['trust.json','approval-v1.json','approval-v2.json','expired-v2.json']; [(shutil.copyfile(s/n,d/n), (d/n).chmod(0o444)) for n in names]"
    run(['wsl', '-d', 'Ubuntu', '--', 'python3', '-c', provision, vm_path(folder), args.receiver])

    def case(name, sequence=2, approval=None, servers=None, cid=None, local=None, expected='VERIFIED_ONLY', initialize=False, reason_contains=None):
        report = reports / (name + '.json')
        command = ['wsl', '-d', 'Ubuntu', '--', 'python3', VM_SCRIPT,
                   '--htree', '/home/arkhen/arkhe-release-tools/bin/htree',
                   '--verifier', '/home/arkhen/arkhe-release-verifier-target/debug/arkhe-verify',
                   '--trust', args.receiver + '/trust.json', '--state', args.receiver + '/state.sqlite',
                   '--report', vm_path(report)]
        if initialize:
            command += ['--initialize-state']
        if approval:
            command += ['--approval', args.receiver + '/' + approval]
        if local:
            command += ['--local-package', vm_path(local)]
        else:
            command += ['--cid', cid or sources[sequence-1]['cid'], '--servers', *(servers or [primary.url])]
        run(command, timeout=150, expected=1 if expected == 'REJECTED' else 0)
        value = json.loads(report.read_text())
        if value['status'] != expected:
            raise AssertionError(f'{name}: {value}')
        if reason_contains and reason_contains not in value.get('reason', ''):
            raise AssertionError(f'{name}: wrong rejection reason: {value}')
        if expected == 'VERIFIED_ONLY' and value['verdict']['authorization_granted']:
            raise AssertionError('verification granted admission')
        results.append({'case': name, 'status': value['status'], 'expected': expected, 'pass': True, 'reason': value.get('reason')})
        save()
        print(name, value['status'], flush=True)
        return value

    primary = LabStore(folder / 'blossom-primary')
    replica = LabStore(folder / 'blossom-replica')
    primary_stopped = False
    try:
        for seq in [1, 2]:
            _, output = run([HTREE, 'add', folder / f'package-v{seq}.zip', '--local'], env)
            hashes = re.findall(r'(?m)^\s*hash:\s*([0-9a-f]{64})\s*$', output)
            keys = re.findall(r'(?m)^\s*key:\s*([0-9a-f]{64})\s*$', output)
            if len(hashes) != 1 or len(keys) != 1:
                raise ValueError('Cannot identify Hashtree CID in add output: ' + output)
            cid = hashes[0] + ':' + keys[0]
            sources.append({'sequence': seq, 'cid': cid, 'package_sha256': hashlib.sha256((folder / f'package-v{seq}.zip').read_bytes()).hexdigest(), 'primary': primary.url, 'replica': replica.url})
            run([HTREE, 'push', cid, '--server', primary.url], env)
            run([HTREE, 'push', cid, '--server', replica.url], env)
        case('01-verified-without-approval', initialize=True)
        case('02-admitted-with-local-approval', approval='approval-v2.json', expected='ADMITTED_LOCAL')
        case('03-idempotent-replay', approval='approval-v2.json', expected='ADMITTED_LOCAL')
        primary.stop()
        primary_stopped = True
        recovered = case('04-primary-offline-replica-recovers', approval='approval-v2.json', servers=[primary.url, replica.url], expected='ADMITTED_LOCAL')
        assert len(recovered['attempts']) == 2 and recovered['attempts'][0].get('exit_code', 1) != 0 and recovered['attempts'][1]['exit_code'] == 0
        case('05-obsolete-v1-rejected', sequence=1, approval='approval-v1.json', servers=[replica.url], expected='REJECTED', reason_contains='obsolete release sequence')
        case('06-expired-approval-rejected', approval='expired-v2.json', servers=[replica.url], expected='REJECTED', reason_contains='local approval binding')
        # Correctly transported package with deliberately corrupted logical artifact.
        bad = folder / 'package-tampered.zip'
        with zipfile.ZipFile(folder / 'package-v2.zip') as src, zipfile.ZipFile(bad, 'w', zipfile.ZIP_DEFLATED) as dest:
            for name in src.namelist():
                data = src.read(name)
                if name == 'artifact.tar':
                    data = bytes([data[0] ^ 1]) + data[1:]
                dest.writestr(name, data)
        _, output = run([HTREE, 'add', bad, '--local'], env)
        bad_cid = re.findall(r'(?m)^\s*hash:\s*([0-9a-f]{64})\s*$', output)[0] + ':' + re.findall(r'(?m)^\s*key:\s*([0-9a-f]{64})\s*$', output)[0]
        run([HTREE, 'push', bad_cid, '--server', replica.url], env)
        case('07-tampered-artifact-rejected', approval='approval-v2.json', servers=[replica.url], cid=bad_cid, expected='REJECTED', reason_contains='exact git archive')
        case('08-approval-for-other-statement-rejected', approval='approval-v1.json', servers=[replica.url], expected='REJECTED', reason_contains='local approval binding')
        # Signature corruption must fail authentication, not merely transport.
        for label, mutate, expected_reason in [
            ('09-attestation-signature-rejected', 'signature', 'invalid signature'),
            ('10-same-sequence-equivocation-rejected', 'equivocation', 'same sequence'),
        ]:
            altered_package = folder / (label + '.zip')
            with zipfile.ZipFile(folder / 'package-v2.zip') as src, zipfile.ZipFile(altered_package, 'w', zipfile.ZIP_DEFLATED) as dest:
                for name in src.namelist():
                    data = src.read(name)
                    if name == 'attestation.json':
                        envelope = json.loads(data)
                        if mutate == 'signature':
                            envelope['signature'] = ('0' if envelope['signature'][0] != '0' else '1') + envelope['signature'][1:]
                        else:
                            envelope['payload'] += ' '
                            key = load_pem_private_key((folder / 'private/attestor.pem').read_bytes(), password=None)
                            envelope['signature'] = key.sign(b'ARKHE:RELEASE:ATTESTATION:v1\0' + envelope['payload'].encode()).hex()
                        data = json.dumps(envelope).encode()
                    dest.writestr(name, data)
            if mutate == 'equivocation':
                # Use a fresh, valid local approval to reach the persistent ledger
                # conflict check instead of failing at the approval binding.
                base = json.loads((folder / 'approval-v2.json').read_text())
                payload = json.loads(base['payload'])
                payload['statement_sha256'] = hashlib.sha256(envelope['payload'].encode()).hexdigest()
                base['payload'] = json.dumps(payload, sort_keys=True, separators=(',', ':'))
                key = load_pem_private_key((folder / 'private/approver.pem').read_bytes(), password=None)
                base['signature'] = key.sign(b'ARKHE:RELEASE:LOCAL-APPROVAL:v1\0' + base['payload'].encode()).hex()
                approval_path = folder / 'approval-equivocation.json'
                approval_path.write_text(json.dumps(base))
                run(['wsl', '-d', 'Ubuntu', '--', 'python3', '-c', 'import shutil,sys; shutil.copyfile(sys.argv[1],sys.argv[2])', vm_path(approval_path), args.receiver + '/approval-equivocation.json'])
            case(label, approval='approval-equivocation.json' if mutate == 'equivocation' else 'approval-v2.json', local=altered_package, expected='REJECTED', reason_contains=expected_reason)
        if args.publish_public:
            returncode, output = run([HTREE, 'push', sources[1]['cid'], '--server', 'https://upload.iris.to'], env, timeout=120, expected=None)
            public = {'server': 'https://upload.iris.to', 'upload_exit_code': returncode, 'cid': sources[1]['cid']}
            (folder / 'public-publication.json').write_text(json.dumps(public, indent=2))
            if returncode == 0:
                case('11-public-hashtree-recovery', approval='approval-v2.json', servers=['https://upload.iris.to'], expected='ADMITTED_LOCAL')
        save()
    finally:
        if not primary_stopped:
            primary.stop()
        replica.stop()
        (folder / 'blossom-observations.json').write_text(json.dumps({'primary': primary.events, 'replica': replica.events}, indent=2))
        save()


if __name__ == '__main__':
    main()
