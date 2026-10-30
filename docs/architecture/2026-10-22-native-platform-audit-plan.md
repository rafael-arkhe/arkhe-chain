# Auditoria e plano: dados, execução e construção agêntica nativos

Data: 22/10/2026. Escopo: checkout local em `D:\arkhe` e proposta anexada pelo usuário.
Registro posterior: a primeira implementação de admissão/outbox está descrita em
[PREVIEW-ADMISSION](../PREVIEW-ADMISSION.md). A matriz abaixo preserva o diagnóstico
anterior à implementação; ela não representa o novo perfil como já existente na auditoria.
Este documento descreve o código inspecionado; não atribui ao checkout um commit
verificado, certificação de produção ou execução em hardware TEE.

## Parecer

A proposta é uma direção arquitetural plausível, mas descreve capacidades futuras
como se já formassem uma plataforma integrada. Existem componentes concretos de
persistência, autorização, identidade canônica e verificação. Não há equivalência
funcional completa com BaaS, plataforma de deploy/edge ou construtor autônomo.

O principal trabalho é integrar fronteiras de confiança: evidência admitida,
checkpoint autenticado, autorização específica da operação e executor restrito.
Dar um nome a uma crate, calcular um hash ou obter uma prova contra uma raiz
fornecida pelo cliente não estabelece essas fronteiras.

Classificação usada: **confirmada** = comportamento presente no código;
**parcial** = implementação com escopo menor; **não encontrada** = ausente nas
fontes ativas inspecionadas; **contradita** = implementação diverge da afirmação.
Ausência em busca estática não prova ausência em infraestrutura externa.

## Matriz de afirmações e evidências

Os links apontam para fontes relativas a este documento. Linhas citadas são pontos
de entrada para inspeção, não substituem a leitura das funções completas.

