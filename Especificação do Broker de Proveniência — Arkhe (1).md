# Especificação do Broker de Proveniência — Arkhe

## 1. Escopo e propósito

## 1. Escopo e propósito

O broker verifica candidatos recuperados pelo Cognee e produz cinco resultados independentes antes de liberá-los ao contexto do agente. A política de admissão decide, com base nesses resultados, se o candidato entra no contexto.

**Princípio central:** proveniência verificável não torna a afirmação verdadeira. O broker verifica criptografia, autorização e vínculo documental. A avaliação semântica é julgamento, não prova, e é exibida como tal — nunca como condição de admissão equivalente às três verificações anteriores.

**Regra de transporte:** o Cognee é transporte não confiável. Nada devolvido por ele é aceite sem verificação contra a raiz de confiança do broker (WormGraph). O Cognee devolve referências (`chunk_id`, `score`); o broker obtém bytes, digests e provas directamente do Arkhe.

**Fora do escopo desta especificação:** implementação Rust, esquema Protobuf/CBOR, integração com o pipeline do Cognee. Os tipos abaixo devem mapear directamente para o esquema de serialização escolhido.

## 2. Esquema dos campos

## 2. Esquema dos campos

O esquema separa três camadas: **entrada não confiável** (provém do Cognee ou do chamador), **resultados calculados** (broker obtém do WormGraph), e **decisão** (broker aplica; nunca pode ser preenchida pelo candidato). Um campo de resultado nunca é aceite da entrada sem recálculo independente.

