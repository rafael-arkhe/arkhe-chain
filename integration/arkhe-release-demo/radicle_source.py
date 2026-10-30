"""Create a real offline Radicle patch and a second-identity signed review in WSL.

All generated signing identities stay in the private run directory. Only the
public Git bundle, review state and source archive are exported to the host.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

TOOLS = Path('/mnt/d/arkhe/ops/local/verifiable-release/tools/radicle/radicle-1.10.3-x86_64-unknown-linux-musl/bin')


def main():
    root = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    root.mkdir(parents=True, exist_ok=False)
    output.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.update(PATH=str(TOOLS) + ':' + env['PATH'], RAD_PASSPHRASE='', NO_COLOR='1', TERM='dumb', GIT_TERMINAL_PROMPT='0')
    log = []

    def run(*args, cwd=None, profile='author', binary=False):
        e = dict(env, RAD_HOME=str(root / profile))
        p = subprocess.run(args, cwd=cwd, env=e, input=b'', capture_output=True, timeout=90)
        log.append({'command': list(args), 'profile': profile, 'exit_code': p.returncode,
                    'stdout': '' if binary else p.stdout.decode(errors='replace'), 'stderr': p.stderr.decode(errors='replace')})
        (output / 'radicle-commands.json').write_text(json.dumps(log, indent=2))
        if p.returncode:
            raise RuntimeError(f'{args}: {p.stdout.decode(errors="replace")} {p.stderr.decode(errors="replace")}')
        return p.stdout if binary else p.stdout.decode().strip()

    for profile in ['author', 'reviewer']:
        run('rad', 'auth', '--alias', 'arkhe-release-lab-' + profile, '--stdin', profile=profile)
    repo = root / 'source'
    repo.mkdir()
    run('git', 'init', '-b', 'main', str(repo))
    run('git', 'config', 'user.name', 'Arkhe release laboratory', cwd=repo)
    run('git', 'config', 'user.email', 'release-lab@example.invalid', cwd=repo)
    (repo / 'README.md').write_text('# Arkhe verifiable release specimen\n\nPublic synthetic source-only artifact. No production authority.\n')
    run('git', 'add', 'README.md', cwd=repo)
    run('git', 'commit', '-m', 'Initialize public release specimen', cwd=repo)
    run('rad', 'init', '--name', 'arkhe-release-specimen', '--description', 'Synthetic release verification demo', '--public', '--no-confirm', '--no-seed', cwd=repo)
    rid = run('rad', 'inspect', '--rid', cwd=repo)
    run('git', 'checkout', '-b', 'release-specimen', cwd=repo)
    (repo / 'specimen.py').write_text('import hashlib\n\ndef digest(data: bytes) -> str:\n    return hashlib.sha256(data).hexdigest()\n')
    (repo / 'test_specimen.py').write_text('import unittest\nfrom specimen import digest\n\nclass SpecimenTests(unittest.TestCase):\n    def test_known_vector(self):\n        self.assertEqual(digest(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")\n    def test_tamper(self):\n        self.assertNotEqual(digest(b"abc"), digest(b"abd"))\n')
    test_log = run(sys.executable, '-m', 'unittest', '-v', cwd=repo)
    (output / 'specimen-tests.txt').write_text(test_log + '\n' + log[-1]['stderr'])
    run('git', 'add', 'specimen.py', 'test_specimen.py', cwd=repo)
    run('git', 'commit', '-m', 'Add deterministic release specimen and tests', cwd=repo)
    commit = run('git', 'rev-parse', 'HEAD', cwd=repo)
    run('git', 'push', 'rad', 'HEAD:refs/patches', '-o', 'patch.message=Release specimen for offline verification', cwd=repo)
    patch = run('rad', 'cob', 'list', '--repo', rid, '--type', 'xyz.radicle.patch', cwd=repo).splitlines()[0].strip()
    author_storage = root / 'author' / 'storage' / rid.removeprefix('rad:')
    reviewer_storage = root / 'reviewer' / 'storage' / rid.removeprefix('rad:')
    shutil.copytree(author_storage, reviewer_storage)
    run('rad', 'patch', 'cache', '--repo', rid, profile='reviewer')
    reviewer = run('rad', 'self', '--did', profile='reviewer')
    run('rad', 'patch', 'review', patch, '--repo', rid, '--accept', '--message', 'LAB AUTOMATION: source tests passed; accepts this exact synthetic revision. Not a human review.', '--no-announce', profile='reviewer')
    state_raw = run('rad', 'cob', 'show', '--repo', rid, '--type', 'xyz.radicle.patch', '--object', patch, profile='reviewer')
    (output / 'radicle-review.json').write_text(state_raw + '\n')
    state = json.loads(state_raw)
    (output / 'radicle-show.txt').write_text(run('rad', 'patch', 'show', patch, '--repo', rid, profile='reviewer'))
    (output / 'radicle-sigrefs.txt').write_text(run('rad', 'inspect', '--sigrefs', rid, profile='reviewer'))
    (output / 'artifact.tar').write_bytes(run('git', 'archive', '--format=tar', commit, cwd=repo, binary=True))
    run('git', 'bundle', 'create', str(output / 'source.bundle'), '--all', cwd=reviewer_storage, profile='reviewer')
    run('git', 'bundle', 'verify', str(output / 'source.bundle'), cwd=reviewer_storage, profile='reviewer')
    metadata = {'repository': rid, 'patch': patch, 'commit': commit, 'reviewer': reviewer,
                'review_evidence_sha256': hashlib.sha256((output / 'radicle-review.json').read_bytes()).hexdigest(),
                'raw_state': state, 'vm_hostname': run('hostname'), 'vm_kernel': run('uname', '-srmo')}
    (output / 'source-observation.json').write_text(json.dumps(metadata, indent=2))
    print(json.dumps({k: v for k, v in metadata.items() if k != 'raw_state'}, indent=2))


if __name__ == '__main__':
    main()
