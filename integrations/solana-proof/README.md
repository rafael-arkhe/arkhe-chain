# ARKHE Solana proof prototype

Protótipo experimental de Token-2022, compromisso de intenção, recibo MMR e
ancoragem por Memo. Leia [a especificação revisada](SPECIFICATION.md) e
[o registro de validação](VALIDATION.md).

O fluxo **Meteora DBC → compra/venda → DAMM v2 → compra/venda → Arkhe**
também está implementado e testado em validator local.
Veja [reprodução, parâmetros e limites](METEORA.md).

Testes ampliados de preparação para lançamento, candidatos de parâmetros e
pendências: [PRELAUNCH.md](PRELAUNCH.md). Há 32 testes automatizados aprovados;
o lançamento público continua bloqueado pelas condições ali registradas.

Pré-requisitos: Node.js 24, npm, pacote WASM já presente em
`verification/crates/arkhe-verify-wasm/pkg`. Não é necessário recompilar Rust.
O pacote usa dependências locais e lock próprio; não altera o lock da aplicação.

```powershell
cd D:\arkhe\integrations\solana-proof
npm ci --ignore-scripts --workspaces=false
npm test
npm run demo
```

`demo` grava `output/receipt.json` com eventos explicitamente sintéticos. Para
verificar, forneça uma raiz e contagem obtidas de fonte independente:

```powershell
node src/cli.mjs verify output/receipt.json ROOT_HEX_CONFIAVEL 7
```

Para repetir somente a demonstração sintética, sua raiz determinística é
`a16e7040f8c45c3d493cc6dc5944c9d7c62651642303b72ba7aa4d8aa1e1e701`.
O comando sai com código 1 se a prova for rejeitada. A verificação é offline;
não consulta Solana nem autentica o checkpoint.

Com um `solana-test-validator` já iniciado:

```powershell
$env:SOLANA_RPC_URL = 'http://127.0.0.1:8899'
npm run test:chain
```

Alternativa: `https://api.devnet.solana.com`. Faucet pode estar indisponível.
O executor solicita SOL de teste, cria chaves efêmeras em memória e cria um mint
novo a cada execução. Nenhuma chave privada é gravada. Por isso o mint de teste
não é administrável após o processo terminar. Ele mantém mint e metadata
authorities durante o teste; não é um lançamento de supply fixo.

O teste de cadeia confere presença obrigatória de memo, aceitação de conteúdo
arbitrário, desativação pelo dono, metadados, saldo final, recibo e ancoragem.
Grava `output/chain-receipt.json` e `output/chain-report.json` somente se todas
as asserções passarem. RPC local também pode ser um proxy; o teste rejeita os
genesis hashes conhecidos de mainnet e testnet antes de solicitar fundos.

Os resultados de inclusão não afirmam autenticidade, completude do histórico,
consistência entre checkpoints ou autorização de políticas do Arkhe. Não há
integração de escrita no serviço WormGraph, DAO ou distribuição econômica de lançamento.
