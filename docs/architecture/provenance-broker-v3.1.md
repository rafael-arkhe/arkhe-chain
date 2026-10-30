# Broker de Proveniência — Arkhe v3.1

Data: 2026-10-29. Status: candidata; perfil e 28 fixtures sintéticos materializados
e auditados. Duas implementações de decisão comparadas sobre observações congeladas;
integração local com fontes sintéticas testada. Revisão independente e integração
com serviços reais permanecem pendentes.
Extensão material v2: 20 fixtures adicionais para lacunas prioritárias, com perfil
versionado separado e preservação dos 28 materiais originais.
Esta versão substitui a v3 apresentada na conversa. Define o contrato e a política
de referência; não altera contratos criptográficos existentes do Arkhe.

## 1. Escopo e fronteiras

GLiNER propõe estruturas; Cognee fornece candidatos; o broker verifica e limita
o conteúdo liberado. Proveniência não demonstra verdade. Entrada do chamador é
não confiável. Identidade vem da sessão autenticada; política e escopos efetivos
são resolvidos pelo host. Resultados nunca são aceitos como alegações do candidato.
Bytes e provas podem vir de qualquer transporte, mas são verificados contra
âncoras e fontes de autorização configuradas independentemente pelo host.

## 2. Contrato

Os tipos abaixo são pseudocódigo do contrato geral. O recorte serializado do piloto
está em [perfil v1](../../schemas/provenance-broker/profile-v1.json) e no
[JSON Schema](../../schemas/provenance-broker/fixture-v1.schema.json).
IDs são strings limitadas pelo perfil. Timestamps são inteiros UTC em milissegundos;
durações são u64 em milissegundos. Posições usam intervalos UTF-8 semiabertos,
com offset e length u64, sem overflow e dentro de fronteiras válidas de caracteres.
O perfil do piloto fixa limites de bytes, trechos, premissas e profundidade de prova.
Ausência de perfil compatível implica Exclude. Campos do contrato geral não cobertos
pelo recorte não ficam implicitamente habilitados pelo piloto.

```text
CandidateInput {
  candidate_id,
  claim: Claim,
  query: { purpose: Analysis | Assertion, historical_req?: { requested_instant } }
}
SessionContext { principal, authenticated_session_id, effective_scopes }
ResolvedPolicy { policy_id, policy_version, policy_digest, profile_id }

Claim {
  subject: EntityRef,
  predicate: PredicateId,             // ex.: migrated_to, works_for
  object: EntityRef | Literal,
  polarity: Positive | Negative,
  modality: Asserted | Possible | Conditional,
  qualifiers: [{ kind, value }]
}
TextPosition { repr_digest, offset: u64, length: u64 }
VerifiedChunk {
  chunk_id, bytes, chunk_digest, text_position, source_digest,
  transformation_ref, evidence_ref, source_scope,
  proof_ref, checkpoint_ref
}
IntegrityVerdict = OK | Invalid | Unknown
IntegrityResult { verdict, verified_chunks: [VerifiedChunk], failures: [Reason] }

TransformVerdict = Accepted | Rejected | Unknown
TransformResult { items: [{ transformation_ref, verdict }], verdict }

AccessVerdict = Permitted | Denied | Unknown
AccessResult { verdict, principal, source_decisions, aggregate_decision?, observation_refs }

VigencyVerdict = Current | Historical | HistoricalDenied | Stale |
                 Revoked | Superseded | Unknown
HistoricalContext {
  requested_instant, state_at_instant,
  evidence_ref, inclusion_proof, trusted_checkpoint_ref,
  effective_interval, observed_at
}
VigencyResult {
  verdict, state, observed_at, evaluated_at, max_age,
  observation_refs, historical_ctx?: HistoricalContext
}

Mechanism = Extracted { predicate_span: TextPosition } |
            Derived { premise_refs, rule_id, rule_version, derivation_artifact_ref }
DocumentalResult {
  chunk_checks: [{ chunk_id, byte_binding_valid, position_valid, record_binding_valid }],
  mechanism: Mechanism,
  predicate_span_valid: bool?,
  derivation_binding_valid: bool?,
  verdict: Complete | Incomplete | Invalid | NotEvaluated
}
Aggregation { constituent_refs, aggregate_ref } // independente de Mechanism

SemanticResult {
  claim_digest, support_set_digest,
  outcome: Supported | Partial | Contradicted | Indeterminate | NotEvaluated,
  method: None | Model | Human | Rule,
  evaluator_ref?, evaluator_version?, score?, evaluation_artifact_ref?
}

ReleasedChunk {
  chunk_id, bytes, chunk_digest, text_position, source_digest, evidence_ref
}
ReleasedPayload {
  chunks: [ReleasedChunk],
  claim?: Claim,
  claim_status: Omitted | ForAnalysis | SupportedByEvaluation,
  semantic?: SemanticResult,
  temporal_context: Current | Historical { requested_instant },
  restrictions: [Restriction]
}
AdmissionDecision {
  candidate_id, decision: Admit | AdmitHistorical | AdmitChunksOnly | Exclude | Reject,
  purpose, policy_id, policy_version, policy_digest,
  decided_at, applied_rule, reasons: [Reason], flags: [Flag],
  released_payload: ReleasedPayload
}
```

