"""Separately implemented decision reader from pinned text and reviewed behavior.

No imports from Gravit. Expected outputs are not an argument to evaluate().
This is a separately implemented compatibility experiment, not blind validation:
the author already inspected golden outputs while defining the comparison.
"""
import base64
import hashlib
import json
import math
import re
from datetime import datetime, timezone
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature

STATES = [None, 'Speculative Claim', 'Probabilistic Assessment', 'Verified Fact']

def sha(data): return hashlib.sha256(data).hexdigest()

def b64(text, length):
    if not isinstance(text, str): raise ValueError('base64 must be text')
    data = base64.b64decode(text, validate=True)
    if len(data) != length or base64.b64encode(data).decode() != text:
        raise ValueError('noncanonical base64 or invalid length')
    return data

def valid_signature(key, signature, message):
    try:
        Ed25519PublicKey.from_public_bytes(key).verify(signature, message)
        return True
    except (InvalidSignature, ValueError):
        return False

def key_entries(entries):
    if not isinstance(entries, list): raise ValueError('keys must be a list')
    found, raw_keys = {}, set()
    for entry in entries:
        raw = b64(entry['public_key'], 32)
        kid = entry['key_id']
        if kid != sha(raw)[:16] or kid in found or raw in raw_keys:
            raise ValueError('invalid or duplicate key identity')
        found[kid] = dict(entry, raw_key=raw)
        raw_keys.add(raw)
    return found

def load_registry(registry_bytes, signatures, trust_bytes):
    root = json.loads(trust_bytes)
    if type(root.get('trust_root_version')) is not int or root['trust_root_version'] != 1:
        raise ValueError('invalid trust root version')
    keys = key_entries(root['root_keys'])
    threshold = root['threshold']
    if type(threshold) is not int or not len(keys)//2 < threshold <= len(keys):
        raise ValueError('trust threshold must be a strict majority')
    signers = set()
    for line in signatures.splitlines():
        line = line.strip(' \t\r')
        if not line or line.startswith('#'): continue
        parts = line.split(' ')
        if len(parts) != 2 or not all(parts): raise ValueError('invalid signature line')
        kid, encoded = parts
        sig = b64(encoded, 64)
        if kid in keys and valid_signature(keys[kid]['raw_key'], sig, b'gravit-registry-v1\n'+registry_bytes):
            signers.add(kid)
    if len(signers) < threshold: raise ValueError('insufficient root signatures')
    doc = json.loads(registry_bytes)
    if type(doc.get('registry_version')) is not int or doc['registry_version'] != 1:
        raise ValueError('invalid registry version')
    registered = key_entries(doc['verifiers'])
    for entry in registered.values():
        if not isinstance(entry.get('operator'), str) or not entry['operator'] or type(entry.get('revoked')) is not bool:
            raise ValueError('invalid operator or revocation')
    return dict(keys=registered, registry_digest=sha(registry_bytes), trust_root_digest=sha(trust_bytes), signers=sorted(signers))

def finite_theta(e):
    x = e.get('theta')
    return type(x) in (int, float) and math.isfinite(x)

def signing_message(artifact_id, e):
    strings = [artifact_id, e['record_id'], e['timestamp'], e['provenance'], e['integrity_hash']]
    if any(not isinstance(s,str) or '\n' in s or '\r' in s for s in strings):
        raise ValueError('invalid signed text')
    if not finite_theta(e): raise ValueError('invalid theta')
    theta = f"{e['theta']:.6f}"
    if float(theta) != e['theta']: raise ValueError('theta precision')
    result = e['result']
    if result is not None and type(result) is not bool: raise ValueError('invalid result')
    return '\n'.join(['gravit-evidence-v1', artifact_id, e['record_id'], theta,
        json.dumps(result), e['timestamp'], e['provenance'], e['integrity_hash']]).encode()

def exclusion(artifact_id, e, registry):
    if registry is None: return None if finite_theta(e) else 'malformed'
    if not e.get('key_id') or not e.get('signature'): return 'unsigned'
    key = registry['keys'].get(e['key_id'])
    if key is None: return 'unknown_key'
    if key['revoked']: return 'revoked_key'
    try: msg = signing_message(artifact_id, e)
    except (ValueError, KeyError): return 'malformed'
    try: signature = b64(e['signature'], 64)
    except (ValueError, TypeError): return 'bad_signature'
    return None if valid_signature(key['raw_key'], signature, msg) else 'bad_signature'