```rust
// ═══════════════════════════════════════════════════════
// ENTRADA (não confiável — provém do Cognee ou do chamador)
// ═══════════════════════════════════════════════════════
struct CandidateInput {
    candidate_id:  CandidateId,    // referência devolvida pelo Cognee
    query_context: QueryContext,
}

struct QueryContext {
    principal:      Principal,     // identidade autenticada do chamador
    tenant:         TenantId,
    scope:          AccessScope,
    policy_id:      PolicyId,      // política a aplicar; validada pelo broker
    historical_req: Option<HistoricalRequest>,
}

struct HistoricalRequest {
    requested_instant: Timestamp,
    max_age:           Duration,   // tolerância em torno do instante
}


// ═══════════════════════════════════════════════════════
// RESULTADOS (calculados pelo broker a partir do WormGraph)
// ═══════════════════════════════════════════════════════

// 1. Integridade e inclusão
struct IntegrityResult {
    // Obtidos do WormGraph; nunca da entrada
    chunk_bytes:       Bytes,
    chunk_digest:      Digest,      // { alg: SHA-256, domain: "chunk", enc: hex }
    text_position:     TextPosition,// { version: SemVer, offset: usize (bytes UTF-8),
    //                               //   length: usize (bytes UTF-8) }
    source_digest:     Digest,      // do documento-fonte
    transformation:    TransformId, // { id: String, version: SemVer }
    evidence_ref:      EvidenceRef,
    inclusion_proof:   InclusionProof,
    // TrustedCheckpoint calculado pelo broker a partir de âncoras configuradas;
    // NUNCA é um campo booleano recebido da entrada.
    trusted_checkpoint: TrustedCheckpoint,
    // transform_accepted: versão da transformação aceite pela política?
    // Separado da integridade: bytes podem estar íntegros mas a versão ser outdated.
    transform_accepted: bool,

    verdict: IntegrityVerdict,
    // OK                → chunk_digest ✓, source_digest ✓, proof ✓, checkpoint ✓
    // TamperingDetected → chunk_digest ✗ (bytes alterados)
    // SourceMismatch    → source_digest ✗ (fonte diferente)
    // ProofAbsent       → inclusion_proof ausente ou inválida
    // CheckpointUntrusted → checkpoint não reconhecido pelas âncoras configuradas
    // TransformOutdated → transform_accepted = false
    //                     ≠ adulteração; bytes podem estar íntegros
}

// 2. Acesso
struct AccessResult {
    // Autorização cobre o candidato E, se agregado, o agregado e cada fonte.
    // Escopos distintos no mesmo tenant também exigem autorização sobre o agregado.
    agg_sources: Vec<(TenantId, AccessScope)>,
    verdict: AccessVerdict,
    // Permitted → acesso confirmado para tenant, scope e agg_sources
    // Denied    → acesso negado (tenants distintos sem escopo comum,
    //             escopos distintos sem autorização de agregação,
    //             ou permissão revogada)
    // Unknown   → fonte de autorização indisponível → falha fechada: Exclude
}

// 3. Vigência
struct VigencyResult {
    state:          StateValue,  // Active | Superseded | Revoked | Unknown
    queried_at:     Timestamp,
    max_age:        Duration,
    // HistoricalContext: preenchido somente quando historical_req presente
    // e policy_permits = true
    historical_ctx: Option<HistoricalContext>,
    verdict: VigencyVerdict,
    // Mapeamento state × historical_req → verdict (ver Secção 3.1)
}

struct HistoricalContext {
    requested_instant:  Timestamp,
    state_at_instant:   StateValue,   // estado registado naquele instante
    evidence_ref:       EvidenceRef,  // prova do estado histórico no WormGraph
    policy_permits:     bool,
}

// 4. Vínculo documental (verificação mecânica apenas)
//    Contradiction e Corroboration pertencem à avaliação semântica (5).
struct DocumentalResult {
    supporting_chunks:  Vec<ChunkRef>,
    relation_type:      RelationType,
    // SimpleSupport → trechos cobrem mecanicamente a relação
    // Aggregation   → reúne fontes; requer agg_sources autorizado
    relation_mechanism: RelationMechanism,
    // Extracted → trecho(s) cobrem a relação directamente nos spans
    // Derived   → relação inferida por regra declarada:
    //             { rule_id: String, rule_version: SemVer, premises: Vec<ChunkRef> }
    //             premises devem ser verificadas individualmente
    // Nota: Aggregation não é mecanismo separado; os seus constituintes
    //       são Extracted ou Derived
    all_chunks_verified: bool, // todos os trechos e premissas verificados
    has_relation_span:   bool, // existe span que cobre a relação, não só as pontas
    verdict: DocumentalVerdict,
    // Supported    → all_chunks_verified=true, has_relation_span=true
    // Partial      → verificação parcial ou relação coberta só pelas pontas
    // Insufficient → has_relation_span=false, ou trechos insuficientes
    // NotEvaluated
}

// 5. Avaliação semântica (julgamento — nunca condição suficiente de admissão)
struct SemanticResult {
    outcome: SemanticOutcome,
    // Supported | Partial | Contradicted | Indeterminate | NotEvaluated
    method: SemanticMethod,
    // NotEvaluated
    // Model  { evaluator: String, version: SemVer, score: f32, threshold: f32 }
    //         score é sinal; threshold declarado na política antes da execução
    // Human  { reviewer: String, timestamp: Timestamp, decision: String }
    //         sem score; a decisão é usada directamente pela política
    // Rule   { rule_id: String, rule_version: SemVer }
    //         sem score; resultado binário
    support_refs: Vec<EvidenceRef>,
}


// ═══════════════════════════════════════════════════════
// DECISÃO (aplicada pelo broker; nunca preenchida pelo candidato)
// ═══════════════════════════════════════════════════════
struct AdmissionDecision {
    decision:       DecisionValue,
    // Admit | AdmitHistorical | AdmitWithFlag | Exclude | Reject
    policy_id:      PolicyId,
    policy_version: PolicyVersion,
    decided_at:     Timestamp,
    applied_rule:   RuleId,        // qual regra da Secção 3 foi aplicada
    reasons:        Vec<DecisionReason>,
    flags:          Vec<DecisionFlag>, // campo obrigatório quando AdmitWithFlag
    //              flags devem especificar o motivo: SEMANTIC_CONTRADICTION,
    //              PARTIAL_DOCUMENTAL, etc.
}
```

## 3. Regras de decisão

## 3. Regras de decisão

A política de admissão é aplicada em ordem. A primeira regra que corresponde determina a decisão. Qualquer combinação não coberta resulta em `Exclude` (falha fechada) — se um caso de teste previsto cair na regra 13, é um erro da tabela, não uma decisão de política.

### 3.1 Mapeamento `state × historical_req → vigency`

| `state` | `historical_req` | `policy_permits` | `vigency` |
| --- | --- | --- | --- |
| `Active` | `None` | — | `Current` se idade ≤ `max_age`; `Stale` se expirado |
| `Active` | `Some` | `true` | `Historical` |
| `Active` | `Some` | `false` | `Stale` (query histórica negada pela política) |
| `Superseded` | `None` | — | `Superseded` |
| `Superseded` | `Some` | `true` | `Historical` |
| `Superseded` | `Some` | `false` | `Superseded` |
| `Revoked` | `None` | — | `Revoked` |
| `Revoked` | `Some` | `true` + política permite histórico revogado | `Historical` (declaração explícita obrigatória) |
| `Revoked` | `Some` | sem declaração explícita | `Revoked` (revogação prevalece) |
| `Unknown` | qualquer | — | `Unknown` → falha fechada |

### 3.2 Tabela de admissão

