"""Maximum four local generation calls; frozen-proposal probes kept separate."""
import json,os,subprocess,time
from pathlib import Path
from balanced_selection import balanced_bank,BalancedProposer,schema,left_control,frozen_probes
from audit_proposal_identity import controls
from dsl_proposal_loop import digest
from dsl_incumbent_dev import run_dev
from run_example_packages import score
from ollama_dsl_proposer import OllamaProposer
from run_local_dsl_schema import request_api


def main():
    out=Path('output/arc3-balanced-selection-20261027');out.mkdir(exist_ok=False)
    cases={'click':controls()['click'],'right':controls()['move'],'left':left_control()};budgets={'click':2,'right':1,'left':1}
    old=json.loads(Path('output/arc3-candidate-bank-smoke-20261027/report.json').read_text())['runs']['move']['result']
    frozen=old['incumbent'];assert digest(frozen)==old['incumbent_sha256']
    probes=frozen_probes()
    report={'design':'Exploratory bundle change: balanced family counts, shuffled order, explicit DEV mismatch details and inverse movement. Not a one-factor causal ablation.',
        'budget':budgets,'max_generation_calls':4,'candidate_bank':balanced_bank(),'training_sha256':{k:digest(v) for k,v in cases.items()},
        'frozen_prior_candidate_sha256':digest(frozen),'frozen_probes':probes,
        'probe_scope':'Post-hoc synthetic validation of an earlier frozen candidate, not sealed holdout or production admission.',
        'admission':'DISABLED','runs':{}}
    (out/'plan.json').write_text(json.dumps(report,indent=2))
    report['frozen_probe_results']={name:score(episodes,frozen) for name,episodes in probes.items()}
    server=None
    try:
        try:request_api('/api/tags')
        except Exception:
            env=dict(os.environ);env['OLLAMA_HOST']='127.0.0.1:11434'
            with (out/'server.log').open('ab') as log:
                server=subprocess.Popen([r'C:\Users\Lemes\AppData\Local\Programs\Ollama\ollama.exe','serve'],env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
            for _ in range(30):
                try:request_api('/api/tags');break
                except Exception:time.sleep(.5)
            else:raise RuntimeError('service unavailable')
        report['inventory']=request_api('/api/tags')
        for name,episodes in cases.items():
            provider=OllamaProposer(out/name,max_calls=budgets[name],format_spec=schema())
            adapter=BalancedProposer(provider);result=run_dev(adapter,episodes,budgets[name])
            attempts=[score(episodes,next(x['proposal'] for x in balanced_bank() if x['candidate_id']==e['candidate_id']))
                if e['status']=='SELECTED_TYPED_CANDIDATE' else score(episodes) for e in adapter.journal]
            report['runs'][name]={'result':result,'frontend':adapter.journal,'scores':attempts,'usage':provider.calls}
            (out/'report.json').write_text(json.dumps(report,indent=2))
            print(json.dumps({'control':name,'stage':result['stage'],'selections':[x.get('candidate_id') for x in adapter.journal]}),flush=True)
        report['complete']=True
    finally:
        report['cleanup']={}
        try:request_api('/api/generate',{'model':'north-mini-code-1.0:latest','keep_alive':0},timeout=15);report['cleanup']['model_unloaded']=True
        except Exception:report['cleanup']['model_unloaded']=False
        if server:
            server.terminate()
            try:server.wait(timeout=5)
            except subprocess.TimeoutExpired:server.kill();server.wait()
            report['cleanup']['owned_server_stopped']=True
        (out/'report.json').write_text(json.dumps(report,indent=2))


if __name__=='__main__':main()
