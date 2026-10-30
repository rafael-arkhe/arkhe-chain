"""Linux VM consumer: fresh Hashtree cache, signed Radicle review, Arkhe admission.

Trust, approval and persistent state are provisioned separately from the package.
Only the explicit --initialize-state command may create a new rollback ledger.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import tempfile
import time
import zipfile
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

MAX_PACKAGE = 4 * 1024 * 1024
NAMES = {'artifact.tar', 'attestation.json', 'source.bundle', 'radicle-review.json', 'README.txt'}


def run(argv, *, env=None, data=None, timeout=40):
    return subprocess.run([str(x) for x in argv], input=data, env=env, capture_output=True, timeout=timeout)


def checked(argv, **kwargs):
    p = run(argv, **kwargs)
    if p.returncode:
        raise ValueError(p.stderr.decode(errors='replace') + p.stdout.decode(errors='replace'))
    return p.stdout


def public_key(did):
    text = did.removeprefix('did:key:')
    if not text.startswith('z'):
        raise ValueError('expected base58btc DID')
    alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    n = 0
    for c in text[1:]:
        n = n * 58 + alphabet.index(c)
    decoded = n.to_bytes((n.bit_length() + 7) // 8, 'big')
    if len(decoded) != 34 or decoded[:2] != b'\xed\x01':
        raise ValueError('expected Ed25519 multicodec')
    return decoded[2:]


def signed_commit(repo, commit, did, work):
    if not re.fullmatch('[0-9a-f]{40}', commit):
        raise ValueError('bad COB commit id')
    raw = checked(['git', '--git-dir', repo, 'cat-file', 'commit', commit])
    lines = raw.splitlines(keepends=True)
    unsigned, signature = [], []
    in_signature = False
    in_headers = True
    for line in lines:
        if in_headers and line.startswith(b'gpgsig '):
            if signature:
                raise ValueError('duplicate signature')
            signature.append(line[7:])
            in_signature = True
        elif in_signature and line.startswith(b' '):
            signature.append(line[1:])
        else:
            in_signature = False
            unsigned.append(line)
            if line == b'\n':
                in_headers = False
    if not signature:
        raise ValueError('missing Radicle operation signature')
    # Radicle COB signatures use SSHSIG as a container, but sign the RAW
    # 20-byte operation-tree OID, not the SSHSIG preimage or Git commit bytes.
    # See radicle-cob/backend/git/change.rs and radicle-crypto/ssh.rs.
    pem = b''.join(signature).decode().splitlines()
    encoded = base64.b64decode(''.join(pem[1:-1]), validate=True)
    if encoded[:10] != b'SSHSIG\x00\x00\x00\x01':
        raise ValueError('unexpected Radicle signature container')

    def field(data, offset):
        if offset + 4 > len(data):
            raise ValueError('truncated signature')
        size = int.from_bytes(data[offset:offset+4], 'big')
        end = offset + 4 + size
        if end > len(data):
            raise ValueError('truncated signature field')
        return data[offset+4:end], end

    offset = 10
    values = []
    for _ in range(5):
        value, offset = field(encoded, offset)
        values.append(value)
    key_blob, namespace, reserved, algorithm, sig_blob = values
    if offset != len(encoded) or namespace != b'radicle' or reserved or algorithm != b'sha256':
        raise ValueError('unsupported Radicle signature profile')
    key_type, pos = field(key_blob, 0)
    key, pos = field(key_blob, pos)
    if pos != len(key_blob) or key_type != b'ssh-ed25519' or key != public_key(did):
        raise ValueError('Radicle signer differs from expected DID')
    sig_type, pos = field(sig_blob, 0)
    sig_bytes, pos = field(sig_blob, pos)
    if pos != len(sig_blob) or sig_type != b'ssh-ed25519' or len(sig_bytes) != 64:
        raise ValueError('invalid Ed25519 signature container')
    tree = lines[0].decode().strip()
    if not re.fullmatch(r'tree [0-9a-f]{40}', tree):
        raise ValueError('missing operation tree')
    Ed25519PublicKey.from_public_bytes(key).verify(sig_bytes, bytes.fromhex(tree[5:]))


def verify_source(work, trust):
    source = trust['source']
    raw = (work / 'radicle-review.json').read_bytes()
    if hashlib.sha256(raw).hexdigest() != source['review_evidence_sha256']:
        raise ValueError('review evidence digest differs from local trust')
    state = json.loads(raw)
    revision = state['revisions'][source['revision']]
    review = revision['reviews'][source['reviewer'].removeprefix('did:key:')]
    if revision['oid'] != source['commit'] or review['verdict'] != 'accept' or review['author']['id'] != source['reviewer']:
        raise ValueError('Radicle revision/review binding mismatch')
    if revision['author']['id'] == source['reviewer']:
        raise ValueError('self review rejected by lab profile')
    repo = work / 'source.git'
    checked(['git', '-c', 'core.hooksPath=/dev/null', 'clone', '--bare', work / 'source.bundle', repo])
    checked(['git', '--git-dir', repo, 'fsck', '--full'])
    signed_commit(repo, source['revision'], revision['author']['id'], work)
    signed_commit(repo, review['id'], source['reviewer'], work)
    revision_op = json.loads(checked(['git', '--git-dir', repo, 'show', source['revision'] + ':0']))
    review_op = json.loads(checked(['git', '--git-dir', repo, 'show', review['id'] + ':0']))
    if revision_op.get('oid') != source['commit']:
        raise ValueError('signed revision does not reference expected commit')
    if review_op.get('type') != 'review' or review_op.get('verdict') != 'accept' or review_op.get('revision') != source['revision']:
        raise ValueError('signed review operation differs from claimed review')
    archive = checked(['git', '--git-dir', repo, 'archive', '--format=tar', source['commit']])
    if archive != (work / 'artifact.tar').read_bytes():
        raise ValueError('release artifact is not the exact git archive of the reviewed commit')
    return {'signed_revision': source['revision'], 'signed_review': review['id'], 'archive_matches_commit': True,
            'scope': 'pinned attestor/RID association plus independently checked signed COB operations; not full Radicle network validation'}


def unpack(package, work):
    if package.stat().st_size > MAX_PACKAGE:
        raise ValueError('package too large')
    with zipfile.ZipFile(package) as z:
        infos = z.infolist()
        if len(infos) != len(NAMES) or {i.filename for i in infos} != NAMES or sum(i.file_size for i in infos) > MAX_PACKAGE:
            raise ValueError('unexpected or oversized package members')
        for info in infos:
            if info.file_size > MAX_PACKAGE:
                raise ValueError('member too large')
            # Fixed flat names only; do not extract arbitrary archive paths.
            (work / info.filename).write_bytes(z.read(info))


def acquire(htree, cid, servers, work, attempts):
    for i, server in enumerate(servers):
        cache = work / f'fetch-{i}'
        cache.mkdir()
        config = cache / 'config.toml'
        config.write_text('[storage]\ndata_dir = ' + json.dumps(str(cache / 'data')) + '\n[nostr]\nrelays = []\n[blossom]\nread_servers = [' + json.dumps(server) + ']\nwrite_servers = []\n[updater]\nauto_check = false\nauto_install = false\n')
        env = dict(os.environ, HTREE_CONFIG_DIR=str(cache), HTREE_DATA_DIR=str(cache / 'data'))
        dest = cache / 'package.zip'
        try:
            p = run([htree, 'get', cid, '--output', dest], env=env, timeout=45)
            attempts.append({'source': server, 'exit_code': p.returncode, 'stdout': p.stdout.decode(errors='replace')[-4000:], 'stderr': p.stderr.decode(errors='replace')[-4000:], 'cache': 'new-empty'})
            if p.returncode == 0 and dest.is_file() and dest.stat().st_size <= MAX_PACKAGE:
                return dest
        except subprocess.TimeoutExpired:
            attempts.append({'source': server, 'status': 'timeout', 'cache': 'new-empty'})
    raise ValueError('INCOMPLETE: no configured source returned the pinned Hashtree content')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--htree', type=Path, required=True)
    p.add_argument('--verifier', type=Path, required=True)
    p.add_argument('--trust', type=Path, required=True)
    p.add_argument('--approval', type=Path)
    p.add_argument('--state', type=Path, required=True)
    p.add_argument('--initialize-state', action='store_true')
    p.add_argument('--cid')
    p.add_argument('--servers', nargs='*', default=[])
    p.add_argument('--local-package', type=Path)
    p.add_argument('--report', type=Path, required=True)
    args = p.parse_args()
    report = {'profile': 'arkhe-release-lab@1', 'host': os.uname().nodename, 'kernel': os.uname().release,
              'receiver': 'Linux WSL VM; laboratory simulation', 'attempts': [], 'executed': False}
    code = 1
    try:
        trust = json.loads(args.trust.read_text())
        if args.initialize_state:
            if args.state.exists():
                raise ValueError('state already exists; refusing reset')
            args.state.parent.mkdir(parents=True, exist_ok=True)
            db = sqlite3.connect(args.state)
            db.execute('CREATE TABLE admitted (tenant TEXT, product TEXT, sequence INTEGER NOT NULL, statement TEXT NOT NULL, PRIMARY KEY(tenant,product))')
            db.commit()
            db.close()
        if not args.state.is_file():
            raise ValueError('persistent rollback state missing; explicit provisioning required')
        with tempfile.TemporaryDirectory(prefix='arkhe-release-consumer-') as tmp:
            work = Path(tmp)
            package = args.local_package if args.local_package else acquire(args.htree, args.cid, args.servers, work, report['attempts'])
            unpack(package, work)
            report['source_verification'] = verify_source(work, trust)
            db = sqlite3.connect('file:' + str(args.state) + '?mode=rw', uri=True, timeout=10)
            try:
                db.execute('BEGIN IMMEDIATE')
                row = db.execute('SELECT sequence,statement FROM admitted WHERE tenant=? AND product=?', (trust['tenant'], trust['product'])).fetchone()
                command = [args.verifier, 'verify-release', work / 'artifact.tar', work / 'attestation.json', args.trust,
                           '--now', str(int(time.time())), '--high-water', str(row[0] if row else 0)]
                if args.approval:
                    command += ['--approval', args.approval]
                verdict = json.loads(checked(command))
                if args.approval:
                    if row and row[0] == verdict['sequence'] and row[1] != verdict['statement_sha256']:
                        raise ValueError('same sequence has a different signed statement')
                    db.execute('INSERT INTO admitted VALUES (?,?,?,?) ON CONFLICT(tenant,product) DO UPDATE SET sequence=excluded.sequence,statement=excluded.statement',
                               (trust['tenant'], trust['product'], verdict['sequence'], verdict['statement_sha256']))
                db.commit()
                report['verdict'] = verdict
                report['status'] = verdict['status']
                report['high_water_before'] = row[0] if row else 0
                report['state_updated'] = bool(args.approval)
                code = 0
            finally:
                db.close()
    except Exception as exc:
        report.update(status='REJECTED', reason=str(exc))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
