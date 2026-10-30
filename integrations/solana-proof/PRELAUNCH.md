# Testes anteriores ao lançamento público — 23/10/2026

**Estado: lançamento público ainda bloqueado.** A suíte automatizada tem 32
testes aprovados. Foram executados cenários completos em quatro ledgers locais:
fixtures oficiais, cópia dos deployments de mainnet, cópia dos deployments de
devnet e candidato de 125 bps na curva e no DAMM v2.

Os parâmetros fornecidos pelo usuário foram usados como candidatos de teste.
Referências a BONK/WIF e alegações de maior adesão não foram consideradas provas
de que esta configuração maximizará adoção ou segurança.

## Matriz de resultados

| Teste solicitado | Resultado e alcance |
|---|---|
| Programas/configuração de produção | PASS de inspeção RPC e execução **local das cópias**; hashes e upgrade authorities registrados. Não foi enviado lançamento público. |
| Curva e migração | PASS: compra/venda, graduação, DAMM v2 e compra/venda posterior nos quatro cenários. |
| Taxa candidata de 1,25% | PASS no candidato Meteora: coeficiente da taxa lido on-chain, 125 bps na curva e no pool migrado. Não reproduz a divisão de taxas do Pump.fun. |
| Autoridades | PASS: mint/freeze revogados; metadados e ponteiro imutáveis no cenário DBC; emissão e atualização indevidas rejeitadas. |
| LP | PASS: posição com liquidez permanentemente travada, zero desbloqueável, saque pelo próprio dono rejeitado. Não foi testada transferência do NFT de posição. |
| Taxas da posição | PASS: terceiro não consegue coletar; dono recebe taxas e o lock permanece. |
| Replay | PASS: reenvio de bytes idênticos não duplica efeito; segunda migração é rejeitada. |
| Concorrência de migração | PASS com cópia de mainnet e candidato 125 bps: um único vencedor entre duas transações concorrentes. |
| Retomada de migração | PASS com cópia de devnet: dois processos novos, sem ler chaves originais, recebem somente estado público; um migra e o outro é rejeitado. |
| Transação expirada | PASS no cenário de cópia de devnet: aguarda ultrapassar `lastValidBlockHeight` e exige rejeição pelo RPC. |
| Slippage/zero | PASS: mínimos impossíveis rejeitados no preflight DBC/DAMM; zero é rejeitado no SDK. Preflight não equivale a transação inválida incluída na cadeia. |
| Indexação | PASS no intervalo dos ensaios: leitura de blocos finalizados, instruções externas e CPIs, identities por assinatura/índices, reconciliação de saldos e supply. |
| Falha de RPC/finalização | PASS com falhas injetadas: bloco enumerado ausente, intervalo não finalizado e provedores divergentes não avançam cursor. |
| Worker contínuo | PASS de polling/retry/reinício com falha transitória injetada. Não é ainda serviço de produção operado continuamente. |
| Persistência | PASS: SQLite WAL, lote atômico, deduplicação, rejeição de replay conflitante e queda de processo durante transação. |
| Recuperação | PASS: reabrir o journal e restaurar exportação reproduzem a mesma raiz; reprodução de prefixo detecta truncamento/reescrita. |
| Checkpoints assinados | PASS: Ed25519, domínio/rede/mint/log, TTL, emissor fixado externamente, sequência e encadeamento; ancoragem de digest executada localmente. |
| Carga | PASS experimental: 5.000 eventos, 300 verificações e dois processos gravadores concorrentes, sem perda das 128 gravações adicionais. SLO de produção não definido. |
| Supply/distribuição | PASS isolado: 1B, seis casas, 600M/200M/150M/50M, saldo final do emissor zero. |
| Airdrop verificável | PASS local: dez destinatários de 60M, raiz ancorada antes da distribuição e provas MMR verificadas pelo WASM existente. |
| Devnet pública | BLOCKED: faucet respondeu HTTP 429 (limite/falta de fundos), antes de criar o mint. Cópia local de devnet não substitui esse teste. |
| Wallets Phantom/Solflare e interface web | PENDING: não há fluxo Arkhe de wallet/interface implementado nem mint público criado para exercitá-lo. Dez endereços não são dez integrações de wallet. |
| Jupiter / Pump.fun | PENDING: não existe executor Pump.fun neste pacote; token local não tem rota pública Jupiter. |
| Vesting, tesouro multisig, DAO, recompensas | PENDING: contratos/políticas não implementados; reservar tokens não aplica vesting, multisig ou governança. |
| Transfer Hook | NOT IN CURRENT SCOPE: candidato básico não utiliza hook; continua pendente se entrar no produto público. |
| Revisão independente / ensaio final público | PENDING: não houve auditoria independente, revisão legal/comercial nem autorização de lançamento por estes testes. |

## Bloqueio encontrado na configuração 60/20/15/5

