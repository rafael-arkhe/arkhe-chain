# Consolidação normativa — Arkhe / AKG-RFC-0002 v0.1.3

**Estado: CANDIDATE_NOT_FROZEN. Data: 16/10/2026.**

Fonte primária: `Texto colado.txt`, 19,221 linhas, 714,416 bytes.
SHA-256 dos bytes originais: `e2ba86120a90cbe151bafff8ec112487c951d97fdba5db6d4e0615f33458c852`.
Referências `Lx–Ly` apontam exclusivamente para essa cópia, sem renumeração.
O SHA-256 é identificador de proveniência desta revisão, não um digest AKG.

## 1. Autoridade e escopo

Esta entrega materializa uma superfície candidata para revisão. Não ratifica o corpus, não congela B.0.2 e não certifica uma implementação. “Vigente” significa aqui **regra selecionada segundo a precedência declarada no corpus**. Não significa aprovação externa comprovada.

A seleção usa o snapshot inicial (L1–1277), suas correções explícitas e cláusulas de suporte individualmente identificadas. O arquivo é uma compilação: posição no arquivo, título “final” ou repetição não provam data ou autoridade. A emenda de L7185 se declara proposta; os imports congelados não vieram com seus artefatos autenticados.

Precedência editorial retida: snapshot candidato → correção explícita compatível → texto corrente materializado → histórico somente informativo. Uma regra com fonte incompleta permanece pendente; nenhuma lacuna é preenchida por pesquisa de terceiros.

**Fora da superfície candidata:** ledgers concorrentes, pesquisa, comparativos de produtos, benchmarks, alegações de pioneirismo, exemplos superseded, selos narrativos e o próprio relatório desta auditoria.

## 2. Regras selecionadas

### N01 — Autoridades

Autor declara; verificador atesta; integrador decide; policy executa. Evidência não cria autoridade.

Fonte: L54–99. Classe: `RETAINED_CANDIDATE`.

### N02 — Objetos fundamentais

VerificationRecord, IntegrationAssessment e BranchIntegrationState são os três objetos persistentes fundamentais. Serializar subobjetos não cria uma quarta autoridade.

Fonte: L54–99. Classe: `RETAINED_CANDIDATE`.

### N03 — Bytes e digest

CanonicalBytes usa WireProjection_v1 e AKGCBORv1. ObjectDigest usa BLAKE3-256 sobre domínio e bytes da projeção unsigned definida antes de serializar.

Fonte: L101–136; L17358–17374. Classe: `RETAINED_CANDIDATE`.

### N04 — PolicyBinding

PolicyRef mantém policy_id/version. PolicyDigest vincula o artefato efetivamente resolvido; mismatch rejeita. PolicyCore e DomainPolicy não são definidos na PoC.

Fonte: L138–220. Classe: `RETAINED_CANDIDATE`.

### N05 — Identidade e propriedades

IdentityRef inclui scheme/value sem inferir scheme; PropertyRef inclui name/version com igualdade exata.

Fonte: L223–271. Classe: `RETAINED_CANDIDATE`.

### N06 — ScopeExpr

Somente artifact_set, symbol_set e component(name); não acrescentar quarta variante por escolha wire.

Fonte: L273–290. Classe: `RETAINED_CANDIDATE`.

### N07 — SubjectRef

Union digest/id. Finding.subject_ref é opcional por omissão; null não representa ausência.

Fonte: L292–325. Classe: `RETAINED_CANDIDATE`.

### N08 — ClaimRef

ClaimRef é text_id. Não criar QualifiedClaimRef nem inferir namespace candidate_intent por B.0.2.

Fonte: L327–351; L1454–1460. Classe: `RETAINED_CANDIDATE`.

### N09 — Finding

Finding contém code/category/subject_ref?/evidence_refs/details_ref?; não contém severity.

Fonte: L353–378. Classe: `RETAINED_CANDIDATE`.

### N10 — Disposição

FindingDisposition referencia um Finding e o PolicyBinding; INFO/WARNING/BLOCKING são decisões de policy. Mudança de policy não muda o fato.

