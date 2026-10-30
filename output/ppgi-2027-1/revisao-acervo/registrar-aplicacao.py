from pathlib import Path
import json,csv,zipfile
root=Path('output/ppgi-2027-1/revisao-acervo')
public=json.loads((root/'alteracoes-remotas-2026-10-28/verificacao-publica.json').read_text(encoding='utf-8'))
assert len(public)==7 and all(x['notice_present'] for x in public)
ids={x['id'] for x in public}
lines=['# Alterações aplicadas por DOI — 28/10/2026','','Sete registros atualizados e conferidos pela API pública. Os DOIs foram preservados.','','| DOI | Alteração |','|---|---|']
for x in public:
 detail='Nota corretiva na descrição'
 if x['id']==22884311:detail+=' e afiliação corrigida para Pesquisador independente, Brasil'
 if x['id'] in {22803255,22906639}:detail+=' e título corrigido'
 lines.append(f"| [{x['doi']}](https://doi.org/{x['doi']}) | {detail} |")
lines.extend(['','Os arquivos PDF históricos e seus checksums foram preservados. As notas explicitam que uma revisão integral dos arquivos permanece pendente. Nos registros 23049119 e 22906639, entradas vazias de data de submissão foram removidas para permitir a validação dos metadados; nenhuma data foi inventada.','','Snapshots anteriores e posteriores e verificação pública estão no diretório alteracoes-remotas-2026-10-28/. A revisão documental não representa concordância independente de coautores, revisão por pares, reprodução de todos os experimentos ou certificação do acervo.'])
(root/'resultado-aplicacao-por-doi.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
p=root/'LEIA-ME.md';s=p.read_text(encoding='utf-8');s=s.replace('Nenhuma versão, arquivo, descrição ou metadado remoto foi alterado. O plugin existente permanece somente de leitura.','Atualização posterior autorizada em 28/10/2026: sete registros receberam notas corretivas, dois tiveram títulos corrigidos e a afiliação UnB foi removida. Os PDFs históricos não foram alterados. Consulte resultado-aplicacao-por-doi.md. O plugin permanece somente de leitura; a atualização foi feita diretamente pela API oficial autenticada.')
s+='\n## Aplicação por DOI concluída\n\nConsulte [o resultado confirmado](resultado-aplicacao-por-doi.md) e a verificação pública em alteracoes-remotas-2026-10-28/verificacao-publica.json.\n';p.write_text(s,encoding='utf-8')
p=root/'correcoes-editoriais.md';s=p.read_text(encoding='utf-8').replace('A alteração remota ainda não foi executada.','A correção da afiliação foi aplicada e verificada publicamente em 28/10/2026.');s+='\n## Atualização de execução\n\nAs notas corretivas e os ajustes de metadados foram aplicados aos sete DOIs. Os trechos destinados aos PDFs continuam como propostas para integração aos fontes; os arquivos históricos não foram substituídos. Consulte resultado-aplicacao-por-doi.md.\n';p.write_text(s,encoding='utf-8')
p=root/'metadados-propostos.json';data=json.loads(p.read_text(encoding='utf-8'))
for x in data:x['applied_remotely']=x['record_id'] in ids
p.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
p=root/'triagem-37-publicacoes.csv';rows=list(csv.DictReader(p.open(encoding='utf-8-sig')))
for r in rows:r['remote_changed']=str(int(r['record_id']) in ids)
with p.open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
package=root.parent/'zenodo-pacote-revisao-2026-10-28.zip'
with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED) as z:
 for name in ['LEIA-ME.md','correcoes-editoriais.md','triagem-37-publicacoes.csv','metadados-propostos.json','alteracoes-aplicadas-transcricoes.json','verificacao-argumentos.json','verificar-argumentos.py','manifest.json','resultado-aplicacao-por-doi.md']:
  z.write(root/name,name)
 for f in (root/'transcricoes-revisadas').iterdir():z.write(f,'transcricoes-revisadas/'+f.name)
 z.write(root/'alteracoes-remotas-2026-10-28/verificacao-publica.json','alteracoes-remotas-2026-10-28/verificacao-publica.json')
assert zipfile.ZipFile(package).testzip() is None
print(json.dumps({'verified_records':len(public),'unchanged_dois':True,'pdf_replacements':0,'package_updated':True}))
