"""Prospective example contrast; explicit rule transfer, no model calls."""
import copy, json, random
from pathlib import Path
import finite_grid_dsl_types as d
import finite_grid_dsl_runtime as rt
from dsl_proposal_loop import canonical, digest, make_request, parse_response
from dsl_prompt_examples import augment
from ollama_dsl_proposer import pack_grid, compress_request
from audit_proposal_identity import controls


def demonstrations():
    programs=copy.deepcopy(d.controls())
    def change(node,typ,old,new):
        if node['op']=='literal' and node['type']==typ and node['value']==old:node['value']=new
        for child in node['args']:change(child,typ,old,new)
    change(programs['move'],d.D,1,-1)
    change(programs['click'],d.P,5,9)
    def grid():return [[0]*64 for _ in range(64)]
    free=grid();free[40][40]=8;left=grid();left[40][39]=8
    blocked=grid();blocked[40][0]=8  # Left boundary blocks the first object.
    click=grid();painted=grid();painted[45][48]=9
    cases=[('left_free','move',free,{'kind':'MOVE','dx':-1,'dy':0},left),
           ('left_blocked','move',blocked,{'kind':'MOVE','dx':-1,'dy':0},blocked),
           ('click_color9','click',click,{'kind':'CLICK','x':48,'y':45},painted)]
    result=[]
    for name,program,before,action,target in cases:
        proposal={'uses_memory':False,'ast':programs[program]}
        parse_response(canonical(proposal))
        actual=rt.execute(proposal['ast'],before,action)
        if actual['grid']!=target:raise ValueError('demonstration replay mismatch')
        result.append({'name':name,'before':before,'action':action,'target':target,'proposal':proposal,
                       'fuel':actual['steps'],'identity_correct':before==target})
    return result


def request(condition,episodes):
    # Feedback absent and fixed in ALL example conditions.
    raw=make_request(episodes,[])
    if condition=='E0':return augment(raw)
    if condition not in ('E1','E2'):raise ValueError('condition')
    value=json.loads(raw)
    # Replace the entire example bundle, including the built-in identity example.
    value.pop('syntax_only_example')
    items=[]
    for demo in demonstrations():
        item={'name':demo['name'],'before':pack_grid(demo['before']),'action':demo['action'],
              'target':pack_grid(demo['target']),'proposal':demo['proposal']}
        if condition=='E2':
            item['contrast']={'identity_prediction':pack_grid(demo['before']),
                'identity_exact':demo['identity_correct'],
                'provided_program_exact':True,
                'required_changes':[{'x':x,'y':y,'before':demo['before'][y][x],'required':demo['target'][y][x]}
                    for y in range(64) for x in range(64) if demo['before'][y][x]!=demo['target'][y][x]]}
        items.append(item)
    value['additional_syntax_examples']=items
    value['example_scope']='Synthetic auxiliary rules: first object moves LEFT with blocking, or CLICK paints color9. Infer target behavior from its training pairs. These examples supply related algorithms; this is in-context transfer, not unaided discovery. Sparse grid encoding is defined in grid_transport_encoding.'
    return canonical(value)


def materialize():
    out=Path('output/arc3-example-contrast-design-20261027');out.mkdir(exist_ok=False)
    demos=demonstrations();targets=controls();receipts=[]
    demo_pairs={digest((x['before'],x['action'])) for x in demos}
    for name,episodes in targets.items():
        if any(digest((b,a)) in demo_pairs for ep in episodes for b,a,_ in ep):raise ValueError('overlapping pair')
        for condition in ('E0','E1','E2'):
            prompt=compress_request(request(condition,episodes))
            (out/f'{name}-{condition}-prompt.json').write_text(prompt,encoding='utf-8')
            receipts.append({'control':name,'condition':condition,'prompt_sha256':digest(prompt),'prompt_bytes':len(prompt.encode()),'training_sha256':digest(episodes)})
    schedule=[];rng=random.Random(27102027)
    for block in range(10):
        rows=[{'block':block+1,'control':name,'condition':c} for name in targets for c in ('E0','E1','E2')]
        rng.shuffle(rows);schedule.extend(rows)
    plan={'status':'DESIGN_ONLY_NOT_EXECUTED','new_model_calls':0,'prospective_requests':60,
        'calls_per_condition':20,'feedback':'none in all conditions','model':'north-mini-code-1.0:latest',
        'options':{'temperature':0,'seed':0,'num_ctx':8192,'num_predict':1024},'timeout_seconds':180,
        'admission':'DISABLED','failure_score':0,'replacements':False,
        'primary':'Required target cells correct / required cells over every scheduled request.',
        'secondary':['whole-grid exact / all scheduled pairs','stationary-target exact / all scheduled stationary pairs'],
        'conditional':'Report separately over executed proposals; undefined when none execute.',
        'schedule':schedule,'prompts':receipts,
        'limits':['E0/E1 changes example content, number, length and framing as a bundle, not pure specificity.',
                  'E1/E2 adds contrast information and prompt length, not a length-matched intervention.',
                  'Different coordinates and pair hashes do not remove algorithmic transfer.',
                  'Successful E2 does not demonstrate contrast is necessary; failure does not locate the cause in model/representation.',
                  'No claim of real levels: demonstrations are synthetic known DSL controls.']}
    (out/'plan.json').write_text(json.dumps(plan,indent=2),encoding='utf-8')
    (out/'demonstrations.json').write_text(json.dumps(demos,indent=2),encoding='utf-8')
    print(json.dumps({'status':plan['status'],'prompts':len(receipts),'demonstrations':len(demos),'future_calls':60}))


if __name__=='__main__':materialize()