### 2.1 Identidades, bytes e digests

Tenant, escopo e política pedidos não conferem autoridade. O host resolve a
política e valida purpose e a consulta histórica para o principal autenticado.
Escopos de fontes e constituintes agregados são resolvidos dos registros
verificados. Autorizar cada fonte não substitui autorizar o agregado.

Cada digest identifica seu perfil de cálculo. O perfil deve especificar algoritmo,
preimage exata e codificação; um rótulo de domínio não implica prefixação dos bytes.
Digests existentes do Arkhe preservam seus perfis. Uma transformação referencia
fonte, representação de saída e identidade/versionamento do processamento.
O broker verifica que bytes do trecho correspondem ao intervalo da representação
identificada e que o registro incluído vincula esses digests e referências.

### 2.2 Mecânica e semântica

`predicate_span_valid` só verifica que o span declarado está dentro da representação,
corresponde aos bytes retidos e está vinculado ao registro. Não verifica se o texto
expressa o predicado, a polaridade ou a modalidade da Claim. Um trecho negativo
pode ter vínculo documental Complete e contrariar uma Claim positiva.

Para Extracted, predicate_span_valid é obrigatório; derivation_binding_valid é
ausente. Para Derived ocorre o inverso: o broker verifica premissas e o artefato de
derivação contra uma regra aceita e versionada. Não exige span literal da conclusão.
Uma inferência que dependa de interpretação linguística continua sendo julgamento
semântico; o vínculo mecânico não a transforma em prova de verdade.

Complete exige todos os vínculos necessários válidos. Incomplete significa que
há trechos individualmente verificáveis, mas o conjunto necessário não está completo.
Invalid identifica vínculo inválido; NotEvaluated indica ausência de avaliação.

Avaliações semânticas devem estar vinculadas à Claim e ao conjunto exato de suporte.
O broker valida método, avaliador, versão e critérios da política antes de aceitar
Supported. Score não é probabilidade calibrada. Avaliação incompatível ou ausente
nunca satisfaz a exigência semântica de Assertion.

## 3. Política de referência e precedência

Aplicar em ordem; primeira regra correspondente vence. IDs são canônicos.

