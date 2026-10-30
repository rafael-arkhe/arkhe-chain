"""Randomized E0/E1/E2 package comparison; known controls, no admission."""
import json,os,subprocess,time,hashlib
from pathlib import Path
from audit_proposal_identity import controls
from dsl_example_contrast import request
from dsl_proposal_loop import parse_response,training_check,digest
from dsl_output_schema import schema,inspect_response
from ollama_dsl_proposer import OllamaProposer,compress_request
from run_local_dsl_schema import request_api
import finite_grid_dsl_runtime as rt

OUT=Path('output/arc3-example-packages-20261027')


def score(episodes,proposal=None):
    result={'required_cells':0,'required_correct':0,'pairs':0,'exact_pairs':0,
            'stationary_pairs':0,'stationary_exact':0,'grid_identity':None}
    identity=True
    for episode in episodes:
        state={}
        for before,action,target in episode:
            pred=None
            if proposal is not None:
                executed=rt.execute(proposal['ast'],before,action,state,proposal['uses_memory'])
                pred=executed['grid'];state=executed['state'];identity &= pred==before
            result['pairs']+=1;result['exact_pairs']+=pred==target
            result['stationary_pairs']+=before==target
            result['stationary_exact']+=before==target and pred==target
            for y in range(64):
                for x in range(64):
                    if before[y][x]!=target[y][x]:
                        result['required_cells']+=1
                        result['required_correct']+=pred is not None and pred[y][x]==target[y][x]
    if proposal is not None:result['grid_identity']=identity
    return result


def main():
    OUT.mkdir(exist_ok=False);server=None
    plan=json.loads(Path('output/arc3-example-contrast-design-20261027/plan.json').read_text())
    assert len(plan['schedule'])==60
    cases=controls();report={'hypothesis':'Effect of example packages in fixed configuration; not pure specificity.',
        'admission':'DISABLED','new_environment_actions':0,'max_generation_calls':60,'records':[],
        'plan':plan,'complete':False}
    (OUT/'plan.json').write_text(json.dumps(report,indent=2))
    try:
        try:request_api('/api/tags')
        except Exception:
            env=dict(os.environ);env['OLLAMA_HOST']='127.0.0.1:11434'
            with (OUT/'server.log').open('ab') as log:
                server=subprocess.Popen([r'C:\Users\Lemes\AppData\Local\Programs\Ollama\ollama.exe','serve'],env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
            for _ in range(30):
                try:request_api('/api/tags');break
                except Exception:time.sleep(.5)
            else:raise RuntimeError('service unavailable')
        report['inventory']=request_api('/api/tags')
        for position,item in enumerate(plan['schedule'],1):
            name=item['control'];condition=item['condition'];episodes=cases[name]
            raw_request=request(condition,episodes);actual_prompt=compress_request(raw_request)
            archived=Path('output/arc3-example-contrast-design-20261027')/f'{name}-{condition}-prompt.json'
            assert actual_prompt==archived.read_text(encoding='utf-8')
            folder=OUT/f'{position:02d}-{name}-{condition}'
            adapter=OllamaProposer(folder,max_calls=1,format_spec=schema())
            row={**item,'position':position,'training_sha256':digest(episodes),
                'prompt_sha256':hashlib.sha256(actual_prompt.encode()).hexdigest(),
                'archived_prompt_equal':True,'score':score(episodes)}
            stage='PROVIDER'
            try:
                raw=adapter(raw_request);stage='SCHEMA'
                row['schema']=inspect_response(raw);stage='PARSE_TYPE'
                proposal=parse_response(raw);row['proposal_sha256']=digest(proposal)
                stage='EXECUTION';metrics=score(episodes,proposal)
                row.update(status='EXECUTED',score=metrics,training=training_check(proposal,episodes))
            except Exception as exc:row.update(status='FAILED_OR_REJECTED',failure_stage=stage,error_type=type(exc).__name__,reason=str(exc))
            row['usage']=adapter.calls
            report['records'].append(row)
            (OUT/'report.json').write_text(json.dumps(report,indent=2))
            print(json.dumps({'position':position,'control':name,'condition':condition,'status':row['status'],'correct':row['score']['required_correct']}),flush=True)
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
        (OUT/'report.json').write_text(json.dumps(report,indent=2))


if __name__=='__main__':main()
