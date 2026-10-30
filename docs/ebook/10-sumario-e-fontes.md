---
title: 'Arkhe: Evidence and Governance for AI Agents'
subtitle: 'Sumário completo e bibliografia de trabalho'
lang: pt-BR
date: '22 de outubro de 2026'
---

# Sumário completo e fontes selecionadas

A edição em inglês mantém **17 capítulos, seis partes e quatro apêndices**.
Os títulos abaixo estão em inglês; as notas editoriais estão em português.
Os capítulos 1–3 foram redigidos em inglês americano, com fontes e preliminares,
em [Part I](manuscrito/00-part-i.en.md). Os capítulos 4–7 estão em
[Part II](manuscrito/00-part-ii.en.md). O capítulo 7 também possui amostra separada
em português e inglês. Os capítulos 8–11 estão em [Part III](manuscrito/00-part-iii.en.md).
Os capítulos 12–14 estão em [Part IV](manuscrito/00-part-iv.en.md).
Os capítulos 15–17 estão em [Part V](manuscrito/00-part-v.en.md).
A edição completa ampliada reúne os 17 capítulos e quatro apêndices; ver
[entrega e verificações](18-complete-edition.md). O aceite editorial para publicação permanece pendente.

## Como as fontes foram escolhidas

Prioridade: especificação do organismo responsável; publicação dos pesquisadores
originais; documentação do mantenedor; relato técnico do próprio operador.
Autoridade, aderência ao tema, estabilidade de versão e limites explícitos foram
os critérios de seleção. “Melhores” significa mais adequadas à fundamentação
deste livro, não um ranking absoluto de literatura.

Cada fonte cumpre uma função: normas definem contratos; pesquisa explica métodos;
documentação orienta uso; código/testes locais sustentam afirmações sobre Arkhe.
Nenhuma fonte externa certifica que o Arkhe implementa corretamente seu conteúdo.
As páginas foram pesquisadas/consultadas em 22/10/2026. A consulta é bibliográfica,
não auditoria integral de todas as demonstrações e implementações citadas.

## Preliminares

- Title Page.
- Copyright, Credits, and AI Content Disclosure.
- Preface: Who This Book Is For.
- How to Use This Book.
- Repository Version, Reproduction, and Evidence Labels.

Explicar pré-requisitos, convenção de afirmações, fontes de confiança, versões e
diferença entre exemplo sintético e execução real. Autoria e licença continuam
a definir; não preencher expediente com nomes ou direitos presumidos.

## Part I — The Verification Problem

### 1. When Logs Are Not Enough

**Pergunta:** que evidência precisamos conservar para investigar uma ação?

Tópicos: logs, métricas e traces; declarações de sucesso; diferença entre registrar
um evento e verificar uma propriedade; cenário fictício de autorização indevida;
perguntas de auditoria e critérios de aceite.

**Entrega:** mapa de evidência de um workflow.  
**Fontes:** R01, R03 e R04.  
**Arkhe:** `docs/SECURITY-MODEL.md`, `docs/STATUS.md`.

Não descrever observabilidade como inútil: ela complementa verificação e operação.

### 2. Evidence, Trust, and Accountability

**Pergunta:** quem afirma o quê, com qual autoridade e sob quais hipóteses?

Tópicos: modelo de ameaça; produtor, host, revisor e executor; identidade de
conteúdo versus identidade do emissor; autenticidade, integridade e frescor;
base de confiança e fronteiras de responsabilidade.

**Entrega:** modelo de ameaça e tabela de autoridades.  
**Fontes:** R01, R03, R06 e R10.  
**Arkhe:** `docs/SECURITY-MODEL.md`, `kernel/arkhe-core/src/evidence.rs`.

### 3. Governance Without Certification Claims

**Pergunta:** como transformar gestão de risco em controles verificáveis?

Tópicos: GOVERN, MAP, MEASURE e MANAGE; perfil de IA generativa; donos de controles;
papéis, classificação e contexto regulatório; inventário de evidência;
revisão humana e tratamento de incidentes.

