# Auditoria do mapeamento dos 100 projetos para Arkhe

Data: 26/10/2026. Objeto: texto anexado pelo usuário, começando por “A lista de 100 projetos é um catálogo de portefólio”.

Atualização posterior à auditoria, na mesma data: foi implementado retrieval híbrido opt-in (BM25 + pgvector + RRF + overlap) sobre snapshot de textos de invariantes, com evidência de inclusão local. Este relatório preserva o estado examinado antes dessa implementação; ver [contratos e limites atuais](../HYBRID-INVARIANT-RETRIEVAL.md) e [resultados executados](../evidence/2026-10-26-hybrid-retrieval/RESULTS.md). A implementação não demonstra melhora geral em corpus real ou AGI.

## Parecer

O texto mistura implementação, especificação, reutilização de padrões e hipótese de arquitetura. Não sustenta as contagens finais nem o uso generalizado de `LEMMA`. Há componentes reais e testáveis, mas eles não demonstram os produtos de portfólio aos quais foram associados. Também há lacunas descritas como futuras que já possuem implementação local.

## Escopo e método

- Inspeção do workspace definido no `Cargo.toml`, fontes, testes, configuração operacional e documentação de fronteiras.
- Diretório examinado: `D:\arkhe`. A raiz não é um checkout Git (`git rev-parse --show-toplevel` falhou); portanto, este relatório não identifica um commit nem certifica ausência de alterações concorrentes.
- Cópias em `arkhe-aegis`, `archive`, `dist`, `releases`, `tmp`, dependências e produtos de build não foram usadas como prova de integração ao workspace principal.
- Ausência significa “não localizado no código/contratos examinados”, não impossibilidade de existir uma cópia histórica ou um equivalente com outro nome.
- O anexo não contém o catálogo original completo de 100 projetos. A existência de cinco temas fora daquele catálogo não pode ser verificada integralmente; só é possível avaliar o mapeamento fornecido.
- Nenhum serviço externo, implantação, publicação ou ambiente de produção foi alterado. Documentos e evidências anteriores são identificados como históricos; não substituem testes executados nesta auditoria.

## 1. Contagens corrigidas

| Conjunto do anexo | Linhas/etapas | IDs distintos |
|---|---:|---:|
| “Já são componentes” | 21 | 26 |
| “Pré-requisitos” | 8 | 9 |
| “Caminho crítico” | 7 | 9 |

Primeiro conjunto: `2, 3, 6, 12, 16, 20, 25, 30, 41, 43, 44, 45, 46, 47, 49, 53, 60, 63, 65, 67, 69, 80, 82, 84, 90, 99`.

Pré-requisitos: `20, 37, 51, 57, 60, 76, 77, 97, 98`. A interseção com o primeiro conjunto é `{20, 60}`.

Caminho crítico: `20, 25, 37, 51, 57, 60, 76, 77, 99`. Todos esses IDs já pertencem à união dos dois conjuntos anteriores. O caminho crítico não é uma terceira categoria disjunta.

A união tem **33 IDs**, deixando **67 IDs fora dessa união**, sem provar que sejam ortogonais. As faixas explicitamente chamadas de ortogonais no anexo abrangem **39 IDs**. Juntas, as tabelas classificam 72 IDs e deixam **28 sem classificação explícita**. “Restantes 64”, “restantes 93” e a soma `21 + 8 + 7 + 64` não constituem uma partição válida dos projetos.

## 2. Componentes alegadamente existentes

Os caminhos abaixo são relativos à raiz e permitem localizar a evidência. “Implementado” descreve o escopo local observado; não significa qualificado em produção.

