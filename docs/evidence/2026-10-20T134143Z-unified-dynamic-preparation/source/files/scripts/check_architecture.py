"""Fail closed on layout drift, duplicate active crates, outside dependencies or changed migrations."""
import hashlib,json,os,sys,tomllib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
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
    discovered_crates=set()
    for layer in ['kernel','cognition','governance','work','evidence','orchestration','storage','verification','integration']:
        for folder,dirs,files in os.walk(ROOT/layer):
            dirs[:]=[d for d in dirs if d not in ['target','node_modules','__pycache__','pkg']]
            if 'Cargo.toml' in files: discovered_crates.add(Path(folder).relative_to(ROOT).as_posix())
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
