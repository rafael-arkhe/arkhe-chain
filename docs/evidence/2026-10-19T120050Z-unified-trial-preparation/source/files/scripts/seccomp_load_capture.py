"""Strict strace load-event decoder; binds syscall success and native BPF bytes to target."""
import hashlib,re,struct
NUMBER=r'(?:0x[0-9a-fA-F]+|[0-9]+)'
def number(expression,limit):
    if not re.fullmatch(NUMBER+r'(?:\s*\|\s*'+NUMBER+r')*',expression.strip()):raise ValueError('non-numeric BPF expression')
    value=0
    for term in expression.split('|'):value|=int(term.strip(),16 if term.strip().lower().startswith('0x') else 10)
    if value>limit:raise ValueError('BPF field overflow')
    return value

def decode_program(text,declared):
    if not 1<=declared<=4096 or len(text)>1048576:raise ValueError('BPF length limit')
    pattern=re.compile(r'BPF_(STMT|JUMP)\(([^()]*)\)')
    output=bytearray();pos=0;count=0
    for match in pattern.finditer(text):
        if text[pos:match.start()].strip(' ,\t'):raise ValueError('unparsed BPF data')
        fields=[p.strip() for p in match[2].split(',')]
        if match[1]=='STMT':
            if len(fields)!=2:raise ValueError('statement arity')
            code=number(fields[0],65535);k=number(fields[1],2**32-1);jt=jf=0
        else:
            if len(fields)!=4:raise ValueError('jump arity')
            code=number(fields[0],65535);k=number(fields[1],2**32-1);jt=number(fields[2],255);jf=number(fields[3],255)
        output.extend(struct.pack('<HBBI',code,jt,jf,k));count+=1;pos=match.end()
    if text[pos:].strip(' ,\t') or count!=declared:raise ValueError('incomplete/truncated BPF capture')
    return bytes(output)

def assess(traces,container_id,pid,expected_bytes):
    events=[]
    for trace in traces:
        if trace['container_id']!=container_id:raise ValueError('foreign container trace')
        if trace['pid']!=pid:continue
        for line in trace['text'].splitlines():
            if 'filter=[' not in line:continue
            match=re.fullmatch(r'([0-9]+\.[0-9]+) seccomp\(([^,]+), ([^,]+), \{len=([0-9]+), filter=\[(.*)\]\}\)\s*=\s*0',line)
            if not match:raise ValueError('filter load missing complete successful return')
            if number(match[2],2**32-1)!=1:raise ValueError('not SET_MODE_FILTER')
            flags=number(match[3],2**32-1)
            if flags&~(1|2|4|16|32):raise ValueError('unreviewed load flags')
            program=decode_program(match[5],int(match[4]))
            if program!=expected_bytes:raise ValueError('loaded candidate bytes differ from offline artifact')
            events.append({'syscall':'seccomp','operation':'SECCOMP_SET_MODE_FILTER','flags':flags,'return_value':0,'timestamp':match[1],'pid':pid,'instruction_count':len(program)//8,'bpf_sha256':hashlib.sha256(program).hexdigest(),'raw_event_sha256':hashlib.sha256(line.encode()).hexdigest()})
    if len(events)!=1:raise ValueError('require exactly one correlated candidate load event')
    return {'schema':1,'state':'CANDIDATE_LOAD_ACCEPTED_OBSERVED','container_id':container_id,'correlated_host_pid':pid,'events':events,'candidate_bytes_match':True,'post_load_dump':False,'inherited_filter_bytes_captured':False,'full_filter_chain_verified':False,'dynamic_rule_coverage_complete':False,'runtime_verified':False,'scope':'crun supplied candidate filter and successful installation, not all inherited filters or all argument outcomes'}
