# Workload attestation: implementação parcial e fronteira de confiança

Implementada a composição `AttestedWorkerVerifier`, utilizável como `WorkerVerifier` no `PgKernel`, sem alterar o formato canônico do WER. Não é um verificador nativo de Nitro, TDX ou SEV-SNP e não comprova atestação de hardware. Produção continua não autorizada.

## Controles implementados

A evidência autenticada do provedor deve vincular report/user data ao digest separado por domínio `AKG:WORKLOAD:BINDING:v1`, contendo tenant, hash completo do WER, chave Ed25519 do workload e digest do artefato. `SignedWorkerVerifier` exige recibo válido da chave exata atestada e preserva os controles de módulo, versão, operação, revogação e admissão dos pais.

O wrapper exige plataforma selecionada, todas as medições da política, timestamp não futuro, validade e idade máxima. A política Nitro exige PCR0, PCR1 e PCR2 explícitos, com 48 bytes e valores não nulos; não deduz relações entre PCRs. Rejeitar PCR nulo é defesa adicional, não substitui a validação nativa de debug/TCB.

`ArtifactReader` deve entregar bytes de fonte independente controlada pelo operador; compara-se BLAKE3 dos bytes (domínio vazio) com o digest aprovado. Isso confere identidade do artefato armazenado; só um adaptador e uma cadeia confiáveis podem demonstrar que esses bytes correspondem ao workload executado. Não mede pesos nem integridade do daemon Ollama.

## Componentes ainda necessários

`WorkloadAttestation`, `ArtifactReader`, `AttestationClock` e a configuração de política são dependências de confiança injetadas. Não há implementação padrão que aceite relatórios. O adaptador nativo deve verificar cadeia e raízes aprovadas, assinatura, report data, plataforma, debug, TCB e revogação antes de emitir `VerifiedWorkload`. Estruturas Rust e mocks não são prova criptográfica. Não há autodetecção de provedor, fallback de atestação ou promoção automática de nível de chave.

A interface distingue Nitro, Intel TDX e AMD SEV-SNP. A resposta “ambos” após três opções não identifica dois provedores específicos; por isso nenhum foi arbitrariamente habilitado. Faltam ambiente acessível, documentos de atestação reais e políticas/raízes aprovadas para completar e qualificar cada adaptador nativo. A custódia independente e o vínculo do workload à chave continuam pendentes até essa integração.

## Journal durável existente

`integration/arkhe-bugbounty/src/postgres.rs` já implementa `Journal` em `PgOperations`; `TriageExecutor` já recebe `Arc<dyn Journal>`. As reservas persistem tenant, solicitante, operação, parâmetros, token de proprietário e os estados PREPARED/DISPATCHED/COMPLETED. Replay usa resposta persistida; parâmetros conflitantes são rejeitados; operações incertas exigem reconciliação. Isso não é uma promessa de exactly-once distribuído nem prova de convergência ESR. Não foi criado outro journal concorrente.

Testes existentes de reconexão PostgreSQL e qualificação local estão em `tests/triage.rs`, `tests/provenance.rs` e `tests/support/ollama_postgres.rs`, com evidências anteriores em `docs/evidence/local/2026-10-18/ollama-postgres-qualification/`. Esta alteração não repete inferência Ollama, chamada HackenProof ou qualificação hardware.

## Verificação

Fixtures de atestação são sintéticas. Testam rejeição de falha nativa, plataforma, binding, PCR divergente, expiração, idade e artefato divergente, além de configuração incompleta/debug e separação dos bindings por registro, tenant, chave e artefato. Um teste com Ed25519 real rejeita recibo de chave diferente da atestada. Resultados locais em `docs/evidence/local/2026-10-18/workload-attestation/RESULTS.md`.

As alegações bibliográficas do anexo não foram revalidadas neste trabalho e não são usadas como prova de segurança do código. Liveness formal, atestação do daemon e custódia isolada permanecem pendentes.

Resultado: 85 testes do workspace passaram, sem falhas; formatação e arquitetura passaram. O teste PostgreSQL `durable_journal_reconnect_replays_response_and_rejects_mismatch` passou com banco local real e feature `postgres-integration`. Todos os comandos registrados mantiveram o mesmo hash de fonte antes/depois. Não houve qualificação de TEE real.
