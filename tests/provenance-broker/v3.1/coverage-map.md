# Mapa de cobertura — contrato ativo e fixtures

Inspeção em 2026-10-29, atualizada com a extensão material v2. Fonte normativa candidata:
[v3.1, seção 5](../../../docs/architecture/provenance-broker-v3.1.md).
Inventário base: 28 fixtures, 30 casos adicionais sobre observações construídas,
11 testes locais de integração e 6 mutações do auditor. A
[extensão v2](extensions-v2/README.md) acrescenta 20 fixtures e 10 testes locais.
Este mapa não é revisão
independente e não altera os oráculos nem independent_review.

Cobertura de uma saída de política não implica cobertura do cenário de origem,
da extração semântica ou da integração viva. IDs de versões substituídas são
mapeados separadamente; não constituem requisitos novos por simples numeração.

## Contrato ativo v3.1

| Requisito | Material | Alcance observado / lacuna |
|---|---|---|
| P-01 baseline Assertion | [P-02](fixtures/P-02.json) | Coberto por equivalência de pré-condições; não há necessidade de arquivo duplicado P-01 |
| P-02 Extracted | [P-02](fixtures/P-02.json) | Baseline completo do perfil congelado; extração do span é observação retida |
| P-03 Derived | [P-03](fixtures/P-03.json) | Binding e regra de identidade; não extrai premissas da linguagem natural |
| P-04 histórico | [P-04](fixtures/P-04.json) | Intervalo e estado assinados/retidos, prova sintética de uma folha; não demonstra completude de banco vivo |
| P-05 dois trechos seguros A/B | [P-05](fixtures/P-05.json) | Parcial: só chunk-1 é seguro e liberado; chunk-2 está Superseded. Falta instância com dois trechos seguros liberados |
| P-06 análise de contradição | [P-06](fixtures/P-06.json) | Gate de análise sobre avaliação Contradicted retida; não demonstra classificação semântica correta |
| N-01 adulteração | [N-01](fixtures/N-01.json) | Bytes adulterados, record preservado; mutação material detectada |
| N-02 transformação rejeitada | [N-02](fixtures/N-02.json) | Rejeição explícita da política |
| N-03 transformação sem cobertura | [N-03](fixtures/N-03.json) | Ausência de cobertura da política |
| N-04 acesso desconhecido | [N-04](fixtures/N-04.json) | Observação de autorização Unknown retida; não indisponibilidade de serviço real |
| N-05 histórico negado | [N-05](fixtures/N-05.json) | Permissão histórica negada e resultado HistoricalDenied |
| N-06 estado histórico não comprovado | [N-06](fixtures/N-06.json) | historical_state Unknown, decisão Exclude |
| N-07 texto negativo contra Claim positiva | [N-07](fixtures/N-07.json) | Parcial: testa semantic.outcome=Contradicted, mas os bytes dizem “migrou”; não há negação literal. Falta fixture com texto negativo vinculado |
| N-08 Assertion incompleta + semântica positiva | [N-08](fixtures/N-08.json) | Gate sobre documental Incomplete; não diagnóstico automático de suporte incompleto |
| N-09 conjunto seguro vazio | [N-09](fixtures/N-09.json) | Ambos os trechos Superseded; nenhum payload liberado |
| N-10 derivação sem regra/artefato | [N-10](fixtures/N-10.json) | Mecanismo Derived sem regra/artefato; documental Invalid |
| N-11 revogação atual | [N-11](fixtures/N-11.json) | Estado Revoked assinado e retido; sem histórico solicitado |
| N-12 fonte ou agregado sem autorização | [N-12](fixtures/N-12.json) | Parcial: autorização global Denied; não há estrutura de agregado com autorizações distintas por constituinte |
| N-13 finalidade sem cobertura | [N-13](fixtures/N-13.json) | Política cobre apenas Analysis e pedido é Assertion |

## Outros materiais executados

- [N-PROOF](fixtures/N-PROOF.json): irmão de prova MMR adulterado.
- [D-UNAVAILABLE](fixtures/D-UNAVAILABLE.json): consulta de autorização necessária indisponível.
- [D-OTHER-UNAVAILABLE](fixtures/D-OTHER-UNAVAILABLE.json): demais fontes necessárias indisponíveis.
- [D-EXPIRED](fixtures/D-EXPIRED.json) e [D-EXPIRY-BOUNDARY](fixtures/D-EXPIRY-BOUNDARY.json): expiração e limite exato.
- [D-WINDOW-BOUNDARY](fixtures/D-WINDOW-BOUNDARY.json): limite exato da janela de validação.
- [D-REVISION](fixtures/D-REVISION.json): revisão de estado mudou na entrega; exige reavaliação.
- [D-GRANT](fixtures/D-GRANT.json), [D-GRANT-EXPIRED](fixtures/D-GRANT-EXPIRED.json) e
  [D-GRANT-INVALID](fixtures/D-GRANT-INVALID.json): concessão sintética válida, expirada e adulterada.

