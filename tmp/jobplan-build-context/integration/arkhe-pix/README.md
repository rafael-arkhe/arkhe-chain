# Arkhe Pix — recibo assinado sintético

Workspace independente, local e experimental. Produz e verifica recibos assinados em Rust/CLI/WASM. O resultado `signature_valid_synthetic` prova assinatura sob a chave fornecida pelo verificador e integridade dos campos assinados. `settlement=NOT_VERIFIED`, `kya_authorization=NOT_VERIFIED`, `purpose_binding=SIGNER_CLAIM_ONLY`. Referenciar um passaporte não demonstra sua validade ou autorização; purpose_hash não verifica automaticamente o dataset. O timestamp de liquidação é uma declaração do emissor.

Todos os recibos deste perfil exigem `profile=arkhe-pix-receipt@1` e `label=synthetic-poc`. A chave determinística `[7;32]` é pública para testes; qualquer pessoa pode emitir essas fixtures. Nenhum pagamento, identidade real, consulta a PSP/BCB ou token é necessário ou executado. Não é W3C Data Integrity, DID:key ou integração KYA.

## Executar

Requisitos: Rust 1.96.0, Node (testado 24.22.1), target wasm32-unknown-unknown e wasm-bindgen CLI 0.2.126.

```powershell
cargo test --locked --workspace
cargo clippy --locked --workspace --all-targets -- -D warnings
node scripts/build-wasm.mjs
node --test scripts/parity.test.mjs
cargo run --locked -p arkhe-pix-cli -- verify --receipt tests/fixtures/receipt-clear.json --signer-hex ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c
python -m http.server 8789 --bind 127.0.0.1 --directory site
```

Abra http://127.0.0.1:8789/ e cole o JSON da fixture e a chave acima. O browser usa o mesmo núcleo Rust. A página não obtém a chave do recibo e não envia os dados a terceiros. Depois de carregar JS/WASM, a verificação não consulta rede. A UI devolve “Não verificável” em falhas. O site ainda não está publicado.

Para emitir uma fixture nova, sem sobrescrever ficheiros existentes:

```powershell
cargo run --locked -p arkhe-pix-cli -- issue-fixture --out tests/fixtures/new-demo.json
cargo run --locked -p arkhe-pix-cli -- canonicalize --receipt tests/fixtures/receipt-clear.json
```

Geração, JCS e assinatura são executados em Rust. `canonicalize` imprime hex dos bytes JCS. CLI `verify` retorna exit 0 somente para assinatura válida sintética, 1 para reprovação criptográfica/estrutural e não-zero para erro de leitura. Não existe comando de assinatura para produção.

## Contrato criptográfico e limites

Digest = BLAKE3(`ARKHE:PIX:RECEIPT:v1\0` || JCS(receipt)); assinatura Ed25519 sobre esses 32 bytes, verificada com verify_strict. Tipo de prova e identificador explícito `ed25519-pubkey-hex:<hex>` devem coincidir com a chave externa. Chaves/digests são hex minúsculo; assinatura base64url sem padding, canónica. A chave prova posse, não identidade jurídica.

Entrada JSON até 32 KiB, campos desconhecidos e duplicados rejeitados (incluindo metadata). Montante entre 1 e 999999999999 centavos, BRL; timestamp entre 0 e 2^53-1 segundos; metadata até 16 entradas, chave até 64 bytes e valor até 256; referências de partes até 128 bytes. Estes são limites locais, não validação fiscal, cadastral ou dos formatos de chave Pix.

E2E: exatamente 32 caracteres ASCII alfanuméricos segundo [API Pix BCB 2.10.0, EndToEndId](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml). O regex de 20 caracteres do esboço foi corrigido. Txid neste perfil é obrigatório, 26–35 alfanuméricos (cobrança); não se afirma suporte a todos os tipos Pix. Sintaxe não verifica existência, unicidade ou liquidação. A API Pix padroniza serviços do PSP recebedor; não oferece aqui um registo público consultável apenas com E2E.

Golden vectors em tests/fixtures fixam recibo, bytes JCS, assinatura, chave e resultado. Foram gerados pelo próprio código Rust, não constituem validação por implementação independente. Não mudar silenciosamente vetores para mascarar regressão.

Consulte docs/MATURITY.md, docs/THREAT_MODEL.md e docs/adr/. O freeze E02 e a release KYA não foram alterados. Código não publicado no Hashtree nesta execução.
