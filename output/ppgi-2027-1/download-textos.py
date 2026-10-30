import urllib.request,json,pathlib,concurrent.futures
from pypdf import PdfReader
out=pathlib.Path('output/ppgi-2027-1/textos');out.mkdir(exist_ok=True)
def fetch_record(n):
 d=json.load(urllib.request.urlopen(f'https://zenodo.org/api/records/{n}',timeout=30));(out/f'{n}-metadata.json').write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
 for f in d['files']:
  if f['key'].endswith('.pdf') and ('Portugu' not in f['key']):
   p=out/f['key'];p.write_bytes(urllib.request.urlopen(f['links']['self'],timeout=30).read());r=PdfReader(p);t='\n'.join(f'\n=== PAGINA {i+1} ===\n'+x.extract_text() for i,x in enumerate(r.pages));p.with_suffix('.txt').write_text(t,encoding='utf-8');print(json.dumps({'file':str(p),'pages':len(r.pages),'chars':len(t)}))
with concurrent.futures.ThreadPoolExecutor() as ex:list(ex.map(fetch_record,['22884311','22887710']))
for doi in ['10.62891/45c2ef5a','10.55277/researchhub.v5ws8lxi.1']:
 try:
  r=urllib.request.urlopen('https://doi.org/'+doi,timeout=25);b=r.read();p=out/(doi.split('/')[-1]+'.html');p.write_bytes(b);print(doi,r.url,len(b));print(b[:150])
 except Exception as e:print(doi,str(e))