Fonte: L380–451. Classe: `RETAINED_CANDIDATE`.

### N11 — Ambiente

Componentes relevantes devem ser vinculados. Suficiência ambiental desconhecida produz INCONCLUSIVE; não equivale a independência.

Fonte: L453–501; L7415–7488. Classe: `RETAINED_CANDIDATE`.

### N12 — Métodos

Union ContractualVerifier/ExecutableVerifier/FormalVerifier. Preservar tipos nominais; result_digest e aliases permanecem pendentes. Não introduzir result_value/domain_ref.

Fonte: L503–636. Classe: `RETAINED_CANDIDATE`.

### N13 — Request

As cinco coleções de VerificationRequest têm cardinalidade mínima um; policy não relaxa esses mínimos.

Fonte: L638–660. Classe: `RETAINED_CANDIDATE`.

### N14 — Dependências

DependencyEdge(source,target,kind) usa STRUCTURAL/SEMANTIC/VERIFICATION e não substitui IntentCore.Dependency.

Fonte: L662–694. Classe: `RETAINED_CANDIDATE`.

### N15 — Comutação

StrongStateCommutes exige igualdade canônica exata para todos os estados admissíveis do domínio vinculado. Sem profile, caminho indisponível.

Fonte: L696–735; L7492–7557. Classe: `RETAINED_CANDIDATE`.

### N16 — Ordering

ExplicitOrdering é constraint, não CompositionEvidence; exige autenticação, causa admissível, digests e aciclicidade.

Fonte: L737–759; L6137–6163. Classe: `RETAINED_CANDIDATE`.

### N17 — Closure

CompositionClosure vincula I,B,F,R,P e universo finito; base ambígua impede closure. Dependência normativa é explícita e desconhecimento de independência inclui membro.

Fonte: L761–805; L14159–14269. Classe: `RETAINED_CANDIDATE`.

### N18 — VerificationRecord

Core inclui contexto, método, evidência, resultado e PolicyBinding. Assinatura fica fora; issued_at não prova validade corrente.

Fonte: L807–864. Classe: `RETAINED_CANDIDATE`.

### N19 — Assessment

Core vincula candidato, branch, frontier e policy; contém dimensões, referências, disposições e decisão. assessment_digest não se inclui.

Fonte: L866–894. Classe: `RETAINED_CANDIDATE`.

### N20 — Branch

Core contém DAG, ordering, frontier e PolicyBinding; state_digest, signer e attestation ficam fora do preimage.

Fonte: L896–944; L7652–7723. Classe: `RETAINED_CANDIDATE`.

### N21 — Assinatura

PoC aceita AKG-SIG-ED25519-v1: chave pública de 32 bytes, assinatura de 64 bytes e mensagem SignatureDomain || ObjectDigest; sem prehash adicional da aplicação.

Fonte: L946–980; L7561–7648. Classe: `RETAINED_CANDIDATE`.

### N22 — Domínios

Preservar seis domínios de objeto e três de assinatura; não normalizar nomes nem inserir DomainPolicy.

Fonte: L982–1011. Classe: `RETAINED_CANDIDATE`.

### N23 — Wire

Campos e discriminadores desconhecidos rejeitam; conjuntos semânticos têm ordenação e unicidade; sequências preservam ordem. Bounds e normalização ficam pendentes onde não fechados.

Fonte: L5605–5625. Classe: `SUPPORTING_WIRE_CANDIDATE_NEEDS_RESOLUTION`.

### N24 — M6

SAFE pairwise não poda closure; observação bootstrap não promove produção; mudança contextual exige reverificação e cobertura parcial não prova independência.

Fonte: L14345–14362. Classe: `SUPPORTING_M6_CANDIDATE`.

### N25 — Arquitetura

NativeCore detém enforcement no desenho proposto; signing/root authority é papel separado; WASM verifica sem promoção de estado; payloads e UI não são autoridades.

Fonte: L17378–17409; L18379–18397; L18842–18857. Classe: `ARCHITECTURE_CANDIDATE_NOT_EMPIRICALLY_VERIFIED`.