| # | `integrity.verdict` | `access.verdict` | `vigency.verdict` | `documental.verdict` | `semantic.outcome` | Decisão |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `OK` | `Permitted` | `Current` | `Supported` | ≠ `Contradicted` | `Admit` |
| 1a | `OK` | `Permitted` | `Current` | `Supported` | `Contradicted` | `AdmitWithFlag(SEMANTIC_CONTRADICTION)` ou `Reject` conforme política declarada |
| 2 | `OK` | `Permitted` | `Historical` | `Supported` | qualquer | `AdmitHistorical` |
| 3 | `OK` | `Permitted` | `Current` | `Partial` | avaliação positiva¹ | `AdmitWithFlag(PARTIAL_DOCUMENTAL)` |
| 4 | `OK` | `Permitted` | `Current` | `Partial` | `Contradicted` | `Reject` (contradição explícita, não incerteza) |
| 5 | `OK` | `Permitted` | `Current` | `Partial` | `Indeterminate` ou `NotEvaluated` | `Reject` (sem avaliação positiva para justificar admissão) |
| 6 | `OK` | `Permitted` | `Current` | `Insufficient` ou `NotEvaluated` | qualquer | `Reject` |
| 7 | `OK` | `Permitted` | `Revoked` ou `Superseded` | qualquer | qualquer | `Reject` |
| 8 | `OK` | `Permitted` | `Stale` | qualquer | qualquer | `Exclude` (revalidar estado antes de devolver) |
| 9 | `OK` | `Permitted` | `Unknown` | qualquer | qualquer | `Exclude` |
| 10 | `OK` | `Denied` | qualquer | qualquer | qualquer | `Reject` |
| 11 | `OK` | `Unknown` | qualquer | qualquer | qualquer | `Exclude` |
| 12 | qualquer falha² | qualquer | qualquer | qualquer | qualquer | `Reject` |
| 13 | não coberto | — | — | — | — | `Exclude` (falha fechada — se caso de teste previsto cai aqui, corrigir a tabela) |

¹ Avaliação positiva: `outcome = Supported` ou `Partial` com (Model: score ≥ threshold declarado) ou (Human: decision positivo) ou (Rule: resultado positivo). `NotEvaluated` e `Indeterminate` não são avaliações positivas. `AdmitWithFlag` não compensa documental `Insufficient`. ² Falha: `TamperingDetected`, `SourceMismatch`, `ProofAbsent`, `CheckpointUntrusted`, `TransformOutdated` conforme política (ver regras adicionais).

**Regras adicionais**

- `is_historical` não é declarável livremente pelo chamador. O broker valida `historical_req` contra a política (`policy_id`) antes de processar. Se a política não autoriza consulta histórica para o principal, `historical_req` é ignorada e `vigency` não pode ser `Historical`.
- `TransformOutdated` resulta em `Reject` somente se a política declarar essa versão como não aceite. Versão antiga sem declaração de política resulta em `AdmitWithFlag(TRANSFORM_OUTDATED)`, nunca em `TamperingDetected`. Bytes íntegros com versão desactualizada são integridade OK, não adulteração.
- `AdmitWithFlag` exige que o campo `flags` esteja preenchido e que a política tenha declarado o limiar (para Model) ou o critério (para Human/Rule) antes da execução. Sem declaração, o resultado é `Reject`.
- A tabela 3.2 é considerada exaustiva para os casos previstos. A suíte de testes deve verificar que nenhum caso de teste previsto cai na regra 13. Se cair, é erro da tabela.
- A decisão, `policy_id`, `policy_version`, `decided_at`, `applied_rule` e `reasons` são campos obrigatórios em `AdmissionDecision`. Um `BrokerRecord` sem esses campos é inválido.

## 4. Falha fechada

## 4. Falha fechada

Quando o broker não consegue determinar com certeza que o candidato é seguro para o contexto, ele exclui ou rejeita. Nunca devolve `Admit` por omissão.

| Situação | Consequência | Motivo |
| --- | --- | --- |
| `access = Unknown` | `Exclude` — remover do contexto do agente | Marcar como "não verificado" ainda expõe o dado ao agente |
| `vigency = Unknown` | `Exclude` | Estado não pode ser determinado na janela de frescura |
| `vigency = Stale` | `Exclude` | Consulta de estado expirou; revalidar antes de devolver |
| `inclusion_proof` ausente | `Reject` | Sem prova, a inclusão no checkpoint não pode ser verificada |
| `checkpoint.trusted = false` | `Reject` | Prova válida contra âncora não confiável não é evidência |
| Checkpoint fora da janela + `is_historical = false` | `Exclude` | Checkpoint antigo para afirmar estado actual é inválido |
| Checkpoint antigo + `is_historical = true` + política | `AdmitHistorical` | Válido para consulta histórica; a política e a autorização devem ser explícitas |
| Agregação entre tenants sem escopo comum | `Reject` | Autorização cobre o agregado e cada fonte; sem escopo comum, Denied |
| Política não cobre a combinação | `Exclude` | Falha fechada: qualquer caso não previsto é excluído |

