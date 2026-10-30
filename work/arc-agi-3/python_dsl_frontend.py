"""Parse a declared Python-syntax subset into the finite DSL. Never execute source."""
import ast,json,re
import finite_grid_dsl_types as d
from dsl_proposal_loop import canonical,parse_response,MAX_REQUEST_BYTES

MAX_SOURCE_BYTES=32768
LITERAL_TYPES={'offset':d.D,'color':d.P,'count':d.N,'kind':d.AK,'key':d.K,'boolean':d.B,'coord_literal':d.C}
ALIASES={'and_':'and','or_':'or','not_':'not','if_':'if'}
SPECIAL={'pair','list_head','list_len','is_some','option_default','match_option','fold'}


def valid_name(name):
    if not re.fullmatch('[a-z][a-z0-9_]{0,15}',name):raise ValueError('SOURCE_NAME')
    return name


def parameters(args):
    if args.posonlyargs or args.kwonlyargs or args.defaults or args.kw_defaults or args.vararg or args.kwarg:raise ValueError('SOURCE_PARAMETERS')
    if any(x.annotation is not None for x in args.args):raise ValueError('SOURCE_ANNOTATION')
    names=[valid_name(x.arg) for x in args.args]
    if len(set(names))!=len(names):raise ValueError('SOURCE_PARAMETERS')
    return names


def constant(node):
    if isinstance(node,ast.Constant):return node.value
    if isinstance(node,ast.UnaryOp) and isinstance(node.op,ast.USub) and isinstance(node.operand,ast.Constant) and type(node.operand.value) is int:return -node.operand.value
    if isinstance(node,ast.Tuple):return tuple(constant(x) for x in node.elts)
    raise ValueError('SOURCE_LITERAL')


def expression(node):
    if isinstance(node,ast.Name):return d.var(valid_name(node.id))
    if isinstance(node,ast.Tuple) and len(node.elts)==2:return d.node('pair',*(expression(x) for x in node.elts))
    if isinstance(node,ast.IfExp):return d.node('if',expression(node.test),expression(node.body),expression(node.orelse))
    if isinstance(node,ast.Lambda):
        return d.node('lambda',expression(node.body),params=parameters(node.args))
    if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and not node.keywords:
        name=node.func.id
        if name in LITERAL_TYPES:
            if len(node.args)!=1:raise ValueError('SOURCE_LITERAL_ARITY')
            return d.lit(LITERAL_TYPES[name],constant(node.args[0]))
        if name=='bind':
            if len(node.args)!=2 or not isinstance(node.args[1],ast.Lambda):raise ValueError('SOURCE_BIND')
            names=parameters(node.args[1].args)
            if len(names)!=1:raise ValueError('SOURCE_BIND')
            return d.node('let',expression(node.args[0]),expression(node.args[1].body),name=names[0])
        op=ALIASES.get(name,name)
        if op not in d.REGISTRY and op not in SPECIAL and op!='if':raise ValueError('SOURCE_CALL_NOT_ALLOWED')
        return d.node(op,*(expression(x) for x in node.args))
    raise ValueError('SOURCE_EXPRESSION_NOT_ALLOWED')


def block(statements):
    if not statements:raise ValueError('SOURCE_RETURN_REQUIRED')
    head,*tail=statements
    if isinstance(head,ast.Return) and not tail and head.value is not None:return expression(head.value)
    if isinstance(head,ast.Assign) and len(head.targets)==1 and isinstance(head.targets[0],ast.Name):
        return d.node('let',expression(head.value),block(tail),name=valid_name(head.targets[0].id))
    if isinstance(head,ast.If) and not tail and head.orelse:
        return d.node('if',expression(head.test),block(head.body),block(head.orelse))
    raise ValueError('SOURCE_STATEMENT_NOT_ALLOWED')


def lower_source(source,uses_memory=False):
    if not isinstance(source,str) or len(source.encode())>MAX_SOURCE_BYTES:raise ValueError('SOURCE_SIZE_OR_TYPE')
    try:tree=ast.parse(source)
    except (SyntaxError,RecursionError,ValueError) as exc:raise ValueError('SOURCE_SYNTAX') from exc
    if sum(1 for _ in ast.walk(tree))>512:raise ValueError('SOURCE_SYNTAX_NODE_LIMIT')
    if len(tree.body)!=1 or not isinstance(tree.body[0],ast.FunctionDef):raise ValueError('SOURCE_SINGLE_FUNCTION')
    fn=tree.body[0]
    if fn.name!='step' or fn.decorator_list or fn.returns or fn.type_params or parameters(fn.args)!=['g','a','s']:raise ValueError('SOURCE_STEP_SIGNATURE')
    try:program=block(fn.body)
    except RecursionError as exc:raise ValueError('SOURCE_DEPTH') from exc
    return parse_response(canonical({'uses_memory':uses_memory,'ast':program}))


