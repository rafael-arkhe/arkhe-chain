"""Predeclare and execute paired public validation budgets. Never submit to Kaggle."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parent

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output-dir',required=True,type=Path)
    p.add_argument('--bridge-exe',required=True,type=Path)
    p.add_argument('--budgets',default='80,200,1000,5000')
    p.add_argument('--seeds',default='0')
    args=p.parse_args();budgets=[int(v) for v in args.budgets.split(',')];seeds=[int(v) for v in args.seeds.split(',')]
    if not budgets or min(budgets)<=0 or len(set(budgets))!=len(budgets) or len(set(seeds))!=len(seeds):
        p.error('positive distinct budgets and distinct seeds required')
    out=args.output_dir.resolve();out.mkdir(parents=True,exist_ok=False)
    plan={'phase':'PUBLIC_DEVELOPMENT_BUDGET_MATRIX','budgets':budgets,'policy_seeds':seeds,
          'games':['ls20','vc33'],'profiles':['random','frontier'],'native_gate':'OFF_FOR_BOTH_POLICY_ARMS',
          'snapshot_capture':True,'capability_demonstrated':False,
          'agent_sha256':hashlib.sha256((ROOT/'arkhe_agent.py').read_bytes()).hexdigest(),
          'interpretation':'paired policy seeds are descriptive; no automatic superiority test; engine seed not independently controlled'}
    (out/'plan.json').write_text(json.dumps(plan,indent=2))
    rows=[];failures=[]
    for seed in seeds:
        for budget in budgets:
            directory=out/f'seed-{seed}-budget-{budget}'
            command=[sys.executable,str(ROOT/'evaluate_arkhe.py'),'--output-dir',str(directory),
                     '--bridge-exe',str(args.bridge_exe.resolve()),'--steps',str(budget),
                     '--seed',str(seed),'--profiles','random,frontier']
            try:
                result=subprocess.run(command,capture_output=True,text=True,timeout=1200)
                (out/f'seed-{seed}-budget-{budget}.log').write_text(result.stdout+'\n'+result.stderr,encoding='utf-8')
                if result.returncode:failures.append({'seed':seed,'budget':budget,'returncode':result.returncode})
            except subprocess.TimeoutExpired:
                failures.append({'seed':seed,'budget':budget,'error':'TIMEOUT'})
            if (directory/'report.json').exists():
                report=json.loads((directory/'report.json').read_text())
                rows.extend({'seed':seed,'budget':budget,**r} for r in report['runs'])
            summary={**plan,'rows':rows,'failures':failures,'complete':False}
            (out/'report.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
            print(json.dumps({'seed':seed,'budget':budget,'recorded_runs':len(rows),'failures':failures}),flush=True)
    summary['complete']=True
    summary['all_runs_completed']=not failures and len(rows)==len(seeds)*len(budgets)*4 and all(r['status']=='COMPLETED' for r in rows)
    (out/'report.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
    return 0 if summary['all_runs_completed'] else 2

if __name__=='__main__':raise SystemExit(main())
