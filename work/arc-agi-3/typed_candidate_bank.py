"""Finite supplied-hypothesis selection control, not free program synthesis."""
import copy,json
import finite_grid_dsl_types as d
from dsl_proposal_loop import canonical,digest,parse_response


def bank():
    rows=[]
    def add(description,ast):
        p=parse_response(canonical({'uses_memory':False,'ast':ast}))
        rows.append({'candidate_id':f'H{len(rows):02d}','description':description,'proposal':p,'proposal_sha256':digest(p)})
    add('Return the grid and state unchanged for every action.',d.node('pair',d.var('g'),d.var('s')))
    for color in sorted(d.LITERALS[d.P]):
        ast=copy.deepcopy(d.controls()['click'])
        def replace(node):
            if node['op']=='literal' and node['type']==d.P:node['value']=color
            for child in node['args']:replace(child)
        replace(ast)
        add(f'On CLICK set the clicked cell to color {color}. On other actions preserve the grid. Preserve state.',ast)
    for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
        ast=copy.deepcopy(d.controls()['move'])
        def replace(node):
            if node['op'] in ('translate','is_blocked'):
                node['args'][2:]=[d.lit(d.D,dx),d.lit(d.D,dy)]
            for child in node['args']:replace(child)
        replace(ast)
        add(f'For any action, move the first detected object by dx={dx}, dy={dy} if unblocked; otherwise preserve the grid. Empty object list preserves grid. Preserve state. This rule ignores action direction/kind.',ast)
    return rows


def response_schema():
    return {'type':'object','properties':{'candidate_id':{'type':'string','enum':[x['candidate_id'] for x in bank()]}},
        'required':['candidate_id'],'additionalProperties':False}


class CandidateBankProposer:
    def __init__(self,callback,candidates=None):self.callback=callback;self.journal=[];self.bank=bank() if candidates is None else copy.deepcopy(candidates)
    def __call__(self,request):
        value=json.loads(request);best=value.get('current_best')
        best_hash=digest(best['proposal']) if best else None
        payload={'task':'Select one supplied deterministic hypothesis that best reproduces every training input/output. Return exactly JSON with candidate_id. No code or new program is requested.',
            'candidate_descriptions':[{'candidate_id':x['candidate_id'],'description':x['description']} for x in self.bank],
            'training_episodes':value['training_episodes'],'previous_training_feedback':value['previous_training_feedback'],
            'current_best_id':next((x['candidate_id'] for x in self.bank if x['proposal_sha256']==best_hash),None),
            'scope':'Known synthetic development controls; candidate algorithms are supplied, no holdout access or production admission.'}
        raw=self.callback(canonical(payload));entry={'raw_response':raw};self.journal.append(entry)
        try:
            if not isinstance(raw,str) or len(raw.encode())>65536:raise ValueError('SELECTION_SIZE')
            def pairs(items):
                result={}
                for k,v in items:
                    if k in result:raise ValueError('DUPLICATE_SELECTION_KEY')
                    result[k]=v
                return result
            data=json.loads(raw,object_pairs_hook=pairs)
            if not isinstance(data,dict) or set(data)!={'candidate_id'} or not isinstance(data['candidate_id'],str):raise ValueError('SELECTION_ENVELOPE')
            selected=next((x for x in self.bank if x['candidate_id']==data['candidate_id']),None)
            if selected is None:raise ValueError('UNKNOWN_CANDIDATE')
            entry.update(status='SELECTED_TYPED_CANDIDATE',candidate_id=selected['candidate_id'],proposal_sha256=selected['proposal_sha256'])
            return canonical(selected['proposal'])
        except (ValueError,TypeError) as exc:
            entry.update(status='SELECTION_REJECTED',reason=str(exc));return canonical({'selection_rejection':str(exc)})
