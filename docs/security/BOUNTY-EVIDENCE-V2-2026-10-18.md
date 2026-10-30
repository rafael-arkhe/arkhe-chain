# bounty_evidence v0.2: integração de perfis sem regressão

Estado: TESTED nos cenários locais, IMPLEMENTATION CANDIDATE; produção não autorizada. O código recebido foi usado como especificação de mudanças, preservando controles já existentes e evitando substituição literal por versões mais fracas.

## Medição v2 e âncora

Novo módulo `bounty_evidence::v2`. PocMeasurement v2 contém chain, fork, alvo, ativo, ganho e report_commitment; não possui submission_block. Deserialize rejeita campos extras, inclusive tentativa de inserir essa altura.

VerifiedAnchor v2 tem campos privados e é obtida por resolve a partir de AnchorSource para o relatório exato. Valida relatório, log, compromisso e chain não nulos. O construtor não verifica criptografia de Rekor: a verificação da prova de inclusão, timestamp, altura e vínculo da abertura ao relatório continua sendo responsabilidade do adaptador confiável. O tipo evita construção direta acidental; não torna confiável uma implementação maliciosa de AnchorSource.

PocMeasurement::with_anchor exige compromisso e chain correspondentes e deriva submission_block exclusivamente da âncora para o avaliador interno legado. O digest da medição v2 inclui report_commitment sob domínio `AKG:POC:MEASUREMENT:v2`. pre_existence_holds v2 recebe a âncora resolvida, compromisso esperado e limite do patch; exige compromisso exato e tempo estritamente anterior. O timestamp do patch ainda precisa vir de fonte confiável. O predicado legado de timestamps permanece de baixo nível e não foi renomeado como prova de log.

## Assinatura real, não MockSv

SignedPocMeasurement v2 usa Ed25519 strict e domínio `AKG:POC:SIGNED-MEASUREMENT:v2`. Cobre digest de todos os campos da medição, contexto completo de relatório/política/operação/parâmetros, identidade, chave e horário declarado. Os controles de registry, validade, revogação atual e idade máxima são compartilhados com v1; não houve mudança dos bytes assinados do perfil v1.

ResolvedPocPolicy::evaluate_signed_v2_admitted verifica assinatura e contexto, consulta a fonte de âncora uma vez, confere compromisso/chain, normaliza a altura e exige governança e WER admitido no fluxo existente. A mesma âncora é reutilizada por uma interface interna congelada; não há segunda consulta mutável ao log durante a mesma avaliação. Medição devidamente assinada com compromisso divergente também é rejeitada.

O novo perfil é explícito e versionado. Não há migração silenciosa de medições, assinaturas, digests ou dados anteriores; tipos v1 continuam disponíveis. Não foi inserido SigVerifier permissivo como fallback. Os testes usam Ed25519 real com chaves TEST, mas fontes de log/registry/governança são fixtures, sem hardware ou prova real de inclusão.

## Liquidação e reivindicação anterior tardia

O journal mantém a exigência de ClosedPriority resolvida de um snapshot elegível completo e finalizado. O snapshot já representa a fase de coleta/fechamento; não foi introduzida outra fila de claims em memória que ignore essa exigência.

Quando Applied é registrado na simulação, o journal guarda a claim vencedora. Se uma prioridade posterior apresentar uma claim anterior (pela ordem de timestamp, posição e compromisso), retorna EarlierClaimAfterSettlement, marca reconciliação e não aplica novo payout. Depois disso, até o replay do snapshot antigo retorna ManualReconciliationRequired. Mudança do log de origem após liquidação também bloqueia para reconciliação. Não há método automático de limpar esse estado, estornar ou pagar outra vez.

Essa situação indica contradição com a alegação anterior de completude/finalização da fonte; exige investigação. O novo sinal não prova que a seleção original estava correta e não recupera um pagamento real já transferido. Toda a estrutura continua em memória, sem pagamento externo ou garantia exactly-once distribuída.

## Diferenças deliberadas em relação ao trecho recebido

- SHA-256 continua sendo sha2, com HASH_PROFILE fixado, em vez de reintroduzir implementação manual.
- Assinaturas continuam Ed25519 reais, em vez de substituir validação por mock; identidade/contexto também são cobertos.
- Registro continua BTreeMap com rejeição de duplicação/sobrescrita e chave reutilizada. A validade é [not_before, not_after).
- Não se aceita retroativamente uma chave revogada só porque o signatário ou caller afirma um tempo anterior. Verificação histórica depende de snapshot autenticado e prova de existência da assinatura antes da revogação, sob política específica. Nenhum desses artefatos reais foi fornecido.
- Params do payout continuam incluindo vulnerability_id, destinatário, valor e identidade do snapshot em v3. O trecho v0.2 recebido omitia vulnerability_id: mesma operação e mesmos demais parâmetros poderiam ser tratados como replay sob outro bug. Essa regressão não foi introduzida.
- O desempate continua pela posição autenticada no log, não por menor op_id que um caller pode escolher/grindar. São aceitos snapshots de um único log com posição única; ordenação global entre logs exige política adicional.
- Não há settle antes de um snapshot completo/finalizado. Apenas detectar uma claim anterior depois de pagar não elimina a corrida de liquidação.

## Testes e evidências

`tests/bounty_v2.rs`: assinatura real, compromisso alterado, versão incompatível, assinatura v1 reaproveitada em v2, rejeição de campo submission_block, mismatch de compromisso, altura externa fora da janela e pré-existência vinculada ao compromisso.

`tests/poc_policy.rs`: fluxo v2 assinado com WER admitido e fonte de âncora fixture; ausência de admissão e compromisso divergente mesmo com nova assinatura válida são rejeitados.

`tests/anchor_priority.rs`: prioridade anterior descoberta após liquidação marca reconciliação e impede segunda aplicação/replay automático. As regressões anteriores de ordem de chegada, janela forjada, vínculo de bug e operadores continuam na suíte.

Sem pesquisa, inferência, PoC real, log externo, hardware, transferência ou aprovação humana nesta rodada. Logs e hashes em `docs/evidence/local/2026-10-18/bounty-evidence-v2/RESULTS.md`. A documentação não atribui THEOREM à adequação do desenho ou aos testes locais.

Resultado local final: 132 testes do workspace passaram, incluindo a regressão de troca de log pós-liquidação. Formatação e arquitetura passaram. As quatro execuções registradas preservaram o hash de fonte antes/depois; os hashes dos logs foram conferidos.
