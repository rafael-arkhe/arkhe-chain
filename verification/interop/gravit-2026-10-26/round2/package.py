"""Create a portable decision-reader handoff, never overwriting an existing archive."""
from pathlib import Path
import hashlib
import sys
from zipfile import ZipFile, ZIP_DEFLATED

BASE=Path(__file__).resolve().parent.parent
output=Path(sys.argv[1]).resolve()
output.parent.mkdir(parents=True,exist_ok=True)
with ZipFile(output,'x',ZIP_DEFLATED) as archive:
    archive.writestr('START-HERE.md',
        '# Arkhe / Gravit interoperability handoff\n\n'
        'Read `gravit-2026-10-26/round2/README.md` for current results and limitations.\n'
        'The parent README preserves the earlier primitive-only round.\n\n'
        'With Python cryptography 50.0.1 and Node.js installed, run:\n\n'
        '```\npython gravit-2026-10-26/round2/verify.py\n```\n\n'
        'The optional --with-arkhe flag requires the original complete Arkhe workspace;\n'
        'this archive contains the decision reader and frozen primitive outputs, not\n'
        'the full Arkhe workspace or its Rust dependency graph.\n'
        'No account credentials are included. All captured hosted inputs are public.\n')
    for file in sorted(BASE.rglob('*')):
        if file.is_file() and '__pycache__' not in file.parts:
            archive.write(file,Path(BASE.name)/file.relative_to(BASE))
digest=hashlib.sha256(output.read_bytes()).hexdigest()
sidecar=output.with_suffix(output.suffix+'.sha256')
with sidecar.open('x',encoding='ascii') as f: f.write(f'{digest}  {output.name}\n')
print(f'{output}\nSHA-256 {digest}')
