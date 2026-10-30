"""Actual TLC singleton bug/property matrix for supplied Bugs-set model."""
import hashlib,json,re,subprocess
from pathlib import Path


def main(formal_subdir='matrix-v3',module='LaneIsolation',output_name='arc3-lane-named-matrix-20261027',expected_live2='FALSIFIED'):
    formal=(Path('work/arc-agi-3/formal')/formal_subdir).resolve()
    jar=formal.parent/'tla2tools.jar'
    out=Path('output')/output_name;out.mkdir(exist_ok=False)
    props=['TypeOK','Isolation','AdmissionSound','HoldoutSealed','AdmissionBinding','EffectsAreVerified','AdmitOnlyViaGate']
    expected={'none':set(),'leakExec':{'Isolation','EffectsAreVerified'},'leakHoldout':{'HoldoutSealed'},
        'unsoundAdmit':{'AdmissionSound','EffectsAreVerified'},'unbind':{'AdmissionBinding'},
        'shortcut':{'AdmissionSound','EffectsAreVerified','AdmitOnlyViaGate'}}
    records=[]
    def run(name,bug,checks,spec='Spec',deadlock=False):
        cfg=formal/f'{name}.cfg'
        bugs='{}' if bug=='none' else '{"'+bug+'"}'
        cfg.write_text(f'SPECIFICATION {spec}\nCONSTANTS MaxVer = 3\n Bugs = {bugs}\n'+('' if deadlock else 'CHECK_DEADLOCK FALSE\n')+checks+'\n')
        args=['java','-XX:+UseParallelGC','-Xmx1g','-cp',str(jar),'tlc2.TLC','-workers','1',
              '-metadir',str((out/name).resolve()),'-config',str(cfg),str(formal/(module+'.tla'))]
        r=subprocess.run(args,cwd=formal,capture_output=True,text=True,timeout=120)
        log=r.stdout+'\n'+r.stderr;(out/f'{name}.log').write_text(log,encoding='utf-8')
        violated=bool(re.search(r'(?:Invariant|Action property) \w+ is violated|Temporal properties were violated',log))
        clean=r.returncode==0 and 'Model checking completed. No error has been found.' in log and not violated
        return {'case':name,'exit_code':r.returncode,'status':'FALSIFIED' if violated else 'PASS' if clean else 'ERROR',
            'deadlock_reported':'Deadlock reached.' in log,'argv':args}
    matrix={}
    for bug in expected:
        row={}
        for prop in props:
            check=('PROPERTY ' if prop=='AdmitOnlyViaGate' else 'INVARIANT ')+prop
            record=run(f'{bug}-{prop}',bug,check)
            record.update(bug=bug,property=prop)
            record['matches_expected']=record['status']==('FALSIFIED' if prop in expected[bug] else 'PASS')
            records.append(record);row[prop]=record['status']
        matrix[bug]=row;print(json.dumps({'bug':bug,'results':row}),flush=True)
    for prop in ('Live1','Live2'):
        record=run(prop,'none','PROPERTY '+prop,'LiveSpec')
        record['matches_expected']=record['status']==('PASS' if prop=='Live1' else expected_live2)
        records.append(record);print(json.dumps(record),flush=True)
    raw=run('raw-default-deadlock','none','INVARIANTS '+' '.join(props[:-1])+'\nPROPERTY AdmitOnlyViaGate',deadlock=True)
    raw['matches_expected']=raw['deadlock_reported'];records.append(raw)
    report={'max_ver':3,'matrix':matrix,'records':records,'all_expected_outcomes':all(x['matches_expected'] for x in records),
            'source_sha256':hashlib.sha256((formal/(module+'.tla')).read_bytes()).hexdigest(),
            'jar_sha256':hashlib.sha256(jar.read_bytes()).hexdigest()}
    (out/'report.json').write_text(json.dumps(report,indent=2))
    if not report['all_expected_outcomes']:raise RuntimeError('unexpected model checker outcome')


if __name__=='__main__':main()
