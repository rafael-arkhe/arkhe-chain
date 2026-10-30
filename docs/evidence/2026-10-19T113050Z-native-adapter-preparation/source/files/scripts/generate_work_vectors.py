"""Independent AKG-CBOR-v1 fixtures; Python stdlib only. Never marks READY."""
import json,sys,hashlib
from pathlib import Path
from blake3_reference import b3

def head(m,n):
    for limit, extra, width in [(24,0,0),(256,24,1),(65536,25,2),(2**32,26,4),(2**64,27,8)]:
        if n < limit:
            return bytes([(m<<5) | (n if width == 0 else extra)]) + (n.to_bytes(width,'big') if width else b'')
    raise ValueError(n)
def cbor(v):
    if v is None: return b'\xf6'
    if isinstance(v,int): return head(0,v) if v>=0 else head(1,-1-v)
    if isinstance(v,str):
        b=v.encode(); return head(3,len(b))+b
    if isinstance(v,bytes): return head(2,len(v))+v
    if isinstance(v,list): return head(4,len(v))+b''.join(map(cbor,v))
    pairs=sorted((cbor(k),cbor(v)) for k,v in v.items())
    return head(5,len(pairs))+b''.join(k+v for k,v in pairs)
def projection(x):
    return {k: bytes(v) if k in ('target','parameters_digest','request_identity','input_digest','output_digest') else [bytes(d) for d in v] if k in ('context_refs','evidence_refs') else v for k,v in x.items()}
def main():
    vectors=[]
    for i,t in enumerate([-2**63,-25,-24,-1,0,23,24,255,256,65535,65536,2**32,2**63-1]):
        x=dict(requested_by='João',intent_type=['Publish','ApproveExpense','Hire','Fire','SignContract','ReleaseSoftware','DraftDocument','QueryKnowledgeBase','Simulate'][i%9],target=[0]*32,parameters_digest=[1]*32,context_refs=[[2]*32,[3]*32] if i%2 else [],request_identity=[4]*32,claimed_created_at=t)
        vectors.append(('WorkIntent',x,b'AKG:WORKINTENT:v1\0'))
    for i in range(4):
        x=dict(module_id='arkhe-perception',module_version='0.1.0',input_digest=[5]*32,output_digest=[6]*32,evidence_refs=[[7]*32] if i%2 else [],confidence_bps=10000 if i%2 else None,uncertainty_note=['',None,'incerteza ç','x'*1500][i],execution_id='exec:1')
        vectors.append(('WorkerExecutionRecord',x,b'AKG:WER:v1\0'))
    out=[]
    for i,(kind,x,domain) in enumerate(vectors):
        encoded=cbor(projection(x))
        out.append(dict(id=f'{kind}-{i:03}',component=kind,status='PENDING_RUST_VALIDATION',input=x,domain_hex=domain.hex(),expected_output=dict(canonical_cbor_hex=encoded.hex(),object_digest_hex=b3(domain+encoded).hex())))
    path=Path(__file__).resolve().parents[1]/'tests/golden_vectors.json'
    data=dict(version='AKG-CBOR-v1',generated_by='independent Python stdlib CBOR + BLAKE3',vectors=out)
    # Keep READY only when regeneration reproduces previously Rust-validated bytes.
    if path.exists():
        old=json.loads(path.read_text())
        for a,b in zip(data['vectors'],old['vectors']):
            if {**a,'status':b['status']}==b: a['status']=b['status']
    if path.exists() and data['vectors'] == old['vectors'] and 'validated_by' in old:
        data['validated_by'] = old['validated_by']
    encoded=(json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    if '--check' in sys.argv:
        if not path.exists() or path.read_bytes()!=encoded: raise SystemExit('FAIL independent vector regeneration differs from committed contract')
        print('PASS independent stdlib AKG-CBOR-v1: 13 WorkIntent + 4 WER vectors; byte-for-byte contract SHA256='+hashlib.sha256(encoded).hexdigest())
    else:
        path.write_bytes(encoded)
        print('Generated 17 independent WorkIntent/WER vectors; unchanged Rust-validated statuses preserved')
if __name__=='__main__': main()