### N26 — Freeze

B.0.2 permanece NOT_FROZEN enquanto faltarem subtipos, result preimage, PolicyDigest, imports/matriz/domínios completos e execução dos dois audits.

Fonte: L1166–1277. Classe: `RETAINED_CANDIDATE`.

## 3. Identidade e fronteiras criptográficas

```text
UnsignedCore(x) := projeção sem assinatura definida pelo tipo
CanonicalBytes(x) := AKGCBORv1(WireProjection_v1(x))
ObjectDigest(x) := BLAKE3-256(DomainObject || CanonicalBytes(UnsignedCore(x)))
SignedMessage(x) := SignatureDomain || ObjectDigest(x)
```

Definir a projeção antes de serializar. Não serializar o objeto completo para depois retirar bytes da assinatura. Não confundir `DomainAssess` com nomes editorialmente semelhantes.

Campos self-digest e attestations externas não integram o próprio preimage. Mudanças em policy, contexto ou campos unsigned normativos afetam a identidade conforme o schema selecionado. Substituir uma attestation de branch não muda o digest do branch.

`PolicyDigest` é uma exceção de resolução de artefato: seu algoritmo e preimage vêm do `PolicyResolutionProfile`, ainda pendente. Não aplicar automaticamente o registry de domínios de objetos AKG a um `PolicyCore` inexistente.

### Registry candidato em bytes

`\0` na coluna literal representa **um byte 00**, não barra seguida de zero. O registro não adiciona `DomainPolicy`.

| Objeto | Literal | Bytes | Hex |
|:---|:---|---:|:---|
| VerificationRecord | `AKG:VERIFY:v1\0` | 14 | `414b473a5645524946593a763100` |
| IntegrationAssessment | `AKG:ASSESS:v1\0` | 14 | `414b473a4153534553533a763100` |
| BranchIntegrationState | `AKG:BRANCH:v1\0` | 14 | `414b473a4252414e43483a763100` |
| Finding | `AKG:FINDING:v1\0` | 15 | `414b473a46494e44494e473a763100` |
| EnvironmentDescriptor | `AKG:ENV:v1\0` | 11 | `414b473a454e563a763100` |
| EnvironmentComponent | `AKG:ENVCOMP:v1\0` | 15 | `414b473a454e56434f4d503a763100` |
| VerificationRecord signature | `AKG:VERIFY-SIG:v1\0` | 18 | `414b473a5645524946592d5349473a763100` |
| IntegrationAssessment signature | `AKG:ASSESS-SIG:v1\0` | 18 | `414b473a4153534553532d5349473a763100` |
| BranchIntegrationState signature | `AKG:BRANCH-SIG:v1\0` | 18 | `414b473a4252414e43482d5349473a763100` |

A conferência de comprimento é mecânica. Não comprova a aprovação do registry nem a implementação de BLAKE3.

## 4. CompositionClosure e obrigações M6

Cláusulas de suporte selecionadas: L14159–14362; não importar os selos desse bloco como prova.

```text
U = {I} ∪ DependencyClosure(I) ∪ BranchInterval(B,F)
    ∪ DependencyClosure(BranchInterval(B,F))
C0 = {I} ∪ DependencyClosure(I)
C(n+1) = C(n) ∪ {Y ∈ U\C(n) :
  ExplicitSemanticDependency(Y,C(n))
  OR NOT ProvablyCompositionIndependent(Y,C(n),R,P)}
```

B, F, R e P precisam de significado e binding imutáveis para a avaliação. Dependência normativa não é inferida por heurística. Falta de prova de independência inclui o membro; não autoriza descartar dependências ausentes do universo resolvido.

A sequência só cresce num universo finito: há no máximo `|U\C0|` iterações que acrescentam membros, mais uma checagem final de estabilidade. A conclusão de **menor** ponto fixo também depende da monotonicidade do operador. Uma frase sobre Knaster–Tarski não substitui a verificação dessas hipóteses.

