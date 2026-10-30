"""Check and package observed public release/policy evidence, without new signing.

Historical manifests/mutations are retained as historical observations, not asserted
to cover all newly added code. The new production manifest hashes the current files.
"""
import datetime,hashlib,json,os,re,subprocess,zipfile
from pathlib import Path

DEMO=Path(__file__).resolve().parents[1]
ROOT=DEMO.parent
SOURCE=ROOT/'output/wasm-policy-release-repo/verification/arkhe-proof-release'
E=DEMO/'evidence'
A=E/'public-release/artifacts'
COMMIT='b444c79a13fec25b7b944f3c8a7e39ab3f34f3dc'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def count_tests(p): return sum(map(int,re.findall(r'test result: ok\. (\d+) passed',p.read_text(encoding='utf-8'))))
ci=load(A/'release-manifest.json')
assert ci['commit']==COMMIT
for name,value in ci['files'].items(): assert sha(A/name)==value,name
assert sha(E/'public-release/github-artifact.zip')=='b0cc413f8837e8c50f518a7542c2139fb0be679e42abc6491d7725feb59428b2'
wasm_hash=sha(A/'arkhe-verify.wasm')
assert wasm_hash=='049672c75c9e96391d004a61f998c2893ffaa5ec0f8117d3ad03777b7b5b28de'
local=load(E/'public-release/local-independent-verification.json')
assert local['positive']==1 and local['rejected_attacks']==15 and local['wasm_sha256']==wasm_hash
negative=load(E/'public-release/negative-controls.json')
assert len(negative['cases'])==6 and all(c['rejected_for_expected_reason'] for c in negative['cases'])
mutants=load(E/'policy-mutations/result.json')
assert len(mutants['cases'])==5 and all(c['killed_by_assertions'] for c in mutants['cases'])
assert mutants['build_products_isolated_per_mutant'] and mutants['original_source_unchanged'] and mutants['final_original_exit_code']==0
assert mutants['policy_source_sha256']==sha(SOURCE/'verification/crates/arkhe-verify-core/src/policy.rs')
assert count_tests(E/'policy-mutations/final-original.txt')==9
assert count_tests(E/'current-verifier-tests.txt')==19
source_manifest=load(SOURCE/'source-manifest.json')
repo=SOURCE.parents[1]
for f in source_manifest['files']:
    assert sha(SOURCE/f['path'])==f['sha256']
    git_path='verification/arkhe-proof-release/'+f['path']
    blob=subprocess.check_output(['git','show',COMMIT+':'+git_path],cwd=repo)
    assert hashlib.sha256(blob).hexdigest()==f['sha256'],git_path
entry=load(A/'arkhe-verify.wasm.bundle.json')['verificationMaterial']['tlogEntries'][0]
report={
    'observed_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'repository':'rafael-arkhe/arkhe','signed_source_commit':COMMIT,
    'workflow_run':'https://github.com/rafael-arkhe/arkhe/actions/runs/40177979432',
    'pull_request':'https://github.com/rafael-arkhe/arkhe/pull/2',
    'wasm_sha256':wasm_hash,'signer_identity':local['identity'],
    'public_oidc_signing_and_rekor_executed':True,
    'ci_cosign_offline_verification_passed':True,
    'ci_rust_verification_and_wasm_policy_execution_passed':True,
    'local_independent_trust_verification_passed':True,
    'wasm_positive_controls':1,'wasm_rejected_attacks':15,
    'offline_public_negative_controls':6,'native_verifier_tests_passed':19,
    'native_policy_tests_passed':9,'compatibility_property_cases':[10000,10000],
    'production_policy_mutants_killed':5,'mutant_build_products_isolated':True,
    'signed_rekor_global_index':entry['logIndex'],
    'merkle_proof_leaf_index':entry['inclusionProof']['logIndex'],
    'source_snapshot_matches_signed_git_commit':True,
    'journal_replay_dispatch_atomicity_implemented_here':False,
    'formal_or_slsa_certification_claimed':False,
}
(E/'production-result.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
files=[]
def walk(base,prefix):
    for directory,dirs,names in os.walk(base):
        dirs[:]=sorted(d for d in dirs if d not in {'target','.git','__pycache__','artifacts'}) if base==SOURCE else sorted(d for d in dirs if d not in {'target','.git','__pycache__'})
        for name in sorted(names):
            path=Path(directory)/name
            rel=prefix+'/'+path.relative_to(base).as_posix()
            if path in {E/'production-manifest.json',E/'production-manifest.sha256'}: continue
            files.append((path,rel))
walk(DEMO,'arkhe-verify-self-demo')
walk(SOURCE,'output/wasm-policy-release-repo/verification/arkhe-proof-release')
workflow=ROOT/'output/wasm-policy-release-repo/.github/workflows/build-verify-wasm.yml'
files.append((workflow,'output/wasm-policy-release-repo/.github/workflows/build-verify-wasm.yml'))
manifest={'files':[{'path':rel,'bytes':p.stat().st_size,'sha256':sha(p)} for p,rel in files]}
mp=E/'production-manifest.json'
mp.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
checksum=E/'production-manifest.sha256'
checksum.write_text(sha(mp)+'  production-manifest.json\n',encoding='utf-8')
archive=ROOT/'arkhe-production-verification-20261025.zip'
if archive.exists(): raise RuntimeError('Refusing to overwrite an existing review archive')
with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED) as z:
    for p,rel in files: z.write(p,rel)
    z.write(mp,'arkhe-verify-self-demo/evidence/production-manifest.json')
    z.write(checksum,'arkhe-verify-self-demo/evidence/production-manifest.sha256')
print(json.dumps({'archive':str(archive),'archive_sha256':sha(archive),'hashed_files':len(files),'public_wasm_sha256':wasm_hash},indent=2))
