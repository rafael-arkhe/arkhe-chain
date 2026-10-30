# E01 — matriz financiada em devnet, protocolo v3

Estado técnico: `MATRIX_MATCHED_TWO_RPC_OPERATORS`. São compromissos de datasets sintéticos,
com três raízes únicas repetidas em 30 tentativas por tamanho, não decisões
financeiras reais ou 90 datasets independentes. Emissão pelo RPC público Solana;
observação posterior por endpoint OnFinality, em processo distinto.

| Folhas/lote | Planejadas | Finalizadas | Segundo RPC | Taxas pagas (lamports) | p95 envio→observação finalizada (ms) |
| --- | --- | --- | --- | --- | --- |
| 1000 | 30 | 30 | 30 | 150000 | 4013.01 |
| 5000 | 30 | 30 | 30 | 150000 | 3909.80 |
| 10000 | 30 | 30 | 30 | 150000 | 3834.95 |

Taxas conhecidas da matriz: 450000 lamports
(0.00045 SOL de devnet). Delta de saldo consistente com taxas:
True. O smoke prévio de três transações está separado.
Saldo final observado: 4998970000 lamports, fonte sender.
Tentativas preparadas: 90; emitidas: 90;
finalizadas: 90; não emitidas: 0.
Interrupção do emissor: `None`.
Os 90 slots planejados permanecem no denominador, sem substituição de tentativas
adversas. A v1 anterior teve 74 finalizações e 15 não emitidas após o deadline
da tentativa 75; seu relatório permanece preservado em prior-v1-REPORT.md.
Este ensaio é uma nova execução identificada, não continuação ou aprovação da v1.
A v2 teve 33 finalizações e parou por EPERM no journal antes de enviar a próxima
tentativa. A v3 acrescenta espera limitada para bloqueios transitórios de arquivo;
não altera a identidade das transações nem substitui resultados das corridas anteriores.
Repetição em outra janela temporal não estabelece, sozinha, causalidade.
As latências não incluem construção MMR nem representam throughput de produção.
As mesmas fixtures têm baseline local com 300 provas e 1.200 negativos rejeitados.

## Procedimento e rastreabilidade

Configuração e ordem de 90 tentativas foram registradas antes da emissão.
Fixtures vinculadas por SHA-256; limite de taxa, reserva e deadlines.
Broadcasts observados: 90; extras: 0;
finalizações após retransmissão: 0.
Hashes dos bytes de retransmissão consistentes: True.
Sem retransmissão na matriz, ela não exercita essa via; o caso controlado é
relatado separadamente. Não houve re-assinatura ou substituição automática de blockhash.
Cada tentativa preserva assinatura e bytes antes do envio.
Ensaio controlado separado: CONTROLLED_LOSS_RECOVERED_SAME_RPC; 2 chamadas locais de envio, 1 encaminhamento(s) ao RPC; 1 recibo(s) conferido(s) pelo segundo operador. O primeiro envio foi descartado intencionalmente antes da rede, com registro explícito. A segunda chamada preservou os bytes/assinatura. Esse caso não integra a matriz de 90 e não é evidência de falha natural do RPC.
O recibo finalizado é comparado ao compromisso; o segundo leitor verifica
assinatura local e concordância de payload, slot e taxa entre provedores.
O hash do relatório do emissor vincula a leitura posterior ao snapshot exato.

O saldo foi observado na devnet: 5 SOL de teste no preflight; testnet sem saldo.
O nome local da carteira não define a rede do endereço. A chave DPAPI foi
decriptada somente para uso pelo processo, passada por stdin, sem inclusão
nestes artefatos. Nenhum endpoint mainnet foi usado.

Limitações/retries do leitor da matriz constam de reader.json, sem remover
observações adversas. Observação por dois operadores não é prova independente
de consenso ou de ausência de inclusão.

## Validação e próximos gates

24 testes locais de transporte, ordem, retransmissão, journal e rejeições; códigos de saída e logs
estão em manifest.json. Auditoria arquitetural incluída. SHA256SUMS confere
integridade dos artefatos, não constitui assinatura ou atestação externa.

A observação de dois operadores não substitui cliente de consenso independente.
Custos em USD/mainnet, privacidade, onboarding em máquina limpa, parceiros,
conformidade legal, TEE e escala do PostgreSQL não foram demonstrados aqui.
`runtime_verified=false` permanece: ancoragem não sela contenção nem autoriza
execução cognitiva. G30 é parcial até completar onboarding e avaliação de seus
alvos próprios. Próxima etapa: revisão/reprodução em ambiente limpo e sessões
exploratórias definidas em docs/E01-ONBOARDING-STUDY.md.

Referências do segundo operador: [rede e endpoint oficial](https://onfinality.io/en/networks).
Fundamento RPC: [documentação Solana](https://solana.com/docs/rpc).
