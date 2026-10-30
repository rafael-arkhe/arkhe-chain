"""Exploratory real-model calls on known synthetic controls, not blind evaluation."""
import json,hashlib
from pathlib import Path
import urllib.request
from dsl_proposal_loop import run_loop
from ollama_dsl_proposer import OllamaProposer


def grid():return [[0]*64 for _ in range(64)]


def main():
    out=Path('output/arc3-local-proposer-20261027');out.mkdir(parents=True,exist_ok=True)
    cases={};click=[]
    for x,y in [(2,3),(9,7)]:
        before=grid();after=grid();after[y][x]=5;click.append((before,{'kind':'CLICK','x':x,'y':y},after))
    click.append((grid(),{'kind':'NOOP'},grid()));cases['click']=[click]
    before=grid();before[3][3]=5;after=grid();after[3][4]=5;blocked=grid();blocked[3][3]=5;blocked[3][4]=9
    cases['move']=[[(before,{'kind':'MOVE','dx':1,'dy':0},after),(blocked,{'kind':'MOVE','dx':1,'dy':0},blocked)]]
    tags=json.load(urllib.request.urlopen('http://127.0.0.1:11434/api/tags',timeout=5))
    report={'phase':'REAL_LOCAL_MODEL_KNOWN_CONTROL_PROPOSALS','blind':False,'model_inventory':tags,
            'budget':{'calls_per_control':2,'controls':2,'max_calls_total':4,'max_output_tokens_per_call':1024,'context_tokens':8192,'timeout_seconds_per_call':180},
            'gold_solution_asts_in_prompt':False,'holdout_supplied_to_proposer':False,'new_environment_actions':0,'runs':{}}
    (out/'plan.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    for name,episodes in cases.items():
        proposer=OllamaProposer(out/name)
        result=run_loop(proposer,episodes,max_attempts=2)
        result['model_calls']=proposer.calls;report['runs'][name]=result
        (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps({'control':name,'status':result['status'],'calls':len(proposer.calls),'attempt_statuses':[x['status'] for x in result['attempts']]}),flush=True)
    report['execution_complete']=True
    (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')

if __name__=='__main__':main()