| Afirmação da proposta | Parecer | Evidência e limite |
|---|---|---|
| Roles `NOSUPERUSER NOBYPASSRLS`, RLS forçado e triggers de imutabilidade | Confirmada no DDL | [roles](../../storage/sql/migrations/20261017000001_init_roles.sql), [append-only](../../storage/sql/migrations/20261017000003_append_only.sql), [RLS](../../storage/sql/migrations/20261017000004_rls.sql), [privilégios](../../storage/sql/migrations/20261017000005_privileges.sql). `PgWormGraph::connect_with_stream` também rejeita login privilegiado. Configuração viva não foi revalidada nesta auditoria. |
| Todo o banco é um ledger append-only à prova de adulteração | Contradita como garantia universal | [journal](../../storage/sql/migrations/20261017000009_bugbounty.sql): linhas 24–34 permitem transições controladas; linha 60 permite limpeza administrativa do log. [payout/witness](../../storage/sql/migrations/20261018000013_payout_witness.sql) têm estado operacional mutável. [billing](../../storage/sql/migrations/20261021000014_stripe_billing.sql) é tabela operacional sem o mesmo trigger. RLS/triggers limitam roles; não protegem contra administrador da infraestrutura que altere DDL/backup. |
| WormGraph é uma MMR e toda consulta exige `InclusionProof` | Parcial; universalidade contradita | [WormGraph](../../evidence/arkhe-wormgraph/src/lib.rs) é um mapa em memória; [PgWormGraph](../../evidence/arkhe-wormgraph/src/postgres.rs) persiste envelopes/objetos e lê checkpoints. [regenerate](../../evidence/arkhe-wormgraph/src/regenerate.rs) reconstrói MMR; [anchor](../../evidence/arkhe-wormgraph/src/anchor.rs) verifica checkpoint assinado. [EvidenceReader](../../kernel/arkhe-core/src/evidence.rs):21 retorna envelope sem prova. Grafo causal e compromisso MMR são estruturas relacionadas, não sinônimos. O tipo literal `InclusionProof` não foi encontrado em kernel/evidence/verification; há `ProofStep`. |
| Memória episódica exige e entrega prova criptográfica | Contradita na API atual | [memória](../../evidence/arkhe-memory/src/lib.rs):26 testa apenas existência de referência em `EvidenceReader`; `retrieve`, linha 51, retorna episódio de `HashMap`, sem prova, persistência ou revalidação. O nome `append_verified` não implementa autenticação por si só. |
| `AwaQueue` faz enqueue via `PgExecutor` na transação de negócio | Não encontrada | Nomes não encontrados em fontes ativas de storage/kernel/orchestration/integrations e manifests examinados. [workspace](../../Cargo.toml) não inclui Awa. Journal e `payout_jobs` específicos não equivalem a uma fila genérica. Não confundir commit atômico de evidências com enqueue transacional. |
| `arkhe-containers`/`arkhe-workers` executam Wasmtime, Wasmer, WaSC, gVisor e runwasi | Não encontrada como implementação descrita | Crates ausentes do workspace. Há execução Podman rootless em [development](../../apps/arkhe-intra/lib/development.mjs):101 e [sandbox-policy](../../apps/arkhe-intra/lib/sandbox-policy.mjs):2. [contrato do executor](../../config/runtime-executor-contract.json):9 declara OCI sem gVisor/runwasi/WASM verificados. Os ensaios parciais não qualificam a matriz completa. gVisor não deve ser descrito como microVM; a proposta mistura mecanismos distintos. |
| Deploy produtivo exige Cosign keyless e Nitro, liberando chaves pelo binário medido | Parcial nos contratos; integração completa não encontrada | [Cosign](../../integrations/cosign/verify-blob.sh) apenas chama CLI com assinatura/certificado; não fixa explicitamente issuer/identidade no wrapper. [policy Kubernetes](../../ops/verification/kubernetes/admission-policy/policy.yaml) tem `authorities: []`. [workload](../../integration/arkhe-bugbounty/src/workload.rs):1 declara ausência de verificador nativo embutido. `AttestedWorkerVerifier` exige bindings, PCRs, frescor, artefato independente e receipt; depende de implementação confiável de `WorkloadAttestation`. Não há provider nativo ou liberação KMS comprovados nas fontes examinadas. |
| Verificação local WASM sem consulta central | Confirmada para operações delimitadas | [exports WASM](../../verification/crates/arkhe-verify-wasm/src/lib.rs):39–103 oferecem hashing, canonicalização, assinatura de claim do perfil Arkhe e inclusão MMR. Binário presente: `pkg/arkhe_verify_wasm_bg.wasm`. Raiz confiável, revogação/frescor e autorização continuam externos; executar localmente não garante por si só ausência de vazamento na aplicação hospedeira. |
| Agentes propõem `WorkIntent` em CBOR determinístico | Confirmada para identidade; parcial para construtor completo | [WorkIntent](../../kernel/arkhe-core/src/work.rs):22 e implementação canônica em `kernel/arkhe-core/src/`; `arkhe-work` reexporta tipos e contém contratos de trabalho. A bancada gera/testa propostas Rust e aprova exportação assinada. Isso não demonstra aplicar migrações, integrar código e publicar aplicações completas pelo kernel. |
| IA não tem chaves nem autoridade direta | Parcial, dependente do host | SDK e fluxo distinguem proposta e admissão; bancada registra `authority: false`. Uma estrutura Rust ou campo booleano não impede acesso a credenciais no processo hospedeiro. É necessário impor isolamento, custódia e permissões do executor. Não há prova universal dessa restrição em todo uso da IA. |
| `ContainmentGate` valida WER e bloqueia toda transição inválida | Confirmada com limites de entrada | [gate](../../kernel/arkhe-kernel/src/lib.rs):259 rejeita emergência, WER ausente em operação protegida e política Deny/Inconclusive. `authorize_admitted`/`authorize_routed_admitted` fazem vínculos adicionais e consulta de evidência. O caminho básico `authorize_checked` não autentica assinatura/atestado do WER, apenas sua presença e decisão de política. Integrações específicas exigem admissão; não presumir cobertura universal. [DevPolicyResolver](../../governance/arkhe-governance/src/lib.rs) rejeita ações protegidas. |
| Cockpit e `integration/mcp-server` aprovam transições do construtor | Parcial e caminho incorreto | O caminho ativo é [integrations/mcp-server](../../integrations/mcp-server/src/index.js), scaffold HTTP de health/metrics sem ferramentas MCP de autorização. [verify-mcp](../../integrations/verify-mcp/README.md) é MCP stdio de verificação sem autoridade. [agi-coder MCP](../../agi-coder/packages/mcp-server/src/index.ts) oferece prova, disponibilidade de atestado GPU e soma de custos; não deploy protegido. O cockpit Intra tem aprovação de exportação em `development.mjs`:152–162, sem integração demonstrada com `ContainmentGate`. |

