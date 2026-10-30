from pathlib import Path
import json,sys
root=Path(__file__).resolve().parent/'revisao-acervo'
manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
if len(sys.argv)==1:
    done={23049119,22884311,22887710,22803255,20971457,21520919,22741927,22850745}
    for r in manifest:
        if r['id'] in done:continue
        for f in r['files']:
            p=json.loads(Path(f['path']).with_suffix('.pages.json').read_text(encoding='utf-8'))
            print('\n###',r['id'],r['title'],'PAGES',len(p),'\n',p[0][:1700])
else:
    rid=sys.argv[1]
    for f in (root/rid).glob('*.pages.json'):
        p=json.loads(f.read_text(encoding='utf-8'))
        for n in map(int,sys.argv[2:]):print('\n###',rid,f.name,'PDF PAGE',n,'\n',p[n-1])
