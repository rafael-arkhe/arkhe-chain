"""Check host trace continuity and native intent/worker input bindings, not authenticity."""
import hashlib
import gzip
import json
from pathlib import Path

def verify(path):
    previous='0'*64;count=0;native=0
    proposals=[];snapshots=set()
    proposal_path=Path(str(path)+'.proposals')
    if proposal_path.exists():proposals=[json.loads(l) for l in proposal_path.read_text(encoding='utf-8').splitlines()]
    for count,line in enumerate(path.read_text(encoding='utf-8').splitlines(),1):
        record=json.loads(line);claimed=record.pop('record_hash')
        encoded=json.dumps(record,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
        if hashlib.sha256(encoded).hexdigest()!=claimed:raise ValueError('trace hash mismatch')
        if record['previous_hash']!=previous or record['step']!=count:raise ValueError('trace continuity mismatch')
        if count>record['manifest']['max_actions']:raise ValueError('action budget exceeded')
        if record['manifest'].get('profile')=='arc-observation-explorer-v2-recorder':
            if count>len(proposals):raise ValueError('missing proposal before dispatch')
            proposal=proposals[count-1]
            if any(proposal[k]!=record[k] for k in ('before','action','prediction')) or proposal['step']!=count:
                raise ValueError('proposal/outcome mismatch')
            for name,state in (('before_frame',record['before']),('after_frame',record['after'])):
                ref=record[name]
                if ref['sha256']!=state or ref['relative_path']!='frames/'+state+'.json.gz':
                    raise ValueError('snapshot reference mismatch')
                if state not in snapshots:
                    raw=gzip.decompress((path.parent/ref['relative_path']).read_bytes())
                    if hashlib.sha256(raw).hexdigest()!=state:raise ValueError('snapshot digest mismatch')
                    snapshots.add(state)
            predicted=record['prediction']['predicted_next']
            if record['prediction_correct']!=(predicted==record['after'] if predicted is not None else None):
                raise ValueError('prediction assessment mismatch')
        pre=record['native_preflight'];post=record['native_record']
        if bool(pre)!=bool(post):raise ValueError('partial native evidence')
        if pre:
            if pre['gate']!='ALLOW' or post['gate']!='ALLOW':raise ValueError('non-allowed action')
            if pre['intent_digest']!=post['intent_digest']:raise ValueError('intent changed')
            if bytes(post['worker_record']['input_digest']).hex()!=post['intent_digest']:
                raise ValueError('worker input differs from intent')
            if post['worker_record']['module_id']!='arc-observation-explorer':raise ValueError('wrong worker')
            native+=1
        previous=claimed
    return {'file':path.name,'actions':count,'native_preflight_record_pairs':native,'snapshots_verified':len(snapshots),
            'status':'PASS_INTERNAL_CONSISTENCY','signature_verified':False,'execution_attested':False}

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory',type=Path);args=p.parse_args()
    result=[verify(path) for path in sorted(args.directory.glob('*.jsonl'))]
    if not result:raise SystemExit('No traces found')
    (args.directory/'trace-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result))