### Implicações para cada equivalente

**Dados/BaaS:** a base PostgreSQL e a trilha de evidências existem. Autenticação
em integrações específicas não equivale a auth BaaS unificada; fila genérica,
API de dados com provas, armazenamento de objetos, recuperação operacional e
experiência de provisionamento precisam de escopo próprio. Tornar tabelas
operacionais append-only indiscriminadamente quebraria journals/leases.

**Deploy/edge:** existe sandbox local e verificador portátil. Não foi encontrado
um control plane integrado de build, registry, release, roteamento, rollback e
execução distribuída. TEE e Cosign são controles diferentes: identidade da cadeia
de publicação não prova medição de execução, e medição não autoriza uma ação.

**Construção agêntica:** já existe bancada útil. A lacuna é transformar sua
proposta/exportação em uma operação protegida admitida, com execução controlada,
reconciliação de falhas e receipt do efeito observado.

## Plano de implementação

Sequência sugerida para um MVP: uma proposta Rust produz um artefato de preview
isolado, revisado e verificável. Publicação produtiva e TEE são marcos posteriores.
As entregas abaixo são propostas, não funcionalidades implementadas por esta auditoria.
Responsáveis indicam áreas; não atribuem trabalho a pessoas.

| Marco | Prioridade / responsável | Entrega e locais previstos | Dependências | Critério de aceite |
|---|---|---|---|---|
| M0 — contrato da jornada | P0 / arquitetura + governança | Especificar `ReleaseSoftware` para preview, payload versionado, digest de baseline/patch/artefato, tenant/ator, política, revisão, executor e efeitos permitidos. Usar tipos existentes; adicionar novo intent só se a semântica exigir. Documentar estados e inventário de capacidades. | Nenhuma | Ameaças, limites e fixtures positivos/negativos revisados; nenhuma aprovação implícita por hash/prova. |
| M1 — admissão e autorização de release | P0 / kernel + runtime | Criar caminho de release que autentique WER e revisão antes do gate; ligar política ao tenant, baseline, artefato, runtime e escopo. Reusar admission ports e receipts existentes das integrações como referência, sem transferir confiança automaticamente. | M0 | WER inventado, módulo não permitido, política divergente, revisão expirada, troca de artefato, tenant/ator incorretos e emergência rejeitam sem efeito. `authorize` básico não pode virar atalho do executor. |
| M2 — fila transacional | P1 / storage + orchestration | Escolher Awa somente após avaliar contrato; alternativamente implementar outbox/jobs SQL. Migração aditiva após a maior versão existente, enqueue usando a mesma `sqlx::Transaction` do registro de negócio. Eventos/evidência imutáveis separados de lease/retry operacional. | M0 | Rollback não deixa job; commit cria job e registro juntos; concorrência não duplica execução lógica; lease tem fencing token, expiração, retry com limite e DLQ; crash/restart recuperam. |
| M3 — leitura verificável | P1 / evidence + verification | Adicionar API separada `get_with_proof` e bundle versionado, preservando leitura interna existente. Reusar `build_root_and_proof`, reconstrução, checkpoints e assinatura já implementados. Vincular payload/envelope/folha, tenant, stream, leaf count e perfil; política de frescor e anti-rollback. | M0 | Rust e WASM validam o mesmo bundle; raiz atacante, folha/índice/count adulterados, omissão/reordenação, checkpoint antigo e tenant divergente falham. Teste PostgreSQL real após reinício. Inclusão não é prova de completude da consulta. |
| M4 — memória persistente verificável | P1 / memory | Substituir armazenamento apenas em `HashMap` por backend persistente; verificar relação conteúdo/episódio/evidência e retornar bundle de M3 para consumidores que o exijam. Separar lookup de referência e admissão. | M3 | Conteúdo ou referência trocada é rejeitado; recuperação após restart; isolamento de tenant; nenhuma resposta marcada como verificada sem checkpoint confiável. |
| M5 — executor mínimo de preview | P0 / runtime + segurança | Consolidar o perfil Podman existente, imagem por digest, supervisor confiável e suite unificada. Executor recebe capability restrita de M1 com validade e fencing; rede/credenciais/volumes mínimos. Revalidar precondições imediatamente antes de executar. | M1, M2 | Perfil exato aprovado na suite; timeout, escape/egress tentado, replay, troca de baseline, revogação antes do efeito e falha de cleanup bloqueiam/isolam. Evidência do supervisor vincula run, imagem, política e resultado. |
| M6 — release control plane | P1 / runtime + operações | Pipeline build → teste → artefato por digest → preview → promoção explícita → rollback; registro de releases e journal. Modelar `UNKNOWN`/reconciliação para efeito externo ambíguo. Integrar checkpoint M3 no receipt. | M2, M3, M5 | Crash antes/depois do efeito não gera sucesso falso. API externa sem idempotência não recebe promessa de exactly-once. Rollback é uma nova transição autorizada com trilha causal. Preview não alcança segredos produtivos. |
| M7 — cockpit e MCP | P1 / Intra + adapters | Ligar a bancada ao caminho M1/M6. MCP autenticado oferece propor, consultar, solicitar revisão e acompanhar execução; aprovação humana mantém identidade e assinatura próprias. Exibir diff, resultados, escopo, evidências e efeitos. Não reutilizar health scaffold como autorização. | M1, M5, M6 | Jornada E2E gera patch, testa, revisa e publica preview; payload adulterado/replay/permissão insuficiente falham. Cliente não pode converter `PROOF_VALID` em permissão. |
| M8 — cadeia de publicação | P1 / supply chain + operações | Expandir ponte Cosign com identidade/issuer/digest esperados e política versionada. Configurar authorities reais no ambiente alvo. Receipts de CI vinculados ao source/build/artifact. | M6 | Artefato sem assinatura, signer/issuer incorreto, digest trocado e receipt de outro build são rejeitados no destino real. Política vazia não é sucesso. |
| M9 — TEE opcional | P2 / segurança + infraestrutura | Escolher uma plataforma inicial (ex.: Nitro); implementar provider nativo de `WorkloadAttestation`, trust roots/TCB, challenge/frescor e custódia/liberação de chave por política. Reusar `AttestedWorkerVerifier`; não inventar substituto por JSON autodeclarado. | M1, M5, M8 | Teste em hardware real; cadeia inválida, debug, PCR divergente, binding de outra chave/WER, replay e evidência expirada falham; serviço de chave nega liberação. Testes com doubles não promovem status de hardware. |
| M10 — operação BaaS e edge | P2 / plataforma | Definir auth/API/storage de objetos, quotas, backup/restauração, observabilidade e SLO; selecionar runtimes adicionais e distribuição por carga medida. Manter matriz por engine/versão/imagem/política/plataforma. | M3, M6, M8 | Restore preserva cadeia verificável; isolamento de clientes e quotas comprovados; cada runtime passa sua própria suite; indisponibilidade de dependências tem comportamento especificado. |