Esses nove casos D-* não são prova de entrega em rede. O host de teste retém
host_audit; seus testes verificam que apenas agent_payload pode ser encaminhado.

## IDs históricos citados no parecer

| ID histórico | Correspondência atual | Estado do cenário |
|---|---|---|
| P-07 reservado | Nenhuma | Não materializado; publicar um caso aqui não o tornaria reservado |
| N-INT-05 transformação rejeitada | N-02 | Coberto no perfil congelado |
| N-ACC-01 acesso negado | N-12 | Gate de autorização coberto |
| N-ACC-03 agregado entre tenants | Nenhuma instância específica | Pendente; schema do recorte não representa agregado multi-tenant |
| N-VIG-05 rollback de checkpoint | D-REVISION / D-EXPIRED são relacionados, não equivalentes | Pendente: replay de checkpoint antigo com aparente frescura ainda não materializado |
| N-VIG-06 projeção atrasada | N-11 e teste signed_revocation | Parcial: revogação cobre gate, não atraso real da projeção |
| N-VIG-07 histórico negado | N-05 | Coberto |
| N-DOC-01 pontas sem relação | N-08 / N-09 | Parcial: flags de host incompletas, sem corpus específico de pontas sem relação |
| N-DOC-02 negação literal | N-07 | Parcial: avaliação Contradicted sem texto negativo |
| N-DOC-03 hipótese literal | Nenhum fixture material específico | Pendente; testes de outcome Indeterminate não substituem texto hipotético |
| N-DOC-04 correção / conflito | Nenhum fixture material específico | Pendente; datas distintas sozinhas não demonstram contradição |
| N-DOC-05 derivação sem regra | N-10 | Coberto no recorte |

## Limites da conclusão

Concordância com oráculos é evidência de conformidade nos casos executados,
mesmo com autoria única. Autoria única permite erros correlacionados e limita
a independência dessa evidência; não a torna inexistente. Revisão por terceiro
pode fortalecê-la, sem constituir prova universal de correção.

Ausência de integração real ou de prova de correção significa não demonstrado,
não falsidade comprovada. Nada neste mapa autoriza marcar os fixtures como revistos.

Próximas lacunas materiais: P-05 com dois trechos seguros, negação/hipótese/correção
com bytes correspondentes, agregado com fontes e permissões distintas, rollback
de checkpoint, projeção atrasada e limites ainda não exercitados. Antes de
materializá-las, qualquer extensão do perfil deve preservar os oráculos existentes
ou registrar explicitamente alterações de versão e sua justificativa.

## Atualização de cobertura — extensão v2

As tabelas anteriores descrevem o alcance da base v1, cujos bytes e oráculos
foram preservados. A cobertura combinada tem estes acréscimos verificáveis:

| Requisito | Material v2 | Alcance |
|---|---|---|
| P-05 dois seguros | V2-P05-TWO-SAFE | Dois trechos verificados liberados, sem Claim/relação |
| N-DOC-01 pontas sem relação | V2-ENDPOINTS-NO-RELATION | Bytes específicos; avaliação Indeterminate retida |
| N-DOC-02 negação literal | V2-NEGATION-POSITIVE-CLAIM / NEGATIVE-CLAIM | Texto negativo vinculado; Claim positiva rejeitada, negativa aceita |
| N-DOC-03 hipótese literal | V2-HYPOTHESIS-ASSERTED / POSSIBLE | Texto hipotético vinculado; modalidades explícitas |
| N-DOC-04 correção | V2-CORRECTION-OLD-CLAIM / ANALYSIS | Correção explícita, não mera diferença de datas |
| N-ACC-03 agregado | V2-AGG-* | Sete casos entre tenants e escopos, fontes e agregado autorizados separadamente |
| N-VIG-05 rollback | V2-ROLLBACK-VALID-OLD-PROOF | Prova antiga válida vs. mínimo monotônico independente do host |
| N-VIG-06 índice atrasado | V2-PROJECTION-* | Divergência material índice/fonte; propagação viva continua pendente |
| Limites | V2-LIMIT-* | Tamanho exato de trecho/payload e um byte acima; matriz completa de limites pendente |

IDs correspondem aos arquivos de [fixtures v2](extensions-v2/fixtures).
Cobertura material desses cenários não demonstra classificação semântica automática,
federação de autorização, persistência real de pin monotônico ou indexação assíncrona.
P-07 reservado e revisão independente permanecem não realizados.
