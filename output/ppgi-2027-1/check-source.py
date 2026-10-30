import pathlib,json,urllib.request,hashlib,re
p=pathlib.Path('output/ppgi-2027-1/textos');d=json.loads((p/'22887710-metadata.json').read_text(encoding='utf-8'))
f=next(f for f in d['files'] if f['key'].endswith('.md'));b=urllib.request.urlopen(f['links']['self'],timeout=30).read();(p/f['key']).write_bytes(b);s=b.decode('utf-8');pat=r'^<a id="(p\d-b\d+)"></a>\s*$';a=re.findall(pat,s,re.M)
print(json.dumps({'sha256_bytes':hashlib.sha256(b).hexdigest(),'chars':len(s),'lines_splitlines':len(s.splitlines()),'blocks_exact_tutorial_regex':len(a),'anchors_other_examples':re.findall(r'<a[^>]*id[^>]*>',s)[:8]},ensure_ascii=False))
import pypdfium2 as pdf
for fn,pg in [('Protocolo_Conhecimento_Verificavel_ArtigoAcademico_2026-09-22.pdf',18),('Arkhe-Design-Fiction-990-v2.pdf',8)]:
 doc=pdf.PdfDocument(p/fn);doc[pg].render(scale=1.4).to_pil().save(str(p/(fn+'.png')))
