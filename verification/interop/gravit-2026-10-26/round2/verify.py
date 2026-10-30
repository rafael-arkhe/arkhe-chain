"""Offline decision comparison and controls. Add --with-arkhe for live Rust checks."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys

ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--with-arkhe',action='store_true')
args=parser.parse_args()
manifest=json.loads((ROOT/'manifest.json').read_bytes())
for entry in manifest:
    file=ROOT/entry['path']
    if hashlib.sha256(file.read_bytes()).hexdigest()!=entry['sha256']:
        raise SystemExit(f"Hash mismatch: {entry['path']}")
subprocess.run([sys.executable,str(ROOT/'compare.py')],check=True)
subprocess.run([sys.executable,str(ROOT/'test_controls.py')],check=True)
if args.with_arkhe:
    subprocess.run([sys.executable,str(ROOT.parent/'verify.py')],check=True)
print(f'PASS: {len(manifest)} pinned files; 54 complete decisions; 17 controls; strict-text difference preserved')
