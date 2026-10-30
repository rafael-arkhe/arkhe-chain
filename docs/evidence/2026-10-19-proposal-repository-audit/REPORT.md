# Auditoria da proposta versus o repositório Arkhe

Data: 19/10/2026. Escopo: arquivos ativos em `D:/arkhe`, anexo de 1.315 linhas,
manifestos, implementações selecionadas, validações locais e evidências existentes.
Não houve alteração de implementação, migração, política, licença ou configuração
de implantação. Não foram iniciados serviços ou novos ensaios de sandbox.

**Conclusão:** a proposta é uma visão de arquitetura e produtos, não um inventário
fiel nem uma demonstração de prontidão de produção. O repositório possui uma base
funcional de contenção, evidência, identidade, aplicações locais e empacotamento.
Há capacidades de referência, integrações parciais e componentes apenas propostos.
Não há fundamento nesta auditoria para declarar AGI, RSI geral, runtime certificado
ou arquitetura inteira congelada.

## 1. Método e resultado estrutural

O primeiro bloco de árvore do anexo contém **461 entradas** de arquivos e diretórios:

| Comparação mecânica | Entradas |
| --- | ---: |
| Caminho proposto existe no filesystem local | 93 |
| Caminho existe sob a crate Rust ativa correspondente, em outra localização | 46 |
| Sem correspondência por esses dois critérios | 322 |

Esses números **não medem percentual de implementação**. Há arquivos reorganizados,
implementações concentradas em `lib.rs`, outros nomes, propostas e caminhos ausentes.
A comparação literal foi feita no Windows e não certifica igualdade de maiúsculas
e minúsculas para build em Linux. Todos os registros e linhas do anexo estão em
[tree-comparison.json](D:/arkhe/docs/evidence/2026-10-19-proposal-repository-audit/tree-comparison.json).

A árvore propõe **23 crates Rust**; 19 têm pacote ativo correspondente e quatro
não pertencem ao workspace: `arkhe-containers`, `arkhe-workers`, `arkhe-intra`
e `arkhe-work-cockpit`. O workspace real contém **24 crates**, incluindo cinco
omitidas pela proposta: `arkhe-cognition-sdk`, `arkhe-agent`, `arkhe-ollama`,
`arkhe-orkut` e `arkhe-runtime`.

| Proposta | Localização/estado real |
| --- | --- |
| `kernel/arkhe-verify-*` | `verification/crates/arkhe-verify-*` |
| `evidence/arkhe-sql` | `storage/sql/crates/arkhe-sql` |
| `governance/arkhe-sql-migrate` | `storage/sql/crates/arkhe-sql-migrate` |
| `integration/arkhe-auth-md` | `integration/auth-md` |
| `orchestration/arkhe-intra` | Não há essa crate; aplicação em `apps/arkhe-intra`, runtime Rust em `orchestration/arkhe-runtime` |
| `work/arkhe-work-cockpit` | Não há essa crate; telas locais no Intra, sem equivalência automática ao cockpit proposto |
| `integration/mcp-server` | `integrations/verify-mcp` implementa MCP de verificação; `integrations/mcp-server` é scaffold HTTP de saúde/métricas |
| `migrations/checksums.lock` | 13 migrações em `storage/sql/migrations`; digests em `config/migrations.lock.json` |
| Muitos workflows separados | Há dois arquivos: `ci.yml` e `besu-b0.yml`; o primeiro consolida diversos gates |

Referências: [Cargo.toml](D:/arkhe/Cargo.toml),
[architecture.json](D:/arkhe/config/architecture.json),
[pnpm-workspace.yaml](D:/arkhe/pnpm-workspace.yaml).
Criar crates vazias para reproduzir a árvore não fecharia as lacunas funcionais.

## 2. Validações executadas nesta auditoria

