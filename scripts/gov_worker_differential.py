"""Differential campaign: real Rust WorkerVerifier vs independent Python/OpenSSL Ed25519 + policy."""
import argparse,hashlib,json,subprocess,sys
import cryptography
from cryptography.hazmat.backends.openssl.backend import backend
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature
ROOT=Path(__file__).resolve().parents[1]
def cbor(value):
    def head(major,n):
        for limit,width,extra in [(24,0,0),(256,1,24),(65536,2,25),(2**32,4,26),(2**64,8,27)]:
            if n<limit:return bytes([major*32+(n if width==0 else extra)])+(b'' if width==0 else n.to_bytes(width,'big'))
        raise ValueError('out of range')
    if isinstance(value,str):
        data=value.encode();return head(3,len(data))+data
    if isinstance(value,int):return head(0,value) if value>=0 else head(1,-1-value)
    if isinstance(value,dict):
        pairs=sorted((cbor(k),cbor(v)) for k,v in value.items())
        return head(5,len(pairs))+b''.join(k+v for k,v in pairs)
    raise ValueError('unsupported projection type')
def reference(case):
    r,t,record=case['receipt'],case['trust'],case['record']
    projection={key:r[key] for key in ['version','tenant','key_id','completed_at_ms','outcome']}
    # Digest32 serializes to a byte array; receipt signing projects it to lowercase hex.
    projection['record_hash']=bytes(r['record_hash']).hex()
    payload=b'AKG:WORKER:RECEIPT:v1\0'+cbor(projection)
    assert payload.hex()==case['signingBytesHex'],'independent CBOR differs from Rust'
    try:Ed25519PublicKey.from_public_bytes(bytes(t['public_key'])).verify(bytes.fromhex(r['signature_hex']),payload)
    except (ValueError,InvalidSignature):return False
    return (r['version']==1 and r['tenant']=='gov-synthetic' and projection['record_hash']==case['recordDigest'] and r['completed_at_ms']>=0 and r['outcome']=='Succeeded'
      and t['active'] and r['key_id']==t['key_id'] and record['module_id']==t['module_id'] and record['module_version']==t['module_version'] and record.get('operation') in t['allowed_operations']
      and not record['evidence_refs'] and not t['require_admitted_input'])
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--cases',type=int,default=4096);args=parser.parse_args()
    if not 16<=args.cases<=65536:parser.error('cases must be 16..65536')
    local=ROOT/'ops/local/gov-adversarial';local.mkdir(parents=True,exist_ok=True)
    corpus=local/'worker-corpus.jsonl'
    with corpus.open('w',encoding='utf-8') as output:
        result=subprocess.run(['cargo','run','-p','arkhe-bugbounty','--example','worker_differential','--locked','--',str(args.cases)],cwd=ROOT,stdout=output,stderr=subprocess.PIPE,text=True)
    if result.returncode:print(result.stderr);raise SystemExit(result.returncode)
    counts={};accepted=0;total=0
    for line in corpus.open(encoding='utf-8'):
        case=json.loads(line);expected=reference(case)
        if expected!=case['nativeAccepted']:raise SystemExit('differential mismatch at '+str(case['case']))
        accepted+=expected;total+=1;counts[str(case['mode'])]=counts.get(str(case['mode']),0)+1
    assert total==args.cases
    report={'scope':'bounded deterministic mutation/differential campaign; not coverage-guided fuzzing or hardware qualification','cases':total,'accepted':accepted,'rejected':total-accepted,'differentialMismatches':0,'mutationClasses':counts,'oracle':'Python cryptography Ed25519/OpenSSL + independent CBOR + policy','cryptographyVersion':cryptography.__version__,'opensslVersion':backend.openssl_version_text(),'sha256':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ['scripts/gov_worker_differential.py','integration/arkhe-bugbounty/examples/worker_differential.rs','integration/arkhe-bugbounty/src/provenance.rs']},'corpusSha256':hashlib.sha256(corpus.read_bytes()).hexdigest()}
    out=ROOT/'docs/evidence/gov/2026-10-21';out.mkdir(parents=True,exist_ok=True)
    (out/'worker-differential.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))
if __name__=='__main__':main()
