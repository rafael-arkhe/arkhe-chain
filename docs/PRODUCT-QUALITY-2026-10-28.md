# Campanha de qualidade do produto — 28/10/2026

Escopo: workspace Rust da raiz e Arkhe-Intra, com dados sintéticos, SQLite
temporário e PostgreSQL 16 descartável. Jira e Mixpanel foram usados como
referências de critérios; não houve acesso a contas desses serviços, criação de
tickets ou envio de telemetria externa.

**Decisão: jornada funcional aprovada no ambiente local; campanha geral
reprovada para liberação integral pelos gates de arquitetura, dependências,
Clippy e formatação.** Os aplicativos auxiliares também tiveram seus testes
executados. Dois testes dependentes de Azure OpenAI permanecem não executados.

## Critérios de referência

- **Workflow e permissões:** estados, transições permitidas, identidade, versão
  atual e pré-condições, conforme o modelo documentado de
  [workflows do Jira](https://support.atlassian.com/jira-cloud-administration/docs/work-with-issue-workflows/).
- **Qualidade de eventos:** sequência do funil, ator, timestamp, associação ao
  documento, ausência de duplicação por replay e propriedades sem dados privados.
  Referências: [estratégia de tracking do Mixpanel](https://university.mixpanel.com/student/activity/3411661-building-a-tracking-strategy)
  e [contrato de ingestão de eventos](https://github.com/mixpanel/docs/blob/main/reference/import-events.mdx).
- **Aceite de produto:** interface real, navegação por teclado, acessibilidade
  automatizada, estado vazio, busca/filtro, segurança do texto, assinaturas,
  falhas externas, exportação, concorrência e recuperação.

Os testes do funil verificam os eventos locais de negócio. Não demonstram entrega
ao Mixpanel, identidade analítica entre dispositivos, retenção/coortes ou um SDK
de analytics instalado.

## Execuções

Os manifests e logs ficam em [evidence/2026-10-28-product-quality](evidence/2026-10-28-product-quality/).
As tentativas iniciais foram preservadas, inclusive o primeiro ensaio PostgreSQL
que encontrou a fixture desatualizada. Os resultados do fluxo principal abaixo
correspondem à execução final após as correções.

| Área | Resultado final |
|---|---|
| Intra | **106 testes aprovados**, nenhum ignorado; inclui os dois novos testes de qualidade |
| Matriz de permissões | 96 combinações em um teste, mais separação de signatários |
| Funil | Versão obsoleta, assinatura inválida e reenvio não duplicam eventos de transição |
| TypeScript | Aprovado |
| Produção Next | Build final aprovado; smoke HTTP com três assinaturas aprovado |
| MCP | 12 testes aprovados |
| E02 | 102 testes aprovados |
| Python | 329 testes aprovados |
| Rust da raiz | 469 aprovados, nenhum reprovado, 20 ignorados na rodada padrão |
| Integrações Rust | 18 desses 20 ignorados foram executados separadamente com sucesso; dois testes Azure continuam pendentes |
| Runtime com feature PostgreSQL | Dois testes adicionais aprovados após corrigir a fixture |
| Vetores | Contrato estático dos 10 vetores aprovado |
| Clippy da raiz | Reprovado por `large_enum_variant` em `cognition/arkhe-rag/src/decoder.rs:46` |
| Formatação Rust | `cargo fmt --all --check` reprovado em arquivos fora das correções desta campanha; nenhum formatador global foi aplicado |
| Arquitetura | Reprovado: registro de componentes, dependências de rebuild e lock de migrações |
| Dependências Node | 39 avisos: 17 altos, 19 moderados, 3 baixos, nenhum crítico |
| Dependências Rust | 7 avisos de vulnerabilidade no lockfile |
| Navegador | Jornada completa aprovada, sem erros JavaScript; cinco análises axe sem violações; desktop e mobile sem overflow horizontal |
| PostgreSQL real | Preview, fencing, encerramento forçado/rollback, RLS e regeneração aprovados em cluster descartável |
| Ponte nativa | Navegador → API → adaptador Rust → PostgreSQL → recibo aprovado; reinício e oito reenvios concorrentes preservam o recibo |
| pgvector/Kafka | Oito testes vetoriais, um de JWT/tenant, um híbrido, três de eventos e um de crash/recovery aprovados |
| Aplicativos auxiliares | 84 testes aprovados: Preflight/Melodic e suas APIs, health MCP, Chladni, Cosign e Solana Proof; nenhuma transação financeira real |

## Achados e encaminhamento

| ID | Prioridade | Achado | Encaminhamento |
|---|---|---|---|
| QA-001 | P1 | Workspace e inventário de arquitetura divergem; `arkhe-ask` usa migrações sem os gatilhos de rebuild exigidos pelo auditor | Reconciliar membros/camadas e registrar os inputs embutidos no build |
| QA-002 | P1 | `20261026000018_wormgraph_fencing.sql` está ausente do lock de migrações | Revisar e registrar a migração nova. Nenhum hash de migração já registrada divergiu |
| QA-003 | P1 | Auditorias de dependências identificam advisories | Triar por artefato distribuído, feature habilitada e caminho alcançável; atualizar com regressão. O scan não prova exploração no produto |
| QA-004 | P2, corrigido | Textos auxiliares e etapas do visor apresentaram contraste abaixo de 4,5:1 | Cores de cinco regras ajustadas para `#475569`, com especificidade no contador; cinco análises axe finais sem violações |
| QA-005 | P2, corrigido | O teste habilitado por `postgres-integration` ainda construía `request_identity` como `Digest32` | Fixture migrada para `RequestIdentity::new`; dois testes com PostgreSQL real aprovados |
| QA-006 | P2 | Clippy reprova o tamanho desigual das variantes de `ConstrainedDecoder` | Avaliar indireção para o matcher no módulo RAG e repetir Clippy/regressão; o lint não foi suprimido |
| QA-007 | P2 | Formatação global divergente em arquivos de governança, WormGraph e exemplos do runtime | Aplicar e revisar formatação em alteração própria, preservando o escopo funcional |

As diferenças de registro e os advisories foram preservados. A campanha não
altera hashes publicados para contornar um gate e não atualiza dependências em
massa sem verificar compatibilidade.

A consulta `cargo tree -i rsa` não encontrou RSA no grafo habilitado padrão;
esse aviso está no lockfile, sem comprovação de uso no artefato testado. Rustls
aparece em dependências ativas de HTTP/SQL. A triagem completa por target e feature
permanece pendente, assim como a análise de alcançabilidade dos advisories Node.

## Fluxo observado e recuperação

O ensaio no navegador criou um rascunho, editou para revisão 2, registrou essa
versão no kernel, assinou autoria/revisão/aprovação com três contas distintas,
confirmou bloqueio de publicação sem Rekor, exportou evidências, filtrou a
biblioteca e conferiu a tela móvel. O texto contendo uma tag `script` permaneceu
texto; não executou código. Conta revisora não conseguiu ler o rascunho privado.

Após reiniciar o processo nativo, o recibo e ambos os objetos canônicos
continuaram disponíveis byte a byte. Oito reenvios concorrentes produziram o
mesmo recibo. Requisições sem autenticação, ator substituído, tipo protegido e
WER com input alterado foram recusados.

O smoke final fez **30 leituras, concorrência 5, p50 30 ms e p95 35 ms**. Esses
tempos medem requisições locais pelo cliente de teste; não incluem toda a
experiência percebida no navegador e não estabelecem um SLO.

Os contêineres de PostgreSQL e Kafka desta campanha foram removidos após os
testes. As contas e chaves sintéticas do navegador ficaram em diretórios
temporários, fora dos dados reais do Intra. Os dois testes dependentes de Azure
OpenAI não foram executados; nenhum provedor de inferência pago foi chamado.
A VM `arkhe-runtime`, inicialmente desligada, foi desligada novamente após
confirmar que não restavam contêineres em execução.

Relatórios detalhados: [gates Rust](evidence/2026-10-28-product-quality/rust-results.json),
[gates Node](evidence/2026-10-28-product-quality/node-results.json),
[aplicativos auxiliares](evidence/2026-10-28-product-quality/aux-results.json),
[navegador final com ponte nativa](evidence/2026-10-28-product-quality/browser/report.json),
[PostgreSQL](evidence/2026-10-28-product-quality/postgres/report.json) e
[pgvector/Kafka](evidence/2026-10-28-product-quality/ask/report.json).
O log [final do Intra](evidence/2026-10-28-product-quality/node-intra-tests-final.log)
substitui a contagem inicial de 104 pela contagem final de 106 testes.

## Reprodução

```powershell
python scripts/quality_campaign.py --group rust --output docs/evidence/NOVA-EXECUCAO
python scripts/quality_campaign.py --group node --output docs/evidence/NOVA-EXECUCAO
python scripts/quality_campaign.py --group aux --output docs/evidence/NOVA-EXECUCAO
python -m unittest discover -s scripts/tests -p 'test_*.py'
python scripts/product_postgres_quality.py
python scripts/product_ask_quality.py
```

O ensaio PostgreSQL requer a máquina Podman `arkhe-runtime` iniciada, a imagem
local `postgres:16` e Playwright/axe já presentes em `ops/local/e02-browser-tools`.
O runner cria um contêiner com nome aleatório e label específica e remove apenas
esse contêiner ao terminar. Bancos, volumes e contas existentes não são usados
pelos ensaios destrutivos.

## Limites

Esta é uma campanha local de regressão e aceite com escopo declarado. Não é um
pentest, prova de cobertura exaustiva, teste de escala de produção, certificação
regulatória ou validação de todas as integrações externas. O smoke de leituras
concorrentes mede o ambiente local; não define capacidade ou SLO. Assinaturas,
integridade local e registro nativo de rascunho não concedem autoridade de
publicação protegida. Gates reprovados impedem declarar aprovação integral desta
campanha.
