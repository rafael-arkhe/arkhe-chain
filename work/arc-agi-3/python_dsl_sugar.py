"""Explicit bounded source sugar; output remains subject to original DSL checks."""
import ast,copy,json
from pathlib import Path
import finite_grid_dsl_types as d
import finite_grid_dsl_runtime as rt
from python_dsl_frontend import lower_source,MAX_SOURCE_BYTES,parameters
from dsl_proposal_loop import canonical,training_check


def call(name,*args):return ast.Call(func=ast.Name(id=name,ctx=ast.Load()),args=list(args),keywords=[])
def name(value):return ast.Name(id=value,ctx=ast.Load())
def numeric(node,helper):
    if isinstance(node,ast.Constant) or (isinstance(node,ast.UnaryOp) and isinstance(node.op,ast.USub)):
        return call(helper,node)
    return node


class Sugar(ast.NodeTransformer):
    def coordinate(self,x,y):return call('coord',numeric(self.visit(x),'offset'),numeric(self.visit(y),'offset'))

    def visit_Subscript(self,node):
        if isinstance(node.value,ast.Subscript):
            return call('grid_get',self.visit(node.value.value),self.coordinate(node.slice,node.value.slice))
        raise ValueError('SUGAR_SINGLE_SUBSCRIPT_UNSUPPORTED')

    def visit_Attribute(self,node):
        aliases={'pos':'obj_pos','color':'obj_color','kind':'action_kind','dx':'action_dx','dy':'action_dy'}
        if node.attr in aliases:return call(aliases[node.attr],self.visit(node.value))
        if node.attr in ('x','y'):
            # Action coordinate access is optional; caller must unwrap with option_default.
            action=isinstance(node.value,ast.Name) and node.value.id=='a'
            op=('action_click_'+node.attr) if action else ('coord_'+node.attr)
            return call(op,self.visit(node.value))
        raise ValueError('SUGAR_ATTRIBUTE_UNSUPPORTED')

    def visit_Call(self,node):
        if isinstance(node.func,ast.Attribute):
            if node.keywords:raise ValueError('SUGAR_METHOD_KEYWORDS_UNSUPPORTED')
            aliases={'objects':'grid_objects','background':'grid_background','grid_get':'grid_get','contains':'obj_contains'}
            if node.func.attr not in aliases:raise ValueError('SUGAR_METHOD_UNSUPPORTED')
            node=call(aliases[node.func.attr],node.func.value,*node.args)
        elif isinstance(node.func,ast.Name) and node.func.id=='objects':
            node=copy.deepcopy(node);node.func.id='grid_objects'
        return self.generic_visit(node)

    def visit_Assign(self,node):
        if len(node.targets)==1 and isinstance(node.targets[0],ast.Subscript):
            target=node.targets[0]
            if not isinstance(target.value,ast.Subscript) or not isinstance(target.value.value,ast.Name):raise ValueError('SUGAR_STORE_TARGET')
            grid=target.value.value.id
            value=call('grid_set',name(grid),self.coordinate(target.slice,target.value.slice),numeric(self.visit(node.value),'color'))
            return ast.Assign(targets=[ast.Name(id=grid,ctx=ast.Store())],value=value)
        return self.generic_visit(node)

    def accumulator_body(self,statements,acc):
        if not statements:return name(acc)
        first,*tail=statements
        if isinstance(first,ast.Assign) and len(first.targets)==1 and isinstance(first.targets[0],ast.Name) and first.targets[0].id==acc:
            value=first.value
        elif isinstance(first,ast.If):
            value=ast.IfExp(test=first.test,body=self.accumulator_body(first.body,acc),orelse=self.accumulator_body(first.orelse,acc))
        elif isinstance(first,ast.Pass):return self.accumulator_body(tail,acc)
        else:raise ValueError('SUGAR_FOR_BODY_UNSUPPORTED')
        if not tail:return value
        return call('bind',value,ast.Lambda(args=ast.arguments(posonlyargs=[],args=[ast.arg(arg=acc)],kwonlyargs=[],kw_defaults=[],defaults=[]),body=self.accumulator_body(tail,acc)))

    def visit_For(self,node):
        if not isinstance(node.target,ast.Name) or node.orelse:raise ValueError('SUGAR_FOR_TARGET_OR_ELSE')
        if any(isinstance(x,(ast.For,ast.While,ast.Return,ast.Break,ast.Continue)) for stmt in node.body for x in ast.walk(stmt)):raise ValueError('SUGAR_FOR_CONTROL_FLOW')
        iterator=self.visit(node.iter)
        if not isinstance(iterator,ast.Call) or not isinstance(iterator.func,ast.Name) or iterator.func.id!='grid_objects' or iterator.keywords or len(iterator.args)!=1:raise ValueError('SUGAR_FOR_ITERATOR')
        body=[self.visit(stmt) for stmt in node.body]
        writes={x.targets[0].id for stmt in body for x in ast.walk(stmt) if isinstance(x,ast.Assign) and len(x.targets)==1 and isinstance(x.targets[0],ast.Name)}
        if len(writes)!=1:raise ValueError('SUGAR_FOR_SINGLE_ACCUMULATOR')
        acc=next(iter(writes));item=node.target.id
        if item==acc or item in ('g','a','s'):raise ValueError('SUGAR_FOR_BINDER')
        args=ast.arguments(posonlyargs=[],args=[ast.arg(arg=acc),ast.arg(arg=item)],kwonlyargs=[],kw_defaults=[],defaults=[])
        value=call('fold',iterator,name(acc),ast.Lambda(args=args,body=self.accumulator_body(body,acc)))
        return ast.Assign(targets=[ast.Name(id=acc,ctx=ast.Store())],value=value)


