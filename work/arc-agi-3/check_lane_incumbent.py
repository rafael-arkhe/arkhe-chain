"""Bounded TLC checks for DEV best selection and explicit admission faults."""
import hashlib,json,subprocess
from pathlib import Path


def main():
    formal=Path('work/arc-agi-3/formal').resolve()
    out=Path('output/arc3-lane-incumbent-tlc-v2-20261027');out.mkdir(exist_ok=False)
    tests=[('safe',0,'FairSpec','INVARIANTS TypeOK IncumbentIsBest Isolation AdmissionSound AdmissionBinding EffectsAreVerified\nPROPERTIES AdmitOnlyViaGate RepairUsesBest FinalBestEventuallyAdmitted','Model checking completed. No error has been found.'),
        ('admission',1,'Spec','INVARIANT AdmissionSound','Invariant AdmissionSound is violated.'),
        ('binding',2,'Spec','INVARIANT AdmissionBinding','Invariant AdmissionBinding is violated.'),
        ('shortcut',3,'Spec','PROPERTY AdmitOnlyViaGate','Action property AdmitOnlyViaGate is violated.'),
        ('best',4,'Spec','INVARIANT IncumbentIsBest','Invariant IncumbentIsBest is violated.'),
        ('nofair',0,'Spec','PROPERTY FinalBestEventuallyAdmitted','Temporal properties were violated.')]
    records=[]
    for name,fault,spec,checks,expected in tests:
        cfg=formal/f'LaneIncumbent-{name}.cfg'
        cfg.write_text(f'SPECIFICATION {spec}\nCONSTANTS MaxVer = 2\n Fault = {fault}\nCHECK_DEADLOCK FALSE\n{checks}\n')
        args=['java','-XX:+UseParallelGC','-Xmx1g','-cp',str(formal/'tla2tools.jar'),'tlc2.TLC','-workers','1',
            '-metadir',str((out/name).resolve()),'-config',str(cfg),str(formal/'LaneIncumbent.tla')]
        r=subprocess.run(args,cwd=formal,capture_output=True,text=True,timeout=120)
        log=r.stdout+'\n'+r.stderr
        (out/f'{name}.log').write_text(log,encoding='utf-8')
        row={'case':name,'exit_code':r.returncode,'expected_message_present':expected in log,'argv':args}
        records.append(row);print(json.dumps(row),flush=True)
    report={'max_ver':2,'records':records,'all_expected_outcomes':all(x['expected_message_present'] for x in records),
        'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [formal/'LaneIncumbent.tla',*formal.glob('LaneIncumbent-*.cfg')]}}
    (out/'report.json').write_text(json.dumps(report,indent=2))
    if not report['all_expected_outcomes']:raise RuntimeError('unexpected TLC outcome')


if __name__=='__main__':main()
