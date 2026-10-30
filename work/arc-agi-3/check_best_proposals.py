"""Test new claims against existing bounded incumbent model and proposal guard."""
import hashlib,json,subprocess
from pathlib import Path


def main():
    formal=Path('work/arc-agi-3/formal').resolve()
    out=Path('output/arc3-best-proposals-tlc-v2-20261027');out.mkdir(exist_ok=False)
    tests=[('best-admissible','LaneIsolationWithBest','FairSpec','BestIsAdmissible',True),
        ('immediate-admission','LaneIsolationWithBest','FairSpec','BestAlreadyAdmitted',False),
        ('old-best','LaneIsolationWithBest','FairSpec','AlwaysLatestBest',False),
        ('exists-good','LaneIsolationWithBest','CompleteFairSpec','ExistsGoodEventuallyAdmitted',False),
        ('propose-guard','LaneProposeGuard','GuardedSpec','Live2',False)]
    records=[]
    for name,module,spec,prop,pass_expected in tests:
        directory=formal/'matrix-v3' if module=='LaneProposeGuard' else formal
        constants='MaxVer = 3\n Bugs = {}' if module=='LaneProposeGuard' else 'MaxVer = 2\n Fault = 0'
        cfg=directory/f'{module}-{name}.cfg'
        kind='PROPERTY' if name in ('exists-good','propose-guard') else 'INVARIANT'
        cfg.write_text(f'SPECIFICATION {spec}\nCONSTANTS {constants}\nCHECK_DEADLOCK FALSE\n{kind} {prop}\n')
        args=['java','-XX:+UseParallelGC','-Xmx1g','-cp',str(formal/'tla2tools.jar'),'tlc2.TLC','-workers','1',
            '-metadir',str((out/name).resolve()),'-config',str(cfg),str(directory/f'{module}.tla')]
        r=subprocess.run(args,cwd=directory,capture_output=True,text=True,timeout=120)
        log=r.stdout+'\n'+r.stderr;(out/f'{name}.log').write_text(log,encoding='utf-8')
        ok=(r.returncode==0 and 'Model checking completed. No error has been found.' in log) if pass_expected else ('violated' in log and r.returncode in (12,13))
        row={'case':name,'property':prop,'expected':'PASS' if pass_expected else 'FALSIFIED','exit_code':r.returncode,'outcome_verified':ok,'argv':args}
        records.append(row);print(json.dumps(row),flush=True)
    sources=[formal/'LaneIncumbent.tla',formal/'LaneIsolationWithBest.tla',formal/'matrix-v3/LaneIsolation.tla',formal/'matrix-v3/LaneProposeGuard.tla']
    report={'records':records,'all_expected_outcomes':all(r['outcome_verified'] for r in records),
        'source_sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}}
    (out/'report.json').write_text(json.dumps(report,indent=2))
    if not report['all_expected_outcomes']:raise RuntimeError('unexpected TLC outcome')


if __name__=='__main__':main()