### Ordem de execução e fronteiras

1. M0 e M1 primeiro. Nenhuma promoção produtiva enquanto a autorização depender
   apenas de presença de WER ou de aprovação local desvinculada do kernel.
2. M2/M3 podem avançar após M0; M5 integra M1/M2. M4 não bloqueia o preview se a
   jornada não consultar memória episódica.
3. M6/M7 entregam o MVP integrado. M8 é obrigatório antes de anunciar a cadeia
   de deploy assinada. M9 é obrigatório apenas para anunciar o perfil TEE.
4. M10 amplia produto e operação; não implementar cinco runtimes simultaneamente.

Não editar migrações publicadas, não distribuir chaves ao modelo e não remover
controles de journal para copiar o DDL simplificado da proposta. Versionar
contratos antes de alterar CBOR/identidade. Separar observação do worker de
decisão do supervisor e evidência persistida de autoridade de execução.

### Aproveitamento do backlog existente

Este plano complementa [implementation-backlog](../../config/implementation-backlog.json)
sem alterar seus estados: A01 → M5; A02 → M3/M8; A03 → M7; A07 → M2;
A08 → M9; A09 → M2/M6; A10 → M1/M5; A11/A12 → M8. O arquivo de status contém
resultados históricos; contagens antigas de crates/migrações não devem ser usadas
como inventário atual. Checkpoints assinados e regeneração já existem e devem
ser integrados, não planejados como se partissem do zero.

