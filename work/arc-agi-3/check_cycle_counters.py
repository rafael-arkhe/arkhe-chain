"""Tracked query counters and isolated faults; no statistical freshness claim."""
import hashlib,json,subprocess
from pathlib import Path


def main():
    formal=Path('work/arc-agi-3/formal').resolve()
    out=Path('output/arc3-cycle-counters-20261027');out.mkdir(exist_ok=False)
    tests=[('safe','none','INVARIANTS TypeOK CounterTypes Isolation AdmissionSound HoldoutSealed AdmissionBinding EffectsAreVerified HoldQPerCycle HoldoutReadOncePerArtifact HoldoutOncePerCycle CounterBinding\nPROPERTY AdmitOnlyViaGate',True),
        ('leakexec','leakExec','INVARIANT Isolation',False),('leakhold','leakHoldout','INVARIANT HoldoutSealed',False),
        ('unsound','unsoundAdmit','INVARIANT AdmissionSound',False),('unbind','unbind','INVARIANT AdmissionBinding',False),
        ('shortcut','shortcut','PROPERTY AdmitOnlyViaGate',False),
        ('repeat-artifact','repeat','INVARIANT HoldoutReadOncePerArtifact',False),
        ('repeat-cycle','repeat','INVARIANT HoldoutOncePerCycle',False),
        ('repeat-binding','repeat','INVARIANT CounterBinding',False),
        ('aggregate-misses-repeat','repeat','INVARIANT HoldQPerCycle',True),
        ('aggregate-implication','repeat','INVARIANT BoundImpliesArtifactOnce',False)]
    records=[]
    for name,bug,checks,pass_expected in tests:
        cfg=formal/f'LaneCyclesAudit-{name}.cfg'
        cfg.write_text(f'SPECIFICATION AuditSpec\nCONSTANTS MaxCyc = 2\n MaxVer = 2\n Bug = "{bug}"\nCHECK_DEADLOCK FALSE\n{checks}\n')
        args=['java','-XX:+UseParallelGC','-Xmx1g','-cp',str(formal/'tla2tools.jar'),'tlc2.TLC','-workers','1',
            '-metadir',str((out/name).resolve()),'-config',str(cfg),str(formal/'LaneCyclesAudit.tla')]
        r=subprocess.run(args,cwd=formal,capture_output=True,text=True,timeout=180)
        log=r.stdout+'\n'+r.stderr;(out/f'{name}.log').write_text(log,encoding='utf-8')
        ok=(r.returncode==0 and 'Model checking completed. No error has been found.' in log) if pass_expected else (r.returncode in (12,13) and 'is violated.' in log)
        row={'case':name,'exit_code':r.returncode,'expected':'PASS' if pass_expected else 'FALSIFIED','outcome_verified':ok,'argv':args}
        records.append(row);print(json.dumps(row),flush=True)
    report={'records':records,'all_expected_outcomes':all(x['outcome_verified'] for x in records),
        'bounds':{'MaxCyc':2,'MaxVer':2},'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [formal/'LaneIsolationCycles.tla',formal/'LaneCyclesAudit.tla']}}
    (out/'report.json').write_text(json.dumps(report,indent=2))
    if not report['all_expected_outcomes']:raise RuntimeError('unexpected TLC outcome')


if __name__=='__main__':main()
