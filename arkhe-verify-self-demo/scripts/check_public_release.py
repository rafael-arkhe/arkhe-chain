"""Offline local recheck of the actual public production release, plus six negatives.

Uses a trust directory independently acquired by local Cosign/TUF, never the root
shipped alongside the release. Positive verification precedes each mutation family.
"""
import base64,hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence/public-release'
A=OUT/'artifacts'
NEG=OUT/'negative-controls'
NEG.mkdir(exist_ok=True)
EXE=ROOT/'target/debug/release.exe'
TRUST=ROOT/'evidence/public-trust'
IDENTITY='https://github.com/rafael-arkhe/arkhe/.github/workflows/build-verify-wasm.yml@refs/heads/codex/verified-wasm-policy-20261025'
HASH='049672c75c9e96391d004a61f998c2893ffaa5ec0f8117d3ad03777b7b5b28de'
WASM=A/'arkhe-verify.wasm'
BUNDLE=A/'arkhe-verify.wasm.bundle.json'
assert hashlib.sha256(WASM.read_bytes()).hexdigest()==HASH
def run(name,wasm=WASM,bundle=BUNDLE,trust=TRUST,identity=IDENTITY):
    args=[str(EXE),'verify-run',str(wasm),str(bundle),str(trust),identity,HASH,str(A/'policy-vectors.json'),str(NEG/(name+'-policy.json'))]
    p=subprocess.run(args,text=True,encoding='utf-8',errors='replace',stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    (NEG/(name+'.txt')).write_text(p.stdout,encoding='utf-8')
    return p
assert run('positive-control').returncode==0
cases=[]
def expect(name,substring,**kwargs):
    p=run(name,**kwargs)
    ok=p.returncode!=0 and substring in p.stdout
    cases.append({'name':name,'exit_code':p.returncode,'expected_reason':substring,'rejected_for_expected_reason':ok})
    if not ok: raise RuntimeError(f'{name}: unexpected result: {p.stdout}')
bad=bytearray(WASM.read_bytes());bad[0]^=1
(NEG/'tampered.wasm').write_bytes(bad)
expect('tampered-production-wasm','HashMismatch',wasm=NEG/'tampered.wasm')
expect('wrong-workflow-ref','identity mismatch',identity=IDENTITY+'-not-authorized')
raw=json.loads(BUNDLE.read_text())
for name,target in [('invalid-merkle','merkle'),('forged-set','set'),('forged-checkpoint','checkpoint')]:
    b=json.loads(json.dumps(raw));entry=b['verificationMaterial']['tlogEntries'][0]
    if target=='merkle':
        entry['inclusionProof']['hashes'][0]=base64.b64encode(bytes(32)).decode()
        reason='MerkleProof'
    elif target=='set':
        s=bytearray(base64.b64decode(entry['inclusionPromise']['signedEntryTimestamp']));s[-1]^=1
        entry['inclusionPromise']['signedEntryTimestamp']=base64.b64encode(s).decode();reason='SET verification failed'
    else:
        text=entry['inclusionProof']['checkpoint']['envelope'];prefix,sig=text.rstrip().rsplit(' ',1)
        s=bytearray(base64.b64decode(sig));s[-1]^=1
        entry['inclusionProof']['checkpoint']['envelope']=prefix+' '+base64.b64encode(s).decode()+'\n';reason='Checkpoint signature verification failed'
    path=NEG/(name+'.bundle.json');path.write_text(json.dumps(b),encoding='utf-8')
    expect(name,reason,bundle=path)
stale=NEG/'stale-trust';stale.mkdir(exist_ok=True)
(stale/'trusted_root.json').write_bytes((TRUST/'trusted_root.json').read_bytes())
capture=json.loads((TRUST/'capture.json').read_text());capture['captured_at_unix']-=31*24*60*60
(stale/'capture.json').write_text(json.dumps(capture))
expect('stale-public-trust','TrustRootStale',trust=stale)
(OUT/'negative-controls.json').write_text(json.dumps({'public_wasm_sha256':HASH,'positive_control_passed':True,'cases':cases},indent=2)+'\n')
print(f'Public production positive passed; {len(cases)} offline negative controls rejected for expected reasons.')
