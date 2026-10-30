"""JSON Schema for the existing op/args DSL. Shape/arity/literals, not typing."""
import json
import finite_grid_dsl_types as d
import jsonschema

NAMES='^[a-z][a-z0-9_]{0,15}$'


def schema():
    ref={'$ref':'#/$defs/Node'}
    def obj(properties):return {'type':'object','properties':properties,'required':list(properties),'additionalProperties':False}
    def args(n):return {'type':'array','items':ref,'minItems':n,'maxItems':n}
    nodes=[]
    for op,(types,result) in sorted(d.REGISTRY.items()):nodes.append(obj({'op':{'const':op},'args':args(len(types))}))
    for op,n in [('pair',2),('if',3),('fold',3),('list_head',1),('list_len',1),('is_some',1),('option_default',2),('match_option',3)]:
        nodes.append(obj({'op':{'const':op},'args':args(n)}))
    nodes.append(obj({'op':{'const':'var'},'args':args(0),'name':{'type':'string','pattern':NAMES}}))
    nodes.append(obj({'op':{'const':'let'},'args':args(2),'name':{'type':'string','pattern':NAMES}}))
    nodes.append(obj({'op':{'const':'lambda'},'args':args(1),'params':{'type':'array','items':{'type':'string','pattern':NAMES},'minItems':1,'maxItems':2}}))
    for t,values in sorted(d.LITERALS.items()):
        vals=sorted(values,key=lambda v:json.dumps(v))
        if t==d.C:vs={'type':'array','items':{'type':'integer'},'minItems':2,'maxItems':2,'enum':[list(v) for v in vals]}
        elif t==d.B:vs={'type':'boolean','enum':vals}
        elif t in (d.K,d.AK):vs={'type':'string','enum':vals}
        else:vs={'type':'integer','enum':vals}
        nodes.append(obj({'op':{'const':'literal'},'args':args(0),'type':{'const':t},'value':vs}))
    result=obj({'uses_memory':{'type':'boolean'},'ast':ref})
    result['$schema']='https://json-schema.org/draft/2020-12/schema'
    result['$defs']={'Node':{'anyOf':nodes}}
    return result


def inspect_response(raw):
    # Validate disjoint op/type branches independently to avoid repeatedly
    # traversing child ASTs through every recursive anyOf alternative.
    try:value=json.loads(raw)
    except (ValueError,RecursionError):return {'valid':False,'reason':'INVALID_JSON'}
    doc=schema();envelope={k:v for k,v in doc.items() if k not in ('$defs',)}
    envelope['properties']={**doc['properties'],'ast':{}}
    errors=list(jsonschema.Draft202012Validator(envelope).iter_errors(value))
    if errors:return {'valid':False,'reason':'SCHEMA_VIOLATION','error_count':len(errors)}
    branches={}
    for branch in doc['$defs']['Node']['anyOf']:
        fields=branch['properties'];op=fields['op']['const']
        key=(op,fields['type']['const'] if op=='literal' else None)
        local={**branch,'properties':{**fields,'args':{k:v for k,v in fields['args'].items() if k!='items'}}}
        branches[key]=jsonschema.Draft202012Validator(local)
    stack=[value['ast']];examined=0
    while stack:
        node=stack.pop();examined+=1
        if examined>4096:return {'valid':False,'reason':'VALIDATOR_LIMIT'}
        if not isinstance(node,dict):return {'valid':False,'reason':'SCHEMA_VIOLATION'}
        op=node.get('op');key=(op,node.get('type') if op=='literal' else None)
        try:validator=branches.get(key)
        except TypeError:return {'valid':False,'reason':'SCHEMA_VIOLATION'}
        if validator is None:return {'valid':False,'reason':'SCHEMA_VIOLATION'}
        errors=list(validator.iter_errors(node))
        if errors:return {'valid':False,'reason':'SCHEMA_VIOLATION','error_count':len(errors)}
        stack.extend(node['args'])
    return {'valid':True,'reason':None,'nodes_examined':examined}
