"""Extract and verify the portable package, including PE subsystem and hashes."""
import hashlib
import json
from pathlib import Path
import struct
import sys
import zipfile

archive, destination = map(lambda value: Path(value).resolve(), sys.argv[1:3])
if destination.exists(): raise SystemExit('Extraction destination must be new.')
with zipfile.ZipFile(archive) as bundle:
    for item in bundle.infolist():
        target = (destination / item.filename).resolve()
        if not target.is_relative_to(destination): raise SystemExit('Unsafe archive path.')
    bundle.extractall(destination)
root = destination / archive.stem
manifest = json.loads((root / 'manifest.sha256.json').read_text(encoding='utf-8'))
files = {path.relative_to(root).as_posix(): path for path in root.rglob('*') if path.is_file() and path.name != 'manifest.sha256.json'}
assert files.keys() == manifest.keys(), 'Unexpected or missing files'
for name, path in files.items():
    assert hashlib.sha256(path.read_bytes()).hexdigest() == manifest[name], name
    assert path.name not in {'credentials.json', 'accounts.json', 'intra.sqlite', '.env.local'}, name
    assert not path.name.endswith('.private.pem'), name
for name, expected in [('Arkhe.exe', 2), ('arkhe-cli.exe', 3)]:
    content = (root / name).read_bytes()
    assert content[:2] == b'MZ', name
    header = struct.unpack_from('<I', content, 0x3c)[0]
    assert content[header:header+4] == b'PE\0\0', name
    assert struct.unpack_from('<H', content, header+92)[0] == expected, name
print(json.dumps({'status': 'PASS', 'files': len(files), 'package': str(root), 'checks': ['SHA256 of every packaged file', 'No local accounts, credentials or signing keys', 'Windows PE GUI and CLI subsystems']}, indent=2))