def lower_sugar(source,uses_memory=False):
    if not isinstance(source,str) or len(source.encode())>MAX_SOURCE_BYTES:raise ValueError('SOURCE_SIZE_OR_TYPE')
    try:tree=ast.parse(source)
    except (ValueError,SyntaxError,RecursionError) as exc:raise ValueError('SOURCE_SYNTAX') from exc
    if sum(1 for _ in ast.walk(tree))>512:raise ValueError('SOURCE_SYNTAX_NODE_LIMIT')
    # Loop items are lambda-local in this frontend, never Python's leaked loop variable.
    for node in ast.walk(tree):
        if isinstance(node,ast.For) and isinstance(node.target,ast.Name):
            item=node.target.id
            outside=copy.deepcopy(tree)
            class RemoveLoops(ast.NodeTransformer):
                def visit_For(self,n):return ast.Pass()
            outside=RemoveLoops().visit(outside)
            if any(isinstance(x,ast.Name) and x.id==item for x in ast.walk(outside)):raise ValueError('SUGAR_LOOP_ITEM_ESCAPES')
    try:rewritten=ast.fix_missing_locations(Sugar().visit(tree));text=ast.unparse(rewritten)
    except RecursionError as exc:raise ValueError('SOURCE_DEPTH') from exc
    return lower_source(text,uses_memory)


def main():
    from audit_proposal_identity import controls
    out=Path('output/arc3-python-sugar-archive-20261027');out.mkdir(exist_ok=False)
    rows=[]
    for path in sorted(Path('output/arc3-python-frontend-smoke-20261027').glob('*/response-*.json')):
        data=json.loads(json.loads(path.read_text())['response']);row={'source':str(path)}
        parsed=ast.parse(data['source'])
        row['for_nodes']=sum(isinstance(n,ast.For) for n in ast.walk(parsed));row['while_nodes']=sum(isinstance(n,ast.While) for n in ast.walk(parsed))
        try:
            proposal=lower_sugar(data['source'],data['uses_memory'])
            row.update(status='LOWERED_AND_TYPED',proposal=proposal,replay=training_check(proposal,controls()[path.parent.name]))
        except (ValueError,TypeError,RecursionError) as exc:row.update(status='SOURCE_REJECTED',reason=str(exc))
        rows.append(row)
    report={'phase':'OFFLINE_FROZEN_SOURCE_REPLAY','new_generation_calls':0,'rows':rows}
    (out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))


if __name__=='__main__':main()
