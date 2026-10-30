from pathlib import Path
import shutil
import subprocess

root = Path('/home/arkhen/nixpkgs-upstream-arkhe/nixpkgs')
proposal = Path('/mnt/d/arkhe/work/nixpkgs-upstream-proposal')
subprocess.run(['git', '-C', str(root), 'switch', '-c', 'arkhe-verify-init'], check=True)
maintainers = root / 'maintainers/maintainer-list.nix'
text = maintainers.read_text()
assert '  rafael-arkhe = {' not in text
entry = '''  rafael-arkhe = {
    name = "rafael-arkhe";
    github = "rafael-arkhe";
    githubId = 306333870;
  };
'''
start = text.index('  raf')
maintainers.write_text(text[:start] + entry + text[start:])
package = Path('pkgs/by-name/ar/arkhe-verify/package.nix')
(root / package).parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(proposal / package, root / package)
