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

def function_body(text, name):
    """Return the brace body of the first Rust function with this name."""
    start=text.find('fn '+name)
    if start<0: return None
    opening=text.find('{', start)
    if opening<0: return None
    depth=0
    for index,char in enumerate(text[opening:], opening):
        if char=='{': depth+=1
        elif char=='}':
            depth-=1
            if depth==0: return text[opening:index+1]
    return None

def main():
    architecture=json.loads((ROOT/'config/architecture.json').read_text())
    workspace=tomllib.loads((ROOT/'Cargo.toml').read_text())['workspace']
    errors=[]
    def check(ok,message):
        if not ok: errors.append(message)
    check(workspace['members']==architecture['rust_members'],'Rust workspace differs from architecture registry')
    skeleton=architecture.get('skeleton_members',[])
    check(isinstance(skeleton,list) and len(skeleton)==len(set(skeleton)),'duplicate skeleton members')
    for path in skeleton:
        check(path in workspace['members'],'skeleton member outside the unified workspace: '+path)
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
    discovered_crates=discover_crates(ROOT, ['apps','kernel','cognition','governance','work','evidence','orchestration','storage','verification','integration','integrations','barrier','state','probes','models','formal','eval'], vendors)
    check(discovered_crates==set(workspace['members']),'active Rust crate missing from the unified workspace')
    for component in architecture['components']:
        check((ROOT/component['path']).exists(),'missing component '+component['id'])
    component_ids={item['id'] for item in architecture['components']}
    edges=architecture.get('edges',[])
    check(isinstance(edges,list) and edges,'architecture has no edges')
    releasing=[edge for edge in edges if edge.get('releases_effect') is True]
    check(releasing==[{'from':'barrier','to':'world','carries':'effect','releases_effect':True,'status':'unwired'}],'only an unwired barrier may release an effect')
    for edge in edges:
        check(edge.get('from') in component_ids,'edge leaves an unknown component: '+str(edge.get('from')))
        check(edge.get('to')=='world' or edge.get('to') in component_ids,'edge enters an unknown component: '+str(edge.get('to')))
        check(edge.get('releases_effect') in (True,False),'edge lacks a release flag')
    skeleton_names=set()
    for path in skeleton:
        data=tomllib.loads((ROOT/path/'Cargo.toml').read_text())
        skeleton_names.add(data['package']['name'])
        for group in ['dependencies','dev-dependencies','build-dependencies']:
            check('arkhe-kernel' not in data.get(group,{}),'skeleton crate depends on the live gate: '+path)
    kernel_manifest=tomllib.loads((ROOT/'kernel/arkhe-kernel/Cargo.toml').read_text())
    for group in ['dependencies','dev-dependencies','build-dependencies']:
        overlap=skeleton_names.intersection(kernel_manifest.get(group,{}))
        check(not overlap,'live gate depends on the skeleton: '+', '.join(sorted(overlap)))
    def dependency_names(manifest, groups):
        found=set()
        for group in groups:
            found.update(manifest.get(group, {}))
        return found
    for wall in architecture.get('dependency_walls', []):
        groups=wall.get('groups', ['dependencies','dev-dependencies','build-dependencies'])
        members=[member for member in workspace['members'] if member in wall.get('from_members', []) or any(member.startswith(prefix) for prefix in wall.get('from_prefixes', []))]
        check(bool(members),'dependency wall matches no crate: '+wall['id'])
        for member in members:
            manifest=tomllib.loads((ROOT/member/'Cargo.toml').read_text())
            crossed=dependency_names(manifest, groups).intersection(wall['forbids'])
            check(not crossed, member+' crosses '+wall['id']+': '+', '.join(sorted(crossed)))
    client=architecture['unpinned_client']
    pin=tomllib.loads((ROOT/client['path']).read_text())
    for key in ['id','snapshot','weights_in_git','may_sign','authority']:
        check(pin.get(key)==client[key],'unpinned client drifted: '+key)
    task_spec=architecture['eval_task']
    task=json.loads((ROOT/task_spec['path']).read_text())
    check(task.get('id')==task_spec['id'] and task.get('frozen') is False and task.get('human_hours') is None,'eval task is not the unfrozen null task')
    check(task.get('write_set_excludes')==task_spec['write_set_excludes'],'eval write set drifted')
    for path in task_spec['write_set_excludes']:
        check((ROOT/path).is_dir(),'eval write exclusion missing: '+path)
    proof=architecture['formal_proof']
    check(proof['must_contain'] in (ROOT/proof['path']).read_text(encoding='utf-8'),'formal proof file dropped the hardware bridge disclaimer')
    receipt=architecture['receipt']
    receipt_text=(ROOT/receipt['file']).read_text(encoding='utf-8')
    body=function_body(receipt_text, receipt['function'])
    check(body is not None,'receipt function missing: '+receipt['function'])
    if body is not None:
        for token in receipt['forbids']:
            check(token not in body,'receipt executes or reaches the skeleton: '+token)
    forbidden=architecture['unwired_sources']['forbids']
    for tree in architecture['unwired_sources']['trees']:
        for directory,dirs,files in os.walk(ROOT/tree):
            dirs[:]=[d for d in dirs if d not in ['target']]
            for name in files:
                if not name.endswith('.rs'): continue
                text=(Path(directory)/name).read_text(encoding='utf-8')
                for token in forbidden:
                    check(token not in text,'live source names the skeleton: '+str((Path(directory)/name).relative_to(ROOT))+' '+token)
    launch=architecture['process_launch']
    launch_hits=[]
    for directory,dirs,files in os.walk(ROOT/launch['tree']):
        dirs[:]=[d for d in dirs if d not in ['target']]
        for name in files:
            if not name.endswith('.rs'): continue
            path=(Path(directory)/name).relative_to(ROOT).as_posix()
            if launch['token'] in (ROOT/path).read_text(encoding='utf-8'): launch_hits.append(path)
    check(sorted(launch_hits)==sorted(launch['allowed']),'process launch moved outside the qualified preview: '+', '.join(sorted(launch_hits)))
    decision=architecture['event_decision']
    decision_body=function_body((ROOT/decision['file']).read_text(encoding='utf-8'), decision['function'])
    check(decision_body is not None,'event decision missing: '+decision['function'])
    if decision_body is not None:
        for token in decision['requires']:
            check(token in decision_body,'event decision lost its fail-closed predicate: '+token)
    allow=architecture['authorization_allow']
    allow_text=(ROOT/allow['file']).read_text(encoding='utf-8')
    allow_body=function_body(allow_text, allow['function'])
    check(allow_body is not None and allow_text.count(allow['construct'])==1 and allow['construct'] in (allow_body or ''),'authorization Allow is no longer a single checked construction')
    stop=architecture['emergency_stop']
    stop_text=(ROOT/stop['file']).read_text(encoding='utf-8')
    check(stop['field'] in stop_text and function_body(stop_text, stop['setter']) is not None,'emergency stop is no longer a caller-set bool')
    for directory,dirs,files in os.walk(ROOT/stop['tree']):
        dirs[:]=[d for d in dirs if d not in ['target']]
        for name in files:
            if not name.endswith('.rs'): continue
            text=(Path(directory)/name).read_text(encoding='utf-8')
            for token in stop['forbids']:
                check(token not in text,'gate source preempts a process: '+token+' in '+name)
    producers=architecture['unsigned_producers']
    for member in workspace['members']:
        if not any(member.startswith(prefix) for prefix in producers['prefixes']): continue
        source=ROOT/member/'src'
        if not source.is_dir(): continue
        for directory,dirs,files in os.walk(source):
            dirs[:]=[d for d in dirs if d not in ['target']]
            for name in files:
                if not name.endswith('.rs'): continue
                path=Path(directory)/name
                check(producers['token'] not in path.read_text(encoding='utf-8'),'producer source holds a signing key: '+str(path.relative_to(ROOT)))
    pure=architecture['pure_verifier']
    pure_manifest=tomllib.loads((ROOT/pure['member']/'Cargo.toml').read_text())
    pure_deps=set()
    for group in ['dependencies','dev-dependencies','build-dependencies']:
        pure_deps.update(pure_manifest.get(group, {}))
    crossed=pure_deps.intersection(pure['forbid_dependencies'])
    check(not crossed,'pure verifier gained an effect dependency: '+', '.join(sorted(crossed)))
    for directory,dirs,files in os.walk(ROOT/pure['member']/'src'):
        dirs[:]=[d for d in dirs if d not in ['target']]
        for name in files:
            if not name.endswith('.rs'): continue
            text=(Path(directory)/name).read_text(encoding='utf-8')
            for token in pure['src_forbids']:
                check(token not in text,'pure verifier source left its boundary: '+token+' in '+name)
    spec=architecture['formal_spec']
    spec_text=(ROOT/spec['path']).read_text(encoding='utf-8')
    for token in spec['requires']:
        check(token in spec_text,'formal spec lost '+token)
    for token in spec['forbids']:
        check(token not in spec_text,'formal spec gained a release step: '+token)
    for item in architecture.get('skeleton_texts', []):
        text=(ROOT/item['path']).read_text(encoding='utf-8')
        for token in item.get('requires', []):
            check(token in text,'skeleton file lost '+token+' in '+item['path'])
        for token in item.get('forbids', []):
            check(token not in text,'skeleton file gained '+token+' in '+item['path'])
    client_file=architecture['model_client']
    client_pin=tomllib.loads((ROOT/client_file['path']).read_text())
    check(client_pin.get('pin')==client_file['pin'] and (ROOT/'models'/client_file['pin']).is_file(),'model client lost its pin')
    for key in ['holds_keys','writes_evidence','releases_effect']:
        check(client_pin.get(key) is False,'model client gained authority: '+key)
    verifier=architecture['eval_verifier']
    check(verifier['must_contain'] in (ROOT/verifier['path']).read_text(encoding='utf-8'),'eval verifier no longer excludes the agent write set')
    mmr=architecture['mmr_reexport']
    authority_text=(ROOT/architecture['authorities']['mmr_profile']).read_text(encoding='utf-8')
    for token in mmr['defines']:
        check(token in authority_text,'MMR authority lost '+token)
    reexport=(ROOT/mmr['reexport']).read_text(encoding='utf-8')
    check('pub use arkhe_verify_core::mmr::profile::' in reexport,'SQL no longer reexports the MMR profile')
    for name in mmr['names']:
        check(name in reexport,'SQL reexport dropped '+name)
    for directory,dirs,files in os.walk(ROOT/mmr['tree']):
        dirs[:]=[d for d in dirs if d not in ['target']]
        for name in files:
            if not name.endswith('.rs'): continue
            text=(Path(directory)/name).read_text(encoding='utf-8')
            for token in mmr['forbid_local']:
                check(token not in text,'SQL redefined the MMR profile: '+token+' in '+name)
    scaffold=architecture['health_scaffold']
    scaffold_text=(ROOT/scaffold['file']).read_text(encoding='utf-8')
    for token in scaffold['requires']:
        check(token in scaffold_text,'health scaffold lost '+token)
    for token in scaffold['forbids']:
        check(token not in scaffold_text,'health scaffold gained authorization: '+token)
    identity=architecture['work_identity']
    check(identity['canonical_marker'] in (ROOT/identity['canonical']).read_text(encoding='utf-8'),'canonical encoding lost AKG-CBOR-v1')
    check(architecture['authorities']['work_identity']=='kernel/arkhe-core','work identity authority moved')
    found={}
    for member in workspace['members']:
        source=ROOT/member/'src'
        if not source.is_dir(): continue
        for directory,dirs,files in os.walk(source):
            dirs[:]=[d for d in dirs if d not in ['target']]
            for name in files:
                if not name.endswith('.rs'): continue
                text=(Path(directory)/name).read_text(encoding='utf-8')
                relative=(Path(directory)/name).relative_to(ROOT).as_posix()
                for type_name in identity['types']:
                    if 'pub struct '+type_name in text: found.setdefault(type_name,[]).append(relative)
    for type_name, path in identity['types'].items():
        check(found.get(type_name)==[path],'work identity type moved: '+type_name+' -> '+', '.join(found.get(type_name,[])))
    for path in identity['operational']:
        check((ROOT/path).is_file(),'operational authority missing: '+path)
    policy=architecture['policy_verdict']
    check(architecture['authorities']['policy']=='governance/arkhe-governance','policy authority moved')
    policy_defs=[]
    for member in workspace['members']:
        source=ROOT/member/'src'
        if not source.is_dir(): continue
        silent=any(member.startswith(prefix) for prefix in policy['silent_prefixes'])
        for directory,dirs,files in os.walk(source):
            dirs[:]=[d for d in dirs if d not in ['target']]
            for name in files:
                if not name.endswith('.rs'): continue
                text=(Path(directory)/name).read_text(encoding='utf-8')
                relative=(Path(directory)/name).relative_to(ROOT).as_posix()
                if 'pub enum PolicyVerdict' in text: policy_defs.append(relative)
                if silent: check('PolicyVerdict::Allow' not in text,'silent layer emitted a policy allow: '+relative)
    check(policy_defs==[policy['definition']],'policy verdict type moved: '+', '.join(policy_defs))
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
