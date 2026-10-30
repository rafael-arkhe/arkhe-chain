"""Generic syntax examples, distinct from task solution ASTs."""
import json
import finite_grid_dsl_types as d


def examples():
    n=d.node;g=d.var('g');s=d.var('s');v=d.var('v');b=d.var('b0')
    result={
      'lexical_binding_identity':n('let',g,n('pair',b,s),name='b0'),
      'option_elimination_identity':n('match_option',n('state_get',s,d.lit(d.K,'k0')),n('pair',g,s),
                                     n('lambda',n('pair',g,s),params=['v'])),
      'constant_corner_update':n('pair',n('grid_set',g,d.lit(d.C,(63,63)),d.lit(d.P,0)),s)}
    for ast in result.values():d.check_program(ast,False)
    return [{'name':name,'uses_memory':False,'ast':ast} for name,ast in result.items()]


def augment(request):
    value=json.loads(request);value['additional_syntax_examples']=examples()
    value['example_scope']='These examples teach only AST syntax; do not copy them as task solutions. Infer behavior from training episodes.'
    return json.dumps(value,sort_keys=True,separators=(',',':'))
