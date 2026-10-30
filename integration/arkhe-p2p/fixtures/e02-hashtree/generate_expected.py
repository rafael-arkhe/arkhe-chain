"""Expected file digests for the E02 Hashtree fixture, from Git only.

Usage: python generate_expected.py <frozen E02 git checkout> [--check]
Reads blobs with `git cat-file` at the pinned commit; never reads the
Hashtree blocks, so the expectation is independent of the transport.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'scripts'))
from blake3_reference import b3  # noqa: E402

COMMIT = '18ec972dd62f7cc76dfcae6588823f7cd4ecb815'
ROOT = dict(hash='ce3b3bb912c5127aadd0a12ff4ef6b8a7701394192ca60628bf71bba33132aac',
            key='b87d23e6e29c50e3dc3c6c930fc80e7822428ba2992e6ee8c4481c4e760cc4f1')
OUT = Path(__file__).with_name('expected.json')


def git(repo, *args):
    return subprocess.run(['git', '-C', repo, *args], check=True, capture_output=True).stdout


def build(repo):
    files = []
    for line in git(repo, 'ls-tree', '-r', '-z', COMMIT).split(b'\0'):
        if not line:
            continue
        meta, path = line.split(b'\t', 1)
        mode, kind, oid = meta.split()
        if kind != b'blob' or mode == b'120000':
            continue
        data = git(repo, 'cat-file', 'blob', oid.decode())
        files.append(dict(path=path.decode(), size=len(data),
                          sha256=hashlib.sha256(data).hexdigest(), blake3=b3(data).hex()))
    refs = {'HEAD': COMMIT}
    for ref in ('refs/tags/arkhe-e02@1', 'refs/tags/arkhe-e02@1-transport.1'):
        refs[ref] = git(repo, 'rev-parse', ref).decode().strip()
    return dict(source=f'git {COMMIT}', hashtree_root=ROOT, refs=refs,
                files=sorted(files, key=lambda f: f['path'].encode()))


if __name__ == '__main__':
    data = (json.dumps(build(sys.argv[1]), indent=2) + '\n').encode()
    if '--check' in sys.argv:
        if OUT.read_bytes() != data:
            raise SystemExit('FAIL expected digests differ from Git')
        print('PASS expected digests match Git')
    else:
        OUT.write_bytes(data)
        print(f'Wrote {OUT}')
