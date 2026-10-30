"""Mutation evidence for the actual production policy module, in isolated copies.

Uses the release workspace's exact Cargo.lock, unchanged dependencies, and real
Ed25519 test signatures. Runtime assertion failures count; compiler errors do not.
"""
import hashlib,json,os,re,shutil,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'output/wasm-policy-release-repo/verification/arkhe-proof-release'
EVIDENCE=ROOT/'arkhe-verify-self-demo/evidence/policy-mutations'
EVIDENCE.mkdir(parents=True,exist_ok=True)
REL='verification/crates/arkhe-verify-core/src/policy.rs'
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
before=sha(SOURCE/REL)
lock=sha(SOURCE/'Cargo.lock')
def run(args,cwd,name):
    # Separate build products are mandatory: identical package IDs in copied
    # workspaces can otherwise reuse a mutant's test binary by timestamp.
    target=(ROOT/'arkhe-verify-self-demo/target/policy-control') if cwd==SOURCE else cwd/'target'
    env=dict(os.environ,CARGO_TARGET_DIR=str(target),RUSTFLAGS='',CARGO_TERM_COLOR='never')
    out=subprocess.run(args,cwd=cwd,env=env,text=True,encoding='utf-8',errors='replace',stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    (EVIDENCE/(name+'.txt')).write_text(out.stdout,encoding='utf-8')
    print(name+': '+str(out.returncode),flush=True)
    return out
base=['cargo','test','--locked','-p','arkhe-verify-core']
assert run(base+['--test','policy_adversarial','--test','policy_compatibility'],SOURCE,'baseline').returncode==0
cases=[
    ('intent_binding','policy_adversarial','scenario_10_digest_replay_is_rejected',
     'if request.action != intent.action || request.parameters_digest != intent.digest() {','if false { // MUTANT: no intent binding'),
    ('worker_key_binding','policy_adversarial','worker_a_key_cannot_claim_worker_b',
     '.get(&record.worker_id)','.get("worker-a")'),
    ('ambiguous_encoding','policy_adversarial','delimiter_ambiguity_and_signing_domains_are_separated',
     'out.extend_from_slice(&(bytes.len() as u64).to_be_bytes());\n    out.extend_from_slice(bytes);',
     'out.extend_from_slice(bytes);\n    out.push(b\'|\'); // MUTANT: ambiguous delimiter encoding'),
    ('module_version_policy','policy_adversarial','adversarial_vectors_reject_every_attack_with_valid_positive_control',
     'self\n                .allowed\n                .contains(&(action.module_id.clone(), action.module_version.clone()))','true /* MUTANT: any module/version */'),
    ('unjustified_migration','policy_compatibility','unjustified_restriction_has_deterministic_counterexample',
     '!old.permits_action(action) || new.permits_action(action) || reasons.iter().any(|r| {',
     'true || !old.permits_action(action) || new.permits_action(action) || reasons.iter().any(|r| {'),
]
report={'policy_source_sha256':before,'cargo_lock_sha256':lock,'build_products_isolated_per_mutant':True,'cases':[]}
with tempfile.TemporaryDirectory(prefix='arkhe-policy-mutations-') as temporary:
    for name,testfile,test,old,new in cases:
        directory=Path(temporary)/name
        shutil.copytree(SOURCE,directory,ignore=shutil.ignore_patterns('target','loader','artifacts'))
        path=directory/REL
        text=path.read_text(encoding='utf-8')
        if text.count(old)!=1: raise RuntimeError(f'{name}: mutation anchor count {text.count(old)}')
        path.write_text(text.replace(old,new),encoding='utf-8')
        assert sha(directory/'Cargo.lock')==lock
        out=run(base+['--test',testfile,test,'--','--exact'],directory,name)
        failures=re.findall(r'^test (\S+) \.\.\. FAILED$',out.stdout,re.MULTILINE)
        killed=out.returncode==101 and failures==[test] and 'test result: FAILED' in out.stdout
        report['cases'].append({'mutation':name,'killed_by_assertions':killed,'exit_code':out.returncode,
            'expected_failed_test':test,'actual_failed_tests':failures,'mutated_source_sha256':sha(path),'cargo_lock_unchanged':True})
        (EVIDENCE/(name+'.patch.txt')).write_text('- '+old+'\n+ '+new+'\n',encoding='utf-8')
        (EVIDENCE/'result.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        if not killed: raise RuntimeError(name+' was not killed by its runtime assertion')
assert sha(SOURCE/REL)==before and sha(SOURCE/'Cargo.lock')==lock
final=run(base+['--test','policy_adversarial','--test','policy_compatibility'],SOURCE,'final-original')
report.update(original_source_unchanged=True,final_original_exit_code=final.returncode)
(EVIDENCE/'result.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
assert final.returncode==0
print('Five policy mutants killed; unchanged original policy suite passed.',flush=True)
