"""Offline evidence coverage of proposed I1-I10, not a runtime authorization gate."""
import argparse
import hashlib
import json
from pathlib import Path


def check(run):
    gate=run['training_gate'];tests=run['test']['all']['joint_rank']
    record=lambda status,reason:{'status':status,'reason':reason}
    return {'trace':run['trace'],'checks':{
      'I1':record('NOT_IDENTIFIABLE','No independently identified complete internal states; matching future observations does not prove equal state.'),
      'I2':record('NOT_EVALUATED','No verified actionable/animation labels supplied; SDK response batches are not proof actions are accepted on individual animation frames.'),
      'I3':record('HEURISTIC_ONLY','Most-frequent color is an extractor heuristic. A change is not automatically a mode transition.'),
      'I4':{**record(gate['status'],'Exact training full-last-render coverage/accuracy gate of joint-rank model, not restored-environment replay.'),'queries':gate['queries'],'issued':gate['issued'],'correct':gate['correct'],'conflicts':gate['conflicts']},
      'I5':{**record('NO_PREDICTIVE_ACCEPTANCE_EVIDENCE','Posthoc reused suffix, no predeclared confirmatory acceptance threshold; no issued whole-render predictions in this run.'),'metrics':tests},
      'I6':record('LOCAL_IMPLEMENTATION_EVIDENCE','Complete-vector implementation and synthetic counterexample tests exist; no semantic correspondence correctness certificate.'),
      'I7':record('LOCAL_IMPLEMENTATION_EVIDENCE','Whole-render consensus and exhaustion checks implemented relative to supplied hypothesis set; no guarantee it contains the true dynamics.'),
      'I8':record('HYBRID_NOT_IMPLEMENTED','Footprint selector does not authorize region persistence; no full-render hybrid transformation was implemented.'),
      'I9':record('HASH_CONSISTENCY_ONLY','Offline source/model hash checks are not signed provenance, durable external anchoring or execution attestation; no new native evidence integration.'),
      'I10':record('RATIFICATION_POLICY_NOT_INTEGRATED','No combined replay/holdout acceptance policy wired to native gate; passing finite tests would not guarantee zero erroneous model approvals.')},
      'ratification':'NOT_ADMITTED','runtime_authorization_performed':False}


def build(source):
    original=json.loads(source.read_text())
    if not original.get('complete') or len(original.get('runs',[]))!=4:raise ValueError('complete four-trace report required')
    return {'phase':'OFFLINE_INVARIANT_EVIDENCE_COVERAGE','input_path':str(source.resolve()),
            'input_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'scope':'reanalysis of stored report evidence; no new trace execution or authenticity certification',
            'new_environment_actions':0,'native_gate_changed':False,'runs':[check(r) for r in original['runs']]}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--report',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();r=build(a.report)
    a.out.parent.mkdir(parents=True,exist_ok=True)
    with a.out.open('x',encoding='utf-8') as f:json.dump(r,f,indent=2)
    print(json.dumps({'traces':len(r['runs']),'admitted':0,'native_gate_changed':False}))
