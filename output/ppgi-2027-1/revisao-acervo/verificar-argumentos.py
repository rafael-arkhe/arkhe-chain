"""Checks independentes da revisão; não reproduzem os seis ensaios do FDF-AGI."""
from fractions import Fraction as F
from pathlib import Path
import json
pi=[F(3,5),F(3,10),F(1,10)]
x=[F(1,2)]*3
v=[F(1,10),-F(1,5),F(0)]
y=[a+b for a,b in zip(x,v)]
score=lambda z:sum(p*a for p,a in zip(pi,z))
assert score(x)==score(y) and x!=y
assert all(F(0)<=a<=F(1) for a in y)
# A single scalar projection has q-1 independent kernel basis vectors when
# pi_q is nonzero. The first q-1 coordinates directly establish independence.
for q in range(1,9):
    weights=[F(i+1,sum(range(1,q+1))) for i in range(q)]
    basis=[]
    for i in range(q-1):
        row=[F(0)]*q;row[i]=F(1);row[-1]=-weights[i]/weights[-1]
        assert sum(p*z for p,z in zip(weights,row))==0
        basis.append(row)
    assert len(basis)==q-1
# Cardinality monotonicity is necessary, but not sufficient for inclusion.
A={'a','b'};B={'c','d'}
assert len(B)>=len(A) and not A.issubset(B)
# An average can improve while one group loses.
before=[F(1,2),F(1,2)];after=[F(3,5),F(1,5)]
assert sum(p*z for p,z in zip([F(9,10),F(1,10)],after))>F(1,2)
# With positive fixed weights, simultaneous deterioration of ALL groups cannot
# increase the score if the score is this same weighted average.
assert all(a<=b for a,b in zip([F(2,5)]*3,x))
assert score([F(2,5)]*3)<=score(x)
report={'kind':'independent-editorial-check','date':'2026-10-28',
 'equal_score_example':{'weights':list(map(str,pi)),'x':list(map(str,x)),'y':list(map(str,y)),'score_x':str(score(x)),'score_y':str(score(y))},
 'kernel_dimensions_checked':{str(q):q-1 for q in range(1,9)},
 'cardinality_does_not_imply_extensivity':True,
 'two_complementary_groups_ratio_at_0_001':str(F(999,1000)/F(1,1000)),
 'ratio_600_possible_with_rich_weight_0_6_and_poor_0_001':str(F(3,5)/F(1,1000)),
 'original_six_experiments_reproduced':False}
Path(__file__).with_name('verificacao-argumentos.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
