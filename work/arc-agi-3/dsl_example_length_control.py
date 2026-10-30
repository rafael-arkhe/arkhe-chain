"""Generic framed demonstrations, byte-matched; token matching NOT certified."""
import json,random,hashlib
from pathlib import Path
from dsl_example_contrast import demonstrations, request
from dsl_prompt_examples import examples
from dsl_proposal_loop import canonical,parse_response
from ollama_dsl_proposer import pack_grid,compress_request
from audit_proposal_identity import controls
import finite_grid_dsl_runtime as rt


def generic_demos():
    result=[]
    for demo,example in zip(demonstrations(),examples()):
        proposal={'uses_memory':False,'ast':example['ast']}
        parse_response(canonical(proposal))
        target=rt.execute(proposal['ast'],demo['before'],demo['action'])['grid']
        result.append({'name':example['name'],'before':pack_grid(demo['before']),
            'action':demo['action'],'target':pack_grid(target),'proposal':proposal})
    return result


def prompt(episodes):
    base=json.loads(compress_request(request('E1',episodes)))
    expected_bytes=len(canonical(base).encode())
    base['additional_syntax_examples']=generic_demos()
    base['example_scope']='Generic syntax demonstrations with explicit input/output and AST. Infer target behavior from its training pairs. Sparse grid encoding is defined in grid_transport_encoding.'
    base['length_control_padding']=''
    gap=expected_bytes-len(canonical(base).encode())
    if gap<0:raise ValueError('generic prompt longer than target byte length')
    base['length_control_padding']=' '*gap
    text=canonical(base)
    assert len(text.encode())==expected_bytes
    return text


def main():
    out=Path('output/arc3-example-e1l-design-20261027');out.mkdir(exist_ok=False)
    measurements=[]
    for name,episodes in controls().items():
        for condition in ('E0','E1','E1L','E2'):
            text=prompt(episodes) if condition=='E1L' else compress_request(request(condition,episodes))
            (out/f'{name}-{condition}-prompt.json').write_text(text,encoding='utf-8')
            measurements.append({'control':name,'condition':condition,'bytes_utf8':len(text.encode()),
                'characters':len(text),'prompt_sha256':hashlib.sha256(text.encode()).hexdigest(),
                'model_prompt_tokens':None,'token_status':'NOT_MEASURED_NO_COMPATIBLE_LOCAL_TOKENIZER',
                'includes_chat_template_tokens':'NOT_MEASURED'})
    rows=[];rng=random.Random(27102028)
    for block in range(10):
        batch=[{'block':block+1,'control':name,'condition':c} for name in controls() for c in ('E0','E1','E1L','E2')]
        rng.shuffle(batch);rows.extend(batch)
    report={'status':'PROVISIONAL_BYTE_MATCHED_TOKEN_MATCH_PENDING','generation_calls':0,
        'admission':'DISABLED','prospective_calls':80,'schedule':rows,'measurements':measurements,
        'padding':'ASCII spaces in a declared JSON string; byte equality is not token equality or neutral semantic intervention.',
        'scope':'Generic AST demonstrations share the E1 input/action examples but compute their own targets. They intentionally differ in rules/outcome composition. No pure-specificity causal claim.'}
    (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(measurements,indent=2))


if __name__=='__main__':main()
