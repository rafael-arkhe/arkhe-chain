# Visão geral

## O que é

`security-app/` é o **frontend de referência de uma plataforma horizontal de inteligência operacional e digital twin** — classe-Foundry, construída sobre o backend da AEGIS (`ontology-module`).

Nasceu (16-mai-2026) como **painel de segurança pública** e essas páginas de domínio seguem vivas e plenas. Mas o produto evoluiu para a casca onde se **materializam aplicações de qualquer domínio crítico** — condomínio, defesa, energia, agro, saúde, governo — a partir da **ontologia**, sem que o domínio seja escrito no código. A segurança pública passou a ser **uma projeção** dessa plataforma, não o teto dela.

São duas camadas:

1. **Plano de controle horizontal** — primitivos genéricos: ontologia (object types, instâncias, grafo), dados (datasets, pipelines, lineage, timeseries), ações e funções, **AIP** (Arquiteto, IDE, modalidades, Autopilot, Pilots, Solution Designer), Workshop de apps, agentes, conectores e governança.
2. **Apps de domínio materializados** — projeções finas e type-safe da ontologia, geradas pelo **AIP Arquiteto**, consumidas por **operadores** (abas no app) e por **público externo** (link `/m/{token}` sem login).

> Paridade com Foundry medida em **~85/100** (scorecard `aegis-vs-foundry-2026-06.md`).

## A capacidade-âncora: gerar aplicações a partir da ontologia

O coração do produto é o **AIP Arquiteto**: um orquestrador multiagente (Coordenador → N agentes de módulo em paralelo → Montador) que, de uma frase do operador, monta um blueprint **Coleta → Processamento → Ontologia → Aplicação** e o **materializa de forma atômica** em tipos, relações, Logic Functions, ActionTypes, agentes, páginas e salas. O app gerado é **RODÁVEL**: os widgets disparam agentes e ações reais (não maquetes).

## O que o painel oferece (resumo)

1. **Busca unificada + ficha customizável por tipo** de objeto
2. **Explorador** (drill-down em grandes conjuntos, respeitando RowPolicy + máscara de propriedade)
3. **Análise de vínculos** (rede / network analysis)
4. **Mapa operacional** (widget genérico ligado a object set — heatmap, geofence, tracking)
5. **Vídeo / CCTV / FMV** com overlays de IA (LPR, face-match)
6. **Visão computacional → georreferência → mapa** (contagem/segmentação → pinos OntologyNode)
7. **Caixa de alertas** + **alarmes duráveis** que disparam ações reais
8. **Briefings** e **relatórios** com dados vivos
9. **Workshop** de apps com Variables Engine, Carbon Composer e ~17 widgets genéricos
10. **Governança** completa — classificação (LAI), marcações (inclusive por propriedade), CBAC, RowPolicy, auditoria de leitura, apagamento LGPD, retenção/TTL
11. **Superfície pública** `/m/{token}` para morador/visitante/paciente/cidadão

## Régua-mestra: multidomínio, zero vertical no código

> **Teste de toda decisão:** "Mineração / saúde / energia herdariam isto de graça?" Se não, está errado.

- O domínio **vem da ontologia** (gerada pelo AIP), **nunca** de tabela/model/perm/serviço de vertical hardcoded.
- A plataforma é um conjunto de **primitivos horizontais** (Ação, Function, Marking, RowPolicy, Connector, Insight) com permissões genéricas.
- **TUDO é widget genérico** — sem "template por caso/domínio". O externo em `/m/{token}` é a **mesma engine de widgets** do operador, escopada por token.
- Mapa **NUNCA** é página por caso — é widget genérico ligado a um object set.

## Duas audiências

| Audiência | Acesso | Superfície |
|---|---|---|
| **Operador interno** | Login + sessão | Abas do app, plano de controle, workshop |
| **Externo / público** | Link `/m/{token}` sem login | Widgets escopados por token (morador/visitante/paciente/cidadão) |

O externo **nunca** é aba do app.

## Para quem

Segurança pública é o primeiro vertical comprovado, mas a plataforma serve qualquer operação de infraestrutura crítica.

- Polícia Civil / Militar / Federal, Ministério Público (GAECO), Guarda Civil Municipal, centros integrados (CIOPS/CICC), sistema penitenciário
- E, por ser horizontal: condomínio (digital twin de portaria/cerca), energia, agro, saúde, governo

## Tenancy

**Um stack por cliente** (mesma estratégia comercial do `politicians-app`). Cada cliente/órgão recebe instância isolada — dados não atravessam tenants. Multi-tenancy via `.env` apontando para o `ontology-module` daquele cliente + headers `X-Tenant-Id` / `X-Use-Case` no `openclaw-gateway`. Dev-mode tem role vendor Safe Core + `allowed_domains` por tenant.

## Fora de escopo

- **Não é** sistema de Boletim de Ocorrência (consome BOs já registrados), nem sistema processual (consome metadados via DataJud), nem rádio operacional, nem CFTV de captura (consome streams existentes).
- **Não armazena prova original** — mantém referências, hashes e cadeia de custódia; mídia bruta no MinIO do `ontology-module`.
- **Não tem vertical no código** — domínio é dado da ontologia.

## Posicionamento vs. AEGIS e politicians-app

| Eixo | AEGIS | politicians-app | security-app |
|---|---|---|---|
| Público | Defesa / inteligência de estado | Pré-candidatos eleitorais BR | Segurança pública + qualquer domínio crítico |
| Natureza | Multi-domínio | Eleitoral | **Plataforma horizontal de digital twin** |
| Tenancy | Multi-tenant SaaS | Single-tenant por campanha | Single-tenant por cliente |
| Idiomas | pt-BR + en-US | pt-BR | **pt-BR default + en-US peer** |
| Branding | AEGIS visível | Próprio (eleitoral) | Próprio (nomenclatura original pt-BR) |
| Backend | ontology-module | reusa ontology-module | reusa ontology-module |

## Decisões fundadoras (16-mai-2026) e evoluções

1. Pasta na raiz do repo: `security-app/`
2. ~~Locale único: pt-BR~~ → **superado**: pt-BR é default, en-US é peer first-class via `useT()` (toda string visível traduzida)
3. Backend reaproveitado integralmente — **nenhum módulo Python novo** no `security-app/`
4. Agentes via `openclaw-gateway` existente (tenant por env); na UI aparecem **sempre como "AIP"**
5. Chrome isolado (sem sidenav AEGIS visível)
6. Sem mensageria operador↔operador (`/canais` descartado — comunicação por canais oficiais da corporação)
7. Sem citar marcas de terceiros nas strings (nomenclatura original em pt-BR; proibido Palantir/Gotham/Foundry/COV/Gaia/Dossier)

> Visão de produto consolidada e canônica: `.claude/product.md` na raiz do repo.
