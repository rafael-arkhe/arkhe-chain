# E01 — transporte candidato em devnet

Implementação: `scripts/e01_solana_transport.mjs` e `scripts/poc_e01_devnet.mjs`.
Usa apenas APIs nativas Node (Ed25519, HTTP e arquivos), sem novas dependências.
Não é um SDK Solana de produção. A matriz v1 foi interrompida na tentativa 75;
a v2 parou por erro de persistência após 33 finalizações. A v3 concluiu 90
finalizações, todas conferidas pelo segundo operador.
Evidências antigas continuam válidas para seus ensaios, sem reescrita retroativa.

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
`e01_independent_reader.mjs` adiciona observação por outro processo e endpoint
OnFinality. Isso diversifica o operador RPC observado; não constitui cliente
de consenso ou verificação criptográfica independente da cadeia inteira.

## Primeiro ensaio, sem saldo (histórico)

Seis testes locais PASS. Smoke real: três payloads montados e assinados;
`getFeeForMessage` retornou 5.000 lamports por mensagem. São estimativas de
devnet, não taxas pagas ou custos em USD/mainnet. `simulateTransaction` retornou
`AccountNotFound` nos três casos, antes da execução do Memo, por ausência da
conta pagadora. Portanto, o comportamento do programa ainda não foi ensaiado.

Uma solicitação `requestAirdrop` retornou erro RPC -32603 (`Internal error`).
Nenhuma chamada `sendTransaction` foi atingida. Estado global INCOMPLETE,
ancoragem NOT_RUN. As 90 tentativas, finalização, leitura independente e medição
econômica continuam pendentes. O runner atual é um smoke de três tamanhos;
não substituiu o executor da matriz de 90 tentativas.

## Continuação com carteira persistente

O depósito do usuário foi observado na devnet, apesar do nome local
`solana-testnet`. Esse nome não fixa uma rede para o endereço público.
O wrapper `scripts/run_e01_wallet.ps1` decripta a chave DPAPI em memória e a
entrega por stdin ao Node, sem gravar o segredo ou incluí-lo nos argumentos.
O runner exige o endereço da carteira E01 e saldo suficiente para o orçamento
mais reserva. Nenhum endpoint de mainnet é permitido.

```powershell
./scripts/run_e01_wallet.ps1 -OutputDirectory ops/local/e01/novo-smoke
./scripts/run_e01_wallet.ps1 -Matrix -OutputDirectory ops/local/e01/nova-matriz
```

Cada execução exige diretório novo. A matriz usa o protocolo de
`config/e01-devnet-protocol.json`, com SHA-256 exato das fixtures, ordem
determinística, 30 tentativas por tamanho, taxa máxima de 10.000 lamports por
transação e orçamento estimado total de 900.000 lamports. Qualquer falha
interrompe a emissão; tentativas restantes não viram sucesso nem são substituídas.
Não iniciar uma nova matriz para substituir resultados adversos.

No primeiro smoke financiado, três transações foram finalizadas, com 5.000
lamports pagos por transação e correspondência byte a byte do compromisso.
O segundo provedor confirmou os três recibos. A primeira leitura teve HTTP 429;
foi preservada separadamente da leitura posterior bem-sucedida com espaçamento.
Limites de recursos/runtime e custo em USD/mainnet permanecem não avaliados.

A matriz v1 teve 74 finalizações; a tentativa 75 atingiu o deadline e as 15
restantes não foram emitidas. A reconciliação observou assinatura ausente em
dois RPCs e altura finalizada acima da validade do blockhash no emissor.
Isso é expiração sem inclusão observada, sob confiança nos provedores; não é
prova independente de não inclusão. Não houve reenvio ou substituição da tentativa.
O resultado parcial deve permanecer no denominador de 90. O segundo operador
conferiu as 74 transações finalizadas, sem divergências de payload, slot ou taxa.
Foram pagos 370.000 lamports na matriz; o delta do saldo corresponde a essas
taxas. O smoke anterior pagou outros 15.000 lamports. Conferir os recibos e
o relatório de evidências para delimitar observação de consenso independente.

## Continuação v2/v3

`docs/E01-REBROADCAST-V2.md` define retransmissão dos mesmos bytes com até quatro
broadcasts, reconciliação antes de enviar e nenhuma re-assinatura automática.
`docs/E01-JOURNAL-V3.md` registra a correção de persistência após o EPERM da v2.
Os testes conjuntos totalizam 24 casos. Usar a versão explicitamente:

```powershell
./scripts/run_e01_wallet.ps1 -ProtocolVersion 3 -Matrix -OutputDirectory ops/local/e01/nova-matriz-v3
```

As corridas v1 e v2 permanecem no histórico. A conclusão da v3 não concede
aprovação retroativa, demonstração de economia mainnet/USD ou certificação
de contenção. O ensaio controlado de perda inicial é separado da matriz.

Na v3, foram finalizadas e conferidas 30/30 transações por tamanho (1k/5k/10k),
com 450.000 lamports pagos no total e delta de saldo correspondente. Não houve
retransmissão necessária nessa matriz. Em ensaio separado, a primeira chamada
foi descartada localmente antes da rede; a segunda preservou bytes e assinatura,
foi finalizada e conferida pelo segundo provedor. Taxa desse caso: 5.000 lamports,
com um único encaminhamento ao RPC. Não é falha natural atribuída ao provedor.

Referências oficiais consultadas para o transporte:
[Memo](https://www.solana-program.com/docs/memo),
[getTransaction](https://solana.com/docs/rpc/http/gettransaction),
[getFeeForMessage](https://solana.com/docs/rpc/http/getfeeformessage).