**Entrega:** matriz orientativa de risco, controle, evidência e responsável.  
**Fontes:** R01, R02, R03 e R16.  
**Arkhe:** `governance/arkhe-governance`, `docs/MATURITY-CRITERIA.md`.

O AI RMF é voluntário. A aplicabilidade legal precisa de análise própria; nenhuma
fonte exige adotar Arkhe ou transforma um log em certificação de conformidade.

## Part II — The Arkhe Architecture

### 4. Mapping the Arkhe Environment

**Pergunta:** onde residem autoridade, evidência e execução?

Tópicos: kernel, cognição, governança, WormGraph, storage e runtime; core de
verificação e adapters; workspace principal versus AGI; direção das dependências;
proposta, admissão, autorização e efeito.

**Entrega:** diagrama de camadas e mapa de autoridades por componente.  
**Fontes:** código e documentação locais como fonte principal; R03/R10 como contexto.  
**Arkhe:** `README.md`, `docs/ARCHITECTURE.md`, `config/architecture.json`.

O diagrama deve distinguir ligações conceituais de integrações operacionalmente testadas.

### 5. Identities That Survive Transport

**Pergunta:** como duas implementações identificam os mesmos objetos?

Tópicos: WorkIntent, WER, RequestIdentity e OperationId; projeção canônica;
codificação determinística CBOR; domínios de hash; Ed25519; vetores independentes
e incompatibilidades de perfil.

**Entrega:** exercício de codificação/digest e adulteração de campos.  
**Fontes:** R05, R06 e R07.  
**Arkhe:** `kernel/arkhe-core/src/{work,worker,canonical,digest}.rs`,
`kernel/arkhe-core/tests/golden_vectors.rs`.

Usar a seção 4.2 da RFC 8949 para estudar codificação determinística; um perfil
Arkhe ainda exige regras próprias. Não alegar assinatura híbrida ou replay de
inferência com base apenas em determinismo de bytes.

### 6. WormGraph and Verifiable Inclusion

**Pergunta:** o que uma prova de inclusão realmente estabelece?

Tópicos: envelopes, pais e persistência; MMR e perfil congelado; checkpoint
retido independentemente; pertencimento versus posição; inclusão versus
consistência; fork, cronologia e dados ausentes.

**Entrega:** prova offline com checkpoint confiável e contraexemplos.  
**Fontes:** R08, R09 e R10 para fundamentos/comparação de logs; perfil Arkhe para MMR.  
**Arkhe:** `docs/MMR-PROFILE.md`, `specs/mmr/spec/mmr-profile-v1.md`,
`verification/crates/arkhe-verify-core/src/mmr`.

RFC 6962/9162 especificam Certificate Transparency, não o MMR do Arkhe.
Não substituir o contrato executável local por regras de uma árvore diferente.

### 7. From Output to Authorization

**Pergunta:** como conferir uma propriedade de saída antes da autorização?

Tópicos: certificado aritmético finito; BudgetInput/BudgetSpec/BudgetProof;
produtor e checker independentes; compromissos de política, intenção e WER;
integração opt-in; testes negativos; limites da conclusão.

**Entrega:** laboratório `budget_pco`, com saída registrada e rejeições.  
**Fontes:** R12 para a linhagem conceitual de proof-carrying code; implementação
local para o certificado específico.  
**Arkhe:** `docs/PROOF-CARRYING-BUDGET.md`,
`kernel/arkhe-kernel/examples/budget_pco.rs`,
`verification/crates/arkhe-verify-core/src/output_proof.rs`.

**Estado:** [amostra em inglês](manuscrito/07-from-output-to-authorization.en.md)
concluída. PCC histórico e PCO desta amostra não são sistemas equivalentes;
nenhuma referência demonstra prova geral de correção de LLM.

## Part III — Implementation

