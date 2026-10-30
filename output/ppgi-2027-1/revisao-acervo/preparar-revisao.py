from pathlib import Path
import csv,difflib,hashlib,json,re,zipfile
ROOT=Path(__file__).resolve().parent
inventory=json.loads((ROOT.parent/'zenodo-inventario.json').read_text(encoding='utf-8'))
manifest=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
reviewed={22884311,22887710,22803255,23049119,20971457,21520919,22906639}
high={22884311,22803255,20971457,21520919,22906639,19984418,19074767,20337092}
notes={
22884311:'Afiliação UnB negada pelo autor; corrigir status do pré-registro, métrica e referência.',
22887710:'Separar tutorial verificável de eficácia ainda não medida; restringir promessa dos gates.',
22803255:'Reivindicação de primeira AGI contradiz exigência de D1 e admissão de cognição não demonstrada.',
23049119:'Explicitar relação score–desfechos; corrigir extensividade, inferências e pacote reprodutível.',
20971457:'Não herdar confirmação geral do caso CGF; separar atestação de verdade semântica.',
21520919:'Rever teoremas apresentados como analogias e exigir evidência para ganho de 28,6 pontos.',
22906639:'Identificar modelo com placeholders; não sugerir adoção efetiva por Estados.',
22850266:'604 páginas; exige revisão por capítulo. Triagem não equivale a auditoria integral.',
21693171:'192 páginas; preservar separação entre física especulativa, matemática e engenharia.',
19984418:'Priorizar comprovação das alegações production-ready, 84,7%, provas ZK e backend ZEE200.',
19074767:'Priorizar afiliação e alegações de validação física; não inferir verdade por integração conceitual.',
20337092:'Conferir afiliações institucionais e alegações de hipóteses validadas; não substituir dados de coautor.',
20357414:'Identificar natureza de proposta e verificar autoridades/locais/selo declarados.',
20347854:'Exigir significado verificável do selo CANONIZED e métricas por plataforma.',
20279078:'Número de arquivos/assertions e selo precisam de pacote versionado; não inferir realização física.',
20279008:'Conferir submissão a periódico e distinguir metáfora biomédica de validação empírica.',
19371344:'Clarificar que proposta não é organismo ONU; conciliar licenciamento e alegações de conformidade.',
22865277:'Nenhum PDF no snapshot público; revisar outros formatos e relação com depósito Redox anterior.',
22741927:'Não afirmar legibilidade para não especialistas sem avaliação com leitores.',
22850745:'Preservar limites de provas/checagem nominal; dados ilustrativos não são medição de eficácia.',
22779781:'Distinguir fixture GGUF mínima, validação estrutural, proveniência e modelo real.',
22774038:'Distinguir arquitetura proposta e operação financeira efetiva; comparar falhas com ameaças explícitas.',
22763818:'Qualificar isomorfia como analogia salvo estruturas e prova especificadas.',
22761375:'Fixar revisão de código e separar propriedades de integridade, confidencialidade e disponibilidade.',
22760896:'Reconstruções de incidentes não demonstram prevenção causal pelo sistema proposto.',
22756370:'Exige revisão matemática especializada de cada resultado e fonte; não inferir solução por plano.',
22738348:'Revisão de síntese; não confundir literatura primária revisada com revisão por pares deste depósito.',
22738327:'Declarar proposta de apresentação, não parceria/endosso de OMS ou BRICS.',
22736815:'Separar sincronização mensurável, hipótese de mecanismo e alegações de telepatia; revisão especializada.',
21383201:'Fixar versão do roadmap e evidência de implementado/testado; capacidades futuras continuam propostas.',
20534974:'Conferir modelos e dados de calibração; não inferir validação experimental a partir de referência.',
20126519:'Identificar gênero filosófico/especulativo e separar de medições computacionais.',
20126398:'Separar implementação do simulador e inferências sobre espaço-tempo, observação e biologia.',
20013405:'Conceito de engenharia; validar física, energia, órbitas e materiais antes de alegar realização.',
19115803:'Separar ontologia proposta, modelo matemático e hipótese física testável.',
19058639:'Rastrear código/commit/dados para latência, throughput e escalas; não tomar convergência analógica como validação.'}
rows=[]
for r in inventory:
    if not r['submitted']:continue
    m=next(x for x in manifest if x['id']==r['id'])
    rows.append({'record_id':r['id'],'title':r.get('title',''),'doi':r.get('doi',''),
      'review_level':'revisao-dirigida-de-trechos' if r['id'] in reviewed else 'triagem-documental-nao-integral',
      'priority':'alta' if r['id'] in high else 'media','pages':sum(f['pages'] for f in m['files']),
      'source_status':m['status'],'action':notes.get(r['id'],'Revisão de texto, fontes e evidências pendente.'),
      'remote_changed':False})
