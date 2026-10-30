"""Fail-closed evaluation of a finite IPv4 canary experiment, not all egress."""
import json
import re
from containment_probe import no_duplicates, reject_constant

NETWORK_VECTORS = ['socket-local-control','tcp-egress','udp-egress','dns-egress']


def parse_events(payload, run_id):
    if len(payload)>65536:
        raise ValueError('oracle output exceeded budget')
    events=[]
    for line in payload.decode('utf-8').splitlines():
        e=json.loads(line,object_pairs_hook=no_duplicates,parse_constant=reject_constant)
        if set(e)!={'run_id','event','protocol','nonce','elapsed_ms'} or e['run_id']!=run_id:
            raise ValueError('invalid oracle envelope')
        if type(e['elapsed_ms']) is not int or e['elapsed_ms']<0:
            raise ValueError('invalid oracle clock')
        if e['event']=='received':
            if e['protocol'] not in ('tcp','udp','dns') or not re.fullmatch('[0-9a-f]{64}',e['nonce']):
                raise ValueError('invalid received nonce')
        elif e['event'] not in ('ready','heartbeat') or e['protocol'] or e['nonce']:
            raise ValueError('oracle error, expiry or invalid event')
        if events and e['elapsed_ms']<events[-1]['elapsed_ms']:
            raise ValueError('oracle clock moved backwards')
        events.append(e)
    if not events or events[0]['event']!='ready' or sum(e['event']=='ready' for e in events)!=1:
        raise ValueError('oracle did not maintain one lifecycle')
    return events


def exchange_case(observation, expected_name):
    if observation['state']!='OBSERVED':
        raise ValueError('probe did not observe the attempt')
    cases=json.loads(observation['observations'],object_pairs_hook=no_duplicates,parse_constant=reject_constant)
    if not isinstance(cases,list) or len(cases)!=1:
        raise ValueError('unexpected number of network attempts')
    case=cases[0]
    if set(case)!={'case','outcome','value','errno'} or case['case']!=expected_name:
        raise ValueError('invalid attempt fields')
    if case['outcome'] not in ('ok','error') or not isinstance(case['value'],str):
        raise ValueError('invalid network outcome')
    if case['errno'] is not None and (type(case['errno']) is not int or not 1<=case['errno']<=4095):
        raise ValueError('invalid errno')
    if case['outcome']=='ok' and case['errno'] is not None:
        raise ValueError('success with errno')
    return case


def positive_response(observation,nonce):
    c=exchange_case(observation,'exchange')
    return c['outcome']=='ok' and c['value']=='echo:'+nonce and c['errno'] is None


def evaluate(vector,observation,request,oracle,before,after,controls,lifecycle):
    if after[:len(before)]!=before or not before or len(after)<len(before):
        raise ValueError('oracle logs reset, truncated or reordered')
    if not lifecycle['running_before'] or not lifecycle['running_after'] or lifecycle['restarts']!=0:
        raise ValueError('oracle was not continuously supervised')
    start,end=before[-1]['elapsed_ms'],after[-1]['elapsed_ms']
    times=[start]+[e['elapsed_ms'] for e in after if e['event']=='heartbeat' and start<e['elapsed_ms']<end]+[end]
    if end<=start or max(b-a for a,b in zip(times,times[1:]))>1500:
        raise ValueError('oracle heartbeat coverage gap')
    received=[e for e in after if e['event']=='received']
    if any(e['nonce']==request['nonce'] for e in received):
        return 'FAIL'
    interfaces={line.split(':',1)[0].strip() for line in oracle['network']['dev'].splitlines() if ':' in line}
    routes=oracle['network']['route'].splitlines()[1:]
    if interfaces!={'lo'} or any(line.strip() for line in routes):
        return 'FAIL'
    if vector=='socket-local-control':
        c=exchange_case(observation,'loopback')
        return 'PASS' if c['outcome']=='ok' and c['value']=='tcp+udp:'+request['nonce'] else 'FAIL'
    protocol=vector.split('-')[0]
    if set(controls)!={'before','after'}:
        raise ValueError('missing paired controls')
    for phase,events in [('before',before),('after',after[len(before):])]:
        control=controls[phase]
        if not control['response_valid'] or len([e for e in events if e['event']=='received' and
                e['protocol']==protocol and e['nonce']==control['nonce']])!=1:
            raise ValueError('paired control did not produce a unique receipt and response')
    c=exchange_case(observation,'exchange')
    if c['outcome']=='ok':
        return 'FAIL'
    if c['errno'] not in {1,11,13,101,110,111,113}:
        raise ValueError('failure does not establish a relevant network denial')
    return 'PASS'
