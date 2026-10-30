"""New four-call condition with supported sugar disclosed in the actual prompt."""
from python_dsl_sugar import lower_sugar
from source_diagnostics import diagnose
from run_python_frontend_smoke import main

CONTRACT={
 'version':'sugar-v2','backend':'Unchanged finite DSL,24nodes,10000fuel. No arbitrary Python execution.',
 'grid':'g[y][x] reads grid_get(g,coord(x,y)); g[y][x]=color(c) writes a new grid binding. Indices must lower to valid Offset values; coord clamps. Single indexing of lists/tuples is NOT supported.',
 'attributes':'obj.pos and obj.color; Coord.x/.y. a.kind/.dx/.dy and a.x/.y use action accessors; coordinates and offsets from actions are Option and need option_default.',
 'methods':'objects(g) or g.objects(), g.background(), g.grid_get(coord), obj.contains(coord). No unknown attributes or method keywords.',
 'for':'for obj in objects(g): ... may update exactly one preexisting accumulator variable. It lowers to fold over a snapshot with lambda-local obj. Body supports accumulator assignments and if/else updates. No nested loops, break, continue, return, for-else or escaping obj.',
 'control':'Outside a fold only a final if/else whose branches return is supported. No while, arbitrary operators, comparisons or pass. Use eq_kind, eq_color etc and typed literal helpers kind/color/offset.',
 'limits':'These forms do not enlarge literal domains, type relations, AST budget or runtime semantics. Return Pair[Grid,State].'}


if __name__=='__main__':main('arc3-python-sugar-smoke-20261027',lower_sugar,CONTRACT,diagnose)
