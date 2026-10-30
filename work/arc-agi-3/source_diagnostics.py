"""Multi-location syntax inventory, not an exhaustive compiler/type diagnostic."""
import ast
from collections import Counter


def diagnose(source,sugar=True):
    try:tree=ast.parse(source)
    except (SyntaxError,ValueError,RecursionError) as exc:return {'syntax_parseable':False,'parse_error':type(exc).__name__,
        'parse_error_location':{'line':getattr(exc,'lineno',None),'offset':getattr(exc,'offset',None),'message':getattr(exc,'msg',str(exc))},
        'known_blockers':[],'observed_sugar':[],'coverage':'Python parse failed; no downstream inventory is available.'}
    parents={child:parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
    blockers=[];forms=[]
    def add(target,node,rule):target.append({'line':getattr(node,'lineno',None),'column':getattr(node,'col_offset',None),'node':type(node).__name__,'rule':rule})
    for node in ast.walk(tree):
        parent=parents.get(node)
        if isinstance(node,ast.Subscript):
            if isinstance(parent,ast.Subscript) and parent.value is node:continue
            two=isinstance(node.value,ast.Subscript)
            if sugar and two:add(forms,node,'GRID_2D_CANDIDATE')
            else:add(blockers,node,'SINGLE_SUBSCRIPT' if two is False else 'GRID_SUBSCRIPT_V1')
        elif isinstance(node,ast.Attribute):
            method=isinstance(parent,ast.Call) and parent.func is node
            allowed=node.attr in ({'objects','background','grid_get','contains'} if method else {'pos','color','kind','dx','dy','x','y'})
            if sugar and allowed:add(forms,node,'KNOWN_METHOD' if method else 'KNOWN_ATTRIBUTE')
            else:add(blockers,node,'METHOD_OR_ATTRIBUTE_UNSUPPORTED')
            if sugar and method and allowed and parent.keywords:add(blockers,node,'METHOD_KEYWORDS_UNSUPPORTED')
        elif isinstance(node,ast.For):
            add(forms if sugar else blockers,node,'FOR_CANDIDATE' if sugar else 'FOR_V1_UNSUPPORTED')
        elif isinstance(node,(ast.While,ast.Break,ast.Continue,ast.Import,ast.ImportFrom,ast.AugAssign,ast.Compare,ast.BinOp)):
            add(blockers,node,'CONSTRUCT_UNSUPPORTED')
        elif isinstance(node,ast.Pass):
            ancestor=parent;inside_for=False
            while ancestor is not None:
                if isinstance(ancestor,ast.For):inside_for=True;break
                ancestor=parents.get(ancestor)
            if not (sugar and inside_for):add(blockers,node,'PASS_OUTSIDE_FOLD')
        elif isinstance(node,ast.If):
            ancestor=parent;inside_for=False
            while ancestor is not None:
                if isinstance(ancestor,ast.For):inside_for=True;break
                ancestor=parents.get(ancestor)
            if not (sugar and inside_for):
                if not node.orelse:add(blockers,node,'IF_WITHOUT_ELSE')
                if parent is not None:
                    for _,value in ast.iter_fields(parent):
                        if isinstance(value,list) and node in value and value[-1] is not node:add(blockers,node,'NONFINAL_IF')
    key=lambda x:(x['line'] or 0,x['column'] or 0,x['rule'])
    return {'syntax_parseable':True,'known_blockers':sorted(blockers,key=key),'observed_sugar':sorted(forms,key=key),
        'blocker_rule_counts':dict(Counter(x['rule'] for x in blockers)),
        'coverage':'Partial syntactic inventory. Forms are candidates, not proof of successful lowering; type, scope, literal and node/fuel constraints are not exhaustively checked.'}
