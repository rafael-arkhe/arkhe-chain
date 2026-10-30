# Checklist de produção — reconciliação com o workspace real

Data: 24/10/2026. Escopo: `D:\arkhe`, workspace Cargo da raiz com 27 membros e aplicação `apps/arkhe-intra`. O blueprint `arkhe-fintech` anexado não é um workspace ativo deste Cargo.toml; esta execução não o compila ou qualifica.

**O primeiro teste não falha no build: build, testes e Clippy passaram. Isso remove a alegação de código não compilado, mas não autoriza produção.** Não houve deploy, contratação de serviços ou alteração de infraestrutura nesta ronda.

## Execução desta ronda

| Gate | Resultado observado | Evidência |
|---|---|---|
| `cargo build --workspace --locked` | exit 0 | [01-build.log](evidence/2026-10-24-production-check/01-build.log) |
| `cargo test --workspace --locked` | 293 aprovados, 0 falhas, 3 ignorados; exit 0 | [02-test.log](evidence/2026-10-24-production-check/02-test.log) |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | exit 0 | [03-clippy.log](evidence/2026-10-24-production-check/03-clippy.log) |
| Suíte Node completa de arkhe-intra | 101 aprovados, 0 falhas, 0 ignorados; exit 0 | [intra-tests-fixed.log](evidence/2026-10-24-production-check/intra-tests-fixed.log) |

[Manifest Rust](evidence/2026-10-24-production-check/results.json), [inputs e hashes](evidence/2026-10-24-production-check/inputs.json), [tentativas Node](evidence/2026-10-24-production-check/intra-results.json). Reprodução dos gates Rust: `python scripts/production_rust_gates.py`. A identidade registrada permaneceu estável durante os gates; seu escopo de arquivos está explicitado no manifest, sem alegação de hash de todo o diretório.

A suíte Node corresponde ao comando `node --test tests/*.test.mjs` do pacote, executado com reporter TAP e caminho explícito a partir da raiz. Não é um teste de navegador de todas as telas.

### Falhas encontradas e corrigidas

A [primeira tentativa Node](evidence/2026-10-24-production-check/intra-tests.log) teve 99 aprovações e duas falhas. As correções foram restritas ao harness:

1. `development.test.mjs` calculava Cargo.lock a partir de `process.cwd()`, falhando quando chamado da raiz. Passou a resolvê-lo a partir do próprio arquivo.
2. `store-resilience.test.mjs` liberava o lock do worker após 500 ms, permitindo que uma máquina ocupada chegasse à asserção depois da liberação. O worker agora mantém o lock até a mensagem explícita do processo principal, liberando-o em `finally`. A exigência de rejeitar a transação e não executar o callback sob lock foi mantida.

Nenhum controle de runtime foi removido para fazer a suíte passar. O build inicial, antes dessas mudanças de testes, também passou e está preservado em [build.log](evidence/2026-10-24-production-check/build.log).

### Três testes não executados

- `transactional_preview_outbox_and_real_cli`: requer PostgreSQL descartável via `ARKHE_TEST_PREVIEW_ADMIN_DATABASE_URL`.
- `real_postgres_commit_kill_reopen_rollback_and_tenant_isolation`: requer cluster isolado migrado, role restrita e exemplo `memo_persistence`.
- `postgres_source_and_anchored_checkpoint_round_trip`: requer `ARKHE_TEST_RUNTIME_DATABASE_URL` e roles migradas.

Eles continuam ignorados nesta execução. Testes que retornam cedo por ausência de ambiente também não devem ser interpretados como validação de serviço externo. O total aprovado não demonstra cobertura completa de ambientes, features opcionais ou caminhos de erro.

## Matriz dos dez itens

