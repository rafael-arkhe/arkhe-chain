from pathlib import Path
import json
import shutil
import subprocess

work = Path('/home/arkhen/nixpkgs-upstream-arkhe')
root = work / 'nixpkgs'
proposal = Path('/mnt/d/arkhe/work/nixpkgs-upstream-proposal')
out = Path('/mnt/d/arkhe/output/nixpkgs-upstream')
out.mkdir(parents=True, exist_ok=True)

def git(*args):
    return subprocess.check_output(['git', '-C', str(root), *args])

before = (work / 'output-hash-before.txt').read_text().strip()
after = (work / 'output-hash-after.txt').read_text().strip()
assert before == after
assert 'checking outputs of' in (work / 'rebuild.log').read_text()
assert (work / 'package-tests.log').read_text().strip().endswith('-arkhe-verify-blake3')
assert 'lib.fakeHash' not in (root / 'pkgs/by-name/ar/arkhe-verify/package.nix').read_text()
assert git('branch', '--show-current').decode().strip() == 'arkhe-verify-init'
base = git('rev-parse', 'HEAD').decode().strip()
assert base == '0470df609861fede4cec47148a001f04513bdabc'

git('config', 'user.name', 'rafael-arkhe')
git('config', 'user.email', '306333870+rafael-arkhe@users.noreply.github.com')
git('add', 'maintainers/maintainer-list.nix')
git('commit', '-m', 'maintainers: add rafael-arkhe', '-m', 'Assisted-by: OpenAI Codex (GPT-6)')
git('add', 'pkgs/by-name/ar/arkhe-verify/package.nix')
git('commit', '-m', 'arkhe-verify: init at 0.1.0-unstable-2026-10-29', '-m',
    'Package the public source-only Arkhe workspace snapshot with fixed source\n'
    'and Cargo hashes. Run the offline verifier/core suites, golden vectors\n'
    'and a BLAKE3 known-answer test using the standard rustPlatform.\n\n'
    'Assisted-by: OpenAI Codex (GPT-6)')
assert not git('status', '--porcelain').strip()
git('diff', '--check', base, 'HEAD')
(out / 'arkhe-verify-upstream.patch').write_bytes(git('format-patch', '--stdout', f'{base}..HEAD'))
(out / 'review.diff').write_bytes(git('diff', '--binary', base, 'HEAD'))
git('apply', '--check', '--reverse', str(out / 'review.diff'))
git('format-patch', '-2', '-o', str(out / 'series'))
for name in ['build.log', 'package-tests.log', 'rebuild.log', 'maintainers.log',
             'output-hash-before.txt', 'output-hash-after.txt', 'path-info.json',
             'rustc-version.txt']:
    shutil.copyfile(work / name, out / name)
for name in ['README.md', 'pull-request.md', 'reproduce.sh']:
    shutil.copyfile(proposal / name, out / name)
shutil.copyfile(root / 'pkgs/by-name/ar/arkhe-verify/package.nix', out / 'package.nix')
result = {
    'nixpkgs_base': base,
    'branch': 'arkhe-verify-init',
    'head': git('rev-parse', 'HEAD').decode().strip(),
    'source_revision': '228da8e803e9f81041066e3a3a50f61e6ff4201c',
    'source_hash': 'sha256-IX8kHrWuRQn9jOb1mwXwJ9eoMkelO+1PpFlbu/dEiiI=',
    'cargo_hash': 'sha256-J2aSDP8/OcFVQdilWyYs+4f8VXwhxEhT9uSh+8egyH8=',
    'system': 'x86_64-linux', 'host': 'WSL Ubuntu',
    'rustc': json.loads((work / 'rustc-version.txt').read_text()),
    'output_nar_hash': before,
    'build': 'passed', 'nix_build_check': 'passed',
    'golden_vectors': '4 passed', 'golden_contract': '1 passed',
    'passthru_blake3': 'passed', 'maintainer_schema': 'passed',
    'formatter': 'passed', 'nixpkgs_review': 'not run',
    'other_machine_vm': 'not run', 'aarch64': 'not run', 'darwin': 'not run',
    'upstream_branch_pushed': False, 'pull_request_created': False,
}
(out / 'results.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