### 8. Integrating the ContainmentGate

**Pergunta:** como exigir evidência sem permitir caminhos alternativos permissivos?

Tópicos: PolicyBinding, resolver, admissão, EvidenceReader; ações protegidas;
erro fechado; review humano; parada de emergência; entradas do gate e testes
contra bypass.

**Entrega:** integração de um resolver com testes de aceitação e rejeição.  
**Fontes:** R03 como referência de riscos; código local como contrato.  
**Arkhe:** `kernel/arkhe-kernel/src/lib.rs`,
`kernel/arkhe-kernel/tests/rejection_gates.rs`,
`governance/arkhe-governance/src`.

### 9. Operation Identity and External Effects

**Pergunta:** como tratar retries, crash e resultado externo desconhecido?

Tópicos: identidade antes do dispatch; parâmetros vinculados; reserva durável;
estados do journal; leases/fencing; transação e outbox; idempotência do destino;
reconciliação; limites de promessas de exactly-once.

**Entrega:** tabela de estados e exercícios de falha em pontos do fluxo.  
**Fontes:** R13 e R14.  
**Arkhe:** `kernel/arkhe-core/src/work.rs`,
`kernel/arkhe-kernel/src/broker_sqlite.rs`,
`integration/arkhe-bugbounty/src/journal.rs`, `docs/ACTION-BROKER.md`.

### 10. Building an Evidence Adapter

**Pergunta:** como admitir e reter evidência sem atribuir autoridade ao transporte?

Tópicos: autenticação de origem; WER e envelope; política e causalidade;
atomicidade; armazenamento append-only e seus limites; RLS; esquema/versão;
entrada malformada e orçamento de recursos.

**Entrega:** contrato de adapter, registro persistente e testes negativos.  
**Fontes:** R05, R10 e R14.  
**Arkhe:** `kernel/arkhe-core/src/evidence.rs`, `evidence/arkhe-wormgraph`, `storage/sql`.

Não descrever RLS como proteção contra todo administrador do banco. Não afirmar
transporte PgWormGraph de BudgetProof como implementado nesta edição.

### 11. Verification on the Client

**Pergunta:** quais decisões um verificador offline pode tomar?

Tópicos: core Rust e WASM; bindings; inputs não confiáveis; raízes retidas pelo
cliente; checkpoint; relógio e revogação; paridade de vetores nativos/WASM;
limites do sandbox.

**Entrega:** fluxo de verificação cliente e matriz de dependências externas.  
**Fontes:** R06, R08, R10 e R15.  
**Arkhe:** `verification/README.md`,
`verification/crates/arkhe-verify-wasm/src/lib.rs`, `integrations/verify-mcp`.

Verificação bem-sucedida não concede autoridade. WASM não elimina confiança no
runtime, nas bibliotecas, nas importações ou nos dados fornecidos pelo host.

## Part IV — Governance and Economics

### 12. Admission Policies and Trust Lifecycles

**Pergunta:** quem controla as regras e como elas mudam com segurança?

Tópicos: requisitos por operação; chaves confiáveis; rotação/revogação;
versionamento e digest da política; expiração; review; separação de poderes;
mudança de regra durante lookup.

**Entrega:** política versionada e plano de ciclo de vida da confiança.  
**Fontes:** R01, R03, R06 e R10.  
**Arkhe:** `governance/arkhe-governance`,
`docs/security/TRUST-LIFECYCLE-2026-10-18.md`,
`docs/security/PRODUCTION-BOUNDARY-2026-10-18.md`.

### 13. Conflicts, Equivocation, and Adjudication

**Pergunta:** quando duas declarações realmente constituem evidência de equivocação?

Tópicos: retry legítimo versus conflito; autoridade, slot, epoch e namespace;
declarações incompatíveis autenticadas; checkpoint bifurcado; retenção de evidência;
processo de contestação e política de penalidade.

