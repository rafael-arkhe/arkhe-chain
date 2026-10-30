"""Restricted AST interpreter. No eval/exec, synthesis, subprocess or OS sandbox."""
from collections import Counter
import json
import finite_grid_dsl_types as t

class StepLimitExceeded(Exception):pass

class Runtime:
    def __init__(self,limit=10000):
        if type(limit) is not int or limit<1:raise ValueError('positive fuel required')
        self.limit=limit;self.steps=0;self.backgrounds={}
    def tick(self,n=1):
        self.steps+=n
        if self.steps>self.limit:raise StepLimitExceeded('STEP_LIMIT_EXCEEDED')
    def background(self,g):
        key=id(g)
        if key not in self.backgrounds:
            counts=Counter()
            for row in g:
                for color in row:self.tick();counts[color]+=1
            self.backgrounds[key]=(g,min(counts,key=lambda c:(-counts[c],c)))
        return self.backgrounds[key][1]
    def objects(self,g):
        bg=self.background(g);visited=set();objects=[]
        for y in range(64):
            for x in range(64):
                self.tick()
                if g[y][x]==bg or (x,y) in visited:continue
                color=g[y][x];cells=[];todo=[(x,y)];visited.add((x,y))
                while todo:
                    px,py=todo.pop();self.tick();cells.append((px,py))
                    for nx,ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
                        self.tick()
                        if 0<=nx<64 and 0<=ny<64 and (nx,ny) not in visited and g[ny][nx]==color:
                            visited.add((nx,ny));todo.append((nx,ny))
                objects.append({'color':color,'cells':tuple(cells),'pos':(min(c[0] for c in cells),min(c[1] for c in cells))})
        return tuple(objects)
    def paint(self,g,writes):
        rows={}
        for x,y,color in writes:
            self.tick()
            if not(0<=x<64 and 0<=y<64):continue
            if y not in rows:self.tick(64);rows[y]=list(g[y])
            rows[y][x]=color
        self.tick(64)
        return tuple(tuple(rows[y]) if y in rows else g[y] for y in range(64))
    def call(self,closure,values):
        names,body,env=closure
        self.tick()
        return self.eval(body,{**env,**dict(zip(names,values))})
    def eval(self,node,env):
        self.tick();op=node['op'];args=node.get('args',[])
        if op=='literal':return tuple(node['value']) if node['type']==t.C else node['value']
        if op=='var':return env[node['name']]
        if op=='lambda':return (node['params'],args[0],dict(env))
        if op=='let':return self.eval(args[1],{**env,node['name']:self.eval(args[0],env)})
        if op=='if':return self.eval(args[1] if self.eval(args[0],env) else args[2],env)
        if op=='match_option':
            option=self.eval(args[0],env)
            return self.eval(args[1],env) if not option[0] else self.call(self.eval(args[2],env),(option[1],))
        if op=='option_default':
            option=self.eval(args[0],env)
            return option[1] if option[0] else self.eval(args[1],env)
        if op=='fold':
            seq=self.eval(args[0],env);value=self.eval(args[1],env);fn=self.eval(args[2],env)
            for item in seq:self.tick();value=self.call(fn,(value,item))
            return value
        v=[self.eval(a,env) for a in args]
        if op=='pair':return (v[0],v[1])
        if op=='add':return max(-64,min(64,v[0]+v[1]))
        if op=='grid_get':return v[0][v[1][1]][v[1][0]]
        if op=='grid_set':return self.paint(v[0],[(v[1][0],v[1][1],v[2])])
        if op=='grid_background':return self.background(v[0])
        if op=='grid_count':
            count=0
            for row in v[0]:
                for color in row:self.tick();count+=color==v[1]
            return count
        if op=='grid_objects':return self.objects(v[0])
        if op=='obj_color':return v[0]['color']
        if op=='obj_pos':return v[0]['pos']
        if op=='obj_contains':
            for cell in v[0]['cells']:
                self.tick()
                if cell==v[1]:return True
            return False
        if op in ('translate','is_blocked'):
            g,obj,dx,dy=v;bg=self.background(g);cells=set(obj['cells']);self.tick(len(cells))
            if op=='is_blocked':
                for x,y in cells:
                    self.tick();nx=x+dx;ny=y+dy
                    if not(0<=nx<64 and 0<=ny<64) or ((nx,ny) not in cells and g[ny][nx]!=bg):return True
                return False
            writes=[]
            for x,y in obj['cells']:self.tick();writes.append((x,y,bg))
            for x,y in obj['cells']:self.tick();writes.append((x+dx,y+dy,obj['color']))
            return self.paint(g,writes)
        if op=='coord':return tuple(max(0,min(63,x)) for x in v)
        if op=='coord_x':return v[0][0]
        if op=='coord_y':return v[0][1]
        if op=='coord_neighbors8':
            x,y=v[0];result=[]
            for dx in (-1,0,1):
                for dy in (-1,0,1):
                    self.tick()
                    if (dx or dy) and 0<=x+dx<64 and 0<=y+dy<64:result.append((x+dx,y+dy))
            return tuple(sorted(result,key=lambda p:(p[1],p[0])))
        if op=='list_len':return len(v[0])
        if op=='list_head':return (True,v[0][0]) if v[0] else (False,None)
        if op=='is_some':return v[0][0]
        if op=='action_kind':return v[0]['kind']
        if op.startswith('action_'):
            field={'action_dx':'dx','action_dy':'dy','action_click_x':'x','action_click_y':'y'}[op]
            kind='MOVE' if field in ('dx','dy') else 'CLICK'
            return (True,v[0][field]) if v[0]['kind']==kind else (False,None)
        if op=='state_get':return (True,v[0][v[1]]) if v[1] in v[0] else (False,None)
        if op=='state_set':return {**v[0],v[1]:v[2]}
        if op in ('eq_offset','eq_color','eq_kind'):return v[0]==v[1]
        if op=='lt_offset':return v[0]<v[1]
        if op=='and':return v[0] and v[1]
        if op=='or':return v[0] or v[1]
        if op=='not':return not v[0]
        raise ValueError('unknown runtime op')


