"""Audit embedded assets: compiler-tracked includes versus build-script migration inputs."""
import re,tomllib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MACRO=re.compile(r'(include_str|include_bytes|include|(?:sqlx::)?migrate)\s*!\s*\(\s*"([^"\n]+)"')
CALL=re.compile(r'(include_str|include_bytes|include|(?:sqlx::)?migrate)\s*!\s*\(')
WATCH=re.compile(r'cargo(?:::|:)rerun-if-changed=([^"\n]+)')
def audit_crate(crate):
    errors=[];counts={'compiler_includes':0,'migration_directories':0}
    build=crate/'build.rs'
    watches=[(crate/p).resolve() for p in WATCH.findall(build.read_text())] if build.exists() else []
    for base in [crate/'src',crate/'tests',crate/'examples']:
        for source in base.rglob('*.rs') if base.exists() else []:
            text=source.read_text()
            if len(CALL.findall(text))!=len(MACRO.findall(text)):
                errors.append(f'{source}: nonliteral embedded asset requires an explicit audited dependency rule')
            for kind,literal in MACRO.findall(text):
                migration=kind.endswith('migrate')
                asset=((crate if migration else source.parent)/literal).resolve()
                if not (asset.is_dir() if migration else asset.is_file()):errors.append(f'{source}: missing embedded asset {literal}');continue
                if migration:
                    counts['migration_directories']+=1
                    # Watch the directory so additions/removals also invalidate compilation.
                    if not any(asset==watch or watch in asset.parents for watch in watches):
                        errors.append(f'{source}: migration directory needs build.rs rerun-if-changed: {literal}')
                else:
                    counts['compiler_includes']+=1
                    # Rust tracks literal include!/include_str!/include_bytes! dependencies.
    return errors,counts

def audit_workspace(root):
    errors=[];totals={'compiler_includes':0,'migration_directories':0}
    members=tomllib.loads((root/'Cargo.toml').read_text())['workspace']['members']
    for member in members:
        found,counts=audit_crate(root/member);errors.extend(found)
        for key,value in counts.items():totals[key]+=value
    return errors,totals

def main():
    errors,counts=audit_workspace(ROOT)
    if errors:raise SystemExit('\n'.join('FAIL '+e for e in errors))
    print(f'PASS embedded assets: {counts["compiler_includes"]} compiler-tracked includes, {counts["migration_directories"]} watched migration directories')
if __name__=='__main__':main()