**Regra de acesso desconhecido:** `Exclude` remove o candidato do conjunto que chega ao agente. A marcação `não verificado` não é suficiente porque o agente pode ainda usar o conteúdo marcado. O broker não passa para o agente o que não consegue verificar.

## 5. Casos de teste

## 5. Casos de teste

Os casos negativos cobrem as três verificações e a falha fechada. Os positivos são controles que devem passar. Casos adversariais reservados (marcados ★) não devem ser vistos durante o desenvolvimento do broker, para evitar sobreajuste da suíte.

### 5.1 Negativos — integridade

| ID | Cenário | Campo adulterado | Resultado esperado |
| --- | --- | --- | --- |
| N-INT-01 | Bytes do trecho alterados após ingestão | `chunk_bytes` ≠ `chunk_digest` | `integrity = TamperingDetected` → `Reject` |
| N-INT-02 | `source_digest` substituído pelo de outro documento | `source_digest` não bate | `integrity = SourceMismatch` → `Reject` |
| N-INT-03 | `inclusion_proof` ausente | campo nulo | `integrity = ProofAbsent` → `Reject` |
| N-INT-04 | Prova válida contra checkpoint não ancorado como confiável | `checkpoint.trusted = false` | `integrity = CheckpointUntrusted` → `Reject` |
| N-INT-05 ★ | Versão da transformação diferente da vigente; bytes íntegros | `transformation.version` desactualizado | `integrity = TransformMismatch` → `Reject` |

### 5.2 Negativos — acesso e vigência

| ID | Cenário | Campo | Resultado esperado |
| --- | --- | --- | --- |
| N-ACC-01 | Tenant sem permissão actual (revogação após ingestão) | `access = Denied` | `Reject` |
| N-ACC-02 | Acesso não pode ser determinado (fonte de estado indisponível) | `access = Unknown` | `Exclude` |
| N-ACC-03 ★ | Nó agregado com dois tenants distintos sem escopo comum | `agg_sources` cruza tenants | `access = Denied` → `Reject` |
| N-VIG-01 | Afirmação substituída por versão posterior | `state = Superseded` | `Reject` |
| N-VIG-02 | Afirmação revogada | `state = Revoked` | `Reject` |
| N-VIG-03 | Consulta de estado expirou (idade > `state_max_age`) | `vigency = Stale` | `Exclude` |
| N-VIG-04 | Estado desconhecido (fonte de estado indisponível) | `vigency = Unknown` | `Exclude` |
| N-VIG-05 ★ | Rollback: checkpoint antigo apresentado como actual (`is_historical = false`) | checkpoint fora da janela | `Exclude` |
| N-VIG-06 ★ | Projeção atrasada: índice devolve registo que o WormGraph já revogou | `state = Revoked` no WormGraph | `Reject` |

### 5.3 Negativos — vínculo documental

| ID | Cenário | Campo | Resultado esperado |
| --- | --- | --- | --- |
| N-DOC-01 | Duas pontas íntegras; nenhum trecho cobre a relação | `has_relation_support = false` | `documental = Insufficient` → `Reject` |
| N-DOC-02 | Trecho expressa negação ("não migrou") | conteúdo do chunk | Mecanicamente: `documental = Supported`, `has_relation_span = true` (span cobre a relação). Semanticamente: `semantic.outcome = Contradicted`. Aplica regra 1a → `AdmitWithFlag(SEMANTIC_CONTRADICTION)` ou `Reject` conforme política. Política do teste deve ser declarada antes; sem declaração, `Reject` |
| N-DOC-03 ★ | Trecho expressa hipótese ou condicional ("poderá migrar") | conteúdo do chunk | `documental = Partial`, `semantic.outcome = Indeterminate`. Aplica regra 5 → `Reject`. Política do teste: sem critério declarado para `Indeterminate`, decisão é `Reject`. Declarar política antes do teste |
| N-DOC-04 ★ | Correção que substitui afirmação anterior sem `state = Superseded` explícito | dois trechos com datas conflitantes | `documental = Partial`, `semantic.outcome = Contradicted` (datas conflitantes). Aplica regra 4 → `Reject` |
| N-DOC-05 ★ | Relação inferida de múltiplos trechos sem regra declarada | `relation_mechanism = Derived` sem `rule_id` | `documental = Insufficient` → `Reject` |

