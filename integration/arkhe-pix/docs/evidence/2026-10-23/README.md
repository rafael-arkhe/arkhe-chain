# Execução local — 2026-10-23

- `cargo test --locked --workspace`: 12 testes do núcleo, zero falhas.
- `cargo clippy --locked --workspace --all-targets -- -D warnings`: passou.
- `node scripts/build-wasm.mjs`: target wasm32-unknown-unknown, wasm-bindgen 0.2.126, saídas web e Node.
- `node --test scripts/parity.test.mjs`: 4 testes, zero falhas. CLI/WASM positivo e negativo, golden JCS, JSON inválido.
- Browser local em 127.0.0.1:8789: assinatura válida sintética; alteração de 12500 para 1 centavo retornou signature_invalid.
- Capturas browser-positive.png e browser-tampered.png mostram resultados observados. Smoke pontual, não suíte de UI automatizada persistida.
- Fixtures geradas pelo CLI Rust, JCS/digest/assinatura pelo núcleo Rust; golden não é implementação independente.
- Nenhum PSP, pagamento, envio externo, chave privada real ou publicação Hashtree.

Correções ao esboço: E2E 32 ASCII alfanuméricos conforme API Pix 2.10.0; identificador de chave não se apresenta como DID:key; verificação estrita e prova coerente com pin externo; domínio criptográfico explícito; limites e parser estrito; sucesso qualificado como synthetic-poc. O primeiro ensaio de fixture tinha tamanho E2E incorreto e foi corrigido antes dos gates finais. Clippy sinalizou tamanho do enum de resultado; a exceção está documentada e limitada a esse enum, mantendo o formato JSON público.
