"""Build the same Arkhe verifier for Node adapters and the independent browser UI."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    for target, output in [
        ('nodejs', 'pkg'),
        ('web', '../../../apps/arkhe-intra/public/verifier'),
    ]:
        subprocess.run([
            'wasm-pack', 'build', 'verification/crates/arkhe-verify-wasm',
            '--target', target, '--out-dir', output, '--locked',
        ], cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
