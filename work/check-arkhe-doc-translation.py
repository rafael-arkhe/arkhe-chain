from pathlib import Path
from collections import Counter
import re
import subprocess

root = Path(r'D:\arkhe\work\nixpkgs-arkhe-integration')
changed = subprocess.check_output(['git', '-C', str(root), 'diff', '--name-only'], text=True).splitlines()
errors = []
for rel in changed:
    assert rel.endswith('.md'), rel
    path = root / rel
    before = subprocess.check_output(['git', '-C', str(root), 'show', f'HEAD:{rel}']).decode('utf-8')
    after = path.read_text(encoding='utf-8')
    pattern = r'sha256-[A-Za-z0-9+/=]+'
    if Counter(re.findall(pattern, before)) != Counter(re.findall(pattern, after)):
        errors.append(f'{rel}: hash values changed')
    old_blocks = re.findall(r'```(?:bash|sh|nix)\n(.*?)```', before, re.S)
    new_blocks = re.findall(r'```(?:bash|sh|nix)\n(.*?)```', after, re.S)
    def normalize(block):
        lines = []
        for line in block.splitlines():
            line = line.split('# ', 1)[0].rstrip()
            line = line.replace('/caminho/do/monorepo', '/path/to/monorepo')
            line = line.replace('[caminho-novo ...]', '[new-path ...]')
            line = line.replace('/caminho/arkhe-verify-upstream.patch', '/path/to/arkhe-verify-upstream.patch')
            if line.strip():
                lines.append(line)
        return lines
    if [normalize(b) for b in old_blocks] != [normalize(b) for b in new_blocks]:
        errors.append(f'{rel}: command/code blocks changed unexpectedly')
    for target in re.findall(r'\]\(([^)]+)\)', after):
        if re.match(r'[a-zA-Z][a-zA-Z0-9+.-]*:', target) or target.startswith('#'):
            continue
        dest = (path.parent / target.split('#')[0]).resolve()
        if dest.exists():
            continue
        try:
            repo_path = dest.relative_to(root).as_posix()
        except ValueError:
            errors.append(f'{rel}: link outside checkout: {target}')
            continue
        present = subprocess.check_output(['git', '-C', str(root), 'ls-tree', 'HEAD', '--', repo_path])
        if not present:
            errors.append(f'{rel}: missing link: {target}')
if errors:
    raise SystemExit('\n'.join(errors))
print(f'Checked {len(changed)} Markdown files: hashes, commands, and local links preserved.')
