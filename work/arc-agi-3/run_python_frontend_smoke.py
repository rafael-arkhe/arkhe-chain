"""Four-call local integration smoke; Python syntax subset, not unrestricted code."""
import json,os,subprocess,time
from pathlib import Path
from audit_proposal_identity import controls
from dsl_incumbent_dev import run_dev
from python_dsl_frontend import PythonSyntaxProposer,output_schema,lower_source
from ollama_dsl_proposer import OllamaProposer
from run_local_dsl_schema import request_api


def main(output_name='arc3-python-frontend-smoke-20261027',lower_fn=lower_source,frontend_contract=None,diagnostics=None,adapter_factory=None,response_schema_fn=output_schema,report_metadata=None):
    out=Path('output')/output_name;out.mkdir(exist_ok=False)
    report={'design':'Integration smoke, known training controls, no independent holdout or language-causal attribution.',
        'budget':{'total_generation_requests':4,'per_control':2,'output_tokens_per_call':1024,'context_tokens':8192,'timeout_seconds':180},
        'source_language':'Python-syntax DSL subset, no source execution','admission':'DISABLED','runs':{}}
    report['frontend_extension']=frontend_contract
    if report_metadata:report.update(report_metadata)
    (out/'plan.json').write_text(json.dumps(report,indent=2));server=None
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
        for name,episodes in controls().items():
            provider=OllamaProposer(out/name,max_calls=2,format_spec=response_schema_fn())
            frontend=adapter_factory(provider) if adapter_factory else PythonSyntaxProposer(provider,lower_fn=lower_fn,frontend_contract=frontend_contract)
            result=run_dev(frontend,episodes,2)
            if diagnostics is not None:
                for entry in frontend.journal:
                    try:entry['source_diagnostics']=diagnostics(json.loads(entry['raw_response'])['source'])
                    except (ValueError,KeyError,TypeError):entry['source_diagnostics']={'status':'NO_VALID_SOURCE_ENVELOPE'}
            report['runs'][name]={'result':result,'frontend':frontend.journal,'usage':provider.calls}
            (out/'report.json').write_text(json.dumps(report,indent=2))
            print(json.dumps({'control':name,'status':result['status'],'stage':result['stage'],'frontend':[x['status'] for x in frontend.journal]}),flush=True)
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
