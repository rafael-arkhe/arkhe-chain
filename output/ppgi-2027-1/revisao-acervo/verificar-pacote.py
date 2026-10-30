from pathlib import Path
import csv,json,zipfile
root=Path('output/ppgi-2027-1/revisao-acervo')
rows=list(csv.DictReader((root/'triagem-37-publicacoes.csv').open(encoding='utf-8-sig')))
assert len(rows)==37 and len({r['record_id'] for r in rows})==37
patches=json.loads((root/'metadados-propostos.json').read_text(encoding='utf-8'))
for item in patches:
 data=json.loads((root/str(item['record_id'])/'metadata.json').read_text(encoding='utf-8'))
 for patch in item['patch']:
  if patch['op']=='test':
   value=data
   for component in patch['path'].strip('/').split('/'):
    value=value[int(component)] if isinstance(value,list) else value[component]
   assert value==patch['value']
changes=json.loads((root/'alteracoes-aplicadas-transcricoes.json').read_text(encoding='utf-8'))
assert len(changes)==7 and all(c['occurrences']>0 for c in changes)
for diff in (root/'transcricoes-revisadas').glob('*.diff'):
 assert diff.stat().st_size>0
z=zipfile.ZipFile(root.parent/'zenodo-pacote-revisao-2026-10-28.zip')
assert z.testzip() is None
assert all(not name.startswith('/') and '..' not in Path(name).parts for name in z.namelist())
print(json.dumps({'inventory_rows':len(rows),'proposed_metadata_records':len(patches),'applied_text_operations':len(changes),'working_transcripts':len(list((root/'transcricoes-revisadas').glob('*.md'))),'zip_files':len(z.namelist()),'zip_integrity':'PASS'},ensure_ascii=False))