Comutação forte quantifica todos os prefix-states admissíveis, não apenas o estado-base. O schema de estado deve cobrir tudo que afeta continuações admitidas. Para transições parciais, habilitação e domínio também precisam ser preservados. Sem esse profile, o caminho de comutação forte fica indisponível.

Ordenação explícita restringe linearizações; não prova independência. O teorema de adjacent swaps é condicional a transições definidas, estado/perfil suficientes, certificados aplicáveis e grafo acíclico. Amostras ou vetores finitos não provam sozinhos a quantificação universal.

## 5. Histórico excluído e decisões de substituição

| Construção histórica | Fonte de conflito | Regra selecionada | Situação |
|:---|:---|:---|:---|
| PolicyRef como digest | L9836–9866 | PolicyRef + PolicyDigest separados | Superseded no candidato |
| PolicyCore/DomainPolicy | L5660–5684; L3959 | Artefato resolvido + perfil ainda aberto | Superseded / deferred |
| Finding.subject_ref obrigatório | L5783 | Opcional por omissão, L292–325 | Superseded |
| SubjectRef com quatro variantes | L6443–6449 | Somente digest/id | Superseded |
| Claim namespace no candidate_intent | L3750–3768 | Não inferir nova semântica | Superseded |
| result_value e método “fechado” | L3786–3826 | Aliases distintos + preimage pendentes | Superseded |
| Request com conjuntos vazios | L6598 | Cinco mínimos iguais a um | Superseded |
| severity factual / blocking finding | L1013–1030 | Disposition sob policy válida | Superseded |
| Estado apenas “relevante”, equivalência configurável | L17445–17467 | Igualdade exata sob profile e domínio vinculados | Não importar para a PoC |
| CanonicalIdentity = bytes | L18479–18497 | Distinguir bytes e ObjectDigest | Superseded pela correção |
| WASM como autoridade por formato | L18924–19023 | Capacidade e autoridade são distintas | Fora da norma |
| EvidenceBundle no próprio subject sem exclusão | L19025–19036 | Detached ou projeção excludente definida | Não aprovado |

A classificação integral por faixas e o índice de títulos estão em `source-index.json`. Uma faixa de suporte não é importada integralmente: só as cláusulas selecionadas em `normative-rules.json` entram neste candidato. A classificação é editorial, não decisão de policy AKG.

## 6. Pendências e gate

| Pendência | O que precisa existir | Estado nesta entrega |
|:---|:---|:---|
| Imports RFC-0001 e B.0.1 | Artefatos completos, versão e identidade fixadas | Não materializados como imports autenticados |
| VerificationMethod | Seis aliases, tipos/resultados e preimage exatos | OPEN |
| PolicyResolutionProfile | CanonicalPolicyBytes, algoritmo, dependências e resolução | OPEN |
| Matriz B.0.2 | Tipos, presença, limites, unicidade, sort keys e condições de todos os campos | Incompleta |
| Normalização | Regras por scheme e rejeição de entrada ambígua | OPEN |
| Perfis de execução e contexto | Estado, domínio, base/frontier, chaves, freshness e escopo de policy | Incompletos |
| FindingPropagationAudit | Relatório semântico sobre snapshot fechado e identificado | NOT_RUN |
| PolicyDigestPropagationAudit | Relatório de bindings completos e reproduzíveis | BLOCKED |
| B.1 | Vetores normativos e negativos identificados | BLOCKED pelo B.0.2 |
| B.2 | Paridade independente, divergências e regressões | NOT_DEMONSTRATED |

O gate original exige subtipos, result preimage, PolicyDigest, snapshot materializado, audits PASS, domínios exatos e matriz completa (L1166–1213). Materializar este documento satisfaz apenas a existência de um **artefato candidato**. Não satisfaz o fechamento das definições nem a ratificação.

**Conclusão de estado:** regras consolidadas; histórico segregado; pendências explícitas; B.0.2 NOT_FROZEN. Os dois bloqueios originais permanecem, e as lacunas adicionais identificadas devem ser resolvidas ou comprovadas pelos imports antes do freeze.
