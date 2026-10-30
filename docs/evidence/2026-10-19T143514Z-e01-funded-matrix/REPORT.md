# E01 — matriz financiada em devnet

Estado técnico: `INCOMPLETE`. São compromissos de datasets sintéticos,
com três raízes únicas repetidas em 30 tentativas por tamanho, não decisões
financeiras reais ou 90 datasets independentes. Emissão pelo RPC público Solana;
observação posterior por endpoint OnFinality, em processo distinto.

| Folhas/lote | Planejadas | Finalizadas | Segundo RPC | Taxas pagas (lamports) | p95 envio→observação finalizada (ms) |
| --- | --- | --- | --- | --- | --- |
| 1000 | 30 | 25 | 25 | 125000 | 2712.92 |
| 5000 | 30 | 23 | 23 | 115000 | 2612.17 |
| 10000 | 30 | 26 | 26 | 130000 | 2668.87 |

Taxas conhecidas da matriz: 370000 lamports
(0.00037 SOL de devnet). Delta de saldo consistente com taxas:
True. O smoke prévio de três transações está separado.
Saldo final observado: 4999615000 lamports, na reconciliação.
Tentativas emitidas: 75; finalizadas: 74; não emitidas:
15. Interrupção do emissor: `finalization deadline; reconcile signature before retry`.
Os 90 slots planejados permanecem no denominador, sem substituição da tentativa
adversa. A assinatura da tentativa 75 não foi encontrada nos dois RPCs durante
a reconciliação; a altura finalizada no emissor excedeu a validade do blockhash.
Não houve reenvio; isso não é prova de não inclusão independente dos provedores.
As latências não incluem construção MMR nem representam throughput de produção.
As mesmas fixtures têm baseline local com 300 provas e 1.200 negativos rejeitados.

## Procedimento e rastreabilidade

Configuração e ordem de 90 tentativas foram registradas antes da emissão.
Fixtures vinculadas por SHA-256; limite de taxa, reserva, deadlines e zero
reenvios automáticos. Cada tentativa preserva assinatura e bytes antes do envio.
O recibo finalizado é comparado ao compromisso; o segundo leitor verifica
assinatura local e concordância de payload, slot e taxa entre provedores.
O hash do relatório do emissor vincula a leitura posterior ao snapshot exato.

O saldo foi observado na devnet: 5 SOL de teste no preflight; testnet sem saldo.
O nome local da carteira não define a rede do endereço. A chave DPAPI foi
decriptada somente para uso pelo processo, passada por stdin, sem inclusão
nestes artefatos. Nenhum endpoint mainnet foi usado.

O primeiro ensaio de leitura do smoke teve HTTP 429; o arquivo original foi
preservado junto à repetição bem-sucedida. Limitações/retries do leitor da matriz
constam de reader.json, sem remover observações adversas.

## Validação e próximos gates

11 testes locais de transporte, ordem e rejeições; códigos de saída e logs
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
