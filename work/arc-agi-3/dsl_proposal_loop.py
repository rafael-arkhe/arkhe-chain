"""Provider-neutral proposal validation and TRAIN-only repair interface.
No remote model client, benchmark environment calls or native authorization.
"""
import hashlib
import json
import re
import finite_grid_dsl_types as d
import finite_grid_dsl_runtime as rt

MAX_RESPONSE_BYTES=65536
MAX_REQUEST_BYTES=262144
MAX_ATTEMPTS=5


def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)
def digest(value):return hashlib.sha256(canonical(value).encode()).hexdigest()


def parse_response(raw):
    if not isinstance(raw,str) or len(raw.encode())>MAX_RESPONSE_BYTES:raise ValueError('RESPONSE_SIZE_OR_TYPE')
    def pairs(items):
        result={}
        for k,v in items:
            if k in result:raise ValueError('DUPLICATE_JSON_KEY')
            result[k]=v
        return result
    try:
        data=json.loads(raw,object_pairs_hook=pairs,parse_constant=lambda x:(_ for _ in ()).throw(ValueError('NONFINITE_JSON')))
    except (json.JSONDecodeError,RecursionError) as exc:raise ValueError('INVALID_JSON') from exc
    if not isinstance(data,dict) or set(data)!={'uses_memory','ast'} or type(data['uses_memory']) is not bool:raise ValueError('INVALID_ENVELOPE')
    stack=[data['ast']];nodes=0
    while stack:
        node=stack.pop();nodes+=1
        if nodes>d.MAX_NODES:raise ValueError('AST_NODE_LIMIT')
        if not isinstance(node,dict) or not isinstance(node.get('op'),str) or not isinstance(node.get('args'),list):raise ValueError('INVALID_NODE')
        allowed={'op','args'}
        if node['op'] in ('var','let'):allowed|={'name'}
        if node['op']=='literal':allowed|={'type','value'}
        if node['op']=='lambda':allowed|={'params'}
        if set(node)!=allowed:raise ValueError('NODE_FIELDS')
        if 'name' in node and (not isinstance(node['name'],str) or not re.fullmatch('[a-z][a-z0-9_]{0,15}',node['name'])):raise ValueError('BINDER_NAME')
        if node['op']=='lambda':
            if not isinstance(node['params'],list) or any(not isinstance(x,str) or not re.fullmatch('[a-z][a-z0-9_]{0,15}',x) for x in node['params']):raise ValueError('LAMBDA_BINDERS')
        stack.extend(node['args'])
    try:d.check_program(data['ast'],data['uses_memory'])
    except (ValueError,TypeError,KeyError) as exc:raise ValueError('TYPECHECK_REJECTED') from exc
    return data


def make_request(training_episodes,feedback):
    primitives={op:{'args':args,'returns':result} for op,(args,result) in sorted(d.REGISTRY.items())}
    literals={k:sorted(v,key=lambda x:json.dumps(x)) for k,v in d.LITERALS.items()}
    instructions={
      'task':'Propose one executable DSL step program from TRAINING episodes only. Return exactly JSON with uses_memory:boolean and ast:node. No Python or Markdown.',
      'max_ast_nodes':d.MAX_NODES,'fuel_per_step':10000,'primitives':primitives,'literal_domains':literals,
      'variables':{'g':'Grid','a':'Action','s':'State'},'step_result':'Pair[Grid,State]',
      'ast_schema':{'ordinary':{'op':'primitive_name','args':['child nodes']},'literal':{'op':'literal','args':[],'type':'type name','value':'literal'},'variable':{'op':'var','args':[],'name':'g/a/s or bound name'},'lambda':{'op':'lambda','args':['body'],'params':['bound names']},'let':{'op':'let','args':['value','body'],'name':'bound name'}},
      'special_forms':{'if':'lazy Bool, same-typed then/else','pair':'two children','let':'value then lexically bound body','list_head':'Option[element]','list_len':'Count','is_some':'Option to Bool','option_default':'Option[T], fallback T (lazy)','match_option':'Option[T], fallback U, lambda(T)->U (lazy)','fold':'bounded snapshot list[T], accumulator U, lambda(U,T)->U'},
      'semantics':{'grid':'64x64 palette0..15, immutable, [y][x]','background':'most frequent palette color; tie lowest','objects':'4-connected same-color components excluding background, discovered y/x scan on argument grid','translate':'clear original visible cells with inferred background then paint translated cells; clip outside and allow overwrite','is_blocked':'outside bounds or nonbackground destination excluding own old cells','add':'Offset saturating[-64,64]','coord':'clamp x/y0..63','state':'four keys k0..k3, bounded Offset values, reset{} per episode; false uses_memory requires empty input/output State','action':'kind MOVE plus dx/dy; CLICK plus x/y; NOOP. Only relevant accessors return Some','fold':'threads explicit accumulator; list snapshot is immutable'},
      'syntax_only_example':{'uses_memory':False,'ast':d.node('pair',d.var('g'),d.var('s'))},
      'training_episodes':training_episodes,'previous_training_feedback':feedback,
      'forbidden':'No suffix, hidden labels, goal oracle or game source supplied. No assertion of goal inference from replay.'}
    payload=canonical(instructions)
    if len(payload.encode())>MAX_REQUEST_BYTES:raise ValueError('REQUEST_BYTE_LIMIT')
    return payload


