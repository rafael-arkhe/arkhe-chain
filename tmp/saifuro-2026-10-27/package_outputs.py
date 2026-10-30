from pathlib import Path
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import shutil, json, hashlib, zipfile, html

root=Path(r'D:\arkhe\output\saifuro-2026-10-27')
tmp=Path(r'D:\arkhe\tmp\saifuro-2026-10-27')
shutil.copyfile(tmp/'final_dossie_v3'/'Dossie_Arkhe_Saifuro.pdf',root/'Dossie_Arkhe_Saifuro.pdf')
shutil.copyfile(tmp/'final_legal_v3'/'Minutas_Juridicas_EN.pdf',root/'Minutas_Juridicas_EN.pdf')
jur=root/'juridico';jur.mkdir(exist_ok=True)
reader=PdfReader(root/'Minutas_Juridicas_EN.pdf')
parts=[('08_Unilateral_NDA_EN',1,2),('09_Mutual_NDA_EN',3,4),('10_IP_Evaluation_Agreement_EN',5,7),('11_Nonbinding_LOI_EN',8,8),('12_Master_Services_Agreement_EN',9,10),('13_Statement_Of_Work_EN',11,12),('14_IP_And_Software_License_EN',13,14),('15_Service_Level_Schedule_EN',15,15),('16_Data_Processing_Addendum_EN',16,17)]
for stem,a,b in parts:
    w=PdfWriter()
    for i in range(a-1,b):w.add_page(reader.pages[i])
    w.add_metadata({'/Title':stem.replace('_',' '),'/Subject':'Draft for negotiation and legal review'})
    with (jur/(stem+'.pdf')).open('wb') as f:w.write(f)

for kind,n in [('Public',6),('Technical',16)]:
    out=root/'apresentacoes'/f'Arkhe_Saifuro_{kind}_EN.pdf'
    c=canvas.Canvas(str(out),pagesize=(960,540))
    c.setTitle(f'Arkhe and Saifuro {kind} evaluation proposal')
    for i in range(1,n+1):
        c.drawImage(ImageReader(str(tmp/f'slides_{kind}'/f'slide-{i:02d}.png')),0,0,960,540)
        c.showPage()
    c.save()

(root/'REGISTRO_COMPARTILHAMENTO.md').write_text('''# Registro de compartilhamento

Nenhum compartilhamento externo realizado por este trabalho.

Para cada futura divulgação registrar material e versão, SHA-256, classificação, remetente, destinatário validado, finalidade, instrumento aplicável, data real de entrega, permissões concedidas, prazo e confirmação de recebimento. Hash não substitui carimbo de tempo confiável.

## Pendências antes de assinar

Entidade Arkhe e titularidade: pendentes. Registro Saifuro independente: pendente. Poderes do signatário: pendentes. Histórico de licenças: pendente. Lei e foro: em negociação. Preços e responsabilidade: em negociação. Perfil do piloto e dados: em negociação. Contratos anteriores assinados: não apresentados.

## Classificação dos pacotes

Pacote completo interno: inclui diligência, minutas, histórico do usuário e inventários. Não encaminhar integralmente à contraparte.

Pacote público: somente resumo executivo e apresentação pública, ambos propostas sem parceria confirmada. Ainda exige sua revisão editorial antes de uso.

Pacote técnico: deck e RFC de proposta. A marcação restrita não cria NDA. Confirmar destinatário e condições de divulgação antes de enviar.
''',encoding='utf-8')

files=sorted(p for p in root.rglob('*') if p.is_file() and '.validation' not in p.parts and p.suffix!='.zip' and p.name not in ['MANIFEST.sha256','index.html'])
links=[]
for p in files:
    rel=p.relative_to(root).as_posix()
    links.append(f'<li><a href="{html.escape(rel)}">{html.escape(rel)}</a></li>')
(root/'index.html').write_text('''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Documentação Arkhe e Saifuro</title><style>body{font:17px Arial;max-width:1080px;margin:50px auto;padding:0 26px;color:#18202b;line-height:1.6}h1{font-size:36px}a{color:#154f85}li{margin:8px 0}p{max-width:850px}</style><h1>Documentação Arkhe e Saifuro</h1><p>Revisão em 27 de outubro de 2026. Pacote interno de pesquisa, proposta e minutas. Contratos exigem preenchimento e revisão jurídica. Nenhum envio externo realizado.</p><p>Comece pelo documento 00 LEIA PRIMEIRO. O registro de fontes diferencia conteúdo consultado de fontes bloqueadas ou inválidas. A autenticação do contato e a consulta independente ao registro empresarial permanecem pendentes.</p><h2>Arquivos</h2><ul>'''+''.join(links)+'</ul></html>',encoding='utf-8')

manifest=[]
for p in sorted(root.rglob('*')):
    if p.is_file() and '.validation' not in p.parts and p.suffix!='.zip' and p.name!='MANIFEST.sha256':
        manifest.append(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(root).as_posix())
(root/'MANIFEST.sha256').write_text('\n'.join(manifest)+'\n',encoding='utf-8')

full=Path(r'D:\arkhe\output\Arkhe_Saifuro_Documentacao_Interna_2026-10-27.zip')
with zipfile.ZipFile(full,'w',zipfile.ZIP_DEFLATED) as z:
    for p in root.rglob('*'):
        if p.is_file() and '.validation' not in p.parts and p.suffix!='.zip':z.write(p,'saifuro-2026-10-27/'+p.relative_to(root).as_posix())
public=Path(r'D:\arkhe\output\Arkhe_Saifuro_Material_Publico_2026-10-27.zip')
with zipfile.ZipFile(public,'w',zipfile.ZIP_DEFLATED) as z:
    for rel in ['documentos/04_PUBLIC_PARTNERSHIP_BRIEF_EN.md','apresentacoes/Arkhe_Saifuro_Public_EN.pptx','apresentacoes/Arkhe_Saifuro_Public_EN.pdf']:
        z.write(root/rel,Path(rel).name)

for zpath in [full,public]:
    with zipfile.ZipFile(zpath) as z:assert z.testzip() is None
for stem in ['Dossie_Arkhe_Saifuro','Minutas_Juridicas_EN']:
    r=PdfReader(root/(stem+'.pdf')); assert all(p.extract_text().strip() for p in r.pages)
    print(stem,len(r.pages),'pages')
for p in jur.glob('*.pdf'):
    r=PdfReader(p);t='\n'.join(page.extract_text() for page in r.pages)
    assert 'signature' in t.lower() or 'signatures' in t.lower()
print(json.dumps({'internal_zip':str(full),'public_zip':str(public),'manifest_entries':len(manifest),'standalone_legal_pdfs':len(parts)},indent=2))