| ID | Condição | Decisão |
|---|---|---|
| REQUEST_INVALID | Entrada malformada, fora dos limites ou identidade inválida | Reject |
| POLICY_UNRESOLVED | Política/perfil não resolvido ou finalidade sem cobertura | Exclude |
| ACCESS_DENIED | Acesso negado ao candidato, fonte necessária ou agregado | Reject |
| ACCESS_UNKNOWN | Acesso desconhecido | Exclude |
| INTEGRITY_INVALID | Integridade, prova ou vínculo criptográfico inválido | Reject |
| INTEGRITY_UNKNOWN | Verificação necessária indisponível ou ausente | Exclude |
| TRANSFORM_REJECTED | Alguma transformação necessária explicitamente rejeitada | Reject |
| TRANSFORM_UNKNOWN | Alguma transformação necessária sem regra ou decisão | Exclude |
| HISTORICAL_DENIED | Consulta histórica não autorizada | Reject |
| STATE_UNAVAILABLE | Vigência Unknown ou Stale | Exclude |
| STATE_DISALLOWED | Revoked ou Superseded sem contexto histórico autorizado | Reject |
| DOCUMENT_INVALID | Vínculo documental Invalid ou NotEvaluated | Reject |
| ANALYSIS_CHUNKS_ONLY | Analysis, Current, documental Incomplete e conjunto seguro não vazio | AdmitChunksOnly |
| DOCUMENT_INCOMPLETE | Demais casos de vínculo incompleto | Reject |
| ASSERTION_UNSUPPORTED | Assertion sem Supported aceito pela política | Reject |
| RELEASE_HISTORICAL | Historical, documental Complete e requisitos anteriores satisfeitos | AdmitHistorical |
| RELEASE_CURRENT | Current, documental Complete e requisitos anteriores satisfeitos | Admit |
| DEFAULT_EXCLUDE | Qualquer combinação restante | Exclude |

TransformResult é independente de IntegrityVerdict. Não existe TransformRejected
em IntegrityVerdict nem exceção que libere versão sem cobertura da política.
O resultado agregado de transformação é Rejected se qualquer item for Rejected;
senão Unknown se qualquer item for Unknown; senão Accepted.

### 3.1 Vigência e histórico

HistoricalDenied pertence a VigencyVerdict; Reject pertence somente à decisão.
Uma consulta histórica negada nunca é convertida em consulta atual.
Historical exige permissão explícita, instante definido, estado naquele instante
comprovado e autorização atual de acesso. O registro histórico deve cobrir o
instante por intervalo de efeito; inclusão de um evento isolado não prova ausência
de alterações posteriores. O host fornece fonte autorizada e cobertura verificável
do histórico. Evidência insuficiente resulta em Unknown.

Estado atual Active não implica Active no passado. Revogação atual não é anulada
por um checkpoint antigo. Uso histórico de estado revogado/substituído exige regra
explícita aplicável à causa e ao período; sem ela não há Historical.

Freshness usa evaluated_at fixado pelo host e limites da política. O chamador não
define esses limites. Observações futuras além da tolerância do perfil são inválidas.

## 4. Falha fechada e payload liberado

Exclude e Reject sempre têm payload vazio: chunks=[], claim ausente, semantic
ausente e claim_status=Omitted. Metadados de auditoria permanecem no host e não
devem expor fontes inacessíveis ao agente.

Admit/AdmitHistorical só liberam o conjunto necessário de trechos verificados,
autorizados e aceitos pela política. Assertion inclui Claim e avaliação aceita,
com claim_status=SupportedByEvaluation. Analysis usa ForAnalysis e preserva
o resultado semântico como julgamento, inclusive Contradicted ou NotEvaluated.

AdmitChunksOnly não admite o candidato incompleto como afirmação. Libera apenas
trechos derivados do conjunto seguro: individualmente verificados, autorizados,
vigentes e com transformação Accepted. Não inclui Claim, inferência, resumo do
agregado ou avaliação semântica da relação incompleta. claim_status=Omitted;
flags=[RELATION_OMITTED]; restrictions=[ANALYSIS_ONLY, NO_RELATION_SUPPORT].
O conjunto seguro é calculado por trecho; nunca inclui bytes de trechos falhos.
Se vazio, a regra DOCUMENT_INCOMPLETE aplica-se. Negação de acesso a qualquer
fonte necessária continua bloqueando o candidato inteiro pelas regras anteriores.

Chunks são ordenados por chunk_id único em ordem lexicográfica UTF-8. Referências
duplicadas são rejeitadas no input resolvido. O perfil fixa orçamento de contexto;
excedê-lo resulta em Reject, sem truncamento silencioso ou divisão de UTF-8.

Checkpoint aceito é resultado da verificação contra âncoras independentes. Não
existe campo de entrada checkpoint.trusted. Histórico é solicitado exclusivamente
por historical_req; não existe is_historical.

### 4.1 Snapshot e entrega