## Validação desta auditoria

Resultados dos comandos executados em 22/10/2026:

| Comando | Resultado | O que sustenta |
|---|---|---|
| `cargo test --locked -p arkhe-kernel -p arkhe-core -p arkhe-wormgraph -p arkhe-memory -p arkhe-verify-core` | Exit 0; 46 testes passaram; 1 ignorado | Vetores canônicos, rejeições do gate, provas MMR, checkpoints assinados, regeneração e perfis criptográficos. `arkhe-memory` não contém testes próprios neste comando. |
| `node --test integrations/verify-mcp/tests/verification-scope.test.mjs integrations/verify-mcp/tests/stdio.test.mjs integrations/verify-mcp/tests/c2pa-signature.test.mjs` | Exit 0; 10 passaram, nenhum skip | MCP stdio com WASM existente, limites de canonicalização, provas alteradas, assinatura de claim e trust roots. O binário WASM não foi reconstruído nesta auditoria. |
| `python storage/sql/scripts/static_audit.py` | Exit 0; 8 checks passaram | Presença textual de roles/RLS/triggers/revokes/contexto/idempotência/perfil; não demonstra aplicação efetiva do DDL. |

O teste ignorado é `postgres_source_and_anchored_checkpoint_round_trip`, que
exige `ARKHE_TEST_RUNTIME_DATABASE_URL` com roles e migrações de teste. Os
resultados históricos de PostgreSQL em `docs/STATUS.md` não foram reexecutados.
Testes de PostgreSQL vivo, hardware, cluster e deploy não são inferidos de testes
unitários ou de documentação histórica. Nenhuma infraestrutura foi provisionada
para esta auditoria.

## Redação arquitetural compatível com o estado atual

O Arkhe possui componentes nativos de persistência PostgreSQL com isolamento por
tenant, evidências e identidades canônicas, autorização por política e verificação
WASM. Há suporte a reconstrução MMR e checkpoints assinados, além de uma bancada
local que gera, testa e submete propostas à aprovação de exportação. Ainda faltam
a integração universal das provas na leitura, fila transacional genérica,
admissão e execução protegidas de releases, control plane de deploy e qualificação
de runtimes/TEE. Esses componentes são a base para um produto integrado; sua
existência isolada não demonstra equivalência completa com as três plataformas.