| IDs / afirmação | Resultado | Evidência e limite |
|---|---|---|
| 2, 12 — RAG Chatbot / PDF QA | Parcial | `cognition/arkhe-rag/src/citation.rs` implementa `CitationVerifier`/`OverlapVerifier`; `apps/arkhe-ask/src/pipeline.rs` implementa retrieval → geração → verificação. Não demonstra ingestão/extração PDF completa. O verificador confere entidades e sobreposição lexical; não prova verdade factual nem entailment geral. Em `arkhe-rag/src/lib.rs`, `build_response` marca `grounded` apenas pela presença de citações: essa função isolada não executa o verificador. |
| 3, 30 — agente com tool calling / MCP | Parcial; associação incorreta | Ask tem pipeline RAG, não um loop genérico de tool calling demonstrado nesses arquivos. `integrations/mcp-server/src/index.js` é explicitamente health/metrics. Existe MCP real separado em `integrations/verify-mcp/src/index.ts`, com três ferramentas de verificação e limites explícitos de autoridade. |
| 6 — busca inteligente de documentos | Implementação delimitada | `apps/arkhe-ask/src/providers/pgvector.rs`: `PgVectorStore`, busca vetorial por tenant e `SET LOCAL hnsw.iterative_scan = relaxed_order`. Não equivale a uma plataforma completa de busca documental. |
| 16 — transcrição de reuniões | Não demonstrada pelo mapeamento | `kernel/arkhe-core/src/worker.rs` define registro de execução. Um WER pode registrar um worker, mas não implementa ASR, diarização ou resumo de reunião. |
| 20 — avaliação LLM / `ConstitutionEval` | Nome/contrato não localizado no escopo | Há testes e harnesses de RAG, inclusive `cognition/arkhe-rag/src/ncm_harness.rs`; isso não estabelece uma plataforma `ConstitutionEval` nem comprova “especificado”. |
| 25 — orquestrador multiagente | Parcial | `integration/arkhe-bugbounty/src/review.rs` contém `ReviewRouter` determinístico para revisão de triagem. `review/votes.rs` se declara experimental. A existência de `apps/arkhe-intra` e desse roteador não demonstra um orquestrador multiagente geral integrado. |
| 41 — encurtador de URL com analytics | Equivalência refutada | `integration/arkhe-bugbounty/src/journal.rs` implementa idempotência em memória; `postgres.rs` fornece portas persistentes. Não implementam o produto URL shortener nem seus analytics. |
| 43 — chat em tempo real | Equivalência refutada | `apps/arkhe-ask/src/events.rs` implementa transporte de eventos de provas. Outbox e Kafka são componentes aproveitáveis, não evidência de mensagens, salas, presença ou entrega de chat. |
| 44 — rate limiting | Equivalência refutada | `kernel/arkhe-kernel/src/lib.rs` contém autorização/evidência em `ContainmentGate`. Esse mecanismo não demonstra quotas, janelas, token bucket ou limitador distribuído. |
| 45 — notificações por eventos | Parcial | Outbox, publicação Kafka e projeção idempotente existem em `apps/arkhe-ask/src/events.rs`. O fluxo observado é de provas; canais e entrega de notificações de produto não foram demonstrados. |
| 46 — fila distribuída de jobs | Parcial | Journal com claim/dispatch/complete existe; não basta para provar scheduler, leasing, retries e distribuição de uma fila geral. A versão `OperationJournal` é em memória; persistência é uma implementação separada. |
| 47 — API gateway com autenticação | Parcial | `apps/arkhe-ask/src/auth.rs` e `main.rs` integram Keycloak JWT à API Ask. É uma API autenticada; não demonstra um gateway geral para múltiplos serviços. |
| 49 — streaming de dados | Implementação delimitada | `events.rs` e `telemetry.rs` preservam `traceparent`/`tracestate` e implementam publicação/consumo Kafka de eventos de provas. Não implica plataforma geral de streaming ou exactly-once. |
| 53 — banco vetorial | Implementação de integração | `PgVectorStore` e migrações Ask usam PostgreSQL/pgvector/HNSW. Integração existente; não é implementação de um novo motor de banco vetorial. |
| 60 — busca híbrida | Não demonstrada | O provider inspecionado é vetorial. Não foi localizado `InvariantRetriever` com BM25+dense+RRF+rerank no módulo de governança ou no pipeline Ask. “Especificado” requer apontar um contrato que o anexo não fornece. |
| 63, 65 — analisador de senhas / autenticação segura | Parcial; objetos diferentes | Keycloak JWT existe; `governance/arkhe-governance/src/policy_bundle.rs` verifica bundles assinados. Isso não demonstra um analisador de senhas. Segurança de autenticação não decorre de bundle de política isoladamente. |
| 67, 69 — anomalias de logs / vulnerabilidades | Equivalência refutada | OTel, Prometheus e Grafana existem em Ask e `ops/jobplan/telemetry`. Observabilidade não demonstra detector de anomalias nem dashboard de gestão de vulnerabilidades. |
| 80 — monitoramento Linux | Classificação inadequada | `ops/jobplan/telemetry/grafana/dashboards/arkhe-ask.json` tem oito painéis, mas são Ask requests, 5xx, p95, decisões de citação, conexões/locks/deadlocks PostgreSQL e scrape health. Não são oito painéis de monitoramento do SO Linux. |
| 82, 84 — Kubernetes e monitoramento | Parcial; caminho errado | `deploy/kubernetes/` não existe na raiz examinada. Há `ops/verification/kubernetes/admission-policy/{README.md,policy.yaml}`. Exemplo de política de admissão não prova implantação/monitoramento Kubernetes operacional. |
| 90 — assistente de incidentes DevOps | Não demonstrado | Ask sobre chunks pode ser reutilizado. Não foi demonstrado fluxo de ingestão de logs, diagnóstico, resposta ou resolução de incidente pelo mapeamento. |
| 99 — identidade blockchain | Não sustentado pelos símbolos citados | `IdentityNode` e implementação de `GovernanceRoster` não foram localizados nas fontes principais examinadas; há apenas menção a `GovernanceRoster` no comentário de `policy_bundle.rs`. Não usar esse comentário como evidência de implementação de identidade blockchain. Outras integrações de identidade não validam automaticamente essa associação. |

