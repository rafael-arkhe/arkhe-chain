"""Use installed model tokenizer via local llama-server; no inference endpoints."""
import hashlib,json,subprocess,time,urllib.request,socket
from pathlib import Path
from dsl_example_contrast import demonstrations
from dsl_example_length_control import generic_demos
from ollama_dsl_proposer import unpack_grid


def main():
    out=Path('output/arc3-example-token-audit-20261027');out.mkdir(exist_ok=False)
    root=Path.home()/'.ollama/models'
    manifest=json.loads((root/'manifests/registry.ollama.ai/library/north-mini-code-1.0/latest').read_text())
    layer=next(x for x in manifest['layers'] if x['mediaType']=='application/vnd.ollama.image.model')
    model=root/'blobs'/layer['digest'].replace(':','-')
    exe=Path.home()/'AppData/Local/Programs/Ollama/lib/ollama/llama-server.exe'
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    def api(path,payload=None):
        req=urllib.request.Request(f'http://127.0.0.1:{port}'+path,
            data=None if payload is None else json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=15) as response:return json.load(response)
    args=[str(exe),'-m',str(model),'--host','127.0.0.1','--port',str(port),'--device','none',
          '--ctx-size','512','--parallel','1','--no-warmup']
    report={'model_digest_from_manifest':layer['digest'],'executable_sha256':hashlib.sha256(exe.read_bytes()).hexdigest(),
            'argv':args,'generation_calls':0,'tokenizer_only_requests':[],'rows':[],'target_differences':[]}
    server=None
    try:
        with (out/'server.log').open('wb') as log:
            server=subprocess.Popen(args,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
        for i in range(240):
            if server.poll() is not None:raise RuntimeError('tokenizer server exited')
            try:api('/health');break
            except Exception:time.sleep(.5)
        else:raise RuntimeError('tokenizer readiness timeout')
        for source in sorted(Path('output/arc3-example-e1l-design-20261027').glob('*-prompt.json')):
            text=source.read_text(encoding='utf-8');row={'source':str(source),'prompt_sha256':hashlib.sha256(text.encode()).hexdigest()}
            for special in (False,True):
                payload={'content':text,'add_special':special,'parse_special':True}
                result=api('/tokenize',payload)
                key='with_model_special_tokens' if special else 'raw_prompt_tokens'
                row[key]=len(result['tokens'])
                (out/(source.stem+f'-tokens-{special}.json')).write_text(json.dumps(result),encoding='utf-8')
                report['tokenizer_only_requests'].append({'endpoint':'/tokenize','source':str(source),'add_special':special})
            report['rows'].append(row)
        for aux,generic in zip(demonstrations(),generic_demos()):
            other=unpack_grid(generic['target']);before=aux['before'];target=aux['target']
            delta=lambda a,b:sum(x!=y for ar,br in zip(a,b) for x,y in zip(ar,br))
            report['target_differences'].append({'auxiliary_name':aux['name'],'generic_name':generic['name'],
                'equal_before':before==unpack_grid(generic['before']),'equal_action':aux['action']==generic['action'],
                'e1_changed_cells':delta(before,target),'e1l_changed_cells':delta(before,other),
                'target_disagreement_cells':delta(target,other)})
        report['status']='MEASURED_RAW_MODEL_TOKENIZER'
        report['ollama_effective_template_tokens']='NOT_MEASURED; add_special is not a chat template. No claim these counts equal Ollama prompt_eval_count.'
    except Exception as exc:report.update(status='INCOMPLETE',error_type=type(exc).__name__,reason=str(exc))
    finally:
        if server is not None:
            server.terminate()
            try:server.wait(timeout=5)
            except subprocess.TimeoutExpired:server.kill();server.wait()
            report['owned_server_stopped']=True
        (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report,indent=2),flush=True)


if __name__=='__main__':main()