### 5.4 Positivos (controles)

| ID | Cenário | Resultado esperado |
| --- | --- | --- |
| P-01 | Candidato válido: todos os campos OK, `state = Active`, `access = Permitted`, trecho cobre a relação | `Admit` |
| P-02 | Relação sustentada por um único trecho directo | `relation_mechanism = Extracted`, `has_relation_support = true` → `Admit` |
| P-03 | Relação derivada: premissas explicitamente identificadas (`premises: Vec<ChunkRef>`), regra declarada (`rule_id + rule_version`), cada premissa verificada individualmente (`all_chunks_verified = true`) | `relation_mechanism = Derived`, `all_chunks_verified = true`, `has_relation_span = true`, `access = Permitted`, `vigency = Current` → `Admit` |
| P-04 | Checkpoint histórico com `is_historical = true`, autorização e política explícita | `vigency = Historical`: `historical_req` presente, `policy_permits = true`, `access = Permitted`, `integrity.verdict = OK`, `documental = Supported` → `AdmitHistorical` |
| P-05 ★ | Candidato válido não visto durante o desenvolvimento do broker | `Admit` (adversarial reservado) |

### 5.5 Métricas de A (testa o broker, não o Cognee)

| Métrica | Definição |
| --- | --- |
| Aceitações indevidas | Candidatos inválidos que receberam `Admit`, `AdmitHistorical` ou `AdmitWithFlag` quando o flag não deveria ter sido emitido |
| Rejeições indevidas | Candidatos válidos que receberam `Reject` ou `Exclude` |
| Cobertura | Percentagem de casos do corpus de teste exercitados |
| Adversariais | Resultado nos casos ★ reservados |

## 6. Rastro e auditabilidade

## 6. Rastro e auditabilidade

Toda afirmação substancial sobre comportamento do sistema deve ser verificável por terceiros. O esquema abaixo aplica-se a afirmações sobre o broker, sobre o código do Arkhe e sobre dependências externas.

### 6.1 Campos de classificação

| Campo | Valores | O que mede |
| --- | --- | --- |
| `status` | `não medido` \| `medido` | Se a afirmação foi verificada |
| `método` | `leitura documental` \| `inspeção de código` \| `teste executado` | Como foi verificada |
| `artefato` | nome do ficheiro + commit/hash + data | Qual versão foi inspeccionada |
| `força` | `THEOREM` \| `LEMMA` \| `CONJECTURE` \| `ECHO` | O que a evidência sustenta |
| `confiança` | intervalo de probabilidade (ex: 0,80–0,95) | Grau de certeza, quando justificável |

### 6.2 Afirmações desta especificação

| Afirmação | Status | Método | Artefato | Força | Confiança |
| --- | --- | --- | --- | --- | --- |
| Cognee é Apache 2.0 | medido — artefato incompleto (ver 6.3) | leitura documental | LICENSE, README, docs.cognee.ai — commit não registado nesta conversa; inspeção não reproduzível por terceiros sem o hash | `LEMMA` | 0,95–0,99 |
| Default do Cognee é `gliner2.5-base-v1` | medido | leitura documental | docs.cognee.ai, SKILL.md | `LEMMA` | 0,95–0,99 |
| Configurar só LLM faz embeddings cair para OpenAI | medido | leitura documental | docs.cognee.ai/guides/local-setup | `LEMMA` | 0,95–0,99 |
| `multi-v1` exige adaptador ou tarefa customizada | não medido | — | — | `CONJECTURE` | 0,50–0,80 |
| Cognee não expõe `source_digest` por chunk | não medido | — | — | `CONJECTURE` | 0,50–0,80 |
| Contrato com 5 resultados independentes é necessário | derivado da análise | — | — | `LEMMA` | 0,80–0,95 |
| Campo semântico separado evita confundir julgamento com prova | proposta de projecto | — | — | `CONJECTURE` | 0,50–0,80 |
| Ganho do Cognee sobre baseline | não medido | — | — | — | — |

### 6.3 Requisito de reprodutibilidade

Para que uma afirmação passe de `CONJECTURE` para `LEMMA`, o registo mínimo é:

```text
artefato:  <nome do ficheiro, ex: LICENSE, arkhe-memory/src/lib.rs>
commit:    <SHA-1 ou SHA-256 do repositório>
data:      <YYYY-MM-DD>
método:    leitura documental | inspeção de código | teste executado
resultado: <o que foi observado>
```

Sem commit e hash, a inspeção não é reproduzível por terceiros e permanece como declaração, não como evidência verificável.
