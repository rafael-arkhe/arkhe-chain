"""Prepare native Arkhe-Intra dependencies, WASM, pinned Ollama provider and local accounts."""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    pnpm = 'pnpm.cmd' if os.name == 'nt' else 'pnpm'
    commands = [
        [pnpm, 'install', '--frozen-lockfile'],
        [sys.executable, 'scripts/build_verifier.py'],
        ['cargo', 'build', '--locked', '-p', 'arkhe-ollama'],
        ['cargo', 'build', '--locked', '-p', 'arkhe-core', '--example', 'intra_draft'],
        [pnpm, 'intra:setup'],
    ]
    for command in commands:
        subprocess.run(command, cwd=ROOT, check=True)
    print('Ready: pnpm dev:intra; open http://127.0.0.1:3003')
    print('Local credentials: ops/local/intra/credentials.json (not printed).')


if __name__ == '__main__':
    main()
