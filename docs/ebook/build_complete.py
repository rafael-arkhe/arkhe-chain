"""Assemble the complete expanded English edition without overwriting earlier parts."""
from pathlib import Path
import hashlib
import json
import posixpath
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent.parent
DIST = BASE / 'dist'
EVIDENCE = BASE / 'evidence'
PARTS = [('i',1,3,'The Verification Problem'),
         ('ii',4,7,'The Arkhe Architecture'),
         ('iii',8,11,'Implementation'),
         ('iv',12,14,'Governance and Economics'),
         ('v',15,17,'Use Cases')]


def strip_metadata(text):
    return re.sub(r'\A---\n.*?\n---\n', '', text, count=1, flags=re.S)


def assemble():
    development = (BASE/'full/development.en.md').read_text(encoding='utf-8')
    chunks = re.split(r'<!-- chapter:(\d+) -->', development)
    additions = {int(chunks[i]): chunks[i+1].strip() for i in range(1,len(chunks),2)}
    assert set(additions)==set(range(1,18))
    technical = (BASE/'full/technical-cases.en.md').read_text(encoding='utf-8')
    cases = re.split(r'<!-- chapter:(\d+) -->', technical)
    deep = {int(cases[i]):cases[i+1].strip() for i in range(1,len(cases),2)}
    assert set(deep)==set(range(1,18))
    additions = {n:additions[n]+'\n\n'+deep[n] for n in additions}
    result = ["---\ntitle: 'Arkhe: Evidence and Governance for AI Agents'\nsubtitle: 'An Implementation Handbook'\nauthor: 'Rafael Oliveira'\nlang: en-US\ndate: 'October 22, 2026'\nrights: 'Independent technical manuscript. Author: Rafael Oliveira. Rights and licensing details remain to be confirmed.'\n---\n",
              (BASE/'full/front.en.md').read_text(encoding='utf-8')]
    chapter_stats=[]
    originals={}
    for roman,start,end,title in PARTS:
        text=strip_metadata((BASE/f'manuscrito/00-part-{roman}.en.md').read_text(encoding='utf-8'))
        originals[roman]=text
        matches=list(re.finditer(r'^## (\d+)\. ([^\n]+)',text,re.M))
        assert [int(m[1]) for m in matches]==list(range(start,end+1))
        result.append(f'# Part {roman.upper()} — {title}\n')
        for i,m in enumerate(matches):
            n=int(m[1]);stop=matches[i+1].start() if i+1<len(matches) else len(text)
            chapter=text[m.start():stop]
            # Reference/qualification tails are moved to the consolidated appendix.
            chapter=re.split(r'^# (?:References|Selected References|Implementation and Evidence Notes)',chapter,maxsplit=1,flags=re.M)[0].strip()
            insertion=re.search(r'^### Exercise:',chapter,re.M)
            if insertion:
                chapter=chapter[:insertion.start()]+additions[n]+'\n\n'+chapter[insertion.start():]
            else:
                chapter+='\n\n'+additions[n]
            # References to serial installments are not promises about missing content.
            chapter=chapter.replace('This sample uses only the main workspace:', 'This laboratory uses only the main workspace:')
            result.append(chapter)
            chapter_stats.append({'chapter':n,'title':m[2],'words_whitespace':len(chapter.split())})
    result.append((BASE/'full/appendices.en.md').read_text(encoding='utf-8'))
    result.append('### D.5 Consolidated Bibliography\n\n#### Foundational and implementation references\n')
    first=originals['i']
    refs=first.split('## Selected Sources',1)[1].split('# Preliminary Material',1)[0]
    result.append(refs.strip())
    for roman,heading,stop in [
        ('ii','# Selected References for Part II','## Local Sources'),
        ('iii','# References and Local Contracts for Part III','Architecture and interface descriptions'),
        ('iv','# References and Local Contracts for Part IV','Local implementation and scope references'),
        ('v','# References and Local Contracts for Part V','The coding-session chapter')]:
        refs=originals[roman].split(heading,1)[1].split(stop,1)[0]
        result.append(f'#### Context labels used in Part {roman.upper()}\n\n'+refs.strip())
    audit=(BASE/'17-research-audit.en.md').read_text(encoding='utf-8')
    newrefs=audit.split('## Newly checked primary sources',1)[1].split('The full abstracts/articles',1)[0]
    result.append('#### New research and standards references\n\n'+newrefs.strip())
    result.append('### D.6 Companion Source Index\n\nThe source package contains `lab/publisher.py`, `lab/test_publisher.py`, and `lab/README.md`. The code listings in the chapters are scoped excerpts; the companion files are the complete runnable teaching application. Native repository files remain at the literal paths identified in the text. The distribution does not relicense or bundle the native repository or third-party specifications.\n')
    master='\n\n'.join(result)+'\n'
    path=BASE/'manuscrito/arkhe-complete.en.md'
    path.write_text(master,encoding='utf-8')
    return path,chapter_stats


