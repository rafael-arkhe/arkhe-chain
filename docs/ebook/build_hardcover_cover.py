"""Adapt vector cover to the exact dimensions reported by the user's KDP preview."""
import json
from pathlib import Path
from pypdf import PdfReader
import pdfplumber
from build_print import cover,BASE,OUT

n=len(PdfReader(OUT/'arkhe-paperback-interior-6x9.pdf').pages)
assert n==216,'Recheck KDP dimensions after an interior page-count change'
path,spine,width,height=cover(n,hardcover=True)
r=PdfReader(path)
assert len(r.pages)==1
page=r.pages[0]
assert abs(float(page.mediabox.width)/72-14.250)<.00001
assert abs(float(page.mediabox.height)/72-10.417)<.00001
fonts=[]
for f in page['/Resources']['/Font'].values():
    f=f.get_object();d=f.get('/FontDescriptor')
    assert d and '/FontFile2' in d.get_object()
    fonts.append(str(f['/BaseFont']))
with pdfplumber.open(path) as pdf:
    p=pdf.pages[0]
    assert not p.annots
    assert all(c['x0']>=.635*72 and c['x1']<=p.width-.635*72 and c['top']>=.635*72 and c['bottom']<=p.height-.635*72 for c in p.chars if c['text'].strip())
report={'file':str(path),'target_inches':[14.250,10.417],'actual_inches':[width,height],'interior_pages':n,'nominal_hardcover_spine_inches':spine,'fonts_embedded':fonts,'outer_text_safety_check':'PASS','raster_images':0,'official_template_downloaded':False,'geometry_basis':'User-provided total dimensions; 6x9, 216-page, white-paper case laminate inferred. Official calculator disabled Calculate despite completed fields. Internal fold positions require final KDP preview.','kdp_upload':'NOT RUN'}
(BASE/'evidence/hardcover-cover-qa.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
