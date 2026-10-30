"""Prepare an offline replay image context from approved, pinned source hashes."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

BASE = '0f65c70efd46927afd01a86aa27d7b49e5e84e1189cce56587e2874c96521979'
parser = argparse.ArgumentParser()
parser.add_argument('--verifier', type=Path, required=True)
parser.add_argument('--source-manifest', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
source = args.verifier.resolve()
approved = json.loads(args.source_manifest.read_text(encoding='utf-8-sig'))
commit = approved['repos']['verifier']['commit']
assert commit == '7887252fc84def69a794d2e32ce65721eb9a25d9'
paths = sorted(list((source / 'gravit_verifier').rglob('*.py')) +
               list((source / 'bindings').glob('*.yaml')) + list((source / 'bindings').glob('*.yml')) +
               [source / 'tests/golden' / n for n in ('trust_root.json', 'registry.json', 'registry.json.sig')])
files = {}
for path in paths:
    name = path.relative_to(source).as_posix()
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest == approved['source_files_sha256']['verifier/' + name], name
    files[name] = digest
args.output.mkdir(parents=True, exist_ok=False)
manifest = {'verifier_commit': commit, 'base_image_id': BASE, 'files': files,
            'trust_scope': 'PUBLIC FIXTURE ROOT ONLY; not an operational trust deployment'}
(args.output / 'trusted-context.json').write_text(json.dumps(manifest, sort_keys=True, indent=2) + '\n', encoding='utf-8')
for name in ('gravit_replay.py', 'test_gravit_replay.py'):
    shutil.copyfile(Path(__file__).with_name(name), args.output / name)
shutil.copytree(Path('kernel/arkhe-kernel/tests/fixtures/gravit/signatures'), args.output / 'fixtures')
(args.output / 'Dockerfile').write_text(
    f'FROM {BASE}\nCOPY gravit_replay.py test_gravit_replay.py trusted-context.json /opt/replay/\n'
    'COPY fixtures /opt/replay/fixtures/\n'
    'ENTRYPOINT ["python", "-I", "/opt/replay/gravit_replay.py"]\nCMD []\n', encoding='utf-8')
print(json.dumps({'status': 'PASS', 'pinned_runtime_files': len(files), 'base_image_id': BASE}))
