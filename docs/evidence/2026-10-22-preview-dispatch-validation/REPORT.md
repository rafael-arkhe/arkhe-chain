# Validação do worker e cockpit

22/10/2026.

- Rust workspace: PASS; testes vivos opt-in permanecem ignorados nesse comando.
- Runtime/kernel final: PASS, reexecutado após o ajuste final dos caminhos de erro.
- PostgreSQL/CLI/worker: PASS, executado separadamente sem skip em cluster descartável.
- Python: 233 testes passaram.
- Intra: 45 testes passaram; TypeScript: PASS.
- Arquitetura e formatação: PASS.

Contagens por log e SHA256 em results.json; testes repetidos não são somados como casos independentes.

Qualificação operacional: SEAL_BLOCKED. Não houve execução real qualificada nem migração do banco da aplicação. Containers de teste removidos por IDs exatos.