O piloto escolhe `ValidatedAt`: autorização no instante da validação, com intervalo
aceito máximo de 250 ms até a entrega. Não afirma autorização atomicamente vinculada
à liberação. O intervalo é semiaberto: entrega em `valid_until` já exige reavaliação.
`valid_until` é o mínimo das expirações absolutas de autorização, estado, política,
âncoras e `evaluated_at + max_decision_ttl`. O orçamento de entrega também é limitado
por `validated_at + accepted_interval_ms`. Cada observação expira segundo seu próprio
instante; reavaliar não renova automaticamente observações anteriores.

```text
DecisionSnapshot {
  evaluated_at, valid_until, revisions,
  policy_digest, anchor_set_digest,
  consistency: { mode, profile_id, observation_digest },
  temporal_guarantee: { kind: ValidatedAt, validated_at, accepted_interval_ms }
}
```

Consulta necessária indisponível bloqueia entrega. Revisão divergente ou prazo
expirado exige reavaliação antes da entrega. O snapshot não elimina a corrida entre
consulta e liberação; o intervalo aceito é parte explícita da garantia escolhida.
Não há entrega por uma decisão Exclude ou Reject, independentemente do snapshot.

`BestEffort` só pode ser usado com aceitação explícita da política e da combinação
de revisões observada. Ele não substitui verificação de integridade, acesso ou estado.
O perfil `frozen-observations-v1` garante retenção e vínculo das observações verificadas,
sem afirmar atomicidade entre fontes. Nenhum perfil `Guaranteed` está habilitado.
Para habilitá-lo, o host deve aceitar um perfil que defina propriedade, fontes,
revisões e procedimento verificável. Nome de protocolo, assinatura ou horário comum
isoladamente não bastam. Evidência adulterada ou incompatível bloqueia a tentativa,
sem rebaixamento para BestEffort.

Uma concessão válida dispensa somente as consultas que cobre. Precisa ser verificada
contra perfil confiável do emissor e vinculada a sujeito, recursos, operação,
finalidade, condições e intervalo. Ela não libera payload nem substitui os demais
controles. Concessão expirada permite consulta e reavaliação; adulterada bloqueia a
tentativa. Invalidação e eventual dispensa de nova consulta seguem o contrato do
emissor aceito pelo host. O contrato `fixture-lease-v1` é sintético: cobre apenas
`access_check`, garante estabilidade até expirar e não representa um serviço real.

### 4.2 Canonicalização

O perfil usa JSON UTF-8 sem BOM, objetos com chaves ordenadas, inteiros exatos,
sem floats, chaves duplicadas ou surrogates inválidos; bytes são hex minúsculo.
Não há normalização Unicode dos bytes de fontes. Coleções normativas:

| Campo | Ordem e duplicatas |
|---|---|
| transform.items | transformation_ref; duplicatas proibidas |
| failures | (code, ref); pares duplicados proibidos |
| reasons | (rule_id, code); pares duplicados proibidos |
| flags | código; duplicatas proibidas |
| agg_sources | (tenant, scope); pares duplicados proibidos |
| released_payload.chunks | chunk_id; duplicatas proibidas |
| support_refs | hash do registro; duplicatas proibidas |

O perfil fixa os códigos admitidos e os domínios/preimages de cada digest.
O MMR usa o perfil congelado `arkhe-mmr@1`; novos hashes de registros do broker têm
domínio próprio e não são apresentados como registros já admitidos pelo runtime.

## 5. Fixtures e resultados esperados

Cada fixture fixa CandidateInput, sessão, política completa, limites, relógio,
observações de acesso/estado, bytes, provas, âncoras, transformações e artefatos do
avaliador. As linhas abaixo são requisitos do contrato geral; o subconjunto
materializado está no [README dos fixtures](../../tests/provenance-broker/v3.1/README.md).

Base B: sessão autenticada; política resolvida; acesso Permitted a todas as fontes
e ao agregado quando aplicável; integridade OK; transformações Accepted; vigência
Current comprovada e fresca; documental Complete; sem agregação; orçamento
respeitado; avaliação Supported aceita e vinculada à Claim e ao suporte.