| Item | O que a evidência permite afirmar | O que continua sem qualificação de produção |
|---|---|---|
| 1. Secrets | `.env.example` da raiz não propõe chave privada de assinatura: documenta token de API e conexão privados. Tokens e chaves de assinatura têm funções diferentes. | KMS/HSM operacional, rotação e custódia do perfil de destino não foram validados. A raiz não tem metadados Git; não foi comprovada ausência de secrets no histórico completo. |
| 2. Erros | O workspace compila, a suíte negativa existente passa e Clippy está limpo. | Não foi feita prova de cobertura de toda variante, auditoria de todo `unwrap`, fuzzing ou análise completa de panic/DoS. Clippy não oferece essa garantia. |
| 3. Inputs | E02 aplica parser restrito; HTTP limita corpo e valida JSON/origem; os testes atuais exercitam recusas. | Validação e confiança de cada integração externa precisam de critérios próprios. Ausência de Zod não demonstra ausência de validação. O `KyaClient` do blueprint não foi validado por estes gates. |
| 4. Auth | O portal valida sessão por hash do token, expiração e revogação, com cookie HttpOnly/SameSite; há verificações por role. O runtime Rust exige Bearer e fixa tenant na configuração de conexão. | Single-org não é SaaS multi-tenant. IAM externo, passkey/DID, MFA, revogação distribuída e o modelo de identidade de cada serviço não foram qualificados. A alegação genérica de que qualquer `X-Tenant-Id` é aceito não descreve o runtime inspecionado. |
| 5. Migrações | Há histórico executado de migrações/RLS PostgreSQL; o portal usa SQLite e tem testes de integridade, FK e recuperação. | Os três testes PostgreSQL acima não rodaram nesta ronda; falta validar a versão atual no ambiente escolhido e seu procedimento de atualização. Configuração de CI sozinha não comprova execução atual. |
| 6. Observabilidade | O portal implementa métricas Prometheus, controle de acesso e logs estruturados; TLS local, scrape e datasource têm evidências históricas delimitadas. | Não foi demonstrada operação de alertas, paging, SLO/error budget ou tracing distribuído no ambiente de produção. Um ID gerado no log não comprova propagação de correlação entre serviços. |
| 7. Testes | 293 testes Rust e 101 Node passaram nesta ronda. E02 tem execução remota própria vinculada a commit. | Não há CI remoto desta execução completa da raiz nem teste do blueprint fintech. Cobertura quantitativa e dependências externas continuam separadas. |
| 8. Rate limits | Login, registro/convites e recuperação possuem limites locais; o teste confirma que um login limitado não bloqueia outra conta. | Não foi demonstrado token bucket global por tenant, proteção distribuída/por IP, orçamento de provedor ou load shedding geral. Limites locais não equivalem a defesa contra DDoS. |
| 9. Segurança/performance | Clippy com todos os targets padrão passou; validação E02 e testes negativos estão executados. Há evidência de TLS local com CA explícita. | Não foram executados nesta ronda cargo-audit/SAST completos, fuzzing, pentest, teste de carga, WAF ou certificado/domínio público. TLS local não qualifica a borda pública. |
| 10. Recuperação/rollback | Existe backup/restauração SQLite que exclui chave privada, verifica integridade e elimina sessões restauradas; a suíte Node atual o exercita. | Agendamento operacional, cópia independente, perda de host, RPO/RTO e ensaio de recuperação PostgreSQL/deployment de destino não foram demonstrados. Down migration não é o único mecanismo possível de recuperação, nem foi testada aqui. |

## Evidências anteriores usadas na reconciliação

São históricas, com versão, ambiente e limites próprios; não se tornam resultados atuais por referência:

- [Execução local de 17/10](EXECUTION.md): migrações PostgreSQL, gates SQL, runtime e observabilidade locais.
- [Reconciliação de 22/10](evidence/2026-10-22-feature-backlog/RESULTS.md): testes e Clippy anteriores do workspace.
- [Infraestrutura Enterprise de 23/10](../arkhe-enterprise/INFRASTRUCTURE-REVIEW.md) e [report.json](../arkhe-enterprise/validation/2026-10-23/infrastructure/report.json): TLS local, backup/restauração e logs; limites de cgroups e operação pública explicitamente pendentes.
- [E02 remoto de 24/10](evidence/remote-ci/e02-40091638278/README.md): snapshot E02 com 20 testes, 165 comparações nativo/WASM e quatro análises axe. Não representa o workspace inteiro.

Fontes inspecionadas nesta ronda: `apps/arkhe-intra/lib/auth.mjs`, `http.mjs`, `observability.mjs`, `scripts/backup.mjs`, `orchestration/arkhe-runtime/src/main.rs` e testes correspondentes. O portal define roles owner/author/reviewer; não se atribuem a ele os roles de um blueprint diferente.

## Decisão de prontidão

Não há fundamento para repetir “o build é a primeira falha” ou “nunca compilou”. Também não há fundamento para liberar produção apenas porque estes gates passaram, ou contar oito bloqueadores universais sem definir o perfil de implantação.

O próximo gate técnico delimitado é executar os três testes PostgreSQL contra um cluster descartável com as roles exigidas, sem reutilizar credenciais ou bancos de produção. A liberação posterior exige um perfil de implantação e aceite que vincule identidade, custódia de chaves, isolamento, limites, alertas e restauração ao ambiente efetivamente operado. Integrações financeiras/institucionais e confiança de recibos externos mantêm os limites já registrados.