def training_check(proposal,episodes):
    examined=0
    for ei,episode in enumerate(episodes):
        state={}
        for ti,(before,action,target) in enumerate(episode):
            examined+=1
            try:r=rt.execute(proposal['ast'],before,action,state,proposal['uses_memory'])
            except rt.StepLimitExceeded:return {'status':'REPLAY_FAIL','reason':'STEP_LIMIT_EXCEEDED','episode':ei,'transition':ti,'queries_examined':examined}
            if r['grid']!=target:return {'status':'REPLAY_FAIL','reason':'FIRST_GRID_MISMATCH','episode':ei,'transition':ti,'queries_examined':examined,'input_state':state,'predicted':r['grid'],'expected':target}
            state=r['state']
    return {'status':'REPLAY_PASS' if examined else 'REPLAY_FAIL','reason':'ALL_TRAIN_QUERIES_EXACT' if examined else 'NO_QUERIES','queries_examined':examined}


def run_loop(proposer,training_episodes,max_attempts=MAX_ATTEMPTS):
    if type(max_attempts) is not int or not 1<=max_attempts<=MAX_ATTEMPTS:raise ValueError('attempt budget1..5')
    feedback=[];journal=[];result={'phase':'PROPOSAL_TRAIN_REPAIR','training_sha256':digest(training_episodes),'max_attempts':max_attempts,'attempts':journal,'holdout_evaluated':False,'ratification':'NOT_EVALUATED','new_environment_actions':0}
    for attempt in range(max_attempts):
        try:request=make_request(training_episodes,feedback)
        except ValueError:result['status']='REQUEST_LIMIT_RUN_INCOMPLETE';return result
        request_hash=hashlib.sha256(request.encode()).hexdigest()
        try:raw=proposer(request)
        except Exception as exc:result.update(status='PROPOSER_ERROR_RUN_INCOMPLETE',error_type=type(exc).__name__);return result
        record={'attempt':attempt+1,'request_sha256':request_hash,'response_sha256':hashlib.sha256(raw.encode()).hexdigest() if isinstance(raw,str) else None}
        journal.append(record)
        try:proposal=parse_response(raw)
        except ValueError as exc:
            record.update(status='PARSE_OR_TYPE_REJECTED',reason=str(exc));feedback.append({'attempt':attempt+1,'reason':str(exc)});continue
        record['proposal']=proposal
        try:score=training_check(proposal,training_episodes)
        except Exception as exc:
            record.update(status='EXECUTION_ERROR_RUN_INCOMPLETE',error_type=type(exc).__name__);result['status']='EXECUTION_ERROR_RUN_INCOMPLETE';return result
        record['training']=score;record['status']=score['status']
        if score['status']=='REPLAY_PASS':result.update(status='TRAINING_CANDIDATE_FOUND',frozen_proposal_sha256=digest(proposal));return result
        feedback.append({'attempt':attempt+1,'training_counterexample':score})
    result['status']='PROPOSAL_BUDGET_EXHAUSTED';return result
