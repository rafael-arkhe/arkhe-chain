"""Check changed sequential model; do not inherit old liveness outcomes."""
import hashlib,json,subprocess
from pathlib import Path
from check_lane_named_matrix import main as matrix


def main():
    matrix('seq-v1','LaneIsolationSeq','arc3-lane-sequential-20261027','PASS')
    formal=Path('work/arc-agi-3/formal/seq-v1').resolve()
    out=Path('output/arc3-lane-sequential-20261027')
    wrapper=formal/'LaneSeqRepairFairness.tla'
    wrapper.write_text('---- MODULE LaneSeqRepairFairness ----\nEXTENDS LaneIsolationSeq\nRepairFairSpec == LiveSpec /\\ WF_vars(Repair)\n====\n')
    cfg=formal/'Live2-repair-fair.cfg'
    cfg.write_text('SPECIFICATION RepairFairSpec\nCONSTANTS MaxVer = 3\n Bugs = {}\nCHECK_DEADLOCK FALSE\nPROPERTY Live2\n')
    args=['java','-XX:+UseParallelGC','-Xmx1g','-cp',str(formal.parent/'tla2tools.jar'),'tlc2.TLC','-workers','1',
        '-metadir',str((out/'Live2-repair-fair').resolve()),'-config',str(cfg),str(wrapper)]
    r=subprocess.run(args,cwd=formal,capture_output=True,text=True,timeout=120)
    log=r.stdout+'\n'+r.stderr;(out/'Live2-repair-fair.log').write_text(log,encoding='utf-8')
    ok=r.returncode==0 and 'Model checking completed. No error has been found.' in log and 'violated' not in log
    report=json.loads((out/'report.json').read_text())
    report['records'].append({'case':'Live2-repair-fair','status':'PASS' if ok else 'UNEXPECTED','exit_code':r.returncode,'matches_expected':ok,'argv':args})
    report['all_expected_outcomes']=all(x['matches_expected'] for x in report['records'])
    report['wrapper_sha256']=hashlib.sha256(wrapper.read_bytes()).hexdigest()
    (out/'report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'additional_fairness_pass':ok}),flush=True)
    if not ok:raise RuntimeError('unexpected extra fairness outcome')


if __name__=='__main__':main()
