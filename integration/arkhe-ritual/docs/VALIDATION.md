# Validação executada — 26/10/2026

Estado atual após o Caminho B: **32 testes locais passaram**, zero falhas e zero
ignorados; formatação e Clippy passaram. São 27 testes com PostgreSQL e cinco sem
DB. O fornecedor Stripe é simulado nos nove testes novos. Log em
`artifacts/stripe-local-tests-20261026.log`. Execução autenticada na Stripe ainda
pendente de credencial; nenhum PaymentIntent externo foi criado.

Ambiente: Windows, Rust 1.96.0, PostgreSQL 16.14 portátil, escuta restrita a
127.0.0.1:55439. SQLx criou bases descartáveis independentes para os testes.
Nenhuma base de produção ou serviço pré-existente foi usado.

Resultados da base anterior, preservados no log original:

- `scripts/test.ps1`: exit code **0**; **23 testes passaram**, zero falhas,
  zero ignorados. 19 testes usam PostgreSQL; 4 verificam criptografia, vetor
  fixado, identidade e gate sem DB. Log em `artifacts/test-20261026.log`.
- Migração completa aplicada automaticamente nos testes PostgreSQL.
- Gate real: atestação válida com política que nega a operação foi rejeitada;
  mapeamento divergente de destino também foi rejeitado.
- Concorrência: mesmo desafio e desafios diferentes para o mesmo efeito resultaram
  em um único efeito/autorização/outbox.
- Rollback: falha injetada no INSERT de outbox desfez consumo e registros anteriores.
- Taxa: saldo insuficiente reverte aceitação; replay não debita de novo.
- Perda de resposta: destino commitou; objeto do destino foi recriado; consulta
  recuperou evidência; worker antigo foi rejeitado; reconciliação não reenviou.
- Retry: autorização antiga foi rejeitada; nova autorização com desafio novo e
  destino durável permitiu outra aquisição, preservando o effect_id.
- Checkpoint: assinatura confiável + inclusão + autorização offline passaram.
  Chave incorreta, record adulterado e raiz incorreta (inclusive reassinada pela
  chave de teste) foram rejeitados.
- Vetor de autorização: CBOR **363 bytes**, BLAKE3 e assinatura Ed25519 conferidos
  por Rust e independentemente por Python (`cbor2`, `blake3`, `cryptography`).
  O teste `pinned_authorization_vector_matches_rust_encoder_and_signature` lê
  diretamente o JSON entregue e compara os valores fixados. Saída Python em
  `artifacts/vector-20261026.log`.
- `cargo fmt -- --check` e Clippy com `-D warnings` passaram.

Limites da execução: resposta perdida e reinício do objeto do destino são cenários
simulados sobre transações PostgreSQL reais; não houve SIGKILL, falha de energia,
hardware TEE, transação em cadeia, wallet ou pagamento real. No cluster portátil
descartável, fsync/synchronous_commit foram desativados para reduzir custo de I/O
dos testes Windows. Isso não valida durabilidade contra queda do servidor/energia.
O compose entregue mantém os padrões do PostgreSQL; não desativa fsync.

O fixture usa chaves privadas públicas e determinísticas apenas para testes. Os
testes fornecem evidência dos cenários exercitados, não uma prova geral de correção.

## Consulta RPC adicional

Após receber https://docs.ritualfoundation.org/, `scripts/probe_ritual.py` consultou
o RPC oficial: chain ID 784, genesis correspondente e código no registry documentado.
Ed25519 em 0x0009 aceitou o vetor e rejeitou mensagem adulterada por `eth_call`.
Zero transações enviadas. Resultado em `vectors/ritual-rpc-observation.json`;
nova execução capturada em `artifacts/rpc-20261026.log`.
