import concurrent.futures, hashlib, json, pathlib, urllib.request
from pypdf import PdfReader
ROOT=pathlib.Path(__file__).resolve().parent
OUT=ROOT/'revisao-acervo'; OUT.mkdir(exist_ok=True)
records=json.loads((ROOT/'zenodo-inventario.json').read_text(encoding='utf-8'))
def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'ZenodoResearchAccess/1.0 (research metadata client)','Accept':'application/json'})
    return urllib.request.urlopen(req,timeout=50).read()
def collect(rec):
    folder=OUT/str(rec['id']);folder.mkdir(exist_ok=True)
    result={'id':rec['id'],'title':rec.get('title'),'files':[]}
    if not rec['submitted']:return dict(result,status='draft-not-reviewed')
    try:
        p=folder/'metadata.json'
        if p.exists():data=json.loads(p.read_text(encoding='utf-8'))
        else:
            data=json.loads(get(f"https://zenodo.org/api/records/{rec['id']}"));p.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
        for f in data.get('files',[]):
            if not f['key'].lower().endswith('.pdf'):continue
            dest=folder/pathlib.Path(f['key']).name
            if not dest.exists():dest.write_bytes(get(f['links']['self']))
            b=dest.read_bytes();declared=f.get('checksum','');actual='md5:'+hashlib.md5(b).hexdigest()
            if declared and actual!=declared:raise ValueError('checksum mismatch')
            reader=PdfReader(dest);pages=[p.extract_text() or '' for p in reader.pages]
            dest.with_suffix('.pages.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf-8')
            dest.with_suffix('.txt').write_text('\n'.join(f'\n=== PAGINA {i+1} ===\n'+s for i,s in enumerate(pages)),encoding='utf-8')
            result['files'].append({'filename':dest.name,'path':str(dest),'pages':len(pages),'chars':sum(map(len,pages)),'sha256':hashlib.sha256(b).hexdigest(),'checksum_verified':bool(declared)})
        result['status']='downloaded-extracted' if result['files'] else 'metadata-only-no-pdf'
    except Exception as e:result['status']='failed';result['error']=str(e)
    print(json.dumps(result,ensure_ascii=False),flush=True)
    return result
if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(collect,records))
    (OUT/'manifest.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
