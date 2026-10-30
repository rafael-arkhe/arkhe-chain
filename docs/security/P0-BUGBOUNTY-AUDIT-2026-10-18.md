# Auditoria dos cinco itens P0 do novo anexo

Auditoria local do código e das evidências existentes; nenhuma pesquisa bibliográfica adicional, inferência ou chamada HackenProof foi feita nesta rodada. O anexo repete como pendentes componentes implementados. As classificações LEMMA e os benchmarks externos recebidos não são evidência de qualidade deste modelo ou deste repositório.

| Item solicitado | Evidência no repositório | Estado e limite |
|---|---|---|
| WorkerVerifier com chave real | `integration/arkhe-bugbounty/src/provenance.rs`, `src/postgres.rs`; captura `public-test-registry.json`, `analysis-receipts.json`, `execution-receipts.json` | Verificação Ed25519 real implementada; custódia e credenciais aprovadas de produção continuam pendentes. Chaves da captura são efêmeras de teste. |
| Kernel::admit persistente | `src/postgres.rs`: PgKernel exige WorkerVerifier antes de commit_verified_worker | Implementado e exercitado com PostgreSQL e consulta após reconexão. Não equivale a atestação de hardware. |
| OperationJournal durável | `src/postgres.rs`: PgOperations; `src/lib.rs`: executor | Implementado, com parâmetros separados, token de proprietário, replay e reconciliação. Operação incerta bloqueia retry automático; não há garantia de exactly-once distribuído. |
| OllamaAnalyzer estruturado | `src/ollama.rs`: Assessment/schema, nonce UUID por requisição e objeto JSON com relatório não confiável | Implementado. O nonce identifica a fronteira JSON; não há delimitadores textuais com sufixo. É mitigação de formatação, não garantia contra prompt injection. |
| MCP pins e allowlist | `src/mcp.rs`: ToolPins e HackenProofMcpClient | Implementado, pinando definição completa, inclusive schemas. Catálogo/codec e endpoint reais ainda precisam de qualificação; descoberta não aprova pins. |

Os caminhos `src/` na tabela referem-se a `integration/arkhe-bugbounty/src/`.

## High/Critical e evidência humana

`ReviewRouter` encaminha High/Critical para revisão mesmo com confiança máxima. No fluxo revisado, `ContainmentGate::authorize_routed_admitted` exige revisão humana aprovada, vinculada ao registro, política, operação e parâmetros, dentro da validade, por módulo permitido, e com atestação admitida. `ReviewProtectedPolicy` impede usar a entrada legada sem roteamento. Essa proteção precisa estar instalada na composição do executor; não é correto afirmar que toda configuração legada ganha revisão obrigatória automaticamente.

Não foi adicionado PoC como alternativa automática: não existe verificador Foundry/fork/differential/ZK integrado. `EvidenceKindRequirement` nominal não transformaria o output do LLM em prova humana ou prova de exploit. A implementação usa o caminho conservador de revisão, com raízes humanas reais ainda não provisionadas. O wrapper `AttestedWorkerVerifier` também depende de adaptadores nativos ainda pendentes.

## Evidência executada reutilizada

`docs/evidence/local/2026-10-18/web3-local-requalification/` contém dois comandos PASS: inferência real com Ollama + assinaturas Ed25519 + PostgreSQL, seguida de verificação das assinaturas e do grafo após reconexão, sem segunda inferência. INV-WER-06/07, replay e parameter mismatch passaram. Nesta auditoria, os hashes dos dois logs foram conferidos e os arquivos-fonte atuais correspondem ao snapshot executado. Não foi necessário repetir os testes ou alterar o código.

O modelo observado foi `north-mini-code-1.0:latest`, digest `d8b269ad5c7c7144ce104b83ce93bc3efb85e0f74e01be6be5f5d6f7ca90b60f`. Os números de benchmarks externos do anexo não se aplicam automaticamente a ele. Upstream HackenProof e governança permaneceram sintéticos. Não houve revisão humana real.

## Correções de conclusão

Ausência de menção documental à idempotência do servidor não demonstra ausência de suporte; o cliente deve continuar sem presumir essa garantia. O journal bloqueia reenvio em resultado incerto e exige reconciliação, em vez de prometer impedir qualquer duplicação remota.

Uma execução local do adaptador não demonstra integração real Arkhe–HackenProof, desempenho Web3 ou autorização de produção. Estado: qualificação local executada; HackenProof real, custódia isolada, TEE nativo e ratificação humana pendentes; `production_authorized=false`.
