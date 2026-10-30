"""Run actual TLC on supplied TLA+ model, retain bounded evidence."""
import hashlib,json,subprocess
from pathlib import Path


def main():
    formal=Path('work/arc-agi-3/formal').resolve()
    out=Path('output/arc3-lane-isolation-tlc-v2-20261027');out.mkdir(exist_ok=False)
    jar=formal/'tla2tools.jar'
    assert hashlib.sha1(jar.read_bytes()).hexdigest()=='bee4a54f3ee3d4afc347c3240ec2d9e93b075104'
    records=[]
    for case in ('safe','leakexec','leakholdout','witness'):
        model='LaneIsolationWitness.tla' if case=='witness' else 'LaneIsolation.tla'
        args=['java','-XX:+UseParallelGC','-Xmx1g','-cp',str(jar),'tlc2.TLC','-workers','1',
              '-metadir',str((out/case).resolve()),'-config',str(formal/f'LaneIsolation-{case}.cfg'),str(formal/model)]
        result=subprocess.run(args,capture_output=True,text=True,timeout=120,cwd=formal)
        log=result.stdout+'\n'+result.stderr
        (out/f'{case}.log').write_text(log,encoding='utf-8')
        expected='Model checking completed. No error has been found.' if case=='safe' else 'Invariant '+{'leakexec':'Isolation','leakholdout':'HoldoutSealed','witness':'NoProdEffects'}[case]+' is violated.'
        records.append({'case':case,'argv':args,'exit_code':result.returncode,'expected_message_present':expected in log})
        print(json.dumps(records[-1]),flush=True)
    report={'model_scope':'finite abstract protocol; verdict oracle assumed; not Rust refinement or empirical gate soundness',
        'records':records,'all_expected_outcomes':all(r['expected_message_present'] for r in records),
        'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [*formal.glob('*.tla'),*formal.glob('*.cfg'),jar]}}
    (out/'report.json').write_text(json.dumps(report,indent=2))
    if not report['all_expected_outcomes']:raise RuntimeError('unexpected TLC outcome')


if __name__=='__main__':main()
