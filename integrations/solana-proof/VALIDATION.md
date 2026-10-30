# Validação — 23/10/2026

Atualização posterior: **32 testes aprovados**, inspeção de deployments e ensaios
adversariais ampliados. Consulte [PRELAUNCH.md](PRELAUNCH.md). Os registros abaixo
são históricos e não substituem essa matriz de prontidão.

Atualização: o cenário Meteora DBC → DAMM v2 também passou em validator local.
A suíte agora tem **15 testes aprovados**. Consulte [o relatório Meteora](METEORA.md)
e [a evidência preservada](evidence/meteora-local-2026-10-23/README.md).
O registro abaixo descreve a primeira etapa de Token-2022; suas limitações de
DEXs se referem àquela etapa.

Ambiente: Windows, Node.js v24.13.0, npm 11.16.0; validator Agave
`solana-test-validator 4.3.0` no Ubuntu/WSL. SDK legado web3.js 1.98.4,
spl-token 0.4.14 e spl-token-metadata 0.1.6 fixados no lock local.

## Testes offline

`npm test`: nove testes aprovados, zero falhas.

- Construtor MMR comparado com todas as provas dos vetores congelados de 1, 3,
  4, 5 e 7 folhas, incluindo raiz, hashes, tipos e direções dos passos.
- Todos os 13 recibos de um lote adicional verificados com o WASM do Arkhe.
- Modificações no valor, destinatário, assinatura, slot, prova, raiz e contagem
  rejeitadas.
- Inteiros u64, codificação de intenção e restrição de RPC exercitados.
- Instruções reais decodificadas para conferir programa, destinatário, valor,
  casas decimais e adjacência do Memo.

`npm run demo`: recibo sintético exportado e verificado; sete folhas.
`node src/cli.mjs verify ... ROOT 7`: inclusão válida com raiz explícita.
`node --check src/chain.mjs`: sintaxe válida.

## Execução no validator

Teste completo executado contra `http://127.0.0.1:18899`.
Não foi usado saldo ou carteira do usuário. Faucet local e chaves efêmeras.

Comando usado para iniciar o validator já instalado neste computador:

```powershell
wsl -d Ubuntu -- /home/arkhen/.local/share/solana/install/active_release/bin/solana-test-validator --ledger /tmp/arkhe-solana-proof-20261023 --rpc-port 18899 --faucet-port 18900 --dynamic-port-range 19000-19030 --bind-address 127.0.0.1 --quiet
```

O faucet acima ocupa a porta que seria usada pelo websocket. O executor usa
somente polling HTTP; para reproduções futuras com websocket, escolher outra
porta de faucet, por exemplo 18950.

Asserções aprovadas: criação do mint Token-2022 e metadados; criação de duas
contas de token; habilitação de MemoTransfer; rejeição específica `NoMemo`;
aceitação de memo arbitrário; transferência com compromisso de intenção;
finalização e recibo MMR válido; publicação do checkpoint; desativação da
exigência pelo dono e transferência posterior sem memo; saldo final 102 unidades
base no destinatário.

Uma execução produziu:

```json
{
  "genesisHash": "6d8FgedxYh8viKtDPqPEsT4waXubshfirngqDEwJKEWy",
  "mint": "8V8vEKgJshynE16Ai44B3J9erJhBYXkYwomQgYX5xAbF",
  "signature": "qVW2yP8EuRcefBtjXtpE3GV5Wcsm4tggHJtvM8JrS9RBmi7yfCWzoAKuQWN8wYjYsQwgnqWpetUqJjHfM5VvLbR",
  "anchorSignature": "5Dk4niPmVktnjJ7CTTeZFhw46PzM7cn8CsbLCifyPDsacW66Smyh47XbmaFR5RXnvJhV858YeNbs8VZbWVYmcCnv",
  "rootHex": "d1bf63a4568eeae2823cf3193d68bd03e65f19ad578bbef69e677ed29d564ab4",
  "destinationAmount": "102",
  "globalTransferCoverage": false
}
```

A execução final também passou após acrescentar comparação dos programas e
bytes das instruções recuperadas do RPC, além do emissor da ancoragem. Seu mint
foi `FejQcP6jBvpUik1vTshidAdz7R9i3vuRe2nmw1ieAGSQ` e sua raiz foi
`e40c4724cc8575bc7bed2389f0ae9c12a5a0d16d1033bc15cc385745fb5ca58c`.
O verificador CLI também foi exercitado com raiz incorreta: retornou inclusão
falsa e código de saída 1. O validator iniciado para estes testes foi encerrado
ao concluir a validação.

Esses identificadores pertencem exclusivamente ao ledger local. Não são links
de explorer público. `output/chain-report.json` e `output/chain-receipt.json`
são atualizados por novas execuções aprovadas. O ledger temporário é evidência
de execução local, sem garantia de retenção futura.

## Limites observados

A tentativa na devnet pública falhou no airdrop com erro RPC `-32603: Internal
error`, antes da criação do mint. A validação completa foi realizada no validator
local, não na devnet nem na mainnet.

Os pacotes exibem aviso de ausência do binding bigint opcional; o fallback
JavaScript executou os testes corretamente. A instalação usou `--ignore-scripts`.

Não foram testados indexação contínua, conectores DEX/wallet/launchpad,
Transfer Hook próprio, governança, recompensas, vesting e liquidez. Nenhum
destes recursos é anunciado como implementado. O diretório `D:\arkhe` não
continha metadados Git acessíveis; a entrega consiste nos arquivos locais,
sem commit ou pull request.
