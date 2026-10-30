# E02 — smoke real em Solana devnet, 2026-10-23

Resultado: `VERIFIED` no CLI local usando `dataset.json`, `anchor.json` e
`ref.json`. As duas transações são reais; as folhas permanecem `synthetic-poc`.
Publisher de chave única para PoC, sem quórum. Não é evidência mainnet nem
declaração de veracidade dos artefactos.

- Publisher: `Bws6Zes8RJGgApCWk8gSYbToF9YGD3h8imwrtNLbhsjj`.
- Root: `54cb6260ac34ce27eacf23d44e1a2d13842c38cd564d969cb81e17e96f5a7ef9`.
- Folhas: 2; referência ao índice 0, `stage10-gguf/bundle.json`.
- Digest BLAKE3 dos bytes exatos de `dataset.json`:
  `022fe7a7311d8e1834f39f4ca4a9de6bc8d8c4f6c5c97ce792c1259768fdcfa8`.
- [Âncora, slot 514359515](https://explorer.solana.com/tx/49huT5GHJzUTK77kqFv93RV7iQdRJbAgpAMjoBxYsQz84M9G52rU4UA4yyqTek3tcTrtxyxuMASvo47DincVU4vA?cluster=devnet).
- [Referência, slot 514359520](https://explorer.solana.com/tx/2yvLFFucz4iVM9MEZRGUMpUvV3hbj8HNrkMmPPPqLzT2xTFwkkY53nXcRTSehNFVSw1AxrioTfUojFWBruu5FCEQ?cluster=devnet).

`rpc-confirmation.json` regista genesis devnet, estados consultados novamente e
verificação Ed25519 independente da proveniência com a chave pública local.
O verificador E02 continua a apenas exibir a declaração de proveniência.
`verification.json` contém a saída do CLI. Não há seed neste diretório.

Reproduzir a verificação offline a partir da raiz do workspace:

```powershell
node scripts/e02_verify.mjs --receipt docs/evidence/2026-10-23-e02-devnet-smoke/ref.json --anchor docs/evidence/2026-10-23-e02-devnet-smoke/anchor.json --dataset docs/evidence/2026-10-23-e02-devnet-smoke/dataset.json
```

Os recibos foram recolhidos por `getTransaction` em
`https://api.devnet.solana.com`, com compromisso `confirmed`. O dataset foi
assinado antes da ancoragem. Preservar os bytes; não voltar a formatá-lo.
As fixtures anteriores da UI continuam sintéticas e não foram substituídas.

Na ronda de conformidade posterior, os mesmos três ficheiros foram novamente
verificados em Node e no motor browser com resultado `VERIFIED`. O verificador
passou a incluir `observation_warning`: não autentica os recibos RPC e depende
do canal de observação para a fidelidade on-chain. `verification.json` preserva
a saída histórica anterior a esse campo; o dataset e os recibos não mudaram.
Cobertura e comandos atuais: `docs/E02-CONFORMANCE.md`.
