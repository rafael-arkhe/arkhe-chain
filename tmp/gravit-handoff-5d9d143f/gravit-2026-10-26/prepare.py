"""Build deterministic local cases and independent Gravit signature jobs; no upstream imports."""
from pathlib import Path
import base64, copy, hashlib, json, math
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

ROOT = Path(__file__).resolve().parent
UP = ROOT / 'upstream'
def load(name): return json.loads((UP / name).read_bytes())
def save(name, value): (ROOT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
def h(b): return hashlib.sha256(b).digest()
def decode(s): return base64.b64decode(s, validate=True)
jobs, expected = [], []
def add(case, verdict, reason):
    jobs.append(case)
    expected.append({'id':case['id'], 'accepted':verdict, 'reason':reason})

# Recursive tree construction, independent from Arkhe's iterative verifier.
leaves = [b'arkhe-interop-a', b'arkhe-interop-b', b'arkhe-interop-c']
def root(ls):
    if len(ls)==1: return h(b'\x00'+ls[0])
    k=1 << ((len(ls)-1).bit_length()-1)
    return h(b'\x01'+root(ls[:k])+root(ls[k:]))
def proof(ls, i):
    if len(ls)==1: return []
    k=1 << ((len(ls)-1).bit_length()-1)
    return proof(ls[:k],i)+[root(ls[k:]).hex()] if i<k else proof(ls[k:],i-k)+[root(ls[:k]).hex()]
for i in range(3):
    add(dict(id=f'merkle-valid-{i}',kind='inclusion',leaf_hex=leaves[i].hex(),index=i,size=3,path=proof(leaves,i),root_hex=root(leaves).hex()),True,'RFC 6962 three-leaf tree')
base=jobs[0]
for name, changes in [('wrong-leaf',{'leaf_hex':'00'}),('short-path',{'path':base['path'][:-1]}),('excess-path',{'path':base['path']+['00'*32]}),('bad-index',{'index':3}),('empty-tree',{'size':0}),('wrong-root',{'root_hex':'00'*32})]:
    add(dict(base, id='merkle-'+name, **changes),False,name)
add(dict(id='merkle-single',kind='inclusion',leaf_hex='',index=0,size=1,path=[],root_hex=h(b'\x00').hex()),True,'single empty leaf')
keys=[Ed25519PrivateKey.from_private_bytes(bytes([n])*32) for n in (1,2,3)]
pubs=[k.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw).hex() for k in keys]
msg=b'arkhe-interop-witness-v1\n'+root(leaves)
sig=keys[0].sign(msg).hex()
add(dict(id='signature-valid',kind='signature',key_hex=pubs[0],message_hex=msg.hex(),signature_hex=sig),True,'Ed25519 raw message')
for name,changes in [('tampered',{'message_hex':'00'}),('wrong-key',{'key_hex':pubs[1]}),('truncated',{'signature_hex':sig[:-2]})]:
    add(dict(jobs[10],id='signature-'+name,**changes),False,name)
trusted=[dict(id=f'w{i}',operator=f'op{i}',key_hex=pubs[i]) for i in range(3)]
ws=[dict(id=f'w{i}',signature_hex=keys[i].sign(msg).hex()) for i in range(2)]
q=dict(id='quorum-valid',kind='quorum',message_hex=msg.hex(),threshold=2,trusted=trusted,witnesses=ws)
add(q,True,'two configured operators with distinct keys')
for name,changes in [('insufficient',{'witnesses':ws[:1]}),('duplicate',{'witnesses':[ws[0],ws[0]]}),('unknown',{'witnesses':[dict(ws[0],id='unknown'),ws[1]]}),('zero',{'threshold':0}),('wrong-message',{'message_hex':'00'})]:
    add(dict(q,id='quorum-'+name,**changes),False,name)
dependent=copy.deepcopy(trusted); dependent[1]['operator']='op0'
add(dict(q,id='quorum-dependent',trusted=dependent),False,'same configured operator')
alias=copy.deepcopy(trusted); alias[1]['key_hex']=pubs[0]
add(dict(q,id='quorum-key-alias',trusted=alias,witnesses=[ws[0],dict(ws[0],id='w1')]),False,'one key under two identities')
save('arkhe-vectors.json',jobs)
local_count=len(jobs)

registry=load('registry.json'); trust=load('trust_root.json')
lookup={e['key_id']:e for e in registry['verifiers']}
for i,line in enumerate((UP/'registry.json.sig').read_text().splitlines()):
    if not line.strip() or line.startswith('#'): continue
    kid,s=line.split(); key=next(k for k in trust['root_keys'] if k['key_id']==kid)
    add(dict(id=f'gravit-registry-{i}',kind='signature',key_hex=decode(key['public_key']).hex(),message_hex=(b'gravit-registry-v1\n'+(UP/'registry.json').read_bytes()).hex(),signature_hex=decode(s).hex()),True,'detached registry root signature; test trust root')

screening=[]
for v in load('vectors.json'):
    if not v['use_registry']: continue
    exclusions={e['record_id']:e['reason'] for e in v['expected']['excluded_evidence']}
    for e in v['evidence']:
        reason=None; key=lookup.get(e.get('key_id'))
        if not e.get('key_id') or not e.get('signature'): reason='unsigned'
        elif key is None: reason='unknown_key'
        elif key['revoked']: reason='revoked_key'
        else:
            theta=e['theta']; fields=[v['name'],e['record_id'],e['timestamp'],e['provenance'],e['integrity_hash']]
            if any(not isinstance(x,str) or '\n' in x or '\r' in x for x in fields) or isinstance(theta,bool) or not isinstance(theta,(int,float)) or not math.isfinite(theta) or float(f'{theta:.6f}') != theta or not (e['result'] is True or e['result'] is False or e['result'] is None): reason='malformed'
            else:
                message='\n'.join(['gravit-evidence-v1',v['name'],e['record_id'],f'{theta:.6f}',json.dumps(e['result']),e['timestamp'],e['provenance'],e['integrity_hash']]).encode()
                try: signature=decode(e['signature'])
                except ValueError: signature=b''
                add(dict(id=f"gravit/{v['name']}/{e['record_id']}",kind='signature',key_hex=decode(key['public_key']).hex(),message_hex=message.hex(),signature_hex=signature.hex()),e['record_id'] not in exclusions,'expected admissibility from pinned Gravit vector')
                continue
        screening.append(dict(vector=v['name'],record=e['record_id'],actual=reason,expected=exclusions.get(e['record_id'])))
assert all(r['actual']==r['expected'] for r in screening), screening
head=load('latest.json'); service=load('service-key.json')
assert head['head']['service_key_id']==service['key_id']
assert h(decode(service['public_key'])).hex()[:16]==service['key_id']
canonical=json.dumps(head['head'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
assert h(canonical+head['signature'].encode()).hex()==head['anchored_digest']
add(dict(id='gravit-hosted-head',kind='signature',key_hex=decode(service['public_key']).hex(),message_hex=canonical.hex(),signature_hex=decode(head['signature']).hex()),True,'service key obtained over HTTPS; no independent key ceremony assertion')
save('jobs.json',jobs); save('expected.json',expected); save('screening.json',screening)
save('inventory.json',dict(verifier_commit='6b2ecbabd098c9a381b0b08184703905c3cb8275',service_commit='f97aee7df270f8abcff8e794529d86cd6706d555',golden_vectors=len(load('vectors.json')),local_vectors=local_count,jobs=len(jobs),noncrypto_screening=len(screening),head=head['head']))
print(f'Prepared {len(jobs)} jobs, {local_count} local vectors, {len(screening)} screening checks')
