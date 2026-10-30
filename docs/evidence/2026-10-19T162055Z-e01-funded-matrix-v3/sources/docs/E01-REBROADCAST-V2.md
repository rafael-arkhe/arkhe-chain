# E01 — protocolo de retransmissão v2

Motivação: a matriz v1 parou com 74 finalizações em 75 tentativas emitidas de
90 planejadas. A tentativa 75 atingiu o deadline; a assinatura não foi observada
pelos dois RPCs na reconciliação, após a validade do blockhash no emissor.
O relatório v1 permanece preservado e não é substituído por outro resultado.

O protocolo `config/e01-devnet-protocol-v2.json` mantém fixtures, tamanhos,
semente da ordem, denominador, taxa máxima e deadline da v1. Acrescenta até
quatro broadcasts por transação, separados por pelo menos oito segundos.
`sendTransaction.maxRetries=0` mantém a retransmissão sob controle do runner.
Não há implantação de programa ou mudança de política do ContainmentGate.

## Máquina de estados

Antes de cada possível envio: consultar altura finalizada, estado da assinatura
com histórico e transação finalizada. Sem leituras válidas, não transmitir.

- Recibo finalizado correspondente: concluir e interromper retransmissões.
- Erro on-chain: interromper a corrida; não classificar como ausência.
- Altura acima da validade e status ausente: parar como EXPIRED_UNOBSERVED,
  sem produzir assinatura substituta. A ausência depende dos RPCs consultados.
- Status observado, inclusive confirmação anterior à expiração: aguardar
  finalização; expiração posterior não invalida uma transação já incluída.
- Status ausente, blockhash válido e orçamento de broadcasts disponível:
  persistir journal e enviar os mesmos bytes, sem mudar assinatura ou payload.
- Resposta de envio perdida: registrar UNKNOWN, reconciliar antes do próximo
  envio; não tratar timeout como prova de falha.
- Deadline: fazer reconciliação final sem transmissão; se ainda inconclusivo,
  parar como DEADLINE_UNRESOLVED. Não re-assinar automaticamente.

O helper não recebe chave ou API de assinatura. Só recebe a transação já
assinada; mudanças de blockhash e reconstrução ficam fora desse protocolo.
Isso limita seu contrato de interface, sem constituir sandbox contra código
arbitrário. Envios repetidos da mesma transação não representam novos lotes no
denominador. A medição separa número de tentativas lógicas e broadcasts.

O journal é escrito em arquivo temporário, sincronizado e renomeado antes do
envio. Se a persistência falhar, a chamada de envio não é realizada. Isso melhora
a recuperação do arquivo local, sem alegar durabilidade transacional de um
banco ou imunidade a toda falha de hardware.

## Validação

Testes com relógio/RPC simulados cobrem primeiro envio perdido, resposta ambígua,
assinatura inesperada, expiração, inclusão antes da expiração com finalização
posterior, erro on-chain, indisponibilidade do leitor, limite de envios,
recibo adulterado e falha do journal. As transações reais continuam exigindo
confirmação de payload por dois operadores RPC em evidências próprias.

```powershell
node --test scripts/e01_rebroadcast.test.mjs scripts/e01_runner.test.mjs scripts/e01_schedule.test.mjs scripts/e01_solana_transport.test.mjs
./scripts/run_e01_wallet.ps1 -ProtocolVersion 2 -OutputDirectory ops/local/e01/novo-smoke-v2
./scripts/run_e01_wallet.ps1 -ProtocolVersion 2 -Matrix -OutputDirectory ops/local/e01/nova-matriz-v2
```

Usar diretório novo; não executar várias corridas para escolher apenas um
resultado favorável. Registrar todas as corridas e as alterações que justificam
cada protocolo. Um resultado melhor em outra janela temporal não estabelece,
sozinho, causalidade ou taxa de confiabilidade geral. Se a rede não exigir
retransmissão durante a matriz, ela não demonstra recuperação de perda; essa
evidência depende de testes de falha simulada ou do ensaio controlado separado.

Referência primária: [Retrying Transactions](https://solana.com/id/developers/cookbook/transactions/retry).
`runtime_verified=false`, economia mainnet/USD e onboarding continuam separados.

## Ensaio controlado em devnet

`run_e01_controlled_loss.ps1` executa um lote separado de 1.000 folhas. O primeiro
`sendTransaction` é rejeitado localmente antes de chegar ao RPC; o journal marca
essa injeção explicitamente. A lógica de entrega reconcilia a assinatura e,
quando permitido, tenta os mesmos bytes novamente. Uma segunda observação RPC
confere o recibo finalizado. O relatório distingue chamadas locais de envios
efetivamente encaminhados ao RPC. Não é falha natural atribuída ao provedor.

Esse ensaio não integra o denominador de 90 da matriz e deve ocorrer depois
do saldo final da matriz ser capturado, para não contaminar a reconciliação
de taxas. O resultado só será declarado após a execução real; nenhum trecho
deste protocolo é evidência prévia de que a recuperação ocorreu.