| Verificação | Resultado observado |
| --- | --- |
| `python scripts/check_architecture.py` | PASS: 24 crates Rust, 6 pacotes Node, 13 migrações imutáveis |
| `python scripts/cognition_conformance.py` | PASS: grafo resolvido/allowlist, 3 testes unitários, 9 doctests compile-fail, 1 doctest positivo e 1 teste de integração do gate |
| Saúde `http://127.0.0.1:3003/api/health` | Conexão recusada; serviço não iniciado por esta auditoria |

Os testes de conformidade cognitiva cobrem interfaces e rejeições específicas.
Não demonstram contenção do SO, autenticidade de toda evidência ou capacidades AGI.
Não houve novo teste de PostgreSQL vivo, CI remoto, Kubernetes, gVisor ou WASI.
Ausência de autoridade de admissão não significa ausência de dependência de
segurança: para a garantia de contenção assumida pelos contratos locais, runtime,
SO e observadores externos também precisam de confiança e validação explícitas.

O último ensaio unificado disponível é **evidência anterior**, não reexecutada aqui:
18 PASS, Seccomp UNASSESSED e memória/CPU/PIDs não executados por fail-closed.
Seu receipt original de limpeza falhou; há reconciliação suplementar e smoke
separado da correção. Continuam `sealed=false` e `runtime_verified=false`.
Referência: [resumo do ensaio](D:/arkhe/docs/evidence/2026-10-19T121632Z-unified-trial-summary/REPORT.md).

## 3. Lacunas prioritárias e critérios de fechamento

Prioridade indica dependência e risco de interpretação, não uma afirmação de
exploração de vulnerabilidade. Ausência de evidência não prova ausência universal
de código, especialmente em arquivos históricos e plugins fora do escopo ativo.

