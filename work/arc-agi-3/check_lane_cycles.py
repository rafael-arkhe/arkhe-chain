"""Finite checks on supplied cycle model; no assumed transfer of old results."""
import hashlib,json,subprocess
from pathlib import Path


def main():
    formal=Path('work/arc-agi-3/formal').resolve()
    out=Path('output/arc3-lane-cycles-20261027');out.mkdir(exist_ok=False)
    tests=[('safe','Spec','INVARIANTS TypeOK Isolation AdmissionSound HoldoutSealed AdmissionBinding EffectsAreVerified HoldQPerCycle\nPROPERTY AdmitOnlyViaGate',True),
           ('Live1','LiveSpec','PROPERTY Live1',True),('Live2','LiveSpec','PROPERTY Live2',False),('Live3','LiveSpec','PROPERTY Live3',True)]
    records=[]
    for name,spec,checks,pass_expected in tests:
        cfg=formal/f'LaneIsolationCycles-{name}.cfg'
        cfg.write_text(f'SPECIFICATION {spec}\nCONSTANTS MaxCyc = 2\n MaxVer = 2\nCHECK_DEADLOCK FALSE\n{checks}\n')
        args=['java','-XX:+UseParallelGC','-Xmx1g','-cp',str(formal/'tla2tools.jar'),'tlc2.TLC','-workers','1',
             '-metadir',str((out/name).resolve()),'-config',str(cfg),str(formal/'LaneIsolationCycles.tla')]
        r=subprocess.run(args,cwd=formal,capture_output=True,text=True,timeout=180)
        log=r.stdout+'\n'+r.stderr;(out/f'{name}.log').write_text(log,encoding='utf-8')
        ok=(r.returncode==0 and 'Model checking completed. No error has been found.' in log) if pass_expected else (r.returncode==13 and 'Temporal properties were violated.' in log)
        row={'case':name,'exit_code':r.returncode,'expected':'PASS' if pass_expected else 'FALSIFIED','outcome_verified':ok,'argv':args}
        records.append(row);print(json.dumps(row),flush=True)
    report={'bounds':{'MaxCyc':2,'MaxVer':2},'records':records,'all_expected_outcomes':all(x['outcome_verified'] for x in records),
        'source_sha256':hashlib.sha256((formal/'LaneIsolationCycles.tla').read_bytes()).hexdigest()}
    (out/'report.json').write_text(json.dumps(report,indent=2))
    if not report['all_expected_outcomes']:raise RuntimeError('unexpected TLC outcome')


if __name__=='__main__':main()
