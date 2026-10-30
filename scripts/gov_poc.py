"""Reproduce the synthetic gov evidence PoC; offline verification performs no network I/O."""
import argparse, hashlib, json, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-build',action='store_true')
    args=parser.parse_args()
    out=ROOT/'docs/evidence/gov/2026-10-21';out.mkdir(parents=True,exist_ok=True)
    checks=[]
    def run(name,command):
        result=subprocess.run(command,cwd=ROOT,capture_output=True,text=True)
        (out/(name+'.log')).write_text(result.stdout+result.stderr,encoding='utf-8')
        if result.returncode: print(result.stdout+result.stderr);raise SystemExit(result.returncode)
        checks.append(name);print('PASS '+name)
        return result.stdout
    for name,suffix,filename in [('fixture',[],'cin-synthetic.json'),('trust',['--trust'],'test-trust-key.hex'),('checkpoint',['--anchor'],'besu-checkpoint.json')]:
        actual=run('generate-'+name,['cargo','run','-p','arkhe-verify-core','--example','gov_fixture','--locked','--']+suffix)
        expected=(ROOT/'integration/arkhe-gov/fixtures'/filename).read_text()
        if (actual.strip()!=expected.strip() if name=='trust' else json.loads(actual)!=json.loads(expected)):
            raise SystemExit('FAIL fixture drift: '+filename)
    lifecycle=run('generate-lifecycle',['cargo','run','-p','arkhe-verify-core','--example','gov_lifecycle_fixture','--locked'])
    if json.loads(lifecycle)!=json.loads((ROOT/'integration/arkhe-gov/fixtures/lifecycle-synthetic.json').read_text()):
        raise SystemExit('FAIL lifecycle fixture drift')
    run('native-release-policy',[sys.executable,'scripts/check_gov_release.py'])
    run('lifecycle',['cargo','test','-p','arkhe-verify-core','--test','gov_lifecycle','--locked'])
    run('native',['cargo','test','-p','arkhe-verify-core','--test','gov_offline','--locked'])
    if not args.skip_build:run('wasm-build',[sys.executable,'scripts/build_verifier.py'])
    run('offline-wasm',['node','--test','integration/arkhe-gov/offline.test.mjs','integration/arkhe-gov/lifecycle.test.mjs','integration/arkhe-gov/rekor.test.mjs'])
    paths=['config/gov-security.json','verification/crates/arkhe-verify-core/src/gov_lifecycle.rs','verification/crates/arkhe-verify-core/tests/gov_lifecycle.rs','scripts/check_gov_release.py','integration/arkhe-gov/prepare-rekor.mjs','integration/arkhe-gov/lifecycle.test.mjs','integration/arkhe-gov/rekor.test.mjs','verification/crates/arkhe-verify-core/src/gov.rs','verification/crates/arkhe-verify-core/examples/gov_fixture.rs','verification/crates/arkhe-verify-wasm/src/lib.rs','integration/arkhe-gov/offline.test.mjs','verification/crates/arkhe-verify-core/tests/gov_offline.rs','scripts/gov_poc.py']
    paths += ['ops/besu/anchor.cjs','docs/evidence/gov/2026-10-21/besu-anchor.json','docs/evidence/gov/2026-10-21/besu-chain-snapshot.json']
    paths += [p.relative_to(ROOT).as_posix() for p in (ROOT/'integration/arkhe-gov/fixtures').glob('*')]
    result={'scope':'synthetic credential evidence; not CIN identity verification','checks':checks,'credentialCount':4,'localBesuAnchoring':'PASS: see besu-anchor.json; not government infrastructure','offlineInclusion':'PASS','offlineCheckpointSignature':'PASS_TEST_KEY_ONLY','credentialTampering':'REJECTED','crossCredentialReplay':'REJECTED','governmentCredentialValidation':'NOT_PERFORMED','revocationOrFreshness':'NOT_PERFORMED','syntheticLifecycleVerification':'PASS: expiry and authenticated status receipt; native OCSP/CRL/CIN verification NOT_PERFORMED','hardwareAttestation':'BLOCKED_PLATFORM_UNSELECTED','publicRekor':'PREPARED_NOT_PUBLISHED','productionConformance':'NOT_CLAIMED','sha256':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths}}
    (out/'results.json').write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