def representatives(records, identity):
    # Connected components of the sharing relation, not just immediate duplicates.
    pending = set(range(len(records)))
    reps = []
    while pending:
        component = {min(pending)}
        while True:
            identities = {identity(records[i]) for i in component}
            provenances = {records[i]['provenance'] for i in component}
            expanded = component | {i for i in pending if identity(records[i]) in identities or records[i]['provenance'] in provenances}
            if expanded == component: break
            component = expanded
        pending -= component
        reps.append(min((records[i] for i in sorted(component)), key=lambda e:e['theta']))
    return reps

def convergence(reps):
    n = len(reps)
    metrics = {}
    if n >= 2:
        metrics = dict(h=sum(e['theta'] >= .7 for e in reps)/n,
                       f=sum(e['theta'] < .5 for e in reps)/n)
    return n >= 2 and metrics['h'] > .7 and metrics['f'] < .3, metrics

def timestamp(text):
    if not isinstance(text,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z',text):
        raise ValueError('invalid timestamp')
    return datetime.strptime(text,'%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)

def freshness(records, context):
    if 'evaluation_time' not in context and 'freshness_max_age_seconds' not in context:
        return all(bool(e['timestamp']) for e in records)
    age = context.get('freshness_max_age_seconds')
    if type(age) is not int or age < 0: return False
    try:
        now = timestamp(context.get('evaluation_time'))
        return all(0 <= (now-timestamp(e['timestamp'])).total_seconds() <= age for e in records)
    except ValueError: return False

def evaluate(request, registry, *, profile='compatibility', bindings=None):
    if profile not in ('compatibility','strict-text'): raise ValueError('unknown profile')
    artifact_id = request['artifact_id']
    evidence = request['evidence']
    counted, excluded = [], []
    for e in evidence:
        why = exclusion(artifact_id,e,registry)
        if why is None: counted.append(e)
        else: excluded.append(dict(record_id=e['record_id'],reason=why))
    reps = representatives(counted, lambda e:e['verifier_id'])
    conv, fractions = convergence(reps)
    tentative = 3 if conv else 2 if counted else 0
    metrics = {'CANON-NAL-001':dict(independent_records=len(reps),**fractions),
               'CANON-VAL-002':dict(record_count=len(counted)),
               'CANON-VER-003':dict(record_count=len(counted))}
    constraints = {name:dict(constraint_ok=True) for name in
        ['CANON-FRS-005','CANON-IND-004','CANON-NSD-007','CANON-PRV-006','CANON-RES-012','CANON-SIG-011']}
    demotions = 0
    cap = 3
    if tentative:
        constraints['CANON-FRS-005']['constraint_ok'] = freshness(counted,request['context'])
        if not constraints['CANON-FRS-005']['constraint_ok']: demotions += 1
        if request['context'].get('high_impact'):
            constraints['CANON-PRV-006']['constraint_ok'] = all(e['provenance'] and e['integrity_hash'] for e in counted)
            if not constraints['CANON-PRV-006']['constraint_ok']: demotions += 1
    if tentative == 3:
        identity = (lambda e:registry['keys'][e['key_id']]['operator']) if registry else (lambda e:e['verifier_id'])
        supporting = representatives([e for e in counted if e['result'] is True], identity)
        false_ids = [e['record_id'] for e in counted if e['result'] is False]
        null_ids = [e['record_id'] for e in counted if e['result'] is None]
        support_ok = len(supporting)>=2 if profile=='strict-text' else not null_ids or len(supporting)>=2
        constraints['CANON-RES-012'] = dict(constraint_ok=not false_ids and support_ok,
            supporting_sources=len(supporting), contradicting_records=false_ids,no_verdict_records=null_ids)
        if not constraints['CANON-RES-012']['constraint_ok']: cap=2
        sig = dict(registry=registry is not None)
        if registry is None:
            sig['constraint_ok']=False
        else:
            sources = representatives(counted,identity)
            hashes = len({e['integrity_hash'] for e in counted})
            sig.update(admissible_records=len(counted),independent_sources=len(sources),integrity_hashes=hashes)
            good, fs = convergence(sources)
            sig['constraint_ok']=hashes<=1 and good
            if hashes<=1: sig.update(fs)
        constraints['CANON-SIG-011'] = sig
        if not sig['constraint_ok']: cap=2
    achieved = min(max(0,tentative-demotions),cap)
    failed_constraint = any(not c['constraint_ok'] for c in constraints.values())
    claimed = request.get('claimed_state')
    status = 'REJECTED' if achieved==0 else 'DEGRADED' if failed_constraint or (claimed is not None and STATES.index(claimed)>achieved) else 'SUCCESS'
    metrics.update(constraints)
    result = dict(artifact_id=artifact_id,final_epistemic_state=STATES[achieved],status=status,
        convergence_metrics=metrics,excluded_evidence=excluded,evidence_ids=[e['record_id'] for e in evidence],
        c_up=tentative>0,c_down=achieved>0,
        registry_digest=registry['registry_digest'] if registry else None,
        trust_root_digest=registry['trust_root_digest'] if registry else None)
    if bindings is not None:
        compose_record(result,request,bindings,tentative,profile)
    return result

def freshness_reason(records,context):
    if 'evaluation_time' not in context and 'freshness_max_age_seconds' not in context:
        return 'evidence missing Freshness Bound timestamp'
    age=context.get('freshness_max_age_seconds')
    try:
        if type(age) is not int or age<0: raise ValueError()
        now=timestamp(context.get('evaluation_time'))
    except ValueError: return 'invalid Freshness Bound policy in context'
    for e in records:
        try: then=timestamp(e['timestamp'])
        except ValueError: return 'evidence timestamp missing or not YYYY-MM-DDTHH:MM:SSZ'
        seconds=(now-then).total_seconds()
        if seconds<0: return 'evidence timestamp after evaluation_time'
        if seconds>age: return 'evidence older than Freshness Bound'
    return ''

def compose_record(result,request,bindings,tentative,profile):
    """Compatibility presentation layer; reviewed against pinned composer behavior.

    Distinct from the specification-first rule experiment. No upstream execution.
    """
    gates=sorted((b for b in bindings if b['kind']=='state_gate'),key=lambda b:b['requirement_id'])
    constraints=sorted((b for b in bindings if b['kind']=='constraint'),key=lambda b:b['requirement_id'])
    ordered=gates+constraints
    gate_states={'CANON-NAL-001':'Verified Fact' if tentative==3 else None,
        'CANON-VAL-002':'Speculative Claim' if tentative else None,
        'CANON-VER-003':'Probabilistic Assessment' if tentative else None}
    winner='CANON-NAL-001' if tentative==3 else 'CANON-VER-003' if tentative else None
    result['requirement_ids']=[b['requirement_id'] for b in ordered]
    result['canon_trace']=[b['canonical_reference'][0] for b in ordered]
    result['reverse_trace']=[dict(evidence_id=e['record_id'],binding_id=b['requirement_id'],
        canon_reference=b['canonical_reference'][0],
        policy_obligation=b['policy_obligation']['description'].strip()[:120]+'...',
        achieved_state=gate_states.get(b['requirement_id']) or 'None',
        is_winning_gate=str(b['requirement_id']==winner)) for b in ordered for e in request['evidence']]
    excluded_ids={e['record_id'] for e in result['excluded_evidence']}
    counted=[e for e in request['evidence'] if e['record_id'] not in excluded_ids]
    reasons=[] if tentative else ["no state_gate Binding's verification condition was satisfied"]
    level=tentative
    demoted=False
    for b in constraints:
        rid=b['requirement_id']
        c=result['convergence_metrics'][rid]
        if c['constraint_ok'] or not level: continue
        cap=2 if rid in ('CANON-SIG-011','CANON-RES-012') else None
        if cap is not None and level<=cap: continue
        if rid=='CANON-FRS-005': why=freshness_reason(counted,request['context'])
        elif rid=='CANON-PRV-006': why='high-impact decision lacks strong provenance binding'
        elif rid=='CANON-IND-004': why='records not independently produced'
        elif rid=='CANON-SIG-011':
            if not c['registry']: why='no verifier registry loaded; Verified Fact requires signed evidence'
            elif c['integrity_hashes']>1: why=f"counted records refer to different content ({c['integrity_hashes']} distinct integrity_hash values)"
            else: why='signed evidence from independent operators does not converge'
        elif rid=='CANON-RES-012':
            n=len(c['contradicting_records'])
            why=f'{n} record(s) report result=false: the claim is contradicted' if n else f"only {c['supporting_sources']} independent source(s) report result=true ({len(c['no_verdict_records'])} record(s) report no verdict)"
        else: raise ValueError(f'unsupported failed constraint {rid}')
        reasons.append(f'{rid}: {why}')
        level=cap if cap is not None else level-1
        demoted=True
    claimed=request.get('claimed_state')
    status='REJECTED' if level==0 else 'SUCCESS'
    if claimed is not None and level:
        claimed_rank=STATES.index(claimed)
        if claimed_rank>level:
            status='DEGRADED'
            reasons.append(f"claimed '{claimed}' not justified by evidence; capped at '{STATES[level]}'")
        elif claimed_rank==level and demoted: status='DEGRADED'
    result.update(final_epistemic_state=STATES[level],status=status,c_down=level>0,
        reason='; '.join(reasons) if reasons else 'All applicable Bindings satisfied')
