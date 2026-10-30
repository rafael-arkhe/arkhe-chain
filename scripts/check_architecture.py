"""Fail closed on layout drift, duplicate active crates, outside dependencies or changed migrations."""
import hashlib,json,os,sys,tomllib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def vendor_paths(root, architecture, members):
    """Skip only explicitly registered reference checkouts, never active members."""
    paths=set()
    for item in architecture.get('vendor_roots', []):
        value=item.get('path', '')
        relative=Path(value)
        if relative.is_absolute() or '..' in relative.parts or not item.get('reason') or not item.get('upstream'):
            raise ValueError('invalid vendor root: '+value)
        path=(root/relative).resolve()
        allowed=any(path.is_relative_to((root/package/'output').resolve()) and path!=(root/package/'output').resolve() for package in architecture['node_packages'])
        if not path.is_relative_to(root.resolve()) or not allowed or any((root/member).resolve().is_relative_to(path) for member in members):
            raise ValueError('vendor root hides active workspace or exceeds reference boundary: '+value)
        paths.add(path)
    return paths

def independent_paths(root, architecture, members):
    """Registered crates with their own workspace and lockfile, outside the unified build."""
    paths=set()
    for item in architecture.get('independent_workspaces', []):
        value=item.get('path', '')
        relative=Path(value)
        if relative.is_absolute() or '..' in relative.parts or not item.get('reason'):
            raise ValueError('invalid independent workspace: '+value)
        path=(root/relative).resolve()
        if not path.is_relative_to(root.resolve()):
            raise ValueError('independent workspace outside the root: '+value)
        # Separate repositories are absent from a clean checkout; an absent path hides nothing.
        if not path.exists(): continue
        manifest=path/'Cargo.toml'
        if not manifest.is_file() or not (path/'Cargo.lock').is_file():
            raise ValueError('independent workspace needs Cargo.toml and Cargo.lock: '+value)
        if 'workspace' not in tomllib.loads(manifest.read_text()):
            raise ValueError('independent workspace lacks its own [workspace]: '+value)
        if any((root/m).resolve().is_relative_to(path) or path.is_relative_to((root/m).resolve()) for m in members):
            raise ValueError('independent workspace overlaps an active member: '+value)
        paths.add(path)
    return paths

def discover_crates(root, layers, vendors):
    found=set()
    for layer in layers:
        for folder,dirs,files in os.walk(root/layer):
            dirs[:]=[d for d in dirs if d not in ['target','node_modules','__pycache__','pkg'] and (Path(folder)/d).resolve() not in vendors]
            if 'Cargo.toml' in files: found.add(Path(folder).relative_to(root).as_posix())
    return found

def main():
    architecture=json.loads((ROOT/'config/architecture.json').read_text())
    workspace=tomllib.loads((ROOT/'Cargo.toml').read_text())['workspace']
    errors=[]
    def check(ok,message):
        if not ok: errors.append(message)
    check(workspace['members']==architecture['rust_members'],'Rust workspace differs from architecture registry')
    from check_embedded_assets import audit_workspace
    asset_errors,_=audit_workspace(ROOT)
    errors.extend(asset_errors)
    names=[]
    for member in workspace['members']:
        file=ROOT/member/'Cargo.toml'
        if not file.is_file(): errors.append('missing '+member); continue
        data=tomllib.loads(file.read_text());names.append(data['package']['name'])
        check('workspace' not in data,'nested workspace in '+member)
        for group in ['dependencies','dev-dependencies','build-dependencies']:
            for dep,value in data.get(group,{}).items():
                if isinstance(value,dict) and 'path' in value:
                    target=(file.parent/value['path']).resolve()
                    check(target.is_relative_to(ROOT) and (target/'Cargo.toml').is_file(),'invalid local dependency '+member+' -> '+dep)
    check(len(names)==len(set(names)),'duplicate active Rust package names')
    try: vendors=vendor_paths(ROOT, architecture, workspace['members'])
    except ValueError as error: errors.append(str(error)); vendors=set()
    try: vendors|=independent_paths(ROOT, architecture, workspace['members'])
    except ValueError as error: errors.append(str(error))
    discovered_crates=discover_crates(ROOT, ['apps','kernel','cognition','governance','work','evidence','orchestration','storage','verification','integration','integrations'], vendors)
    check(discovered_crates==set(workspace['members']),'active Rust crate missing from the unified workspace')
    for component in architecture['components']:
        check((ROOT/component['path']).exists(),'missing component '+component['id'])
    for path in ['storage/sql/Cargo.toml','verification/Cargo.toml']:
        check(not (ROOT/path).exists(),'obsolete nested workspace: '+path)
    discovered_nodes={p.parent.relative_to(ROOT).as_posix() for base in ['apps','integrations'] for p in (ROOT/base).glob('*/package.json')}
    check(discovered_nodes==set(architecture['node_packages']),'Node workspace differs from architecture registry')
    node_names=[]
    for path in architecture['node_packages']:
        node_names.append(json.loads((ROOT/path/'package.json').read_text())['name'])
    check(len(node_names)==len(set(node_names)),'duplicate active Node package names')
    for path in ['Cargo.lock','pnpm-lock.yaml','rust-toolchain.toml','pnpm-workspace.yaml']:
        check((ROOT/path).is_file(),'missing root authority '+path)
    for path in ['storage/sql/Cargo.lock','verification/Cargo.lock','apps/preflight/bun.lock','apps/melodic-lab/bun.lock']:
        check(not (ROOT/path).exists(),'obsolete active lockfile '+path)
    expected=json.loads((ROOT/'config/migrations.lock.json').read_text())
    actual={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'storage/sql/migrations').glob('*.sql'))}
    check(actual==expected,'published migration files differ from locked source identities')
    # Packaged plugin remains an isolated frozen artifact, not a root workspace dependency.
    for path in ['plugins/paybox/pnpm-lock.yaml','plugins/paybox/pnpm-workspace.yaml','plugins/paybox/starter-manifest.json']:
        check((ROOT/path).is_file(),'missing packaged plugin contract '+path)
    # Prevent old exported bundle paths from re-entering executable source/config.
    obsolete=['arkhe_agi_environment','arkhe_sql_phase1_postgres16_gates','arkhe_verify_phase1']
    for name in obsolete: check(not (ROOT/name).exists(),'legacy export root reappeared: '+name)
    for base in ['kernel','cognition','governance','work','evidence','orchestration','scripts','ops/runtime','.github']:
        for directory,dirs,files in os.walk(ROOT/base):
            dirs[:]=[d for d in dirs if d not in ['target','node_modules','__pycache__','local']]
            for name in files:
                path=Path(directory)/name
                if path.suffix in ['.rs','.toml','.py','.yml','.yaml'] or path.name=='Dockerfile':
                    if path.name=='check_architecture.py': continue
                    text=path.read_text(encoding='utf-8')
                    check(not any(value in text for value in obsolete),'obsolete source path in '+str(path.relative_to(ROOT)))
    if errors:
        for error in errors: print('FAIL '+error)
        raise SystemExit(1)
    print(f"PASS unified architecture: {len(names)} Rust crates, {len(node_names)} Node packages, {len(expected)} immutable migrations; historical and packaged boundaries preserved")
if __name__=='__main__': main()
