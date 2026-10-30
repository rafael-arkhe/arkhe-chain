"""8x8 synthetic pilot. Public grids/actions; private dynamics and terminal goal."""
import copy,itertools,random
from collections import deque

SIZE=8
ACTIONS=tuple(f'ACTION{i}' for i in range(1,6))
DELTAS=((1,0),(-1,0),(0,1),(0,-1),(0,0))
RULES=tuple((p,goal) for p in itertools.permutations(DELTAS) for goal in (3,4))


def reachable(base,start):
    seen={start};queue=deque([start])
    while queue:
        x,y=queue.popleft()
        for dx,dy in DELTAS[:4]:
            p=(x+dx,y+dy)
            if 0<=p[0]<SIZE and 0<=p[1]<SIZE and base[p[1]][p[0]]!=2 and p not in seen:
                seen.add(p);queue.append(p)
    return seen


def layout(seed):
    rng=random.Random(seed)
    for _ in range(200):
        cells=[(x,y) for y in range(SIZE) for x in range(SIZE)];rng.shuffle(cells)
        start,one,two=cells[:3];walls=cells[3:11]
        base=[[0]*SIZE for _ in range(SIZE)]
        for x,y in walls:base[y][x]=2
        base[one[1]][one[0]]=3;base[two[1]][two[0]]=4
        if one in reachable(base,start) and two in reachable(base,start):return base,start
    raise RuntimeError('layout generation budget exhausted')


def advance(base,pos,delta):
    x,y=pos;dx,dy=delta;dest=(x+dx,y+dy)
    return dest if 0<=dest[0]<SIZE and 0<=dest[1]<SIZE and base[dest[1]][dest[0]]!=2 else pos


def render(base,pos):
    grid=copy.deepcopy(base);x,y=pos
    grid[y][x]=5 if base[y][x] in (3,4) else 1
    return grid


class Episode:
    def __init__(self,rule_id,layout_seed,horizon=50):
        if type(rule_id) is not int or not 0<=rule_id<len(RULES):raise ValueError('rule id')
        if type(horizon) is not int or horizon<1:raise ValueError('horizon')
        self._base,self._pos=layout(layout_seed);self._rule_id=rule_id
        self._deltas,self._goal=RULES[rule_id];self._steps=0;self._horizon=horizon

    def observe(self):
        done=self._steps==self._horizon
        return {'grid':render(self._base,self._pos),'available_actions':list(ACTIONS),
            'step':self._steps,'done':done,
            'reward':int(self._base[self._pos[1]][self._pos[0]]==self._goal) if done else None}

    def step(self,action):
        if self._steps==self._horizon:raise ValueError('episode finished')
        if action not in ACTIONS:raise ValueError('unavailable action')
        self._pos=advance(self._base,self._pos,self._deltas[ACTIONS.index(action)])
        self._steps+=1;return self.observe()


def oracle_plan(episode,max_expansions=64):
    """Privileged evaluator only. Certifies shortest path for this positional world."""
    queue=deque([(episode._pos,[])]);seen={episode._pos};expanded=0
    while queue:
        pos,path=queue.popleft();expanded+=1
        if expanded>max_expansions:return {'status':'SEARCH_INCOMPLETE','expanded':expanded}
        if episode._base[pos[1]][pos[0]]==episode._goal:
            return {'status':'FOUND','actions':path,'expanded':expanded}
        for action,delta in zip(ACTIONS,episode._deltas):
            dest=advance(episode._base,pos,delta)
            if dest not in seen:seen.add(dest);queue.append((dest,path+[action]))
    return {'status':'UNREACHABLE','expanded':expanded}


class FiniteEffectLearner:
    """Baseline supplied five displacement primitives; learns their action assignment."""
    def __init__(self,initial_observation):
        grid=initial_observation['grid'];self.base=copy.deepcopy(grid)
        for y,row in enumerate(grid):
            for x,value in enumerate(row):
                if value==1:self.base[y][x]=0
        self.possible={action:set(DELTAS) for action in initial_observation['available_actions']}

    def position(self,grid):
        positions=[(x,y) for y,row in enumerate(grid) for x,c in enumerate(row) if c in (1,5)]
        if len(positions)!=1:raise ValueError('one actor required')
        return positions[0]

    def update(self,before,action,after):
        pos=self.position(before)
        self.possible[action]={delta for delta in self.possible[action] if render(self.base,advance(self.base,pos,delta))==after}

    def predict(self,before,action):
        outputs={tuple(tuple(row) for row in render(self.base,advance(self.base,self.position(before),delta))) for delta in self.possible[action]}
        if len(outputs)!=1:return None
        return [list(row) for row in next(iter(outputs))]