| ID | Fixture (demais campos herdados de B) | Decisão / regra |
|---|---|---|
| P-01 | Assertion, candidato completo | Admit / RELEASE_CURRENT |
| P-02 | Assertion; Extracted; predicado, polaridade e modalidade explícitos; span válido vinculado à representação; todos os trechos verificados; B completo, inclusive avaliação Supported aceita | Admit / RELEASE_CURRENT |
| P-03 | Assertion; Derived; premissas individualmente verificadas e autorizadas; regra aceita e versionada; aplicação correta com artefato vinculado à Claim; derivation_binding_valid=true; predicate_span_valid ausente; B completo, inclusive avaliação Supported aceita | Admit / RELEASE_CURRENT |
| P-04 | Assertion; histórico autorizado; estado no instante e cobertura histórica comprovados; limites e acesso atual válidos; B exceto vigência Historical | AdmitHistorical / RELEASE_HISTORICAL |
| P-05 | Analysis; documental Incomplete; dois trechos individualmente seguros A/B; nenhum trecho falho liberado | AdmitChunksOnly / ANALYSIS_CHUNKS_ONLY |
| P-06 | Analysis; documental Complete; avaliação Contradicted vinculada à Claim | Admit / RELEASE_CURRENT |
| N-01 | Bytes adulterados; integridade Invalid | Reject / INTEGRITY_INVALID |
| N-02 | Transformação explicitamente rejeitada; integridade OK | Reject / TRANSFORM_REJECTED |
| N-03 | Transformação sem cobertura; integridade OK | Exclude / TRANSFORM_UNKNOWN |
| N-04 | Acesso Unknown | Exclude / ACCESS_UNKNOWN |
| N-05 | Histórico solicitado e negado; HistoricalDenied | Reject / HISTORICAL_DENIED |
| N-06 | Histórico autorizado mas estado no instante sem comprovação | Exclude / STATE_UNAVAILABLE |
| N-07 | Assertion; Claim positiva; trecho negativo íntegro; documental Complete; avaliação Contradicted | Reject / ASSERTION_UNSUPPORTED |
| N-08 | Assertion; documental Incomplete; avaliação Supported | Reject / DOCUMENT_INCOMPLETE |
| N-09 | Analysis; documental Incomplete; conjunto seguro vazio | Reject / DOCUMENT_INCOMPLETE |
| N-10 | Derivação sem regra/artefato exigido; documental Invalid | Reject / DOCUMENT_INVALID |
| N-11 | Estado atual revogado, sem histórico | Reject / STATE_DISALLOWED |
| N-12 | Fonte necessária ou agregado sem autorização | Reject / ACCESS_DENIED |
| N-13 | Política sem finalidade coberta | Exclude / POLICY_UNRESOLVED |

P-05 deve fixar bytes e referências exatos de A/B no payload esperado e ausência
da Claim, da relação, de inferências e de semantic. Todos os demais fixtures também
incluem payload esperado completo; decisões negativas têm payload vazio.
Fixtures adicionais cobrem prova inválida, limites, offsets, fonte trocada,
revogação após projeção e estados históricos conflitantes. Exemplos reservados
são instâncias separadas, não as categorias públicas acima.

## 6. Métricas e rastreabilidade

Qualquer liberação indevida por Admit, AdmitHistorical ou AdmitChunksOnly conta
como aceitação indevida, inclusive vazamento de um único trecho. Rejeições
indevidas e payloads incorretos são contados separadamente. Cobertura da suíte
não constitui prova universal.

Registrar método de inspeção, artefato/revisão e resultado observado. Design,
leitura documental e teste executado são categorias distintas. Esta especificação
não afirma ganho de recuperação, qualidade em português ou integração com serviços reais.

## 7. Critério de conclusão e comparação

Fixtures fixam observações externas completas, âncoras, perfil criptográfico,
sessão, política/digest, relógio e avaliações retidas do avaliador (com identidade,
versão, Claim e suporte vinculados). A comparação da função de decisão não chama
novamente um modelo nem consulta estado vivo. Testes de integração dessas fontes
são separados.

Comparar decision e released_payload integralmente, incluindo bytes, referências,
Claim presente/ausente, status, restrições e contexto temporal; comparar também
applied_rule canônico, flags e política resolvida. O relógio fixo permite comparar
decided_at; tempos operacionais de medição ficam fora do resultado normativo.

