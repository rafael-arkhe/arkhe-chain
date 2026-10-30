# ADR-019 — Adaptadores de evidência AWS com admissão existente

Data: 25/10/2026. Estado: proposto; implementação e ativação pendentes.

## Contexto

O [Arkhe Cloud](../ARKHE-CLOUD.md) propõe usar eventos e configurações AWS para
verificar controles específicos. O projeto já possui WER, ContainmentGate,
admissão de evidência e verificador portátil. Um consumidor AWS não deve criar
uma autoridade paralela ou transformar um finding em autorização automática.

Config fornece avaliações com recurso, regra e tempo de avaliação, conforme a
[documentação AWS](https://aws.amazon.com/config/faqs/). O Security Hub CSPM usa
[ASFF](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-findings-format.html)
para findings. Esses dados têm cobertura e atraso próprios e não possuem a mesma
cadeia de digests assinados dos logs CloudTrail. Um hash calculado pelo coletor
não é uma assinatura AWS sobre a resposta nem uma prova de veracidade.

## Decisão proposta

Consumir Config e Security Hub em adaptadores externos ao núcleo, inicialmente
somente leitura. Preservar o payload original e um manifesto com origem,
conta/região, recurso, identificador do evento/avaliação, versão de schema,
tempos de origem/coleta, digest e versão do coletor. Autenticar o coletor e
declarar explicitamente a confiança depositada nele; não alegar autenticidade
offline da AWS quando o payload não a oferece.

Normalizar em artefato versionado separado do WER. Referenciar os bytes originais,
política e resultado no WER, usando os campos existentes. Admitir pelo committer
conforme [ADR-002](ADR-002-no-direct-wormgraph-write.md); consultar evidência
admitida pelo caminho do gate existente para ações protegidas.

A avaliação deve considerar conta, região, recurso, regra, estado, idade máxima e
cobertura esperada. Evento duplicado é idempotente; reordenação preserva histórico
sem substituir observação mais recente por antiga. Distinguir não conformidade,
erro de coleta, dado ausente e avaliação inconclusiva. Nenhum deles pode ser
silenciosamente convertido em aprovação. Tempos de coleta não substituem tempos
de avaliação; o orçamento de atraso e relógio confiável deve ser explícito.

Não confundir erros do coletor com valores de `ComplianceType`. O tipo
[`Evaluation`](https://docs.aws.amazon.com/config/latest/APIReference/API_Evaluation.html)
aceita `COMPLIANT`, `NON_COMPLIANT` e `NOT_APPLICABLE`; `PutEvaluations` não aceita
`INSUFFICIENT_DATA`, embora esse valor conste no enum documentado. `ERROR` não é
um valor desse enum. Preservar o estado original e registrar falhas de coleta ou
avaliação separadamente, conforme o contrato da API consumida.

GuardDuty pode fornecer sinais adicionais; ausência de ameaça detectada não é
prova de controle satisfeito. Remediação via EventBridge/Lambda exige intenção,
política, autorização e journal de execução próprios. Este ADR não a habilita.

## Alternativas

| Alternativa | Motivo da escolha |
|---|---|
| AWS nativo sem pacote Arkhe | Adequado para operação nativa, mas não entrega por si só o vínculo ao WorkIntent e à política Arkhe. |
| Consumidor escreve diretamente no WormGraph | Rejeitada por contornar admissão e atribuir autoridade ao coletor. |
| Consumir apenas CloudTrail | Insuficiente para atestar postura: evento de API e avaliação de configuração respondem perguntas distintas. |
| Adaptadores + admissão existente | Proposta: preserva as fronteiras e permite declarar exatamente o que cada fonte sustenta. |

## Consequências e critérios de aceite

É necessário versionar schemas, suportar paginação/checkpoints de coleta,
reconciliação, duplicação, falhas parciais e isolamento entre contas/tenants.
Privilégios mínimos, custo de coleta, retenção e acesso aos payloads precisam ser
definidos antes de ativação; um pacote público não deve expor dados sensíveis.

Aceite exige fixtures com estados conformes/não conformes, expiração, duplicação,
reordenação, conta/região errada, cobertura incompleta e bytes adulterados;
verificação offline com confiança explícita no coletor; e integração em sandbox
que demonstre rejeição de ação protegida quando a evidência requerida estiver
ausente ou vencida. Prova de inclusão exige checkpoint confiável independente e
não afirma anterioridade ou consistência além do perfil MMR suportado.

Este ADR documenta a proposta de F3. A decisão de adoção depende da revisão de F0
e da qualificação F1/F2 descritas no roadmap, sem alterar o estado do kernel ou
declarar os serviços AWS já integrados.