**Entrega:** contrato proposto de evidência e critérios de adjudicação.  
**Fontes:** R08/R09 para logs e R06 para assinaturas; sem inferir política econômica.  
**Arkhe:** `docs/backlog/BACKLOG.md`, itens 6.1–6.4,
`integration/arkhe-depin/README.md`.

Este capítulo não promete SlashingEngine operacional. Divergência local não basta
para provar má-fé ou autorizar movimentação de fundos.

### 14. Auditable Costs and Unit Economics

**Pergunta:** quanto custa um resultado útil, considerando toda a operação?

Tópicos: unidades e micro-USD; custos declarados versus medidos; origem do meter;
computação, armazenamento, verificação e revisão; retries; amortização;
orçamento por operação; ledger e overflow.

**Entrega:** modelo de custo por resultado e protocolo de coleta.  
**Fontes:** R17 e R13.  
**Arkhe:** `agi-coder/crates/agi-coder-cost/src/lib.rs`,
`docs/backlog/BACKLOG.md`, item 15.1.

CostTracker recebe valores fornecidos; o campo measured não autentica a medição.
Não prometer preços de serviço ou economias sem medição reproduzível.

## Part V — Use Cases

### 15. Code Agents: From Proposal to Release

**Pergunta:** como vincular uma mudança à autorização e à evidência do build?

Tópicos: mandato e escopo; sessão/patch; revisão e testes independentes;
proveniência de build; identidade de artefato; assinatura e transparência;
aprovação de release e reconciliação de deployment.

**Entrega:** laboratório de proposta/review/release com fronteira explícita de execução.  
**Fontes:** R10 e R11.  
**Arkhe:** `docs/JULES-COMPLETION.md`,
`agi-coder/crates/agi-coder-jules`, `docs/PREVIEW-EXECUTION.md`, `integrations/cosign`.

Proveniência assinada não garante ausência de vulnerabilidades. A documentação
de um framework de segurança não atribui automaticamente um nível de qualificação
ao Arkhe; os requisitos precisam ser avaliados na implementação.

### 16. DePIN Without Leaps of Trust

**Pergunta:** o que muda entre normalizar um recibo e verificar execução remota?

Tópicos: DTO sintético de recibo de computação distribuída; normalização;
commitments e prova composta;
assinatura de árbitro; checkpoint independente; computação versus identidade
física da GPU; TEE e limites da evidência opaca; requisitos de interoperabilidade.

**Entrega:** laboratório do adapter existente e checklist de integração real.  
**Fontes:** R18 e R08 para comparação conceitual de verificação/inclusão.  
**Arkhe:** `integration/arkhe-depin/README.md`,
`integration/arkhe-depin/src/adapters/gensyn.rs`,
`integration/arkhe-depin/tests/portable_proof_composite.rs`.

A fonte R18 descreve o sistema do fornecedor. Não autentica a fixture local,
não valida o DTO proposto e não comprova interoperabilidade real do Arkhe.
Redes externas de armazenamento e conectividade permanecem fora do tutorial implementado.

### 17. Content Provenance and Authenticity

**Pergunta:** quais afirmações de proveniência podem acompanhar conteúdo?

Tópicos: claim, assertion, manifest e binding; emissor e raiz confiável;
assinaturas; limites da autenticidade; perfil Arkhe versus a especificação de
proveniência identificada em R19;
validação padrão e validação parcial.

**Entrega:** mapa entre claim local e requisitos de interoperabilidade.  
**Fontes:** R19 e R06.  
**Arkhe:** `verification/crates/arkhe-verify-core/src/c2pa`,
`verification/crates/arkhe-verify-wasm/src/lib.rs`.

Proveniência não estabelece verdade factual. O perfil local de assinatura Arkhe
não deve ser apresentado como validação completa dos padrões de proveniência e assinatura de conteúdo.

## Part VI — Appendices

**A. Glossary and Counterexamples.** Termos, distinções e exemplos de conclusões
indevidas: digest/identidade, assinatura/verdade, inclusão/consistência,
autorização/execução, retry/equivocação.

