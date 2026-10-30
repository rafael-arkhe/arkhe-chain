"""Local Ollama adapter with lossless sparse grids and recorded usage.
No task solution AST in prompt; model output still must pass strict validator.
"""
from collections import Counter
import hashlib
import json
from pathlib import Path
import time
import urllib.request
import finite_grid_dsl_runtime as rt


def pack_grid(grid):
    g=rt.validate_grid(grid);colors=Counter(c for row in g for c in row)
    base=min(colors,key=lambda c:(-colors[c],c))
    return {'encoding':'background_overrides','width':64,'height':64,'base_color':base,
            'overrides':[[x,y,c] for y,row in enumerate(g) for x,c in enumerate(row) if c!=base]}


def unpack_grid(value):
    if value['width']!=64 or value['height']!=64:raise ValueError('64x64 only')
    g=[[value['base_color']]*64 for _ in range(64)];seen=set()
    for x,y,c in value['overrides']:
        if not 0<=x<64 or not 0<=y<64 or (x,y) in seen:raise ValueError('invalid override')
        seen.add((x,y));g[y][x]=c
    rt.validate_grid(g);return g


def compress_request(request):
    value=json.loads(request)
    value['training_episodes']=[[[pack_grid(b),a,pack_grid(t)] for b,a,t in episode] for episode in value['training_episodes']]
    for item in value['previous_training_feedback']:
        counter=item.get('training_counterexample',{})
        for key in ('predicted','expected'):
            if key in counter:counter[key]=pack_grid(counter[key])
    value['grid_transport_encoding']='Lossless 64x64: initialize every pixel to base_color, then set each override[x,y,color]. DSL still receives actual grids; this JSON is input-output evidence, not executable AST.'
    return json.dumps(value,sort_keys=True,separators=(',',':'))


class OllamaProposer:
    def __init__(self,out,model='north-mini-code-1.0:latest',max_calls=2):
        self.out=Path(out);self.out.mkdir(parents=True,exist_ok=False);self.model=model;self.max_calls=max_calls;self.calls=[]
    def __call__(self,request):
        if len(self.calls)>=self.max_calls:raise RuntimeError('provider call budget')
        prompt=compress_request(request);index=len(self.calls)+1
        payload={'model':self.model,'prompt':prompt,'stream':False,'format':'json','think':False,
                 'keep_alive':'5m','options':{'temperature':0,'seed':0,'num_predict':1024,'num_ctx':8192}}
        (self.out/f'request-{index}.json').write_text(json.dumps(payload,indent=2),encoding='utf-8')
        log={'call':index,'model':self.model,'prompt_sha256':hashlib.sha256(prompt.encode()).hexdigest(),'prompt_bytes':len(prompt.encode()),'max_output_tokens':1024,'context_tokens':8192,'timeout_seconds':180}
        self.calls.append(log);started=time.perf_counter()
        try:
            req=urllib.request.Request('http://127.0.0.1:11434/api/generate',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
            with urllib.request.urlopen(req,timeout=180) as response:data=json.load(response)
            log.update({k:data.get(k) for k in ['model','done','done_reason','prompt_eval_count','eval_count','total_duration','load_duration','prompt_eval_duration','eval_duration']})
            (self.out/f'response-{index}.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
            return data.get('response','')
        except Exception as exc:
            log.update(status='PROVIDER_ERROR',error_type=type(exc).__name__);raise
        finally:
            log['wall_seconds']=time.perf_counter()-started
            (self.out/'usage.json').write_text(json.dumps(self.calls,indent=2),encoding='utf-8')