| ID / prioridade | Constatação | Evidência e critério de fechamento |
| --- | --- | --- |
| A01 / P0 | Não existe aprovação unificada 22/22 do candidato. gVisor/runwasi/WASM e TEE não herdam resultados do Podman. | `runtime-unified-contract.json`, resumo do ensaio. Fechar cobertura dinâmica Seccomp e revisão da cadeia herdada; executar a matriz inteira com limpeza comprovada na mesma tupla. Depois, matriz independente por runtime/perfil/imagem. |
| A02 / P0 | `verify_artifact` retorna `valid: true` para hashing e canonicalização C2PA/GGUF. Isso não constitui verificação de assinatura C2PA, cadeia de confiança, arquivo GGUF completo ou proveniência. | `integrations/verify-mcp/src/tools/verify-artifact.ts`, `verification/.../c2pa/claim.rs`. Separar resultado de digest/canonicalização de veredito criptográfico; testes negativos de assinatura, trust roots e bindings antes de anunciar verificação completa. Não foi demonstrado bypass do kernel por esse retorno. |
| A03 / P0 | O perfil local do Intra não é a admissão nativa universal descrita na proposta. Seu fluxo de documentos usa autorização por papéis/assinaturas em Node e SQLite. | `apps/arkhe-intra/lib/documents.mjs`, `store.mjs`. O próprio export declara que não é receipt WormGraph. Se o produto exigir transição protegida Arkhe, integrar o gate e a admissão correspondente; até lá, manter explícito o escopo de evidência local. |
| A04 / P1 | `DRAFT/NOT FROZEN` e `FROZEN` coexistem no anexo e em `design.md`. O registro de arquitetura classifica AKG como pre-freeze. | `design.md`, `config/architecture.json`. Definir por perfil versão, digest, autoridade de aprovação, testes de paridade e estado; congelar apenas o que tem evidência. |
| A05 / P1 | Cognição ainda não corresponde aos algoritmos descritos. Não há `dream_rsi.rs`, `simulator.rs` ou `self_model.rs` nesses módulos ativos. | `arkhe-learning` emite proposta; `world-model` gera digests do cenário sem modelo causal; `metacognition` escolhe confiança 7000/2500 e cobertura 10000/0 pela presença de referências. Implementar calibração histórica, simulador avaliável e aprendizado medido; não rotular os stubs como capacidade demonstrada. |
| A06 / P1 | RAG fornece estruturas de citação, mas `grounded` depende apenas de lista não vazia. Não foi evidenciada busca vetorial/híbrida com validação integral dos chunks nesse módulo. | `cognition/arkhe-rag/src/lib.rs`. Validar digest e prova de cada fonte/chunk, separar presença de citação de fundamentação, incluir recuperação e casos negativos de índice adulterado. |
| A07 / P1 | Awa/BullMQ, heartbeat Tokio separado e DLQ de três tentativas não estão implementados pelas crates propostas, que não existem no workspace. Redis no Compose não demonstra fila. | `Cargo.toml`, `docker-compose.yml`. Há journal e jobs operacionais em integrações específicas. Uma fila genérica exige contrato de lease/retry, enqueue transacional, crash recovery e testes de reinício. Não substituir essas garantias por nomes de dependências. |
| A08 / P1 | Existem assinaturas Ed25519 e quórum em perfis específicos, mas isso não demonstra ML-DSA, HSM/PKCS#11, TEE ou uma ConstitutionStore universal. | `integration/auth-md/src/token.rs`, `integration/arkhe-bugbounty/src/governance.rs`, `provenance.rs`, `governance/arkhe-governance/src/lib.rs`. Preservar a capacidade existente; especificar escopo, rotação/revogação, anti-replay e custódia por integração. |
| A09 / P1 | SQL append-only é uma propriedade de tabelas/roles, não de todo estado. O journal permite transições operacionais controladas por trigger. O DDL simplificado do anexo omite tenant e ator. | `storage/sql/migrations/20261017000009_bugbounty.sql`. Preservar PK `(tenant_id,requested_by,operation_id)` e parâmetros imutáveis; documentar estado operacional mutável versus evidência imutável; testar isolamento/conflitos nas APIs. Não reescrever as migrações publicadas para copiar o exemplo. |
| A10 / P1 | O SDK e o gate têm controles reais, mas não substituem isolamento de runtime. O host continua responsável por autenticar evidências antes do snapshot. | `docs/COGNITION-SDK.md`, testes executados. Manter allowlist, sandbox e admissão; testar recebimento de evidência inválida e identidade duplicada no host, além da tipagem. |
| A11 / P1 | O CI possui separação de OIDC no job de atestação, mas a existência do YAML não comprova execução remota ou publicação. Algumas etapas fora dos cognition gates ainda usam tags de actions/tooling sem pin equivalente. | `.github/workflows/ci.yml`, `besu-b0.yml`. Obter receipts remotos do commit, validar permissões e identidades, revisar pins do restante da cadeia. O diretório local não contém metadados `.git`; esta auditoria não atribui um commit verificado ao checkout. |
| A12 / P1 | `ClusterImagePolicy` é um template deliberadamente incompleto, com `authorities: []`; não há aprovação de admissão Kubernetes demonstrada. | `ops/verification/kubernetes/admission-policy/policy.yaml`. Vincular autoridades/identidades reais e testar rejeição de imagem não autorizada no cluster de destino antes de usá-lo como garantia. |
| A13 / P1 | EXE, CLI, MSI e ZIP já existem; a lacuna de distribuição não é ausência desses formatos. O perfil empacotado é local, não inclui todo o runtime PostgreSQL/laboratórios. | `packaging/windows/README.md`, `dist/`. O README declara ausência de assinatura de editor, atualização automática, SSO e multitenancy nesse perfil. Exigir testes em máquina limpa, integridade/assinatura, atualização/rollback e matriz de perfis antes de distribuição produtiva. Binários e MSI não foram instalados ou executados nesta auditoria. |
| A14 / P2 | A camada completa de sharding, réplicas com LSN, service mesh, discovery atestado, CDN e armazenamento S3 endereçado por conteúdo não foi evidenciada como sistema operacional integrado. | Compose e fontes ativas inspecionados. Tratar como opções de implantação; cada capacidade precisa de contrato, implementação e teste. Evitar colocá-las como pré-requisito para o aplicativo local. |
| A15 / P2 | A proposta comercial mistura gratuidade, revenue share e metadata de licença sem vínculo implementado. O workspace declara `Apache-2.0 OR MIT`, mas não há os dois textos de licença propostos na raiz. | `Cargo.toml` e inventário da raiz. Não foi verificada licença Community Source que imponha 10%. Formalizar separadamente, sem alterar licenças automaticamente. Os valores de nuvem e preços do anexo não têm fontes verificáveis, região/data/SKU ou medição de carga anexadas; são hipóteses comerciais, não orçamento validado. |

