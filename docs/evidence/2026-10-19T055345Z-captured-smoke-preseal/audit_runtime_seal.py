"""Freeze a unified-contract snapshot and audit seal readiness; never executes probes."""
import argparse
import hashlib
import json
from pathlib import Path
from containment_probe import write_json, manifest, no_duplicates, reject_constant
from runtime_containment import ROOT

FIELDS=[('mount_contract','final_manifest_sha256'),('seccomp_contract','profile_file_sha256'),('seccomp_contract','abi_table_sha256'),('seccomp_contract','expanded_rule_manifest_sha256'),('seccomp_contract','compiled_filter_evidence_sha256')]

FIELD_BINDINGS={'final_manifest_sha256':'mount_manifest','profile_file_sha256':'seccomp_profile','abi_table_sha256':'abi_table','expanded_rule_manifest_sha256':'expanded_rule_manifest','compiled_filter_evidence_sha256':'compiled_filter_evidence'}

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def audit(contract,catalog,bindings=None):
    bindings=bindings or {}
    issues=[]
    def block(code,detail):issues.append({'code':code,'detail':detail})
    if contract.get('state')!='READY_FOR_SEAL':block('CONTRACT_NOT_READY',str(contract.get('state')))
    expected={v['id'] for v in catalog['vectors']}
    ids=contract.get('vectors',[])
    if len(ids)!=22 or len(set(ids))!=22 or set(ids)!=expected:block('VECTOR_SET_MISMATCH','require exactly the 22 catalog IDs')
    if contract.get('runtime_verified') is not False:block('PREMATURE_VERIFICATION','contract must not assert runtime verification before execution')
    if contract.get('execution_enabled') is not False:block('PREMATURE_EXECUTION','pre-seal contract must leave execution disabled')
    for section,key in FIELDS:
        value=contract.get(section,{}).get(key)
        if not isinstance(value,str) or len(value)!=64 or any(c not in '0123456789abcdef' for c in value):block('UNBOUND_ARTIFACT',section+'.'+key)
        elif isinstance(bindings.get(FIELD_BINDINGS[key]),dict) and bindings[FIELD_BINDINGS[key]].get('sha256')!=value:block('CONTRACT_BINDING_MISMATCH',section+'.'+key)
    target=contract.get('target_profile',{})
    expected_cgroup={'memory.max':str(target.get('memory_bytes')),'memory.swap.max':str(target.get('memory_swap_max_bytes')),'cpu.max':'50000 100000','pids.max':str(target.get('pids_max'))}
    if target.get('memory_bytes')!=134217728 or target.get('cpu_quota')!=0.5 or target.get('pids_max')!=16 or contract.get('overrides',{}).get('cgroup-enforcement')!=expected_cgroup:block('TARGET_LIMIT_MISMATCH','all target expectations must match the single reduced candidate')
    if target.get('production_1536m_approval') is not False:block('PRODUCTION_SCOPE_OVERCLAIM','128 MiB candidate does not verify 1536 MiB production')
    for role in contract.get('seal',{}).get('required_sha256',[]):
        entry=bindings.get(role)
        if not isinstance(entry,dict):block('MISSING_SEAL_BINDING',role);continue
        value=entry.get('sha256')
        if not isinstance(value,str) or len(value)!=64 or any(c not in '0123456789abcdef' for c in value):block('INVALID_BINDING_HASH',role);continue
        if role=='image':
            if entry.get('image_id')!='sha256:'+value:block('INVALID_IMAGE_BINDING',role)
            continue
        path=entry.get('path')
        if not isinstance(path,str):block('MISSING_BINDING_PATH',role);continue
        candidate=(ROOT/path).resolve()
        if not candidate.is_relative_to(ROOT.resolve()) or not candidate.is_file() or sha(candidate)!=value:block('ARTIFACT_HASH_MISMATCH',role)
    # File hashes alone do not validate semantics, rule coverage or the runtime.
    pending=contract.get('remaining_work',[])
    if pending:block('PENDING_IMPLEMENTATION',pending)
    return {'schema':1,'kind':'pre-seal-readiness-audit','snapshot_frozen':False,'state':'SEAL_BLOCKED' if issues else 'SEMANTIC_REVIEW_REQUIRED','runtime_verified':False,'execution_started':False,'sealed':False,'issues':issues,'note':'An SHA-256 snapshot is not an executable seal, attestation or runtime approval. This auditor cannot promote or launch a trial.'}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--contract',type=Path,default=ROOT/'config/runtime-unified-contract.json');p.add_argument('--output',type=Path,required=True);p.add_argument('--bindings',type=Path)
    args=p.parse_args();output=args.output.resolve()
    if not output.is_relative_to(ROOT/'docs/evidence'):raise ValueError('evidence must stay under workspace docs/evidence')
    if output.exists():raise ValueError('refuse to overwrite existing evidence')
    contract_bytes=args.contract.read_bytes();contract=json.loads(contract_bytes,object_pairs_hook=no_duplicates,parse_constant=reject_constant)
    catalog=json.loads((ROOT/'config/runtime-containment-vectors.json').read_text())
    bindings=json.loads(args.bindings.read_text(),object_pairs_hook=no_duplicates,parse_constant=reject_constant) if args.bindings else {}
    result=audit(contract,catalog,bindings)
    output.mkdir(parents=True)
    (output/'runtime-unified-contract.json').write_bytes(contract_bytes)
    result['snapshot_frozen']=True
    result['contract_sha256']=hashlib.sha256(contract_bytes).hexdigest()
    result['catalog_sha256']=sha(ROOT/'config/runtime-containment-vectors.json')
    (output/'catalog.json').write_bytes((ROOT/'config/runtime-containment-vectors.json').read_bytes())
    (output/'audit_runtime_seal.py').write_bytes(Path(__file__).read_bytes())
    write_json(output/'results.json',result)
    lines=['# Pré-selamento do contrato unificado','',f"Estado: {result['state']}. Snapshot congelado; sealed=false.",'Execução não iniciada; runtime_verified=false.','',f"SHA-256 do contrato: `{result['contract_sha256']}`",'','## Bloqueios','']
    lines += ['- '+issue['code']+': '+(issue['detail'] if isinstance(issue['detail'],str) else '; '.join(issue['detail'])) for issue in result['issues']]
    lines+=['','O manifesto SHA256SUMS verifica bytes dos artefatos, sem assinatura ou atestação.','Para selar execução, implementar e vincular os artefatos faltantes, revisar a','cobertura semântica, observar a identidade real do runtime e validar o runner.','Não reutilizar PASS de ensaios parciais como aprovação da corrida unificada.']
    (output/'REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8');manifest(output)
    print(json.dumps({'state':result['state'],'contract_sha256':result['contract_sha256'],'issues':len(result['issues']),'report':str(output/'REPORT.md')},indent=2))
    return 2

if __name__=='__main__':raise SystemExit(main())
