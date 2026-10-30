"""Compare comment-stripped sequential revisions, normalize known clause orders."""
import hashlib,json,re
from pathlib import Path


def normalize(text):
    text=re.sub(r'\(\*.*?\*\)','',text,flags=re.S)
    text=re.sub(r'\\\*[^\n]*','',text)
    text=re.sub(r'^-+\s*MODULE\s+(\w+)\s*-+\s*$',r'MODULE \1',text,flags=re.M)
    text=re.sub(r'^=+\s*$','END',text,flags=re.M)
    for start,end,separator in [('Next','Spec',chr(92)+'/'),('Fairness','LiveSpec','/'+chr(92))]:
        pattern=rf'(?ms)^{start}\s*==(.*?)(?=^{end}\s*==)'
        match=re.search(pattern,text)
        if not match:raise ValueError('operator not found')
        terms=match.group(1).split(separator)
        terms=sorted(re.sub(r'\s+','',term) for term in terms if term.strip())
        text=text[:match.start()]+start+'=='+separator.join(terms)+'\n'+text[match.end():]
    return re.sub(r'\s+','',text)


def main():
    a=Path('work/arc-agi-3/formal/seq-v1/LaneIsolationSeq.tla')
    b=Path('work/arc-agi-3/formal/seq-v2/LaneIsolationSeq.tla')
    result={'scope':'Textual check stripping comments/whitespace and sorting only Next disjuncts and Fairness conjuncts; not a general TLA equivalence checker.',
        'normalized_definitions_equal':normalize(a.read_text())==normalize(b.read_text()),
        'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in (a,b)}}
    out=Path('output/arc3-python-frontend-fixture-20261027')
    (out/'seq-revision-comparison.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2))


if __name__=='__main__':main()