## 4. Capacidades já existentes que a proposta precisa reconhecer

- Kernel nativo com classificação, resolução de política, admissão de evidência e
  rejeições; runtime com commit transacional de evidência, explicitamente separado
  da execução de efeitos externos.
- SDK cognitivo selado e snapshots de leitura, com compile-fail e allowlist
  resolvida pelo Cargo; `arkhe-agent` e integração Ollama já fazem parte do workspace.
- Implementação PostgreSQL do WormGraph, migrações RLS/triggers, journal de
  idempotência, provas MMR e verificação WASM. A memória episódica atual usa mapa
  em RAM; não equivale às três implementações de store propostas no anexo.
- Quórum/assinaturas de governança e proveniência em integrações específicas,
  autenticação `auth-md`, Orkut e bugbounty. Não generalizar seus perfis para
  qualquer transição protegida.
- Intra com documentos, credenciais, assistente Ollama, desenvolvimento em sandbox
  e avaliação controlada. O gerador de avaliação cobre tarefas sintéticas de
  raciocínio, planejamento, aprendizagem e ferramentas; não é certificação AGI.
- Fontes e artefatos locais Windows: `Arkhe.exe`, `arkhe-cli.exe`, MSI e ZIP.
  O cockpit genérico de Rust proposto não é necessário para reconhecer essas telas.

## 5. Os 30 produtos de IA do anexo

Esta é uma triagem de aderência, não teste end-to-end de 30 produtos. “Sem produto
evidenciado” significa que a inspeção não encontrou evidência suficiente da solução
completa; não exclui utilitários, experimentos ou dependências relacionadas.

| # | Produto | Aderência observada e lacuna principal |
| ---: | --- | --- |
| 1 | Chatbot | Parcial: assistente Ollama local; não demonstra serviço geral com memória conversacional durável e SLA. |
| 2 | RAG | Estruturas de referência; faltam recuperação, embeddings e prova de grounding efetiva. |
| 3 | Coding assistant | Parcial: laboratório de desenvolvimento e propostas/testes isolados; não comprova indexação completa do codebase ou IDE pronta. |
| 4 | Research agent | Sem produto completo evidenciado de pesquisa, planejamento e busca externa com fontes. |
| 5 | Customer support | Sem produto evidenciado de tickets, base operacional e escalonamento. |
| 6 | AI SaaS | Base local de autenticação; faltam billing, tenant isolation end-to-end e operação SaaS. |
| 7 | Document intelligence | Documentos e assinaturas locais; não equivale a OCR/extraction/validation de documentos arbitrários. |
| 8 | Voice assistant | Sem pipeline conversacional STT/LLM/TTS completo evidenciado. |
| 9 | Image generation | Sem plataforma completa evidenciada com geração, armazenamento e governança de entrega. |
| 10 | Video generation | Sem pipeline de geração e workers GPU evidenciado como produto. |
| 11 | Recommendation engine | Sem serviço completo evidenciado de embeddings de usuário, ranking e feedback. |
| 12 | Search engine | Sem busca híbrida/reranking operacional evidenciada; citar fontes em RAG não resolve isso. |
| 13 | Fraud detection | Bugbounty e triagem de vulnerabilidades não demonstram modelo de detecção de fraude. |
| 14 | Personalization | Perfis e papéis locais não equivalem a motor de personalização avaliado. |
| 15 | Multi-agent | Módulos cognitivos e agente existem; coordenação geral de agentes/estado compartilhado continua parcial. |
| 16 | Workflow automation | Fluxos locais de documento/desenvolvimento existem; catálogo geral de triggers/conectores não demonstrado. |
| 17 | Knowledge management | Memória e referências existem; ingestão/indexação/recuperação completa não demonstradas. |
| 18 | Meeting assistant | Sem produto evidenciado de ingestão de áudio, transcrição e síntese de reuniões. |
| 19 | Email assistant | Tipos/adaptadores de canais não demonstram integração operacional de classificação, rascunho e aprovação de e-mail. |
| 20 | Data analyst | Há dados SQL e painéis; não há evidência suficiente de Text-to-SQL seguro e análise geral. |
| 21 | Financial intelligence | Operações/payouts específicos não equivalem a forecasting e análise de risco financeiro. |
| 22 | Healthcare assistant | Sem produto clínico evidenciado ou validação do domínio; guardrails genéricos não o comprovam. |
| 23 | E-commerce assistant | Plugin Paybox é pacote separado; não comprova assistente integrado de catálogo, recomendação e checkout. |
| 24 | Learning platform | Avaliação de capacidades sintéticas existe; não é plataforma de aprendizagem adaptativa para usuários. |
| 25 | Document generation SaaS | Composição e edição locais existem; templates/geração SaaS/exportação e operação completa exigem validação própria. |
| 26 | Fine-tuning | Sem produto completo evidenciado de datasets, treinamento e model registry. |
| 27 | Inference platform | Integração Ollama local; não demonstra serving GPU com batching e autoscaling. |
| 28 | Observability | Compose declara Prometheus/Grafana e há métricas; não demonstra tracing/eval/custos integrados em produção. |
| 29 | Model gateway | Provider local com limites/digest; não comprova routing/fallbacks/budget multi-provider. |
| 30 | Production AI platform | Fundação e aplicações locais parciais; faltam provas de operação, segurança e integração para o escopo completo anunciado. |