def validate_grid(g):
    if not isinstance(g,(tuple,list)) or len(g)!=64 or any(not isinstance(r,(tuple,list)) or len(r)!=64 for r in g):raise ValueError('64x64 grid required')
    if any(type(c) is not int or not 0<=c<=15 for r in g for c in r):raise ValueError('palette0..15 required')
    return tuple(tuple(r) for r in g)


def validate_state(s):
    if not isinstance(s,dict) or any(k not in ('k0','k1','k2','k3') or type(v) is not int or not -64<=v<=64 for k,v in s.items()):raise ValueError('invalid State')
    if len(json.dumps(s).encode())>4096:raise ValueError('state byte limit')
    return dict(s)


def validate_action(a):
    if not isinstance(a,dict) or a.get('kind') not in ('MOVE','CLICK','NOOP'):raise ValueError('invalid action')
    fields={'MOVE':{'kind','dx','dy'},'CLICK':{'kind','x','y'},'NOOP':{'kind'}}[a['kind']]
    if set(a)!=fields:raise ValueError('unexpected action fields')
    for k in fields-{'kind'}:
        if type(a[k]) is not int:raise ValueError('integer action fields required')
    if a['kind']=='MOVE' and (a['dx'] not in (-1,0,1) or a['dy'] not in (-1,0,1) or (a['dx'],a['dy'])==(0,0)):raise ValueError('invalid move')
    if a['kind']=='CLICK' and not(0<=a['x']<64 and 0<=a['y']<64):raise ValueError('invalid click')
    return dict(a)


def execute(ast,grid,action,state=None,uses_memory=False,limit=10000):
    typed=t.check_program(ast,uses_memory);g=validate_grid(grid);a=validate_action(action);s=validate_state({} if state is None else state)
    if not uses_memory and s:raise ValueError('stateless program must receive empty state')
    runtime=Runtime(limit);result=runtime.eval(ast,{'g':g,'a':a,'s':s})
    output=validate_grid(result[0]);state_out=validate_state(result[1])
    if not uses_memory and state_out:raise ValueError('stateless output state must be empty')
    return {'grid':[list(r) for r in output],'state':state_out,'steps':runtime.steps,'ast_nodes':typed['nodes']}


def memory_control():
    n=t.node;g=t.var('g');s=t.var('s');k=t.lit(t.K,'k0')
    return n('pair',n('if',n('is_some',n('state_get',s,k)),n('grid_set',g,t.lit(t.C,(0,0)),t.lit(t.P,5)),g),
             n('state_set',s,k,n('add',n('option_default',n('state_get',s,k),t.lit(t.D,0)),t.lit(t.D,1))))
