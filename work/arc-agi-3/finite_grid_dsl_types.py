"""Static finite-grid DSL contract, type checker only. No evaluation/search."""
MAX_NODES=24
G='Grid';S='State';O='Object';A='Action';C='Coord';D='Offset';K='Key';B='Bool';N='Count';P='Color';AK='ActionKind'
REGISTRY={
'add':((D,D),D),
'grid_get':((G,C),P),'grid_set':((G,C,P),G),'grid_background':((G,),P),'grid_count':((G,P),N),'grid_objects':((G,),('List',O,4096)),
'obj_color':((O,),P),'obj_pos':((O,),C),'obj_contains':((O,C),B),'translate':((G,O,D,D),G),'is_blocked':((G,O,D,D),B),
'coord':((D,D),C),'coord_x':((C,),D),'coord_y':((C,),D),'coord_neighbors8':((C,),('List',C,8)),
'action_kind':((A,),AK),'action_dx':((A,),('Option',D)),'action_dy':((A,),('Option',D)),
'action_click_x':((A,),('Option',D)),'action_click_y':((A,),('Option',D)),
'state_get':((S,K),('Option',D)),'state_set':((S,K,D),S),
'eq_offset':((D,D),B),'eq_color':((P,P),B),'eq_kind':((AK,AK),B),'lt_offset':((D,D),B),
'and':((B,B),B),'or':((B,B),B),'not':((B,),B)}
LITERALS={D:{-1,0,1,2,5,8},N:{0,1,2,4,8,64},P:{0,1,2,3,4,5,8,9,15},K:{'k0','k1','k2','k3'},AK:{'MOVE','CLICK','NOOP'},B:{True,False},C:{(0,0),(0,63),(63,0),(63,63),(32,32)}}


def count(ast):return 1+sum(count(x) for x in ast.get('args',[]))


def infer(ast,env=None,uses_memory=True):
    env={'g':G,'a':A,'s':S} if env is None else env
    if not isinstance(ast,dict) or not isinstance(ast.get('op'),str):raise ValueError('invalid AST node')
    op=ast['op'];args=ast.get('args',[])
    if not isinstance(args,list):raise ValueError('args must be a list')
    def require(n):
        if len(args)!=n:raise ValueError('wrong arity: '+op)
    def sub(x):return infer(x,env,uses_memory)
    def fn(node,types):
        if node.get('op')!='lambda' or len(node.get('args',[]))!=1:raise ValueError('explicit lambda required')
        names=node.get('params',[])
        if len(names)!=len(types) or len(set(names))!=len(names) or any(not isinstance(x,str) for x in names):raise ValueError('invalid binders')
        return infer(node['args'][0],{**env,**dict(zip(names,types))},uses_memory)
    if op=='var':
        require(0)
        if ast.get('name') not in env:raise ValueError('unbound variable')
        return env[ast['name']]
    if op=='literal':
        require(0);t=ast.get('type');value=ast.get('value')
        if t not in LITERALS:raise ValueError('unknown literal type')
        if t==C:
            if not isinstance(value,(tuple,list)) or len(value)!=2 or any(type(x) is not int for x in value):raise ValueError('invalid Coord')
            value=tuple(value)
        if t in (D,N,P) and type(value) is not int:raise ValueError('numeric literal must be int, not bool')
        if t==B and type(value) is not bool:raise ValueError('Bool required')
        if value not in LITERALS[t]:raise ValueError('literal outside finite language')
        return t
    if op=='pair':require(2);return ('Pair',sub(args[0]),sub(args[1]))
    if op=='let':
        require(2);name=ast.get('name')
        if not isinstance(name,str):raise ValueError('binder name required')
        return infer(args[1],{**env,name:sub(args[0])},uses_memory)
    if op=='if':
        require(3)
        if sub(args[0])!=B:raise ValueError('Bool condition required')
        t=sub(args[1])
        if t!=sub(args[2]):raise ValueError('branch type mismatch')
        return t
    if op in ('list_head','list_len','fold'):
        require(3 if op=='fold' else 1);t=sub(args[0])
        if not isinstance(t,tuple) or t[0]!='List' or not 0<=t[2]<=4096:raise ValueError('bounded List required')
        if op=='list_head':return ('Option',t[1])
        if op=='list_len':return N
        initial=sub(args[1]);body=fn(args[2],(initial,t[1]))
        if body!=initial:raise ValueError('fold accumulator type changed')
        return initial
    if op in ('is_some','option_default','match_option'):
        require(1 if op=='is_some' else 2 if op=='option_default' else 3);t=sub(args[0])
        if not isinstance(t,tuple) or t[0]!='Option':raise ValueError('Option required')
        if op=='is_some':return B
        fallback=sub(args[1])
        if op=='option_default':
            if fallback!=t[1]:raise ValueError('default type mismatch')
            return fallback
        if fn(args[2],(t[1],))!=fallback:raise ValueError('match branches differ')
        return fallback
    if op not in REGISTRY:raise ValueError('unknown primitive: '+op)
    expected,result=REGISTRY[op];require(len(expected))
    if op=='state_set' and not uses_memory:raise ValueError('state writes forbidden')
    if tuple(map(sub,args))!=expected:raise ValueError('type mismatch: '+op)
    return result


def check_program(ast,uses_memory=False):
    size=count(ast)
    if size>MAX_NODES:raise ValueError('AST node budget exceeded')
    t=infer(ast,uses_memory=uses_memory)
    if t!=('Pair',G,S):raise ValueError('step must return Pair[Grid,State]')
    return {'type':t,'nodes':size,'uses_memory':uses_memory}


def node(op,*args,**fields):return {'op':op,'args':list(args),**fields}
def var(name):return node('var',name=name)
def lit(t,v):return node('literal',type=t,value=v)


def controls():
    g=var('g');a=var('a');s=var('s');o=var('o')
    click=node('pair',node('if',node('eq_kind',node('action_kind',a),lit(AK,'CLICK')),
              node('grid_set',g,node('coord',node('option_default',node('action_click_x',a),lit(D,0)),
                                            node('option_default',node('action_click_y',a),lit(D,0))),lit(P,5)),g),s)
    move=node('match_option',node('list_head',node('grid_objects',g)),node('pair',g,s),
              node('lambda',node('pair',node('if',node('is_blocked',g,o,lit(D,1),lit(D,0)),g,
                                                  node('translate',g,o,lit(D,1),lit(D,0))),s),params=['o']))
    return {'click':click,'move':move}
