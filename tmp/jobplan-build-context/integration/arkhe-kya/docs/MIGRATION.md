# Migração do PoC — 2026-10-23

## Apresentação com estado persistente

`scripts/gen_fixtures.mjs` produz agora também `presentation.json`, contendo
recibo + status. Recusa sobrescrever ficheiros; para preservar a geração anterior,
fornecer um diretório de saída novo.

```powershell
node integration/arkhe-kya/scripts/gen_fixtures.mjs integration/arkhe-kya/fixtures/with-presentation
integration/arkhe-kya/target/debug/arkhe-kya.exe state-init ops/local/kya-state.json
integration/arkhe-kya/target/debug/arkhe-kya.exe verify-presentation integration/arkhe-kya/fixtures/with-presentation/presentation.json integration/arkhe-kya/fixtures/with-presentation/context.json integration/arkhe-kya/fixtures/with-presentation/policy-demo.json ops/local/kya-state.json
```

Executar antes `cargo build --manifest-path integration/arkhe-kya/Cargo.toml
--locked --bin arkhe-kya` e criar o diretório pai do state file, se necessário.
Usar caminhos de estado controlados pelo operador; não usar um arquivo enviado
pelo agente. A fixture tem tempo/desafio fixos e test keys: não é operação real.
Os comandos mostram uso, não inicializam um estado de produção automaticamente.

O `verify RECEIPT CONTEXT POLICY [STATUS]` continua disponível, mas é stateless.
`verify-presentation` mantém contexto/policy externos e exige persistência.

## Testes e API

Removido `tests/status_standalone.rs`, que apenas incluía o mesmo código de
`crates/arkhe-kya-status/tests/revocation.rs`. A migração do comando é:

```powershell
cargo test --manifest-path integration/arkhe-kya/Cargo.toml -p arkhe-kya-status --locked --test revocation
```

Os cinco gates têm agora uma só implementação/execução por `--workspace`.
O reexport Rust `status` permanece por compatibilidade, sem duplicar o núcleo.
`status_composition` e os exports WASM anteriores permanecem disponíveis.
Os relatórios antigos preservam os números/paths históricos; não representam
o layout atual. Não foram reescritos hashes ou resultados históricos.
