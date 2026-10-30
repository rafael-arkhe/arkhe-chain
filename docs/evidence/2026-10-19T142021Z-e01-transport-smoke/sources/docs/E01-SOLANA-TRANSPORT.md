# E01 — transporte candidato em devnet

Implementação: `scripts/e01_solana_transport.mjs` e `scripts/poc_e01_devnet.mjs`.
Usa apenas APIs nativas Node (Ed25519, HTTP e arquivos), sem novas dependências.
Não é um SDK Solana de produção. Estado: PREPARED; publicação não demonstrada.

## Perfil de fio v1

Transação legacy com um fee payer/assinante e uma instrução Memo v2
(`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`). O payer é a conta assinante
da instrução; não há transferência ou implantação de programa. Limite local
conservador: pacote de 1.232 bytes, memo de até 566 bytes UTF-8.

Payload: JSON UTF-8 sem espaços, na ordem fixa `type,v,genesis,run,profile,n,root,dataset`.
`type=arkhe:e01:mmr`, `v=1`, genesis fixado da devnet, run UUID, perfil MMR v1,
contagem, raiz hexadecimal e SHA-256 do dataset. Essa é uma codificação de
transporte experimental, separada de AKG-CBOR; não altera o perfil canônico Arkhe.
Os bytes exatos e seu SHA-256 são preservados por tentativa.

O programa Memo registra bytes; não valida a semântica Arkhe, unicidade de run,
conteúdo do dataset ou autoridade de admissão. Reenvio não tem deduplicação
aplicacional on-chain. Uma raiz publicada não autoriza execução de propostas.

## Execução

```powershell
node --test scripts/e01_solana_transport.test.mjs
node scripts/poc_e01_devnet.mjs ops/local/e01/fixtures.json ops/local/e01/smoke-new
# Ensaio com SOL de teste, carteira nova somente em memória:
node scripts/poc_e01_devnet.mjs ops/local/e01/fixtures.json ops/local/e01/send-new --devnet-airdrop-and-send
```

Usar um diretório de saída novo por execução para preservar tentativas anteriores.
Sem flag: assina localmente, consulta taxa e simula; nunca transmite.
Com flag: solicita 0,01 SOL de devnet, aguarda saldo finalizado, simula e só
transmite se a simulação não contiver erro. Não há carteira existente descoberta
ou lida, mainnet é recusada e o segredo não é escrito em disco.

Limitação da carteira efêmera: se o faucet responder tardiamente após timeout,
os tokens de teste podem chegar a uma chave já descartada. Não depositar fundos
reais nesses endereços. Uma carteira persistente/custódia de produção não foi
implementada neste perfil. Não há reenvio automático ou troca de blockhash após
erro ambíguo: reconciliar a assinatura preservada antes de nova tentativa.

O runner preserva assinatura e transação antes do envio. A consulta finalizada
compara assinatura, status, slot, blockhash, header, payer, programa, contas e
bytes do memo. O leitor atual usa o mesmo RPC: não constitui observação por
operador independente nem prova de consenso independente do provedor.

## Estado observado

Seis testes locais PASS. Smoke real: três payloads montados e assinados;
`getFeeForMessage` retornou 5.000 lamports por mensagem. São estimativas de
devnet, não taxas pagas ou custos em USD/mainnet. `simulateTransaction` retornou
`AccountNotFound` nos três casos, antes da execução do Memo, por ausência da
conta pagadora. Portanto, o comportamento do programa ainda não foi ensaiado.

Uma solicitação `requestAirdrop` retornou erro RPC -32603 (`Internal error`).
Nenhuma chamada `sendTransaction` foi atingida. Estado global INCOMPLETE,
ancoragem NOT_RUN. As 90 tentativas, finalização, leitura independente e medição
econômica continuam pendentes. O runner atual é um smoke de três tamanhos;
não substitui o executor da matriz de 90 tentativas.

Referências oficiais consultadas para o transporte:
[Memo](https://www.solana-program.com/docs/memo),
[getTransaction](https://solana.com/docs/rpc/http/gettransaction),
[getFeeForMessage](https://solana.com/docs/rpc/http/getfeeformessage).
