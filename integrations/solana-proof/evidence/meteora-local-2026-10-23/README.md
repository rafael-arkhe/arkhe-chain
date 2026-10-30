# Evidência do teste local Meteora / Arkhe

Execução de 23/10/2026: **PASS**. Validator Agave 4.3.0 no Ubuntu/WSL, iniciado
pelo launcher do projeto em ledger novo, com snapshot local da configuração DAMM.
Nenhuma transação pública ou carteira pessoal foi utilizada.

| Etapa | Slot finalizado |
|---|---:|
| Configuração DBC | 294 |
| Criação Token-2022 | 327 |
| Compra na curva | 366 |
| Venda na curva | 404 |
| Graduação | 443 |
| Migração DAMM v2 | 482 |
| Compra DAMM v2 | 521 |
| Venda DAMM v2 | 554 |

Raiz MMR dos oito eventos:

```text
727adc0cd5ad70c0cc8ea05a6063e92432908f0bf21cb26b47237c3f4c4157ff
```

Arquivos preservados:

- [report.json](report.json): versões, hashes, endereços e asserções.
- [receipts.json](receipts.json): oito provas de inclusão e eventos completos.
- [events.json](events.json): eventos sem as provas.
- [transactions.json](transactions.json): logs RPC, saldos, slots e taxas.

O checkpoint foi publicado na transação local
`5dVNkgApq6nvLVx144cY8iUjcEBLE5bwqKcUdvZVu4cSXEuCTCArpDmFmJbVMDxTYect2HkJpEztJoHHYSjMRKed`.
Os identificadores pertencem ao genesis local
`7w2gSguomFRBzDZZcDHoHwLyrfoe9Lnhb8ZCMQFAfkwD` e não aparecem no explorer público.

Verificação dos bytes preservados, a partir da pasta do pacote:

```powershell
node src/verify-meteora.mjs evidence/meteora-local-2026-10-23/receipts.json 727adc0cd5ad70c0cc8ea05a6063e92432908f0bf21cb26b47237c3f4c4157ff 8
```

O comando verifica inclusão e ordenação dos eventos contra a raiz fornecida.
Não verifica consenso Solana offline ou autenticidade da raiz. A raiz neste
documento é um registro do teste controlado, não um certificado independente.
Os efeitos econômicos foram conferidos pelo executor durante a execução.

As etapas de preflight negativo, financiamento inicial e ancoragem não integram
as oito folhas de negócio; as transações auxiliares bem-sucedidas estão no arquivo
de transações. A tentativa prematura foi rejeitada na simulação, sem envio.

Reprodução e limitações: [METEORA.md](../../METEORA.md).