## 3. Pré-requisitos e sete etapas propostas

| Item | Auditoria |
|---|---|
| Avaliação / `ConstitutionEval` | Há infraestrutura de testes e vetores; não foi encontrado o componente nominal alegado. A prioridade é uma proposta, não conclusão demonstrável por existência de testes. |
| Search + Hybrid / `InvariantRetriever` | Lacuna no escopo examinado; busca vetorial de chunks não é retrieval híbrido de invariantes com proveniência. |
| SQL / `DuckDbBackend` | **Afirmação de ausência desatualizada.** `governance/arkhe-governance/src/er_backend.rs` contém implementação real usando `duckdb::Connection`, sob feature `duckdb-backend`, com testes de paridade. Reutiliza DuckDB; não requer construir um mini motor SQL. Abre banco em memória, recarrega a tabela e materializa todos os pares do bloco; a interface documenta saída quadrática. Escalabilidade não está provada. |
| CDC para `ConstitutionGraph` | Não demonstrado no módulo atual. Outbox de provas não é CDC de invariantes. O grafo completo também está pendente. |
| Interpreter/compiler → manifest/grafo CBOR | O encoder canônico já existe em `kernel/arkhe-core/src/canonical.rs`, e snapshots o utilizam. Isso não demonstra um parser formal de `MigrationManifest` nem compilador de grafo deôntico. Também não prova que construir um compilador geral seja pré-requisito necessário. |
| Federated learning → Dream-RSI | Associação não demonstrada. `cognition/arkhe-learning/src/lib.rs` compõe proposta e WER. `docs/STATUS.md` mantém eficácia Dream-RSI como conjectura. |
| Edge inference → `LocalInferenceProof` | Não foi localizado o tipo/contrato alegado no escopo examinado. Inferência local e prova de inferência são requisitos diferentes. |
| Identidade + coordenação | O mapeamento tem os limites descritos acima; necessidade universal e ordem rígida das sete etapas não são deriváveis do código. |

As sete linhas podem ser apresentadas como hipótese de planejamento para um objetivo definido. O repositório não prova que sejam um caminho mínimo, necessário ou suficiente para AGI.

## 4. Os cinco artefatos chamados de essenciais