with (ROOT/'triagem-37-publicacoes.csv').open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
metadata=[]
for rid in [22884311,22803255,22906639]:
    old=json.loads((ROOT/str(rid)/'metadata.json').read_text(encoding='utf-8'))
    patch=[]
    if rid==22884311:
        assert old['metadata']['creators'][0]['orcid']=='0009-0005-2697-4668'
        patch=[{'op':'test','path':'/metadata/creators/0/affiliation','value':'Universidade de Brasília'},
               {'op':'replace','path':'/metadata/creators/0/affiliation','value':'Pesquisador independente, Brasil'}]
        reason='Autor confirmou ausência de vínculo com UnB em 28/10/2026.'
    else:
        title=('Arkhe as a Proposed Architecture for Verifiable AI Agents: Cognitive Requirements, Governance, and Limits of the Constitutive AGI Definition' if rid==22803255 else 'Modelo conceitual de constituição para governança de IA — proposta para discussão')
        patch=[{'op':'test','path':'/metadata/title','value':old['metadata']['title']},{'op':'replace','path':'/metadata/title','value':title}]
        reason='Proposta editorial substantiva; revisar junto ao corpo e aos coautores antes de aplicar.'
    metadata.append({'record_id':rid,'snapshot_sha256':hashlib.sha256((ROOT/str(rid)/'metadata.json').read_bytes()).hexdigest(),
      'format':'RFC6902 local review proposal; NOT a direct Zenodo update payload',
      'patch':patch,'reason':reason,'applied_remotely':False})
(ROOT/'metadados-propostos.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')

# Conservative, exact changes to textual transcriptions. No PDF is overwritten.
# These are working transcripts, not typeset or submission-ready editions.
corrections=[]
def corrected_transcript(rid,filename,ops):
    source=ROOT/str(rid)/filename
    original=source.read_text(encoding='utf-8');text=original
    for label,before,after in ops:
        n=text.count(before)
        if n==0:raise ValueError(f'Missing anchor: {rid} {label}')
        text=text.replace(before,after)
        corrections.append({'record_id':rid,'change':label,'occurrences':n,'before':before,'after':after})
    dest=ROOT/'transcricoes-revisadas';dest.mkdir(exist_ok=True)
    note=('# Transcrição de trabalho com correções editoriais pontuais\n\n'
          'Não é uma nova edição diagramada. Tabelas, fórmulas e figuras devem ser conferidas no PDF original. '
          'As correções abaixo não encerram os demais achados da revisão dirigida. '
          'A autoria e a versão publicada permanecem preservadas; integração final e revisão autoral pendentes.\n\n')
    out=dest/(str(rid)+'-'+source.stem+'.working.md');out.write_text(note+text,encoding='utf-8')
    diff=''.join(difflib.unified_diff(original.splitlines(True),text.splitlines(True),fromfile=source.name,tofile=out.name))
    (dest/(str(rid)+'-'+source.stem+'.diff')).write_text(diff,encoding='utf-8')
corrected_transcript(22884311,'Protocolo_Conhecimento_Verificavel_ArtigoAcademico_2026-09-22.txt',[
 ('Referência Perez','2104.06390','2202.03286'),
 ('Status no resumo','(ensaio randomizado, avaliadores cegos, N = 150, ANCOVA), pré-registrado, com protocolo','(ensaio randomizado, avaliadores cegos, meta inicial N = 150, ANCOVA), ainda não executado e sujeito a pré-registro, com planejamento de protocolo'),
 ('Indicador de data','proporção de registros com data de evento posterior à\ndata de registro','proporção de registros declarados contemporâneos cuja gravação ocorreu depois do evento, com atraso e incerteza documentados')])
corrected_transcript(22887710,'Arkhe_DocumentoMestreComoPrompt_AcademicPaper_2026-09-22.txt',[
 ('Limite dos gates','garante que a alucinação não atravesse um gate sem ser registrada como\nevidência de falha','verifica apenas as propriedades cobertas pelos gates e seus oráculos; erros sem cobertura podem atravessá-los sem detecção')])
corrected_transcript(23049119,'FDF-AGI_AcademicPaper_2026-09-30.txt',[
 ('Gênero dos ensaios','6. Empirical Validation','6. Synthetic-Model Demonstrations and Reported Numerical Results'),
 ('Inversão na conclusão','distributive properties are invariant to\nchanges that benchmarks measure','group outcomes may change while the aggregate score remains unchanged'),
 ('Limite da extensividade','The extensivity of Ψ is checkable by\ninspection of |M| across iterations','The extensivity of Ψ requires checking set inclusion M_t ⊆ M_(t+1) with stable approach identifiers; inspecting |M| alone is insufficient')])