**B. Types, Profiles, and Versioned Contracts.** WER, WorkIntent, EvidenceEnvelope,
PolicyBinding, BudgetProof, OperationId, perfis MMR e diferenças de workspace.

**C. Implementation and Operations Checklist.** Identidade, proveniência,
admissão, gate, executor, journal, retenção, revisão, rotação e recuperação.

**D. References, Reproduction, and Evidence Ledger.** Fontes com versão, manifest
do código, comandos, saídas e escopo dos testes.

## Bibliografia prioritária

### R01 — NIST AI Risk Management Framework

[NIST — AI RMF](https://www.nist.gov/itl/ai-risk-management-framework).
Base para organizar gestão de risco e responsabilidades. Fonte institucional
primária e pública. Uso voluntário; não certifica a implementação.

### R02 — NIST AI 600-1, Generative AI Profile

[NIST — Generative Artificial Intelligence Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence).
Complementa a gestão de risco com o contexto de IA generativa. Preferir a
publicação final de 2024 ao draft de consulta pública de abril de 2024.

### R03 — OWASP Top 10 for Agentic Applications, 2026

[OWASP — Top 10 for Agentic Applications](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/).
Referência de ameaças específicas de aplicações agentivas. Serve para construir
cenários negativos, não como prova de cobertura completa ou ranking estatístico
de incidência no Arkhe.

### R04 — Google SRE Workbook: Monitoring

[Google — Monitoring](https://sre.google/workbook/monitoring/).
Relato técnico do operador para o papel de métricas, logs e tracing. Ajuda a
apresentar observabilidade e verificação como funções complementares.

### R05 — RFC 8949: CBOR

[RFC Editor — RFC 8949](https://www.rfc-editor.org/rfc/rfc8949.html).
Referência normativa para CBOR, incluindo codificação determinística.
As restrições de cada perfil Arkhe continuam explicitadas no repositório.

### R06 — RFC 8032: EdDSA

[RFC Editor — RFC 8032](https://www.rfc-editor.org/rfc/rfc8032.html).
Referência para Ed25519/EdDSA. Não define distribuição de confiança, revogação ou
o significado de uma declaração assinada.

### R07 — BLAKE3: Specification, Analysis, and Design Rationale

[BLAKE3 authors — BLAKE3-specs](https://github.com/BLAKE3-team/BLAKE3-specs).
Fonte dos autores sobre o hash. O esquema de domínios e preimages dos objetos
Arkhe precisa ser documentado separadamente.

### R08 — RFC 9162: Certificate Transparency Version 2.0

[RFC Editor — RFC 9162](https://www.rfc-editor.org/rfc/rfc9162.html).
Fundamentos de inclusão, consistência e logs de transparência. Documento
experimental de CT; não é uma especificação normativa do WormGraph/MMR.

### R09 — RFC 6962: Certificate Transparency

[RFC Editor — RFC 6962](https://www.rfc-editor.org/rfc/rfc6962.html).
Referência histórica necessária para perfis locais que usam RFC 6962.
É obsoletada por RFC 9162, mas citar a revisão nova não muda protocolos já
implementados; identificar sempre a revisão efetivamente usada.

### R10 — Sigstore: Overview and Security Model

[Sigstore — Overview](https://docs.sigstore.dev/about/overview/) e
[Security Model](https://docs.sigstore.dev/about/security/).
Documentação dos mantenedores sobre identidades, assinaturas e transparência.
Referência para delimitar o que é confiado na ponte Cosign/Sigstore.

### R11 — SLSA 1.2: Provenance

[SLSA — Provenance](https://slsa.dev/spec/v1.2/provenance).
Especificação versionada para organizar proveniência de build e seus requisitos.
Usar a trilha/predicado correspondente ao artefato; não confundir versão do
framework com versão do predicateType ou atribuir nível sem avaliação.

### R12 — Proof-Carrying Code: Research Foundations

[George Necula — tese na CMU](https://www.cs.cmu.edu/~rwh/students/necula.pdf) e
[Andrew Appel — Foundational Proof-Carrying Code](https://www.cs.princeton.edu/~appel/fpcc.html).
Pesquisa original para explicar produtor não confiável e checker. É fundamento
conceitual, não validação formal do certificado aritmético do Arkhe.

### R13 — Amazon Builders' Library: Idempotent APIs

[AWS — Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/).
Relato de engenharia do operador para identidade de requisição, retries e
tratamento de intenção. Não estabelece efeito único em todo destino externo.

### R14 — PostgreSQL: Row Security Policies

[PostgreSQL 18 — Row Security Policies](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).
Documentação oficial versionada para políticas e exceções de RLS. Conferir a
versão do banco usado em cada exemplo antes da redação final.

### R15 — WebAssembly: Security

[WebAssembly — Security](https://webassembly.org/docs/security/).
Documentação oficial sobre isolamento e relação com o host. O escopo não é prova
de ausência de bugs no runtime nem de correção da aplicação hospedada.

### R16 — AI Act: Legislation and Official Implementation Guidance

[Regulation (EU) 2024/1689 — EUR-Lex](https://eur-lex.europa.eu/eli/reg/2024/1689/oj),
[Comissão Europeia — AI Act](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai) e
[Navigating the AI Act](https://digital-strategy.ec.europa.eu/en/faqs/navigating-ai-act).
Priorizar a legislação e suas alterações para alegações legais. A abertura direta
do EUR-Lex nesta pesquisa encontrou uma verificação de navegador: o articulado
não foi auditado aqui. As páginas da Comissão foram localizadas para orientação;
datas, exceções e alterações precisam ser conferidas na versão legal aplicável
ao fechamento da edição.

### R17 — FinOps Foundation: Unit Economics

[FinOps Foundation — Unit Economics](https://www.finops.org/framework/capabilities/unit-economics/).
Referência do mantenedor para relacionar custos a unidades de valor. Não fornece
um benchmark de custo nem transforma valores declarados no ledger em medição.

### R18 — Gensyn: Verde

[Gensyn — Verde: verifying ML training on untrusted nodes](https://www.gensyn.ai/research/verde-a-verification-system-for-machine-learning-over-untrusted-nodes) e
[Verde Verification System in Production](https://www.gensyn.ai/research/verde-verification-system-in-production).
Pesquisa/documentação do produtor sobre a abordagem de verificação. Evidência
do sistema Gensyn não constitui evidência de integração Arkhe com esse sistema.

### R19 — C2PA Technical Specification 2.4

[C2PA — Technical Specification 2.4](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html).
Especificação versionada para estudar claims, manifests e validação. Versão de
referência selecionada, sem alegação de ser a mais recente ou de que o Arkhe a
implementa integralmente.

## Fontes e tarefas ainda necessárias antes da edição final

- Fixar commit/tag do Arkhe e versões das dependências em cada laboratório.
- Conferir erratas dos RFCs e revisão das especificações utilizadas.
- Ler integralmente e fichar as seções que sustentarem afirmações detalhadas.
- Obter e autenticar recibo/schema upstream antes de alegar integração Verde real.
- Rever artigos legais e alterações aplicáveis antes de associar controles a obrigações.
- Selecionar literatura específica de adjudicação se o capítulo 13 avançar para
  desenho de sanções: logs e assinaturas, isoladamente, não bastam.
- Preservar [matriz técnica](03-matriz-tecnica.md),
  [fontes comerciais anteriores](05-fontes.md) e [registro de reprodução](06-validacao.md)
  como documentos separados da bibliografia técnica.

Este sumário detalha o plano de 53.000 palavras já existente; não altera o
orçamento nem expande a promessa para integrações ausentes. Cada capítulo deve
terminar com exercício, resultado esperado, rejeição relevante e limites.
