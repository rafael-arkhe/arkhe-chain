# Maturidade — 2026-10-23

| Componente | Estado | Evidência / limite |
|---|---|---|
| Núcleo JCS+BLAKE3+Ed25519 | Executado | 12 testes Rust, incluindo os 5 gates originais corrigidos e golden |
| CLI e WASM | Executado | 4 testes Node: paridade positivo/negativo, golden JCS e entradas inválidas |
| Clippy | Executado | workspace/all-targets com -D warnings |
| UI browser | Smoke executado | positivo sintético e montante adulterado; capturas em evidence/2026-10-23 |
| API PSP | PENDING | arkhe-pix-bcb é stub, não faz rede |
| Liquidação | NOT_VERIFIED | E2E, montante e horário são declarações assinadas |
| Autorização KYA | NOT_VERIFIED | digest opcional não verifica mandato nem passaporte |
| Identidade das partes | NOT_VERIFIED | nenhuma validação de CPF/CNPJ/cadastro |
| Consumidor real | PENDING | sem cliente, disputa ou pagamento real testado |
| Publicação | PENDING | workspace local, sem tag/release Hashtree |

Testes não são auditoria externa nem prova de ausência de vulnerabilidades. Assinatura por chave de fixture pública não é autenticidade de comerciante. Não foram feitas alegações legais sobre eFX ou stablecoins; são alheias ao escopo.
