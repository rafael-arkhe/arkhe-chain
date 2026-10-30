"""Frozen-parent feedback ablation, 40 requests; no candidate admission."""
import json, os, subprocess, time
from pathlib import Path
from audit_proposal_identity import controls, measure
from dsl_proposal_loop import make_request, training_check, parse_response, digest
from dsl_prompt_examples import augment
from dsl_output_schema import schema, inspect_response
from ollama_dsl_proposer import OllamaProposer
from run_local_dsl_schema import request_api

OUT=Path('output/arc3-feedback-ablation-20261027')


def feedback(condition, proposal, episodes):
    if condition=='A':return []
    score=training_check(proposal,episodes)
    item={'attempt':1,'training_counterexample':score}
    if condition=='C':
        ei,ti=score['episode'],score['transition'];before,action,target=episodes[ei][ti]
        predicted=score['predicted']
        item['pixel_counterexample']={'action':action,'differences':[
            {'x':x,'y':y,'before':before[y][x],'predicted':predicted[y][x],'required':target[y][x]}
            for y in range(64) for x in range(64) if predicted[y][x]!=target[y][x]],
            'instruction':'Match required target values on these training inputs; preserve unchanged targets including blocked moves and NOOP.'}
    if condition=='D':item['repair_instruction']='The previous proposal was identity on all examined training inputs. Do not repeat that identity program. Preserve valid unchanged targets including blocked moves and NOOP.'
    return [item]


def main():
    OUT.mkdir(exist_ok=False);server=None;report={'design':'Frozen archived parent, not adaptive repair chains; five repetitions per control per condition, fixed seed0 temperature0; interleaved A-D.',
        'max_generation_requests':40,'new_environment_actions':0,'admission':'DISABLED','records':[]}
    archived=Path('output/arc3-local-proposer-schema-20261027/move/response-1.json')
    parent=parse_response(json.loads(archived.read_text())['response']);cases=controls()
    report['parent_sha256']=digest(parent)
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
            else:raise RuntimeError('server unavailable')
        report['inventory']=request_api('/api/tags')
        for repetition in range(5):
            for name,episodes in cases.items():
                for condition in 'ABCD':
                    label=f'{repetition+1}-{name}-{condition}'
                    adapter=OllamaProposer(OUT/label,max_calls=1,format_spec=schema())
                    record={'repetition':repetition+1,'control':name,'condition':condition,'training_sha256':digest(episodes)}
                    try:
                        raw=adapter(augment(make_request(episodes,feedback(condition,parent,episodes))))
                        record['schema']=inspect_response(raw)
                        proposal=parse_response(raw)
                        record.update(status='EXECUTED',proposal_sha256=digest(proposal),same_parent_hash=digest(proposal)==digest(parent),metrics=measure(proposal,episodes),training=training_check(proposal,episodes))
                    except Exception as exc:record.update(status='INCOMPLETE_OR_REJECTED',error_type=type(exc).__name__,reason=str(exc))
                    report['records'].append(record)
                    (OUT/'report.json').write_text(json.dumps(report,indent=2))
                    print(json.dumps({'completed':len(report['records']), 'label':label,'status':record['status'],'same_parent_hash':record.get('same_parent_hash')}),flush=True)
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
