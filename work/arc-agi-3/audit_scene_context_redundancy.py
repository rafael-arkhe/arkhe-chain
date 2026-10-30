"""Audit exact-position whole-scene descriptors: context is derived, not extra input."""
import json
from pathlib import Path
import object_transition_probe as b


def descriptors(grid,action):
    s=b.scene(grid);objects=sorted(s['objects'],key=lambda o:(o['signature'],o['y'],o['x']))
    base=[action,s['width'],s['height'],s['background'],[[o['signature'],o['y'],o['x']] for o in objects]]
    binary=[];palette=[]
    for o in objects:
        cells=set(o['shape']);ring=set()
        for x,y in cells:
            for dx in (-1,0,1):
                for dy in (-1,0,1):
                    if (x+dx,y+dy) not in cells:ring.add((x+dx,y+dy))
        bits=[];colors=[]
        for dx,dy in sorted(ring,key=lambda p:(p[1],p[0])):
            x=o['x']+dx;y=o['y']+dy
            if not(0<=x<s['width'] and 0<=y<s['height']):bits.append('EDGE');colors.append('EDGE')
            else:bits.append(int(grid[y][x]!=s['background']));colors.append(grid[y][x])
        binary.append(bits);palette.append(colors)
    return [b.digest(base),b.digest([base,binary]),b.digest([base,palette])]


def board(shift=0,wall=True):
    g=[[0]*15 for _ in range(10)]
    g[3][2+shift]=5;g[6][7+shift]=5
    if wall:g[6][8+shift]=9
    return g


def audit():
    frames=[board(),board(),board(1),board(0,False)]
    keys=[descriptors(g,{'id':4}) for g in frames]
    partitions=[]
    for variant in range(3):
        partitions.append([[keys[i][variant]==keys[j][variant] for j in range(len(keys))] for i in range(len(keys))])
    assert partitions[0]==partitions[1]==partitions[2]
    assert keys[0][0]!=keys[2][0] and keys[0][0]!=keys[3][0]
    return {'status':'EXACT_SCENE_PARTITIONS_IDENTICAL','controls':['duplicate scene','translated scene','obstacle removed'],
            'partitions':partitions,'conclusion':'additional context is a deterministic function of the complete before-scene descriptor; exact-key equality classes do not change',
            'scope':'same dimensions, region extraction, palette/background rule, action and hash implementation; no hash collisions assumed',
            'real_trace_ablation_executed':False,'new_environment_actions':0}

if __name__=='__main__':
    r=audit();out=Path('output/arc3-context-redundancy-audit-20261027');out.mkdir(parents=True,exist_ok=True)
    (out/'report.json').write_text(json.dumps(r,indent=2),encoding='utf-8');print(r['status'])
