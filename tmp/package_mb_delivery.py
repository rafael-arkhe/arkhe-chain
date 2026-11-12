from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re
import shutil
import zipfile

ROOT = Path('D:/arkhe')
SRC = ROOT / 'docs/arkhe-cvm'
DEST = ROOT / 'output/entrega-mercado-bitcoin-20261108'
DEST.mkdir(exist_ok=True)

mapping = {
    'one-pager.md': 'one-pager.md',
    'descoberta-80h.md': 'descoberta-80h.md',
    'kpis-sre.md': 'kpis-sre.md',
    'aceite.md': 'aceite.md',
    'proposta-comercial-saas.md': 'proposta-comercial-saas.md',
}
link_map = {
    'plano.md': 'escopo-tecnico.md',
    'anexo-tecnico-v0.2.md': 'limites-tecnicos.md',
    '../cvm-249-matriz-arkhe-2026-11-08.md': 'requisitos-supervisao.md',
    'backlog.json': 'escopo-tecnico.md',
    'riscos-decisoes.md': 'limites-tecnicos.md',
}
for original, target in mapping.items():
    text = (SRC / original).read_text(encoding='utf-8')
    text = text.replace('Arkhe–CVM', 'da proposta de auditoria')
    text = text.replace('fornecedor Arkhe', 'fornecedor')
    if original == 'aceite.md':
        text = re.sub(r'## Teste opcional de ancoragem\n.*?(?=## Critério de encerramento)', '', text, flags=re.S)
    for old, new in link_map.items():
        text = text.replace(f']({old})', f']({new})')
    text = text.replace(' Este documento usa os quatro eixos descritos pelo usuário, sem presumir inspeção do infográfico.', '')
    (DEST / target).write_text(text, encoding='utf-8')

shutil.copyfile(
    ROOT / 'output/pdf/one-pager-registros-verificaveis-rafael-oliveira.pdf',
    DEST / '01-apresentacao-tecnica.pdf',
)
shutil.copyfile(SRC / 'kpis-sre-medicao.json', DEST / 'kpis-sre-medicao.json')

(DEST / 'escopo-tecnico.md').write_text('''# Escopo técnico para avaliação

08/11/2026 | Proposta de integração, sem adoção ou implantação confirmada.

## Objetivo e arquitetura

Conferir conteúdo, ordem e assinaturas de registros fora do sistema de origem.
A fonte deve permitir enumerar o intervalo auditado. Integridade não substitui
reconciliação de completude.

Fonte experimental → coleta somente leitura → inbox durável e cursor →
reconciliação → diário e MMR → checkpoint híbrido → arquivos preservados →
consulta/exportação → auditor independente.

O ambiente e o acesso direto de supervisão devem ficar sob controle do cliente
ou da gestora. A auditoria não deve bloquear a escrita de negócio. O impacto das
leituras precisa ser medido.

## Entregas propostas após a descoberta

1. Adaptador para uma rede/fonte e um caso sintético definidos.
2. Persistência, idempotência, cursor, reconciliação e correções/reorgs.
3. Checkpoints e pacote com arquivos, manifesto e provas completas.
4. Consulta de operações, estados, metadados, cobertura e exportação.
5. Autorização em profundidade, credenciais exclusivas e trilha de acesso.
6. Verificador do perfil, recuperação, monitoramento e transferência operacional.

Essas funções ainda exigem desenvolvimento e homologação. Um dossiê demonstrado
não equivale a API de supervisão pronta. Perfis, bytes canônicos, confiança,
limites e fonte autoritativa devem ser acordados antes da implementação.

## Calendário e dependências

Descoberta: quatro semanas de 20 horas de equipe. Depois dela, reestimar
implantação, escala, responsabilidades e prazo. A referência inicial de oito
semanas de engenharia precisa ser replanejada para essa cadência e não é data
final contratada.

Identificar contratantes, gestora, rede, caso, acessos e calendário institucional.
Pactuar carga, suporte, RTO/RPO, retenção e custódia das chaves. Resolver geração
histórica de provas acima de 4.096 registros antes de liberar escala comercial.

Os IDs D01–D15 citados no pacote são decisões pendentes; D15 corresponde à prova
histórica. B03/B04: contratos e arquitetura; B07: reconciliação; B08/B10:
evidências e provas; B11/B12/B14: API e acesso; B16: privacidade; B18: carga;
B19: auditor independente. São itens de planejamento, não trabalhos concluídos.

Consulte [descoberta](descoberta-80h.md), [aceite](aceite.md),
[KPIs](kpis-sre.md) e [limites](limites-tecnicos.md).
''', encoding='utf-8')