As quatro alocações consomem exatamente um bilhão de tokens. Se os 600M são
**airdrop/quests**, os 200M são LP, os 150M são tesouro e os 50M são equipe,
não sobra uma parcela adicional para venda na bonding curve. O validador de
orçamento rejeita essa contagem duplicada.

O teste do airdrop e o teste DBC usam **mints diferentes**. Não foram combinados
artificialmente num mesmo lançamento. É necessário definir uma parcela vendida
deduzida de alguma alocação, reinterpretar explicitamente a parcela comunitária
ou escolher um pool DAMM v2 direto com liquidez financiada. Essa decisão econômica
não foi tomada pelo executor.

O candidato de taxas 125 bps não implementa distribuição 60/20/15/5, vesting de
24 meses ou quests. O airdrop foi um envio autorizado pelo emissor, não um
programa permissionless de claims. Prova de inclusão confirma a alocação no
snapshot; não prova cumprimento de tarefas sociais ou justiça da seleção.

## Correções encontradas durante os testes

- Os genesis hashes de mainnet/devnet estavam truncados nas proteções locais.
  Foram substituídos pelos identificadores completos e receberam regressão.
- A confirmação de reenvio precisa aceitar a resposta RPC `already processed`,
  além do retorno da mesma assinatura, e conferir que não houve novo débito.
- No validator acelerado, o cache de blockhash do SDK expirava durante o airdrop.
  Cada transferência agora usa um blockhash recém-consultado e assina os bytes.
- As rejeições negativas usam erros específicos; erro de conexão não conta como
  teste de slippage, lock ou autoridade aprovado.

## Custos e limites da referência Pump.fun

Na consulta de 23/10/2026, a documentação oficial confirma a taxa da curva de
1,25%, mas também descreve uma taxa adicional do app/web de 0,45% sem referral
ou 0,40% com referral, vigente desde 17/10/2026, além de custos de rede. Portanto,
1,25% não representa o custo total de uma operação pelo app/web.
[Fonte oficial de taxas](https://pump.fun/docs/fees).

Esses custos não são copiados para a Meteora. O ensaio de 125 bps testa a taxa
de negociação dos pools, sem front-end, priorização ou divisão Pump.fun de taxas.

## Reprodução

Instalação do pacote: `npm ci --ignore-scripts --workspaces=false`.
Suíte: `npm test`. Medições: `npm run benchmark:prelaunch`.

Inspeção/download de deployments (somente leitura pública):

```powershell
npm run inspect:deployments
$env:METEORA_PROFILE = 'output/prelaunch/mainnet-beta/profile.json'
npm run validator:meteora
```

Em outro terminal, com o mesmo perfil, após iniciar slots:

```powershell
$env:METEORA_PROFILE = 'output/prelaunch/mainnet-beta/profile.json'
$env:METEORA_OUTPUT_DIR = 'output/prelaunch/mainnet-result'
npm run test:prelaunch
npm run audit:prelaunch -- output/prelaunch/mainnet-result
```

Para o candidato de taxas, preparar `npm run prepare:fee-candidate`, encerrar o
validator anterior, iniciar outro com perfil `output/prelaunch/fee125/profile.json`
e usar saída `output/prelaunch/fee125-result`. O launcher sempre cria ledger novo.
O cenário com retomada/expiração também pode ser executado no perfil de mainnet;
nesta entrega ele foi exercitado com a cópia de devnet.

Airdrop: `npm run test:airdrop` usa validator local. Definir
`SOLANA_RPC_URL=https://api.devnet.solana.com` tenta rede pública de teste,
dependendo do faucet. Não há carregamento de carteira pessoal. Nenhuma chave
privada foi persistida; os tokens experimentais não são um produto administrável.

O verificador de alocações é `verifyAllocation` em `src/airdrop.mjs`. Ele usa
MMR BLAKE3 do Arkhe, com domínio `arkhe-airdrop-allocation/v1`; não recebe provas
de uma árvore Merkle binária arbitrária. Raiz e escopo precisam vir de confiança
independente.

## Limites operacionais ainda abertos

O journal experimental limita-se a 10.000 eventos; precisa de uma política de
crescimento/segmentação antes de tráfego público. SQLite embutido no Node 24 é
experimental. O scanner é conservador, para transfer/mint/burn dos programas SPL
e Token-2022 básicos; transferência com fee fica fora do perfil. A consistência
é conferida por replay do prefixo completo, sem prova sucinta de consistência.

Não foram testados um fork real de rede, quorum de provedores independentes em
produção, rotação operacional das chaves, HSM/KMS, deploy de serviço contínuo ou
um período prolongado de carga. Checkpoints nos ensaios usam chaves Ed25519 de
teste; a chave pública preservada na evidência não é uma raiz de confiança pública.
Os registros não são prova offline do consenso Solana.

Relatórios preservados: [evidence/prelaunch-2026-10-23](evidence/prelaunch-2026-10-23/README.md).