Todos os fixtures têm saída única e política concreta. Casos destinados a regras
explícitas não podem cair no fallback. A cobertura material de DEFAULT_EXCLUDE e de
todas as combinações da matriz ainda não foi demonstrada.
Duas implementações concordantes fornecem evidência de conformidade com a suíte,
não prova de correção. O fechamento exige ainda perfil serializado e limites
concretos, fixtures materiais, execução e revisão dos resultados.

### 7.1 Execução do piloto

As implementações [Python](../../scripts/provenance_broker_decision.py) (imperativa)
e [Node](../../scripts/provenance_broker_decision.mjs) (tabela de predicados) não
compartilham código de decisão e não recebem expected_output. Foram escritas pelo
mesmo autor nesta sessão: não constituem autoria nem revisão independente.
O [comparador](../../scripts/compare_provenance_broker.py) compara ambas com os
oráculos retidos, inclusive payload, snapshot e resultado da entrega. A matriz
adicional constrói observações de host em memória; não afirma assinaturas válidas
para essas mutações nem substitui fixtures materiais revisados.

O [host de teste](../../scripts/provenance_broker_host.py) valida CandidateInput,
retém sessão/política/fontes fora da entrada do chamador, verifica assinaturas,
bindings de estado e as formas MMR do piloto e aplica a política. Somente agent_payload
é roteável ao agente; host_audit permanece interno. Uma entrega bloqueada nunca
encaminha o payload da admissão anterior. Não há endpoint de produção, IdP real,
PostgreSQL, consulta viva ao WormGraph ou executor de efeitos externos nesta entrega.

Resultados e hashes das fontes executadas estão no
[relatório de conformidade](../../tests/provenance-broker/v3.1/conformance-report.json).
Revisão independente permanece pending em todos os fixtures. O validador material
e os motores puros têm responsabilidades distintas; nenhum resultado de um fixture
confere autorização de produção.

### 7.2 Extensão material v2

O [perfil v2](../../schemas/provenance-broker/profile-v2.json) e o
[schema v2](../../schemas/provenance-broker/fixture-v2.schema.json) estendem o recorte
sem alterar o perfil v1. A observação assinada inclui decisões de autorização por
fonte e agregado; a política precisa permitir explicitamente agregação cross-tenant.
Um grant do agregado não substitui permissões das fontes. Constituintes, tenant,
scope e principal são vinculados aos registros verificados e ao conjunto exato.

Para consulta atual, anchors.minimum_leaf_count é o mínimo monotônico retido pelo
host para anchors.stream_id. Prova válida de um checkpoint com menos folhas resulta
em Stale. O mínimo não é recebido de CandidateInput. A extensão testa uma raiz
antiga válida com uma folha e uma exigência independente de duas folhas. Persistência
do mínimo e forks exigem integração real; não são provados pelo fixture.

projection é observação do índice: não pode sobrepor-se ao estado autorizado.
Os [20 fixtures](../../tests/provenance-broker/v3.1/extensions-v2/README.md) incluem
negação, hipótese e correção literais, dois trechos seguros, agregação com decisões
distintas, rollback, índice atrasado e limites de bytes. Os avaliadores semânticos
continuam retidos, sem execução de GLiNER. Todos mantêm revisão independente pending.

### 7.3 Experimento de extração e suporte

Um [harness separado](../../tests/provenance-broker/extraction-harness/README.md)
executou GLiNER2.5 Multi sobre oito fontes únicas de 19 fixtures, com revisão de
checkpoint e versões fixadas. Os fixtures originais continuam retidos e inalterados.
O experimento separa extração, avaliador de suporte Rule identificado, concordância
com rótulos provisórios e integração. Não promove scores do extrator a SemanticOutcome.

O novo avaliador não é aceito pela política atual: as 19 tentativas de ingestão
experimental foram bloqueadas; simulações da função pura são rotuladas como tal.
O harness não afirma integração autenticada positiva ou admissão de novas extrações
no WormGraph. Resultados medidos, divergências, hashes e pendências estão no relatório
do experimento. A classificação documental de modalidade teve somente 1/8 de
concordância neste corpus; isso impede inferir sua adequação para o broker.
