import json,re,urllib.request,pathlib
from pypdf import PdfReader
p=pathlib.Path('output/ppgi-2027-1/textos');s=(p/'45c2ef5a.html').read_text();d=json.loads(re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',s).group(1));(p/'desci-metadata.json').write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
def find(x):
 if isinstance(x,dict):
  if 'pdfUrl' in x: return x['pdfUrl']
  for v in x.values():
   z=find(v)
   if z:return z
 if isinstance(x,list):
  for v in x:
   z=find(v)
   if z:return z
u=find(d);f=p/'Arkhe-Design-Fiction-990-v2.pdf';f.write_bytes(urllib.request.urlopen(u,timeout=40).read());r=PdfReader(f);t='\n'.join(f'\n=== PAGINA {i+1} ===\n'+x.extract_text() for i,x in enumerate(r.pages));f.with_suffix('.txt').write_text(t,encoding='utf-8');print('PAGES',len(r.pages));print(t)
