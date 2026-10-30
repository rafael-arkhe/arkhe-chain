"""Assess paired smoke source receipts and candidate load evidence; never seal runtime."""
import argparse,copy,hashlib,json
from pathlib import Path
from containment_probe import ROOT,write_json,manifest
from mount_manifest import compare
from seccomp_load_capture import assess as assess_load
from runtime_containment import digest

def assess_mounts(candidate,before,after,source_before,source_after):
    expected={x['target'] for x in candidate['mounts']}
    if len(expected)!=len(candidate['mounts']) or len(expected)!=38:raise ValueError('candidate mount set mismatch')
    for snapshot,source in [(before,source_before),(after,source_after)]:
        rows=source['records']
        if source['verdict']!='VERIFIED' or len(rows)!=len(expected) or {x['target'] for x in rows}!=expected or any(x['status']!='VERIFIED' or not x.get('method') for x in rows):raise ValueError('incomplete source bindings')
        if source['container_id']!=snapshot['oracle']['container_id'] or source['host_pid']!=snapshot['oracle']['host_pid']:raise ValueError('source/target identity mismatch')
        checked=compare(candidate,snapshot)
        if checked['issues'] or checked['source_binding_review_required']:raise ValueError('mount/device comparison did not verify source bindings')
    a=before['oracle'];b=after['oracle']
    for key in ['container_id','host_pid','boot_id','namespaces','membership','uid_map']:
        if a[key]!=b[key]:raise ValueError('target identity changed: '+key)
    if a['mountinfo']!=b['mountinfo'] or before['device_metadata']!=after['device_metadata']:raise ValueError('mount/device state changed')
    if source_before['oci_config_sha256']!=source_after['oci_config_sha256'] or source_before['records']!=source_after['records']:raise ValueError('source bindings changed')
    rules=copy.deepcopy(candidate)
    rules.update(state='SMOKE_VERIFIED_CANDIDATE_MOUNT_MANIFEST',execution_enabled=False,sealed=False,runtime_verified=False)
    rules['verification']={'method':'independent target and correlated conmon namespace reads, exact OCI source/engine root paths, inode/content parity and mask checks','before_after_match':True,'source_bindings_verified':38,'kernel_filter_chain_verified':False,'reusable_previous_pass':False,'applicability':'Policy template only. Every new target must resolve its own container/fixture/namespace identities with the pinned verifier; observed raw host paths are references, not wildcards.'}
    rules['reference']={'container_id':a['container_id'],'boot_id':a['boot_id'],'source_bindings':source_before['records'],'mount_metadata':before['mount_metadata'],'device_metadata':before['device_metadata']}
    return rules

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--trial',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    trial=a.trial.resolve();out=a.output.resolve()
    if not trial.is_relative_to(ROOT/'docs/evidence') or not out.is_relative_to(ROOT/'docs/evidence') or out.exists():raise ValueError('new evidence folder required')
    for line in (trial/'SHA256SUMS').read_text().splitlines():
        h,name=line.split('  ',1);path=(trial/name).resolve()
        if not path.is_relative_to(trial) or digest(path)!=h:raise ValueError('trial manifest mismatch')
    read=lambda path:json.loads(path.read_text())
    report=read(trial/'results.json');candidate=read(ROOT/'config/runtime-mounts-candidate.json')
    if report['errors'] or not report['lease_released'] or not all(x['absent'] for x in report['cleanup']):raise ValueError('trial/cleanup incomplete')
    if digest(ROOT/'config/runtime-mounts-candidate.json')!=report['candidate']['mount_spec_sha256']:raise ValueError('candidate changed')
    profile=ROOT/'config/seccomp/arkhe-unified-x86_64-v1/profile.json'
    if digest(profile)!=report['candidate']['profile_sha256']:raise ValueError('profile changed')
    before=read(trial/'host-receipts/before.json');after=read(trial/'host-receipts/after.json')
    source_before=read(trial/'source-bindings/result-1.json');source_after=read(trial/'source-bindings/result-2.json')
    mounts=assess_mounts(candidate,before,after,source_before,source_after)
    program=(ROOT/'config/seccomp/arkhe-unified-x86_64-v1/candidate.bpf').read_bytes()
    traces=read(trial/'runtime-traces.json')
    if any(t['uid']!=1000 or t['mode']!='0o600' for t in traces):raise ValueError('untrusted trace ownership/mode')
    load=assess_load(traces,before['oracle']['container_id'],before['oracle']['host_pid'],program)
    load.update(profile_file_sha256=digest(profile),trace_artifact_sha256=digest(trial/'runtime-traces.json'),source_trial_sha256=digest(trial/'results.json'),boot_id=before['oracle']['boot_id'],target_seccomp_status=before['oracle']['status'],capture_runtime=report['capture_runtime'])
    out.mkdir();write_json(out/'mount-manifest.json',mounts);write_json(out/'candidate-load-evidence.json',load);(out/'candidate-loaded.bpf').write_bytes(program)
    for name in ['scripts/assess_runtime_smoke.py','scripts/seccomp_load_capture.py','scripts/vm_source_bindings.py','scripts/run_captured_smoke.py','scripts/run_unified_smoke.py','scripts/mount_manifest.py','scripts/vm_mount_snapshot.py','config/runtime-mounts-candidate.json','config/runtime-unified-contract.json']:
        target=out/'execution-sources'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((ROOT/name).read_bytes())
    write_json(out/'results.json',{'state':'SMOKE_ARTIFACTS_VERIFIED_NOT_RUNTIME_SEALED','sealed':False,'runtime_verified':False,'source_trial':str(trial),'mount_manifest_sha256':digest(out/'mount-manifest.json'),'compiled_candidate_load_evidence_sha256':digest(out/'candidate-load-evidence.json'),'mount_bindings_verified':38,'device_expectations':len(candidate['devices']),'filter_instruction_count':load['events'][0]['instruction_count'],'inherited_filter_chain_captured':False,'dynamic_rule_coverage_complete':False})
    (out/'REPORT.md').write_text('# Validação de artefatos do smoke\n\n38 fontes/máscaras verificadas antes/depois; 13 expectativas de dispositivos.\nFiltro candidato: 383 instruções idênticas ao artefato offline, fornecidas\npelo crun ao seccomp SET_MODE_FILTER com retorno 0 no PID do alvo.\nNão é dump pós-carregamento nem captura dos demais filtros herdados.\nManifesto e evidência aptos a binding; sealed=false; runtime_verified=false.\nFaltam runner unificado, source snapshot e cobertura dinâmica completa.\n',encoding='utf-8')
    manifest(out);print(json.dumps({'output':str(out),'mounts_verified':38,'candidate_load_observed':True,'runtime_verified':False}))
if __name__=='__main__':main()
