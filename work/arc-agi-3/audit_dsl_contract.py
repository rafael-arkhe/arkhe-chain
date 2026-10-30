"""Executable consistency counterexamples; not a DSL interpreter."""
import json
from pathlib import Path


def node_count(ast):
    return 1+sum(node_count(c) for c in ast.get('args',[]))


def n(op,*children):return {'op':op,'args':list(children)}


def audit():
    action=n('var_action');grid=n('var_grid')
    click=n('if',n('eq_kind',n('action_kind',action),n('literal_CLICK')),
            n('grid_set',grid,n('coord',n('unwrap',n('action_click_x',action)),
                                      n('unwrap',n('action_click_y',action))),n('literal_Color5')),grid)
    count=node_count(click)
    assert count==16 and count>12
    color_count=sum(v==0 for row in [[0]*64 for _ in range(64)] for v in row)
    assert color_count==4096 and color_count>64
    # A checkerboard uses two colors; one is background, each cell of the
    # other color is an isolated 4-connected component.
    component_count=sum((x+y)%2==1 for y in range(64) for x in range(64))
    assert component_count==2048 and component_count>64
    return {'status':'SPECIFICATION_COUNTEREXAMPLES_CONFIRMED',
            'click_ast':click,'ast_nodes_counting_operators_variables_literals':count,'declared_max_nodes':12,
            'grid_count_all_zero_grid':color_count,'list_len_nonbackground_checkerboard_objects':component_count,
            'declared_Int_domain':[-64,64],
            'scope':'tests literal stated DSL contract; no search or candidate execution',
            'new_environment_actions':0}

if __name__=='__main__':
    out=Path('output/arc3-dsl-contract-audit-20261027');out.mkdir(parents=True,exist_ok=True)
    r=audit();(out/'report.json').write_text(json.dumps(r,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in r.items() if k!='click_ast'},indent=2))
