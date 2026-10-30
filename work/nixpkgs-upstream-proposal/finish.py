from pathlib import Path
import subprocess

root = Path('/home/arkhen/nixpkgs-upstream-arkhe/nixpkgs')
maintainers = root / 'maintainers/maintainer-list.nix'
text = maintainers.read_text()
entry = '''  rafael-arkhe = {
    name = "rafael-arkhe";
    github = "rafael-arkhe";
    githubId = 306333870;
  };
'''
assert text.count(entry) == 1
text = text.replace(entry, '')
start = text.index('  rafaelgg = {')
maintainers.write_text(text[:start] + entry + text[start:])
subprocess.run(['git', '-C', str(root), 'diff', '--check'], check=True)
