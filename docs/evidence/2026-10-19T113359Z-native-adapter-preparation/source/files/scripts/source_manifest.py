"""Refresh/check source identities after a layout change; never hashes local credentials."""
import argparse,hashlib,os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PRUNE={'target','node_modules','__pycache__','dist','pkg','.git','.angular','.venv'}
def files(root):
    for folder,dirs,names in os.walk(root):
        dirs[:]=[d for d in dirs if d not in PRUNE and (Path(folder)/d)!=ROOT/'ops/local']
        for name in names:
            path=Path(folder)/name
            if path==root/'MANIFEST.sha256': continue
            if name.startswith('.env') and name not in ['.env.example','.env.template']: continue
            if any(name.endswith(s) for s in ['.sqlite','.sqlite-wal','.sqlite-shm','.pyc','.tsbuildinfo']): continue
            yield path

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda:source.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write',action='store_true')
    args=parser.parse_args()
    # Refresh component identities first, then the root identity over their manifests.
    for root in [ROOT/'storage/sql',ROOT/'verification',ROOT]:
        manifest=root/'MANIFEST.sha256'
        if args.write:
            paths=sorted(files(root))
            manifest.write_text(''.join(digest(p)+'  '+p.relative_to(root).as_posix()+'\n' for p in paths),encoding='utf-8')
        count=0
        for line in manifest.read_text(encoding='utf-8').splitlines():
            expected,name=line.split('  ',1);path=(root/name).resolve()
            if not path.is_relative_to(root.resolve()): raise SystemExit('FAIL manifest path leaves component')
            if path.is_relative_to(ROOT/'ops/local'): raise SystemExit('FAIL local credentials in source manifest')
            if not path.is_file() or digest(path)!=expected: raise SystemExit('FAIL source identity: '+name)
            count+=1
        print('PASS source manifest '+str(root.relative_to(ROOT) if root!=ROOT else '.')+': '+str(count)+' files')
if __name__=='__main__': main()
