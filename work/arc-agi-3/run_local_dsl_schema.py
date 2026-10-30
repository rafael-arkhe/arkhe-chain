"""Second declared exploratory prompt condition; same existing local model."""
import json,os,time,subprocess,hashlib
import urllib.request
from pathlib import Path
from dsl_proposal_loop import run_loop
from ollama_dsl_proposer import OllamaProposer
from dsl_prompt_examples import augment
from dsl_output_schema import schema,inspect_response

MODEL='north-mini-code-1.0:latest'
OUT=Path('output/arc3-local-proposer-schema-20261027')


def request_api(path,payload=None,timeout=10):
    req=urllib.request.Request('http://127.0.0.1:11434'+path,data=None if payload is None else json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=timeout) as response:return json.load(response)


def grid():return [[0]*64 for _ in range(64)]


def main():
    OUT.mkdir(parents=True,exist_ok=False);server=None;cleanup={};r={}
    try:
        try:request_api('/api/tags')
        except Exception:
            env=dict(os.environ);env['OLLAMA_HOST']='127.0.0.1:11434'
            with (OUT/'ollama-server.log').open('ab') as log:
                server=subprocess.Popen([r'C:\Users\Lemes\AppData\Local\Programs\Ollama\ollama.exe','serve'],env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
            for i in range(30):
                try:request_api('/api/tags',timeout=2);break
                except Exception:time.sleep(.5)
            else:raise RuntimeError('server unavailable')
        inventory=request_api('/api/tags');r={'phase':'REAL_LOCAL_MODEL_JSON_SCHEMA_CONDITION','blind':False,'model':MODEL,'model_inventory':inventory,
          'comparison':'historical JSON-mode condition; descriptive, not a statistical causal estimate',
          'changed_factor':'format=json replaced by generated actual-DSL schema; same examples/evidence/model/settings/parser/DSL',
          'budget':{'controls':2,'calls_per_control':2,'max_calls_total':4,'max_output_tokens_per_call':1024,'context_tokens':8192,'timeout_seconds_per_call':180},
          'model_load_requests':[],'runs':{},'new_environment_actions':0}
        (OUT/'plan.json').write_text(json.dumps(r,indent=2),encoding='utf-8')
        (OUT/'output-schema.json').write_text(json.dumps(schema(),indent=2),encoding='utf-8')
        # Service/model loading is recorded separately, without inference prompt.
        for attempt in range(2):
            start=time.perf_counter()
            try:
                loaded=request_api('/api/generate',{'model':MODEL,'keep_alive':'5m'},timeout=180)
                r['model_load_requests'].append({'status':'READY','wall_seconds':time.perf_counter()-start,'eval_count':loaded.get('eval_count')});break
            except Exception as exc:
                r['model_load_requests'].append({'status':'ERROR','error_type':type(exc).__name__,'wall_seconds':time.perf_counter()-start})
                if attempt==1:raise
        click=[]
        for x,y in [(2,3),(9,7)]:
            b=grid();a=grid();a[y][x]=5;click.append((b,{'kind':'CLICK','x':x,'y':y},a))
        click.append((grid(),{'kind':'NOOP'},grid()))
        free=grid();free[3][3]=5;after=grid();after[3][4]=5;blocked=grid();blocked[3][3]=5;blocked[3][4]=9
        cases={'click':[click],'move':[[(free,{'kind':'MOVE','dx':1,'dy':0},after),(blocked,{'kind':'MOVE','dx':1,'dy':0},blocked)]]}
        for name,episodes in cases.items():
            adapter=OllamaProposer(OUT/name,max_calls=2,format_spec=schema())
            schema_checks=[]
            def callback(prompt):
                raw=adapter(augment(prompt));schema_checks.append(inspect_response(raw));return raw
            result=run_loop(callback,episodes,max_attempts=2)
            result['independent_schema_checks']=schema_checks
            result['model_calls']=adapter.calls;r['runs'][name]=result
            (OUT/'report.json').write_text(json.dumps(r,indent=2),encoding='utf-8')
            print(json.dumps({'control':name,'status':result['status'],'attempts':[{'status':a['status'],'reason':a.get('reason'),'training':a.get('training',{}).get('reason')} for a in result['attempts']]}),flush=True)
        r['execution_complete']=True
    except Exception as exc:r.update(execution_complete=False,status='RUN_INCOMPLETE',error_type=type(exc).__name__)
    finally:
        try:request_api('/api/generate',{'model':MODEL,'keep_alive':0},timeout=15);cleanup['model_unloaded']=True
        except Exception:cleanup['model_unloaded']=False
        if server is not None:
            server.terminate()
            try:server.wait(timeout=5)
            except subprocess.TimeoutExpired:server.kill();server.wait()
            cleanup['task_server_stopped']=True
        else:cleanup['existing_server_left_running']=True
        r['cleanup']=cleanup
        (OUT/'report.json').write_text(json.dumps(r,indent=2),encoding='utf-8')

if __name__=='__main__':main()
