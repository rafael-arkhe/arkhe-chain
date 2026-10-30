"""Balanced supplied families and explicit DEV-only mismatch details."""
import copy,json,random
from typed_candidate_bank import bank,CandidateBankProposer
from dsl_proposal_loop import canonical


def balanced_bank():
    chosen=[x for x in bank() if x['candidate_id'] in ('H00','H03','H06','H07','H08','H10','H11','H12','H13')]
    for i,row in enumerate(chosen):row['candidate_id']=f'B{i:02d}'
    random.Random(27102030).shuffle(chosen)
    return chosen


def schema():
    return {'type':'object','properties':{'candidate_id':{'type':'string','enum':[x['candidate_id'] for x in balanced_bank()]}},'required':['candidate_id'],'additionalProperties':False}


def details(value):
    result=[]
    for item in value['previous_training_feedback']:
        counter=item.get('training_counterexample',{})
        if counter.get('reason')!='FIRST_GRID_MISMATCH':continue
        before,action,target=value['training_episodes'][counter['episode']][counter['transition']]
        pred=counter['predicted']
        result.append({'action':action,'differences':[{'x':x,'y':y,'predicted':pred[y][x],'required':target[y][x]}
            for y in range(64) for x in range(64) if pred[y][x]!=target[y][x]],
            'instruction':'Use the required training target values above, not the previous predicted values. Choose a hypothesis matching all training pairs.'})
    return result


class BalancedProposer(CandidateBankProposer):
    def __init__(self,callback):
        def annotated(request):
            value=json.loads(request);value['explicit_dev_mismatch']=details(value)
            return callback(canonical(value))
        super().__init__(annotated,balanced_bank())


def grid():return [[0]*64 for _ in range(64)]


def left_control():
    before=grid();before[3][3]=5;after=grid();after[3][2]=5
    blocked=grid();blocked[3][0]=5
    return [[(before,{'kind':'MOVE','dx':-1,'dy':0},after),(blocked,{'kind':'MOVE','dx':-1,'dy':0},blocked)]]


def frozen_probes():
    before=grid();before[14][12]=8;after=grid();after[14][13]=8
    blocked=grid();blocked[10][62]=5;blocked[10][63]=5
    return {'right_family':[[ (before,{'kind':'MOVE','dx':1,'dy':0},after),
        (blocked,{'kind':'MOVE','dx':1,'dy':0},blocked),(grid(),{'kind':'MOVE','dx':1,'dy':0},grid()) ]],
        'noop_challenge':[[(before,{'kind':'NOOP'},before)]]}