def source_for(program):
    inverse={value:key for key,value in LITERAL_TYPES.items()}
    reverse={value:key for key,value in ALIASES.items()}
    def render(node):
        op=node['op'];args=node['args']
        if op=='var':return node['name']
        if op=='literal':return inverse[node['type']]+'('+repr(node['value'])+')'
        if op=='lambda':return '(lambda '+', '.join(node['params'])+': '+render(args[0])+')'
        if op=='let':return 'bind('+render(args[0])+', lambda '+node['name']+': '+render(args[1])+')'
        return reverse.get(op,op)+'('+', '.join(render(x) for x in args)+')'
    return 'def step(g, a, s):\n    return '+render(program)+'\n'


def output_schema():
    return {'type':'object','properties':{'uses_memory':{'type':'boolean'},'source':{'type':'string','maxLength':MAX_SOURCE_BYTES}},
            'required':['uses_memory','source'],'additionalProperties':False}


class PythonSyntaxProposer:
    """Callback adapter for run_dev. Source parsing errors become recorded rejects."""
    def __init__(self,callback,lower_fn=lower_source,frontend_contract=None):
        self.callback=callback;self.journal=[];self.lower_fn=lower_fn;self.frontend_contract=frontend_contract
    def __call__(self,request):
        value=json.loads(request)
        value.pop('syntax_only_example',None);value.pop('ast_schema',None)
        value['task']='Return exactly JSON with uses_memory:boolean and source:string. Source is the declared Python-syntax DSL subset, not arbitrary Python.'
        value['repair_task']='Revise current_best using DEV feedback; return the full step function.'
        value['frontend_previous_feedback']=[{'status':x['status'],'reason':x.get('reason')} for x in self.journal]
        value['python_frontend']={'signature':'def step(g, a, s):','allowed':'return, local assignment, final if/else with returns; registered intrinsic calls; pair tuple; lambda; bind(value, lambda name:body)',
            'literal_helpers':LITERAL_TYPES,'aliases':ALIASES,'max_source_bytes':MAX_SOURCE_BYTES,
            'forbidden':'Imports, attributes, subscripts, loops, general operators, host calls and arbitrary Python execution.',
            'semantics':'Parsed and lowered to the existing DSL. Intrinsics use that interpreter, including lazy if/Options. No source is executed.'}
        if self.frontend_contract is not None:value['python_frontend']['extension']=self.frontend_contract
        if value.get('current_best'):
            incumbent=value['current_best']['proposal']
            value['current_best']['proposal']={'uses_memory':incumbent['uses_memory'],'source':source_for(incumbent['ast'])}
        payload=canonical(value)
        if len(payload.encode())>MAX_REQUEST_BYTES:raise ValueError('SOURCE_REQUEST_LIMIT')
        raw=self.callback(payload);entry={'raw_response':raw};self.journal.append(entry)
        try:
            if not isinstance(raw,str) or len(raw.encode())>65536:raise ValueError('SOURCE_RESPONSE_SIZE')
            def pairs(items):
                result={}
                for k,v in items:
                    if k in result:raise ValueError('SOURCE_DUPLICATE_KEY')
                    result[k]=v
                return result
            data=json.loads(raw,object_pairs_hook=pairs)
            if not isinstance(data,dict) or set(data)!={'uses_memory','source'} or type(data['uses_memory']) is not bool:raise ValueError('SOURCE_ENVELOPE')
            proposal=self.lower_fn(data['source'],data['uses_memory'])
            entry.update(status='LOWERED_AND_TYPED',proposal=proposal)
            return canonical(proposal)
        except (ValueError,TypeError,RecursionError) as exc:
            entry.update(status='SOURCE_REJECTED',reason=str(exc))
            # run_dev records this as PARSE_TYPE_REJECTED and retains the incumbent.
            return canonical({'python_frontend_rejection':str(exc)})


if __name__=='__main__':
    from pathlib import Path
    from audit_proposal_identity import controls
    from dsl_incumbent_dev import run_dev
    out=Path('output/arc3-python-frontend-fixture-20261027');out.mkdir(exist_ok=False)
    report={'source':'MANUAL_FIXTURE_NOT_MODEL_SYNTHESIS','generation_calls':0,'python_source_executed':False,'controls':{}}
    for name,episodes in controls().items():
        answers=iter([canonical({'uses_memory':False,'source':'def step(g,a,s): return g,s'}),
                      canonical({'uses_memory':False,'source':source_for(d.controls()[name])})])
        requests=[]
        def fixture(request):requests.append(json.loads(request));return next(answers)
        adapter=PythonSyntaxProposer(fixture)
        result=run_dev(adapter,episodes,2)
        report['controls'][name]={'result':result,'requests':requests,'source_journal':adapter.journal}
    (out/'report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({name:r['result']['stage'] for name,r in report['controls'].items()}))
