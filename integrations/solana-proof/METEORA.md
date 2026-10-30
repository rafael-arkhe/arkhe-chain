# Meteora DBC → DAMM v2 → Arkhe

Validação em 23/10/2026: **PASS em validator local**, usando os programas SBF
de teste publicados pela Meteora. Este resultado não é um lançamento público.
A suíte offline terminou com **15 testes aprovados**; o cenário completo também
passou num segundo ledger novo iniciado pelo launcher do pacote.

## O que foi executado

1. Configuração DBC e criação de mint Token-2022 com metadados e seis casas.
2. Conferência da revogação das autoridades de mint e freeze.
3. Rejeição específica de migração prematura na simulação de preflight.
4. Compra no DBC, com tokens recebidos e aumento da reserva quote.
5. Venda de metade dos tokens recebidos, com débito exato e redução da reserva.
6. Graduação por `SwapMode.PartialFill`, conferindo o limite de reserva on-chain.
7. Migração para DAMM v2, com `isMigrated`, liquidez positiva e dois vaults
   financiados; conferência do reembolso de flash rent.
8. Compra e venda no pool DAMM v2, com limites mínimos derivados das cotações.
9. Oito eventos exportados, provas MMR verificadas pelo WASM do Arkhe e rejeição
   de uma observação adulterada.
10. Ancoragem da raiz em Memo e recuperação da transação finalizada para conferir
    programa e conteúdo.

O executor assina com chaves efêmeras em memória. Para cada operação, recupera
a transação finalizada, exige sucesso, compara BLAKE3 da mensagem com a mensagem
assinada e confere o programa esperado. Registra logs, taxas e saldos de token.

## Reprodução

Pré-requisitos: Node.js 24 e `solana-test-validator` instalado no Linux ou no
Ubuntu/WSL. No Windows, o launcher procura o executável no PATH do WSL ou na
instalação padrão Solana. Outra distribuição pode ser escolhida com
`ARKHE_WSL_DISTRO`.

Primeiro terminal:

```powershell
cd D:\arkhe\integrations\solana-proof
npm ci --ignore-scripts --workspaces=false
npm run prepare:meteora
npm run validator:meteora
```

Depois que o validator começar a produzir slots, no segundo terminal:

```powershell
cd D:\arkhe\integrations\solana-proof
npm test
$env:SOLANA_RPC_URL = 'http://127.0.0.1:18899'
npm run test:meteora
```

O launcher cria ledger novo com nome único, sem `--reset`. Usa RPC `18899`,
websocket `18900`, faucet `18950` e portas dinâmicas `19100–19139`.
O executor exige ambiente local e rejeita os genesis hashes públicos conhecidos.
Solicita **100 SOL fictícios** ao faucet local, sem carregar carteira pessoal.

Verificação offline, com raiz e contagem obtidas por canal de confiança:

```powershell
npm run verify:meteora -- output/meteora/receipts.json ROOT_HEX_CONFIAVEL 8
```

Retorna código 1 quando rejeitado. A raiz muda a cada execução porque as chaves,
assinaturas e slots mudam. Usar a raiz do próprio bundle demonstra apenas
autoconsistência, sem autenticar o publicador.

## Ambiente fixado e evidências

| Componente | Versão / origem |
|---|---|
| Runtime testado | Windows, Node.js 24.13.0; Agave 4.3.0 no Ubuntu/WSL |
| DBC SDK | `@meteora-ag/dynamic-bonding-curve-sdk@2.0.0` |
| DAMM v2 SDK | `@meteora-ag/cp-amm-sdk@1.5.1` |
| Binários oficiais | Commit `3a965ec0c0a527c2be3c48b8b479366705bf4926` do SDK |
| Configuração DAMM | Snapshot devnet de `Hv8Lmzmnju6m7kcokVKvwqz7QPmdX9XfKjJsXz8RXcjp` |
| Snapshot observado | Slot RPC `514244548`, em 23/10/2026 |
| Verificação | WASM existente do Arkhe e perfil MMR BLAKE3 v1 |

SHA-256 dos bytes ELF, conferidos no download e nos programas carregados:

```text
dynamic_bonding_curve.so
85f43457764052cb243060c3c6eed131861cf89419b121a2ea5a6f6009b52c7e
cp_amm.so
586ed1f98c38db6cc4f3f03382575a2ae82671c0532a29aeddd8aa77c56924c9
Dados da configuração DAMM (328 bytes)
56d526bd28a68a2096dc195200f3e43e1a972c4973b05f4ec2daf16772517ebc
```

O snapshot em `fixtures/meteora-damm-config.json` preserva os bytes da conta e
normaliza `rentEpoch` para zero para o genesis local. As execuções finais usam
esse arquivo, sem clonar estado remoto durante o início do validator. O hash
dos binários não estabelece equivalência com os deployments de mainnet.

`output/meteora/` contém `report.json`, `events.json`, `receipts.json` e
`transactions.json`. Nova execução atualiza esses arquivos. Em caso de falha,
o relatório marca FAIL e `failure.json` guarda o diagnóstico.

Uma cópia da execução aprovada está em
[evidence/meteora-local-2026-10-23](evidence/meteora-local-2026-10-23/README.md),
incluindo o relatório e as provas, para preservar a evidência desta entrega.

## Parâmetros exercitados

São valores de teste, não uma configuração comercial aprovada:

- Token-2022 básico, seis casas, supply de um bilhão; quote SOL/WSOL.
- Sem transfer fee, Transfer Hook, MemoTransfer obrigatório ou vesting.
- Autoridades configuradas como `Immutable` pelo DBC.
- Taxa da curva constante em 100 bps, sem taxa dinâmica.
- Inputs do builder: market cap inicial de 10 SOL e de migração de 50 SOL.
- Reserva quote necessária para graduação: **15.450849718 SOL**.
- Migração DAMM v2 com `FixedBps100`.
- Configuração de 100% da liquidez do parceiro permanentemente travada.
  O teste confere pool e vaults; não certifica todos os direitos/estados das
  posições LP como uma auditoria independente de lock.

A tokenomics 60/20/15/5 não foi aplicada. Na DBC, supply, tokens vendidos e
reserva de migração devem ser derivados conjuntamente dos parâmetros da curva.
Percentual de LP não equivale a percentual de supply.

Uma execução inicial falhou na migração por falta de saldo para flash rent na
autoridade DBC. O executor agora provisiona 1 SOL fictício nessa autoridade e
exige reembolso, conforme os testes oficiais. Os programas Meteora não foram
alterados para obter aprovação.

## Prova Arkhe e limites

As folhas usam domínio novo, sem alterar o recibo anterior de transferências:

```text
["arkhe-meteora-event/v1", sequence, phase, genesisHash, program,
 config, dbcPool, dammPool, baseMint, quoteMint, signature, slot,
 messageHash, observations]
```

`observations` contém pares ordenados de strings. São observações RPC após
finalização, sem prova de estado sincronizada no exato slot de execução.
O verificador exige sequência completa, assinaturas distintas, slots não
decrescentes, programas esperados e identidade de rede/pools/mints entre eventos.
Verifica inclusão de todas as folhas na raiz fornecida, usando o WASM do Arkhe.

A verificação offline não autentica o checkpoint, não verifica consenso Solana
e não reexecuta efeitos econômicos. O executor realiza as asserções dos efeitos
durante o teste. Este adaptador não é um indexador contínuo, não grava no serviço
WormGraph e não garante completude de swaps externos ou consistência entre raízes.

O resultado valida o fluxo local com Token-2022 básico e observação externa.
Transfer Hook, interface web de lançamento, wallets, Jupiter, deployments de
mainnet e configuração econômica pública permanecem sem validação.

## Fontes primárias

- [SDK e fixtures fixados](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/tree/3a965ec0c0a527c2be3c48b8b479366705bf4926/packages/dynamic-bonding-curve)
- [API de migração](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/3a965ec0c0a527c2be3c48b8b479366705bf4926/packages/dynamic-bonding-curve/src/services/migration.ts)
- [Preparação de flash rent nos testes oficiais](https://github.com/MeteoraAg/dynamic-bonding-curve/blob/91e696eef6a3764157220f6c104f079b7830fc04/tests/utils/svm.ts)
- [Reembolso de flash rent](https://github.com/MeteoraAg/dynamic-bonding-curve/blob/91e696eef6a3764157220f6c104f079b7830fc04/programs/dynamic-bonding-curve/src/instructions/migration/flash_rent.rs)
