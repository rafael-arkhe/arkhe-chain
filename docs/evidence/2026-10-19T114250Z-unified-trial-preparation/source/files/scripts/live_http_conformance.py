"""Live browser/API -> containment -> PostgreSQL -> WormGraph conformance.
Includes application/database restarts and a real database outage.
"""
import argparse, copy, http.client, json, secrets, subprocess, time, urllib.error, urllib.request
from pathlib import Path
from generate_work_vectors import cbor, projection
from blake3_reference import b3
ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:8788'
DB='arkhe-live-postgres'; APP='arkhe-live-runtime'

def wait_healthy(check, attempts=45, delay=1):
    """Retry only readiness GETs across bounded restart transport failures."""
    for _ in range(attempts):
        try:
            if check()==200: return
        except (OSError, urllib.error.URLError, http.client.HTTPException):
            pass
        time.sleep(delay)
    raise RuntimeError('Live runtime did not become healthy')
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine',default='podman',choices=['podman','docker'])
    parser.add_argument('--connection',default='arkhe-runtime')
    args=parser.parse_args()
    engine=[args.engine]+(['--connection',args.connection] if args.engine=='podman' else [])
    for name in [DB,APP]:
        data=json.loads(subprocess.check_output(engine+['container','inspect',name],text=True))[0]
        if data['Config'].get('Labels',{}).get('io.arkhe.environment')!='live-v1':
            raise RuntimeError('Refusing lifecycle tests against unrelated containers')
    cfg=json.loads((ROOT/'ops/local/live.json').read_text())
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def request(path,body=None,auth=True):
        headers={'Authorization':'Bearer '+cfg['token']} if auth else {}
        if body is not None: headers['Content-Type']='application/json'
        req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
        try:
            with opener.open(req,timeout=15) as response: return response.status,response.read()
        except urllib.error.HTTPError as e: return e.code,e.read()
    def ready():
        wait_healthy(lambda: request('/health')[0])
    def proposal(kind='Simulate'):
        i=dict(requested_by='local-operator',intent_type=kind,target=[0]*32,parameters_digest=[1]*32,
            context_refs=[],request_identity=list(secrets.token_bytes(32)),claimed_created_at=int(time.time()))
        h=b3(b'AKG:WORKINTENT:v1\0'+cbor(projection(i)))
        w=dict(module_id='live-conformance',module_version='0.1.0',input_digest=list(h),output_digest=[2]*32,
            evidence_refs=[],confidence_bps=None,uncertainty_note=None,execution_id=secrets.token_hex(16))
        return dict(intent=i,worker_record=w)
    ready()
    assert request('/health',auth=False)[0]==401
    assert request('/evidence/not-a-digest')[0]==400
    work=proposal(); status,data=request('/work',work); assert status==200,(status,data)
    receipt=json.loads(data); record=receipt['record_hash']
    expected_intent=cbor(projection(work['intent'])); expected_worker=cbor(projection(work['worker_record']))
    assert receipt['intent_digest']==b3(b'AKG:WORKINTENT:v1\0'+expected_intent).hex()
    assert receipt['worker_digest']==b3(b'AKG:WER:v1\0'+expected_worker).hex()
    assert request('/objects/WorkIntent/'+receipt['intent_digest'])==(200,expected_intent)
    assert request('/objects/WorkerExecutionRecord/'+receipt['worker_digest'])==(200,expected_worker)
    envelope=json.loads(request('/evidence/'+record)[1])
    assert envelope['record_hash']==list(bytes.fromhex(record))
    assert envelope['subject']==list(bytes.fromhex(receipt['intent_digest']))
    assert envelope['payload_digest']==list(bytes.fromhex(receipt['worker_digest']))
    assert json.loads(request('/work',work)[1])==receipt
    child=proposal(); child['intent']['context_refs']=[list(bytes.fromhex(record))]
    child['worker_record']['input_digest']=list(b3(b'AKG:WORKINTENT:v1\0'+cbor(projection(child['intent']))))
    child['worker_record']['evidence_refs']=[list(bytes.fromhex(record))]
    code,data=request('/work',child); assert code==200,(code,data)
    child_hash=json.loads(data)['record_hash']
    assert json.loads(request('/evidence/'+child_hash)[1])['causal_parents']==[list(bytes.fromhex(record))]
    assert request('/work',proposal('Publish'))[0]==403
    forged=proposal(); forged['intent']['requested_by']='another-actor'
    assert request('/work',forged)[0]==403
    mismatched=proposal(); mismatched['worker_record']['input_digest']=[0]*32
    assert request('/work',mismatched)[0]==403
    subprocess.run(engine+['restart',APP],check=True,stdout=subprocess.DEVNULL)
    ready()
    assert json.loads(request('/evidence/'+record)[1])==envelope
    failed=proposal()
    try:
        subprocess.run(engine+['stop',DB],check=True,stdout=subprocess.DEVNULL)
        assert request('/health')[0]==503
        assert request('/work',failed)[0]==503
    finally:
        subprocess.run(engine+['start',DB],check=True,stdout=subprocess.DEVNULL)
        ready()
    failed_hash=b3(b'AKG:WORKINTENT:v1\0'+cbor(projection(failed['intent']))).hex()
    assert request('/objects/WorkIntent/'+failed_hash)[0]==404
    assert json.loads(request('/evidence/'+record)[1])==envelope
    assert json.loads(request('/evidence/'+child_hash)[1])['causal_parents']==[list(bytes.fromhex(record))]
    print('PASS HTTP: independent CBOR/hash parity, commit/read, parent links, replay, authentication, actor binding, protected rejection, restart durability, real DB outage fail-closed')
if __name__=='__main__': main()