(ROOT/'alteracoes-aplicadas-transcricoes.json').write_text(json.dumps(corrections,ensure_ascii=False,indent=2),encoding='utf-8')

published=len(rows);pdfs=sum(len(r['files']) for r in manifest);pages=sum(f['pages'] for r in manifest for f in r['files'])
index=f'''# Revisão do acervo Zenodo — 28/10/2026

Inventário autenticado: {len(inventory)} registros, {published} publicados e {len(inventory)-published} rascunhos. Foram obtidos {pdfs} PDFs públicos, totalizando {pages} páginas, com checksum conferido quando informado. Um registro publicado não apresenta PDF neste snapshot; isso não significa que não possua outros formatos. Os rascunhos não foram analisados nem modificados.

## Entregas

- [Correções editoriais propostas](correcoes-editoriais.md): sete registros prioritários, com trechos substitutivos, justificativas e condições de integração.
- [Triagem das 37 publicações](triagem-37-publicacoes.csv): cobertura explícita por registro. Triagem não é revisão integral nem declaração de ausência de erros.
- [Metadados propostos](metadados-propostos.json): remoção da afiliação UnB confirmada como indevida pelo autor e duas propostas de título. Formato de revisão local; não enviar diretamente como corpo de atualização Zenodo.
- [Alterações aplicadas nas transcrições](alteracoes-aplicadas-transcricoes.json): {len(corrections)} operações rastreadas em três transcrições de trabalho, com diffs em `transcricoes-revisadas/`.
- [Checks matemáticos independentes](verificacao-argumentos.json): exemplos racionais, dimensões do núcleo no modelo explicitado e contraexemplo para cardinalidade/extensividade. Não são reprodução dos seis experimentos da monografia.
- [Manifesto dos originais](manifest.json): arquivos, contagens, hashes e status de aquisição. Fontes preservadas nos diretórios numéricos.

## Prioridades

1. Corrigir afiliação UnB no protocolo, confirmada como incorreta pelo autor.
2. Retirar reivindicação não demonstrada de primeira AGI do título e de todas as passagens dependentes. Revisão de corpo e coautoria necessária.
3. Resolver status de pré-registro, referência, métrica e indicador temporal do protocolo.
4. Explicitar hipóteses da prova FDF, revisar extensividade e distinguir simulação sintética de validação do ciclo metodológico.
5. Evitar propagação de confirmação excessiva do CGF para Cathedral OS; separar atestação, validade semântica e generalidade.
6. Auditar os relatos numéricos e as alegações de produção, validação física, certificação e submissão editorial dos demais trabalhos.

## Alcance real

Foi feita triagem documental do conjunto e revisão dirigida de trechos de sete registros. As 1.833 páginas não foram revisadas manualmente linha a linha. O volume de 604 páginas e as monografias extensas continuam exigindo revisão por capítulo. Textos de física, medicina, matemática e direito não recebem certificação de domínio nesta análise. Resultados de fontes e do autor permanecem distintos dos checks executados nesta sessão.

As transcrições são materiais editáveis intermediários: preservam artefatos de extração, referências a figuras e tabelas do PDF e achados pendentes. Não devem ser publicadas como uma nova edição pronta. Os blocos substitutivos são propostas para revisão autoral, não depoimentos fabricados ou novos resultados. Nenhuma versão, arquivo, descrição ou metadado remoto foi alterado. O plugin existente permanece somente de leitura.

## Próxima integração

Integrar trechos aprovados aos fontes editoriais originais, revisar todas as ocorrências afetadas, conferir coautoria e afiliações, resolver cada alegação com evidência e renderizar a nova edição antes de publicar. Caso os fontes originais não estejam disponíveis, reconstruir uma edição explicitamente revisada em vez de sobrescrever o PDF extraído. Registrar nota de correção com vínculo à versão histórica.
'''
(ROOT/'LEIA-ME.md').write_text(index,encoding='utf-8')
package=ROOT.parent/'zenodo-pacote-revisao-2026-10-28.zip'
with zipfile.ZipFile(package,'w',compression=zipfile.ZIP_DEFLATED) as z:
    for name in ['LEIA-ME.md','correcoes-editoriais.md','triagem-37-publicacoes.csv','metadados-propostos.json','alteracoes-aplicadas-transcricoes.json','verificacao-argumentos.json','verificar-argumentos.py','manifest.json']:
        z.write(ROOT/name,name)
    for f in (ROOT/'transcricoes-revisadas').iterdir():z.write(f,'transcricoes-revisadas/'+f.name)
print(json.dumps({'publications':published,'pdfs':pdfs,'pages':pages,'changes':len(corrections),'package':str(package)},ensure_ascii=False))