| Artefato | Estado observado e limite |
|---|---|
| `InvariantResolver` com Fellegi–Sunter | **Implementado como biblioteca e testado nesta auditoria.** `invariant_resolver.rs`, `fellegi_sunter.rs`, `er_backend.rs` e `resolution_binding.rs` têm resolução, EM, conflitos de modalidade, snapshot e vínculos de auditoria. Comparação de condição é igualdade ASCII sem distinção de caixa; isso não prova implicação semântica geral. O log fornecido no módulo é `MockResolutionLog`; testes de registro não provam ancoragem externa durável. |
| `OntologyVersion` com compatibilidade retroativa | **Parcial.** `ontology_snapshot.rs` identifica conteúdo de snapshots imutáveis por digest/CBOR, valida duplicatas e divergência de versão. Isso não implementa evolução de schema nem compatibilidade retroativa. O ADR-0002 declara o escopo restrito. |
| `ConstitutionGraph` deôntico derrotável | **Não implementado como descrito.** O arquivo `constitution_graph.rs` contém `InvariantId` e `Modality`, e declara ausência de armazenamento de grafo, arestas tipadas, evolução de schema e implicação de condições. O nome do arquivo não constitui implementação do grafo. |
| `PassLaneAuditor` | **Não localizado no escopo examinado.** Telemetria, contadores e logs não demonstram amostragem com população/denominador definido, probabilidades e cobertura auditável. |
| `VerifierVerification` | **Componente nominal e cadeia completa não demonstrados.** Há testes/vetores native/WASM e CI em `.github/workflows/ci.yml`; há adapter Sigstore real em `integrations/cosign`. Seu README limita o perfil a `messageSignature` e rejeita DSSE/in-toto. Isso não comprova build reproduzível, proveniência SLSA e assinatura dos bytes do próprio WASM de uma release identificada. Não afirmar ausência de Sigstore: ele existe, com outro escopo. |

## 5. Validação executada

1. `cargo test --locked --offline -p arkhe-governance -p arkhe-rag`: **81 testes passaram**, nenhum falhou ou foi ignorado. Governança: 53 testes unitários/integração + 2 doctests; RAG: 26 testes.
2. `cargo test --locked --offline -p arkhe-governance --features duckdb-backend --test invariant_resolver --test resolution_binding`: **32 testes executados, dos quais 30 são repetições da suíte padrão e 2 são específicos do backend DuckDB.** Todos passaram, incluindo paridade e concorrência DuckDB e igualdade dos seis bindings/bytes de registro.
3. `cargo test --locked --offline -p arkhe-ask`: **15 testes passaram e 15 foram ignorados**, sem falhas. Foram exercitados o pipeline, isolamento por tenant, rejeição de tokens, journal via double, providers HTTP simulados e telemetria. Os ignorados exigem PostgreSQL/pgvector, Kafka ou Azure reais; não foram habilitados nesta auditoria.

Esses resultados verificam contratos locais. Não medem qualidade da ontologia, acurácia geral de entity resolution, capacidade de AGI, escalabilidade, operação de produção ou eficácia em corpus real. Nenhum teste novo foi adicionado.

## 6. Correção da nota de honestidade

- “Catálogo, não roadmap”: interpretação razoável, mas a intenção do catálogo completo não é verificável pelo anexo isolado.
- “21 implementados/especificados” e “8 pré-requisitos”: confundem linhas com projetos e atribuem evidência excessiva a várias associações.
- “7 formam o caminho crítico”: hipótese de arquitetura, dependente de objetivo, critérios e dependências ainda não demonstrados.
- “Os cinco não estão na lista”: falta o catálogo original completo para validar a ausência e eventuais equivalências.
- “Arkhe é AGI”: **não demonstrado**; a documentação local também o reconhece. Ausência de demonstração não é prova lógica de impossibilidade, portanto `REFUTED` é excessivo se usado nesse sentido.
- “Os 100 constroem uma AGI” e “com os cinco, são uma arquitetura”: não há demonstração de suficiência. Uma camada de verificação com predicados delimitados não prova que toda ação ou resposta seja correta.

Convenção incorporada após a revisão do usuário: falta de demonstração de suficiência é `NÃO DEMONSTRADO` (ou `PENDING` para uma obrigação de evidência pendente). `REFUTED` exige evidência de contradição ou impossibilidade da afirmação; não resulta apenas de ausência de evidência. A crítica às equivalências da seção 2 refuta a inferência de que aquele componente demonstra aquele produto, sem afirmar impossibilidade de implementar o produto.

Formulação sustentada: o workspace contém componentes de RAG, autenticação, persistência, eventos, autorização e verificação, além de um resolvedor de invariantes e snapshots canônicos testados. Retrieval híbrido de invariantes, grafo deôntico completo, evolução compatível de ontologia, auditoria de pass lane e cadeia de confiança completa da release WASM permanecem não demonstrados no escopo examinado. A lista de portfólio pode inspirar componentes; não estabelece uma contagem de progresso rumo a AGI.