Os apps Angular `preflight` e `melodic-lab` e o dashboard Chladni foram reconhecidos
como superfícies próprias, não usados como prova de implementação dos 30 produtos.

## 6. Ordem recomendada para fechar as lacunas

1. **Verdade do contrato:** reconciliar árvore, status de freeze, perfis e mensagens
   de verificação. Critério: cada claim publicado aponta a fonte, perfil e evidência.
2. **Contenção do candidato:** completar Seccomp/cadeia herdada e executar 22/22 com
   limpeza unificada válida. Critério: nenhum vetor obrigatório não avaliado e
   nenhum reaproveitamento de PASS de outra tupla.
3. **Uma jornada fiduciária completa:** escolher documento ou bugbounty e provar
   UI → intenção → admissão → journal → efeito externo reconciliável → evidência.
   Critério: rejeição de assinatura inválida, parâmetros alterados, replay,
   revogação e falhas de commit/reinício, no perfil escolhido.
4. **Distribuição e operação:** validar os pacotes existentes em ambiente limpo,
   startup/health, backup/restauração, atualização/rollback e identidade de editor.
5. **Capacidades avançadas e expansão:** implementação real de RAG, calibração e
   aprendizado, com baseline e tarefas inéditas; filas/escala apenas conforme
   demanda medida. Tratar os 30 produtos como backlog, não como módulos prontos.

## 7. Artefatos e limites

- `proposal.txt`: cópia exata do anexo; digest em `input-identity.json`.
- `tree-comparison.json`: todas as 461 entradas e os mapeamentos de crates.
- `checks.json`: comandos/resultados observados nesta auditoria e saúde local.
- `findings.json`: achados priorizados para acompanhamento.
- `sources/` e `source-index.json`: cópias e hashes de fontes selecionadas.
- `SHA256SUMS`: integridade dos artefatos; não é assinatura nem atestação.

Não foram auditadas exaustivamente todas as linhas de cada crate, todos os binários,
plugins empacotados, ambientes remotos ou preços/termos externos. As garantias
criptográficas específicas, custos, licenciamento e conformidade regulatória
não devem ser inferidos da existência de pastas, de um hash ou de um teste unitário.
