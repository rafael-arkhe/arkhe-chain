"""Validate all four editable interfaces without changing installed dependencies."""
import argparse
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-build', action='store_true')
    args = parser.parse_args()
    npm = 'npm.cmd' if os.name == 'nt' else 'npm'
    checks = [
        ('preflight', ['test', '--', '--watch=false']),
        ('preflight', ['run', 'test:api']),
        ('melodic-lab', ['test', '--', '--watch=false']),
        ('melodic-lab', ['run', 'test:api']),
        ('arkhe-intra', ['test']),
        ('chladni-dashboard', ['test']),
    ]
    if not args.skip_build:
        checks += [(name, ['run', 'build']) for name in ['preflight', 'melodic-lab', 'arkhe-intra']]
    for name, command in checks:
        print(f'CHECK {name}: npm {" ".join(command)}', flush=True)
        subprocess.run([npm, *command], cwd=ROOT / 'apps' / name, check=True)
    print('PASS: all interface checks. External providers and live chain transactions require separate validation.')


if __name__ == '__main__':
    main()