(DEST / 'limites-tecnicos.md').write_text('''# Limites técnicos e decisões de confiança

08/11/2026 | Resultados locais e proposta, sem certificação de produção.

Há primitivas locais de conteúdo, MMR, checkpoints híbridos e conferência offline.
Um dossiê de dez arquivos e um manifesto foi verificado, com rejeição de alteração,
remoção, reordenação, checkpoint adulterado e chave incorreta. Isso não equivale
a integração com eventos do mercado ou auditoria independente.

- O gerador local de provas MMR aceita até 4.096 registros acumulados. Selar a
  cada 1.000 não elimina o limite. Nós persistentes/provas históricas exigem projeto.
- Provas precisam de índice, contagem, irmãos e outros picos no perfil correto.
  Registro, folha e raiz têm funções e domínios distintos.
- O pacote precisa do checkpoint assinado completo e de confiança recebida por
  canal independente. Chave dentro do pacote não autentica identidade humana.
- ML-DSA-65 e Ed25519 são assinaturas híbridas, não agregadas. Não há comprovação
  de hardware seguro ou validação de StrongBox/TPM no escopo demonstrado.
- Um perfil novo de eventos exige integração e testes próprios, inclusive em WASM.
- Separar evento canônico da própria prova evita circularidade do compromisso.
- Completude requer fonte enumerável e reconciliação. MMR não prova evento omitido
  antes da coleta nem define por si só consistência/disponibilidade distribuída.
- Idempotência preserva identidade lógica; para checkpoint selado, recuperar bytes
  salvos. Nova assinatura não precisa repetir os mesmos bytes para ser válida.
- Logs append-only pela aplicação não são imutáveis contra administrador.
- Arquivo ausente impede conferir conteúdo; bytes divergentes são rejeitados.
  A prova não comprova verdade, identidade humana ou integridade de hardware.

## Primeiro ensaio proposto

IDs sintéticos estáveis por caso; namespace novo por caso, sem rotação por sessão.
Selagem a cada 60 segundos ou 1.000 registros novos, sem checkpoint vazio.
Consulta informa prova pendente enquanto necessário. Retries com jitter e limites,
cursor durável, replay e reconciliação, sem promessa de zero overhead.

Rede e parceiros não foram definidos. Não há ponte multirrede no escopo inicial.
Leitura exclusiva deve existir na borda, aplicação, RPC e fonte; classe de conexão
não é autorização institucional. Medir lag, backlog, divergência e selagem
separadamente, com qualidade de relógio declarada.

Nenhum serviço, acesso ao ambiente do destinatário ou SLA foi ativado.
''', encoding='utf-8')

themes = [
    ('M01', 'Legitimidade, admissão e adesão'),
    ('M02', 'Arquitetura e plano de testes'),
    ('M03', 'Controles e governança'),
    ('M04', 'Conexão e credenciais exclusivas'),
    ('M05', 'Leitura integral em tempo real'),
    ('M06', 'Consulta e extração estruturada'),
    ('M07', 'Integridade, tempo e reconstrução'),
    ('M08', 'Continuidade e suporte'),
    ('M09', 'Supervisor exclusivamente leitor'),
    ('M10', 'Acesso direto e documentação'),
    ('M11', 'Segregação de produção'),
    ('M12', 'Dados e recursos fictícios'),
    ('M13', 'Privacidade, identificação e sigilo'),
    ('M14', 'Resiliência e incidentes'),
    ('M15', 'Supervisão e rastreabilidade'),
    ('M16', 'Relatórios e governança off-chain'),
    ('M17', 'Sigilo, divulgação e publicidade'),
    ('M18', 'Calendário e encerramento'),
]
requirements = '''# Referências de supervisão: mapa de trabalho

08/11/2026 | Avaliação técnica preliminar, sem comprovação de atendimento.

Os IDs mantêm a rastreabilidade dos testes e KPIs. A base normativa e as referências
por artigo estão na matriz de planejamento original; prevalece a
[Resolução CVM 249/2026](https://conteudo.cvm.gov.br/export/sites/cvm/legislacao/resolucoes/anexos/200/resol249.pdf).
Gestora, rede, prazos e condições institucionais exigem confirmação.

| ID | Tema a demonstrar |
|---|---|
'''
requirements += '\n'.join(f'| {key} | {theme} |' for key, theme in themes)
requirements += '''

Pacote ou prova criptográfica não substitui leitura integral, atualidade,
retenção e continuidade. Cada tema precisa de evidência no ambiente escolhido.
Não se presume participação do projeto ou do destinatário no programa.

Consulte [aceite](aceite.md), [escopo](escopo-tecnico.md) e [KPIs](kpis-sre.md).
'''
(DEST / 'requisitos-supervisao.md').write_text(requirements, encoding='utf-8')

