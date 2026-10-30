"""Read-only all-page preflight for the generated paperback PDFs."""
from pathlib import Path
import json
import pdfplumber
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[2]
report={}
for name in ['arkhe-paperback-interior-6x9.pdf','arkhe-paperback-cover-6x9-white.pdf']:
    path=ROOT/'output/pdf'/name
    r=PdfReader(path);bad=[];blank=[];fonts=set();sample={};words=0
    with pdfplumber.open(path) as d:
        for i,p in enumerate(d.pages,1):
            words+=len((p.extract_text() or '').split())
            if not p.chars:blank.append(i)
            assert not p.annots
            for c in p.chars:
                if not c['text'].strip():continue
                if 'interior' in name:
                    outside=(c['x0']<62.2 or c['x1']>369.8 or c['top']<53 or (c['bottom']>595 and not (607<=c['top']<=625)))
                else:
                    outside=(c['x0']<18 or c['x1']>p.width-18 or c['top']<18 or c['bottom']>p.height-18)
                if outside:bad.append({'page':i,'text':c['text'],'bbox':[round(c[k],2) for k in ['x0','x1','top','bottom']]})
            if len(p.lines)>8 and 'table' not in sample:sample['table']=i
            if any('Consolas' in c['fontname'] for c in p.chars) and 'code' not in sample:sample['code']=i
    for p in r.pages:
        for f in p['/Resources'].get('/Font',{}).values():
            f=f.get_object();desc=f.get('/FontDescriptor')
            fonts.add((str(f.get('/BaseFont')),bool(desc and any(k in desc.get_object() for k in ['/FontFile','/FontFile2','/FontFile3']))))
    report[name]={'pages':len(r.pages),'page_inches':[float(x)/72 for x in [r.pages[0].mediabox.width,r.pages[0].mediabox.height]],'out_of_margin_chars':len(bad),'examples':bad[:15],'blank_pages':blank,'fonts':sorted(fonts),'extracted_words':words,'annotations':0,'outlines':len(r.outline),'encrypted':r.is_encrypted,'sample_pages':sample}
    assert not bad,report[name]
    assert all(f[1] for f in fonts),fonts
    assert not r.outline and not r.is_encrypted
    if 'interior' in name:assert len(r.pages)%2==0
    else:assert len(r.pages)==1
(ROOT/'docs/ebook/evidence/print-qa.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