def inspect_epub(path):
    with zipfile.ZipFile(path) as z:
        assert z.namelist()[0]=='mimetype'
        assert z.getinfo('mimetype').compress_type==zipfile.ZIP_STORED
        assert z.read('mimetype')==b'application/epub+zip'
        names=set(z.namelist())
        for name in names:
            if name.endswith(('.xml','.opf','.xhtml','.ncx')):ET.fromstring(z.read(name))
        container=ET.fromstring(z.read('META-INF/container.xml'))
        opf=container.find('.//{*}rootfile').attrib['full-path']
        package=ET.fromstring(z.read(opf))
        items={i.attrib['id']:i.attrib for i in package.findall('.//{*}manifest/{*}item')}
        for item in items.values():
            target=posixpath.normpath(posixpath.join(posixpath.dirname(opf),item['href']))
            assert target in names,target
        for item in package.findall('.//{*}spine/{*}itemref'):assert item.attrib['idref'] in items
        assert package.find('.//{http://purl.org/dc/elements/1.1/}language').text=='en-US'
        assert any('cover-image' in i.get('properties','').split() for i in items.values())


def main():
    DIST.mkdir(exist_ok=True);EVIDENCE.mkdir(exist_ok=True)
    pandoc=shutil.which('pandoc')
    if not pandoc:raise SystemExit('Pandoc is required.')
    source,chapters=assemble()
    text=source.read_text(encoding='utf-8')
    assert re.findall(r'^## (\d+)\. ',text,re.M)==[str(n) for n in range(1,18)]
    for label in 'ABCD':assert re.search(r'^## '+label+r'\.',text,re.M)
    html=DIST/'arkhe-complete-en.html';epub=DIST/'arkhe-complete-en.epub'
    common=[pandoc,str(source),'--standalone','--toc','--toc-depth=3','--css',str(BASE/'style.css')]
    subprocess.run(common+['--embed-resources','-t','html5','-o',str(html)],check=True)
    subprocess.run(common+['-t','epub3','--split-level=2','--epub-cover-image',str(DIST/'arkhe-cover-en-v1.jpg'),'-o',str(epub)],check=True)
    inspect_epub(epub)
    jar=BASE/'tools/epubcheck-5.4.0/epubcheck.jar'
    java=shutil.which('java')
    validator={'status':'NOT RUN'}
    if jar.is_file() and java:
        completed=subprocess.run([java,'-jar',str(jar),str(epub),'-j',str(EVIDENCE/'epubcheck-complete-en.json')],capture_output=True,text=True,encoding='utf-8',errors='replace')
        (EVIDENCE/'epubcheck-complete-en.log').write_text(completed.stdout+completed.stderr,encoding='utf-8')
        validator={'status':'PASS' if completed.returncode==0 else 'FAIL','exit_code':completed.returncode}
    files=list((BASE/'full').glob('*.md'))+list((BASE/'lab').glob('*.py'))
    files += [BASE/'lab/README.md',BASE/'17-research-audit.en.md',BASE/'18-complete-edition.md',BASE/'README.md',BASE/'build_complete.py',BASE/'style.css',source,DIST/'arkhe-cover-en-v1.jpg']
    files += [EVIDENCE/'publisher-demo.json',EVIDENCE/'editorial-qa-complete-en.json']
    files += [BASE/f'manuscrito/00-part-{r}.en.md' for r,*_ in PARTS]
    # Native input manifests remain scoped to their original runs; preserve their hashes.
    files += sorted(EVIDENCE.glob('source-manifest-part-*-en.json'))
    manifest={str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    (EVIDENCE/'source-manifest-complete-en.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    report={'language':'en-US','chapters':chapters,'appendices':['A','B','C','D'],
            'words_whitespace':len(text.split()),'basic_structure':'PASS','epubcheck':validator,
            'kindle_previewer':'NOT RUN','author':'Rafael Oliveira','publisher_rights':'NOT CONFIRMED',
            'artifacts':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [html,epub]}}
    (EVIDENCE/'build-report-complete-en.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    # Bundle only original editorial sources, the original teaching lab, and evidence.
    bundle=DIST/'arkhe-complete-en-source.zip'
    with zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED) as z:
        for p in files:z.write(p,p.relative_to(BASE).as_posix())
        z.write(EVIDENCE/'source-manifest-complete-en.json','evidence/source-manifest-complete-en.json')
        z.write(EVIDENCE/'build-report-complete-en.json','evidence/build-report-complete-en.json')
        for name in ['epubcheck-complete-en.json','epubcheck-complete-en.log']:
            if (EVIDENCE/name).is_file():z.write(EVIDENCE/name,'evidence/'+name)
    print(json.dumps(report,indent=2))
    if validator['status']=='FAIL':raise SystemExit('EPUBCheck failed; inspect retained diagnostics.')


if __name__=='__main__':main()