(DEST / 'README.md').write_text('''# Material para avaliação técnica e comercial

Preparado por Rafael Oliveira para a equipe do Mercado Bitcoin.
Versão de entrega: 08/11/2026.
ORCID declarado: 0009-0005-2697-4668, sem autenticação de titularidade.

## Ordem sugerida de leitura

1. [Apresentação de uma página em PDF](01-apresentacao-tecnica.pdf).
2. [Descoberta técnica de 80 horas](descoberta-80h.md).
3. [Escopo técnico](escopo-tecnico.md) e [limites](limites-tecnicos.md).
4. [KPIs SRE](kpis-sre.md) e [modelo de medição](kpis-sre-medicao.json).
5. [Testes de aceite](aceite.md) e [referências de supervisão](requisitos-supervisao.md).
6. [Proposta comercial por assinatura](proposta-comercial-saas.md).

Inclui [versão editável da apresentação](one-pager.md).

## Estado do material

Proposta para avaliação, não contrato, software pronto para produção ou prova de
atendimento regulatório. Não há adoção, parceria ou acesso à infraestrutura do
destinatário confirmados. Metas e preços são hipóteses; escala operacional depende
de desenvolvimento e homologação. Datas comerciais devem ser revalidadas antes de aceite.

O pacote não inclui chaves, credenciais, custos internos, código-fonte ou registros
de publicação externa. Não foi enviado automaticamente ao destinatário.

## Integridade e próximo passo

manifest.json e SHA256SUMS.txt permitem conferir os arquivos listados. Não são
assinatura digital nem autenticação do autor. Para detectar substituição maliciosa,
obter o digest esperado do ZIP por canal confiável separado; ele também é entregue
no arquivo .zip.sha256 externo ao pacote.

Próximo passo sugerido: validar interesse, interlocutores e escopo da descoberta
antes de contratar implantação ou assinatura.
''', encoding='utf-8')

checked = 0
for file in DEST.glob('*.md'):
    text = file.read_text(encoding='utf-8')
    assert 'R$ 244.440' not in text
    assert 'precificacao-interna' not in text
    assert 'arkhe' not in text.lower(), file.name
    assert 'testnet' not in text.lower(), file.name
    for link in re.findall(r'\]\(([^)]+)\)', text):
        if link.startswith('http'):
            continue
        target = (file.parent / link.split('#')[0]).resolve()
        assert target.is_relative_to(DEST.resolve()) and target.is_file(), (file.name, link)
        checked += 1

for file in DEST.glob('*.json'):
    json.loads(file.read_text(encoding='utf-8'))

files = []
for file in sorted(DEST.iterdir()):
    if file.is_file():
        files.append({'path': file.name, 'size_bytes': file.stat().st_size,
                      'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
manifest = {'delivery': 'proposta-tecnologia-evidencias-mercado-bitcoin',
            'prepared_at': datetime.now(timezone.utc).isoformat(),
            'status': 'PROPOSAL_FOR_REVIEW_NOT_SENT', 'files': files,
            'note': 'Manifest and checksum list excluded from their own inventory.'}
(DEST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(DEST / 'SHA256SUMS.txt').write_text(''.join(f"{item['sha256']}  {item['path']}\n" for item in files), encoding='utf-8')

archive = DEST.with_suffix('.zip')
assert not archive.exists()
with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as output:
    for file in sorted(DEST.iterdir()):
        output.write(file, 'entrega-mercado-bitcoin/' + file.name)
with zipfile.ZipFile(archive) as result:
    assert result.testzip() is None
    assert len(result.namelist()) == len(files) + 2
    for item in files:
        data = result.read('entrega-mercado-bitcoin/' + item['path'])
        assert hashlib.sha256(data).hexdigest() == item['sha256']
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(checksum + '  ' + archive.name + '\n')
print(json.dumps({'zip': str(archive), 'files': len(files) + 2,
                  'links_checked': checked, 'size_bytes': archive.stat().st_size,
                  'sha256': checksum, 'sent': False}, ensure_ascii=False))
