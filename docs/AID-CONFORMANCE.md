# AID v1.0-rc5 — vetores congelados

Quinze dos quarenta vetores da rc5 estão congelados com bytes fixos, nos dois
níveis que a auditoria pediu: a etapa isolada e o pacote completo pela entrada
normal do verificador. 40 testes.

A lista nominal é esta tabela, e é a única fonte: uma contagem citada fora daqui
envelhece a cada commit e convida a erros de composição.

| Vetor | O que prova | Esperado |
|:---|:---|:---|
| **V01** | Uma génese autorizada, apresentada sozinha | `PASS` |
| **V03** | `previous_aid` declarado sem predecessor apresentado | `INCONCLUSIVE`, com `model` e `history` ainda verificados |
| **V04** | A chave assinante está autorizada para outro `agent_id` | `FAIL` em `authorization` |
| **V06** (unitário e integrado) | O `aid` do predecessor é recomputado antes de qualquer assinatura | Controlo `PASS`; variante `FAIL` em `predecessor_aid_recomputation` |
| **V07a** | A operação está dentro do digest: trocá-la e manter o `aid` quebra a recomputação | `FAIL` em `aid_recomputation` |
| **V07b** | Trocar a operação e recomputar o `aid` não renova a assinatura | `FAIL` em `signature_verification` |
| **V02a** | Extensão de 2 para 5 eventos, com prova de consistência de dois passos | `PASS` |
| **V02b** | Extensão de 1 para 2 eventos — a forma que um agente real produz por execução | `PASS` |
| **V02** sem eventos | As mesmas raízes e prova, sem os eventos: a relação é demonstrável, os históricos não | `INCONCLUSIVE` |
| **V13a**, **V13b**, **V13c** | Árvores de 3, 5 e 2 folhas idênticas | Raízes fixas em hexadecimal |
| **V14a** | `N = M = 0` com `previous_aid != null` e a raiz vazia normativa | `PASS` |
| **V14b** | `N = 0` com uma raiz declarada que não é `SHA-256("")` | `FAIL` em `continuity` |
| **V14c** | `M < N`: o histórico encolheu | `FAIL` em `history_consistency` |
| **V20** | Dimensões fora do perfil marcadas `NOT_REQUIRED` | Congelado em cada controlo `model-only` |

| Onde | O quê |
|:---|:---|
| `verification/vectors/aid/V01.json`, `V03.json`, `V04.json` | A génese, o predecessor ausente e a chave de outro agente |
| `verification/vectors/aid/V06.json` | Controlo e variante do predecessor adulterado |
| `verification/vectors/aid/V07.json` | Os dois envelopes de operação trocada e os três digests relevantes |
| `verification/vectors/aid/V02.json` | As duas extensões com prova e o pacote sem eventos |
| `verification/vectors/aid/V14.json` | A fronteira da relação *append-only* |
| `verification/crates/arkhe-verify-core/src/aid/` | O verificador (`jcs`, `merkle`, `types`, `verify`) |
| `.../tests/aid_basics.rs` | V01, V03 e V04 — 5 testes |
| `.../tests/aid_v06.rs` | V06 nos dois níveis — 6 testes |
| `.../tests/aid_v07.rs` | V07a e V07b — 4 testes |
| `.../tests/aid_history.rs` | V02 e V14 — 8 testes |
| `.../tests/aid_merkle_consistency.rs` | A prova RFC 9162 como função pura — 7 testes |
| `.../tests/aid_canonicalization.rs` | As regras de parse e de árvore de que o `aid` depende — 10 testes |
| `.../examples/aid_basics_fixture.rs`, `aid_v06_fixture.rs`, `aid_v07_fixture.rs`, `aid_history_fixture.rs` | Os geradores |

Regenerar (o resultado tem de ser byte-idêntico ao ficheiro comitado):

```powershell
cargo run -q -p arkhe-verify-core --example aid_basics_fixture -- --vector V01 > verification/vectors/aid/V01.json
```

```powershell
cargo run -q -p arkhe-verify-core --example aid_basics_fixture -- --vector V03 > verification/vectors/aid/V03.json
```

```powershell
cargo run -q -p arkhe-verify-core --example aid_basics_fixture -- --vector V04 > verification/vectors/aid/V04.json
```

```powershell
cargo run -q -p arkhe-verify-core --example aid_v06_fixture > verification/vectors/aid/V06.json
```

```powershell
cargo run -q -p arkhe-verify-core --example aid_v07_fixture > verification/vectors/aid/V07.json
```

```powershell
cargo run -q -p arkhe-verify-core --example aid_history_fixture -- --vector V02 > verification/vectors/aid/V02.json
```

```powershell
cargo run -q -p arkhe-verify-core --example aid_history_fixture -- --vector V14 > verification/vectors/aid/V14.json
```

Correr tudo:

```powershell
cargo test -p arkhe-verify-core --test aid_basics --test aid_v06 --test aid_v07 --test aid_history --test aid_merkle_consistency --test aid_canonicalization
```

Os geradores do V06 e do V07 têm o construtor de payload duplicado em vez de
partilhado, de propósito: um vetor congelado não pode mudar porque o gerador de
outro vetor mudou. O V02 e o V14 partilham um gerador porque são o mesmo tema —
a relação entre dois históricos — e mudam juntos.

## 1. Os bytes

Comuns a todos os ficheiros:

| Campo | Valor |
|:---|:---|
| `agent_id` | `550e8400-e29b-41d4-a716-446655440000` |
| Chave pública | `88df55…a763` — **chave pública de teste, nunca de confiança real** |
| Janela da política | `2026-01-01T00:00:00Z` (inclusivo) a `2027-01-01T00:00:00Z` (exclusivo) |
| Instante de verificação | `2026-11-20T11:00:00Z` |
| Predecessor | `operation: genesis`, `provenance_timestamp` `2026-11-20T10:00:00Z` |
| Sucessor | `operation: extend`, `provenance_timestamp` `2026-11-20T10:05:00Z` |

### V01, V03, V04, V06 e V07

Os cinco são os **mesmos dois snapshots**, apresentados de cinco maneiras. O
V01 é o predecessor do V06 apresentado sozinho; o V03 é o sucessor do V06 com o
predecessor removido; o V04 é o envelope do V01 byte por byte, sob uma política
que autoriza a chave para outro `agent_id`. Os `aid` têm portanto de coincidir
entre ficheiros, e um teste exige isso — é o que faz destes ficheiros uma cadeia
auditável em vez de sete fixtures soltas.

| Campo | Valor |
|:---|:---|
| `predecessor.aid` (histórico vazio) — e o `aid` do V01 e do V04 | `sha256:066803420ccfdd62158f9ad05216a3d278f3711a7467bf30354898e932ee309d` |
| `aid` do sucessor assinado — e o `aid` do V03 | `sha256:cb45d178076648f598faa775cd988d4e229911488b953d4385cb06f8e5381ffe` |
| V04, `agent_id` autorizado na política | `6ba7b810-9dad-11d1-80b4-00c04fd430c8`, contra o `550e8400…` do payload |
| V06, campo adulterado | `predecessor.payload.descriptor.history.history_root` → `sha256:ff…ff` |
| V06, aid recomputado na variante | `sha256:3ab4398f703e3830b8010d9f2c5b30a2c4f2357abcd415c0d7d557b397954794` |
| V07, payload trocado | o mesmo sucessor com `operation: rotate` |
| V07, `aid` do payload trocado | `sha256:7a3a7c416aeb9894af5d9feb1e6e4000f5ab3f889ae532538d42bb58ec019d17` |
| V07, operações autorizadas na política | `genesis`, `extend`, **`rotate`** |

O predecessor e o sucessor assinado são o mesmo snapshot nos dois ficheiros, com
os mesmos bytes canónicos e por isso o mesmo `aid`. É o que faz dos dois
vetores a mesma cadeia vista de dois ângulos.

A variante do V06 preserva um digest sintaticamente válido e altera **apenas** a
raiz do predecessor. Um teste verifica que a assinatura retida é genuína sobre o
`aid` declarado: nada falha na criptografia, falha na recomputação.

No V07 o `rotate` está autorizado de propósito. Sem isso, o V07b pararia em
`authorization` e demonstraria a regra de autorização em vez da regra da
assinatura. Um teste verifica a política antes de afirmar a etapa — um vetor que
falha na etapa errada não demonstrou a regra para que foi escrito. Outro teste
repõe `extend` no payload trocado e recupera exatamente o `aid` e os bytes
canónicos originais: nada mais no payload foi tocado, é a operação que move o
digest.

O V01 passa, e o que ele **não** prova está escrito no próprio ficheiro: que
aquela é a única génese do agente. Uma segunda génese autorizada passaria
sozinha do mesmo modo, e nada aqui escolhe entre as duas — é o V16, e continua
`PENDING`. A dimensão `continuity` de uma génese é `PASS` porque não há aresta
para verificar e a declaração assinada de que não há é o que passa.

O V03 é a figura do veredito sem etapa: evidência que falta não é contradição,
logo a verificação não para — `continuity` fica `INCONCLUSIVE`, `model` e
`history` continuam a ser verificados e passam, o veredito global é
`INCONCLUSIVE` e `failure_stage` fica vazio. Uma etapa só é nomeada quando o
verificador para nela.

O par V01/V04 congela que a autorização não viaja no pacote: os mesmos bytes,
assinados pela mesma chave, dão `PASS` sob uma política e `FAIL` sob outra.

### V02 e V14

Os eventos são objetos canónicos com `event_index`, `kind` e `payload_digest`, e
os bytes da folha são o JCS desse objeto — o hash de folha é aplicado uma vez.

| Caso | `N` → `M` | Passos da prova | Veredito |
|:---|:---|:---|:---|
| V02a | 2 → 5 | 2 | `PASS` |
| V02b | 1 → 2 | 1 | `PASS` |
| V02 sem eventos | 1 → 2 | 1 | `INCONCLUSIVE` |
| V14a | 0 → 0 | 0 | `PASS` |
| V14b | 0 → 0, raiz anterior errada | 0 | `FAIL` |
| V14c | 2 → 1 | 0 | `FAIL` |

O V02a congela também que os eventos do predecessor são um prefixo dos do
sucessor e que as duas listas reconstroem as duas raízes declaradas. O caso sem
eventos é o que um adaptador produz quando exporta só as raízes e a prova: a
relação entre os históricos fica demonstrada e os históricos em si não, logo
`history` e `continuity` são `INCONCLUSIVE` e o veredito global também — **a
dimensão `model`, que foi verificada, continua `PASS` no relatório**. Um
pacote enxuto não é uma falha; é uma afirmação mais fraca, dita como tal.

## 2. Regras que tiveram de ser fechadas para congelar

A rc5 deixava estes pontos sem bytes. Ficaram fechados assim, e o que ficou
fechado está nos testes, não só aqui.

| Ponto | Decisão | Porquê |
|:---|:---|:---|
| Classes de vetor por algoritmo | Duas: **derivado de semente** — Ed25519 (RFC 8032) e ML-DSA-65 em modo determinístico puro (`ctx` vazio, `rnd` = `0^32`, FIPS 204), onde chave e assinatura se regeneram de uma semente de 32 bytes — e **assinatura opaca**, em que a assinatura é dada pré-gerada (inclui o ML-DSA-65 *hedged*) e o harness só verifica | A distinção não é «Ed25519 determinístico contra ML-DSA probabilístico»: o FIPS 204 padroniza o modo determinístico, e a `fips204 0.4.6` já expõe a feature `ml-dsa-65` e o `try_sign_with_seed`, que alimenta esse `rnd`. Os vetores aqui são derivados de semente com Ed25519 porque nenhum verificador ML-DSA está ligado ao caminho do AID (a crate entra como dependência opcional com ml-dsa-44), e porque 6618 caracteres hex por assinatura contra 128 pesam no ficheiro. É trabalho não feito, não uma impossibilidade |
| Bytes de evidência | **hex minúsculo**, não base64 | Os restantes vetores deste repositório são hex. Um vetor congelado não deve exigir uma segunda codificação de transporte para ser lido |
| Passos da prova de consistência | Cada passo é um nó de 32 bytes em hex minúsculo, numa lista ordenada | Sem a lista e o seu comprimento declarados, o consumo do caminho é ambíguo |
| Instantes | `YYYY-MM-DDTHH:MM:SSZ` exatamente: 20 caracteres, UTC, segundo | Com a forma fixa, comparar dois instantes é comparar duas strings. Sem ela, duas implementações discordam sobre fusos, frações e `+00:00` |
| Janela da chave | `valid_from` inclusivo, `valid_until` exclusivo | A fronteira era ambígua nas rc2–rc5 |
| Instante de verificação | Limita o instante de proveniência declarado | Um snapshot não pode declarar ter sido assinado depois do momento em que está a ser verificado. É o único uso do instante de verificação no perfil `model-only`, e é o que torna o parâmetro verificável em vez de decorativo |
| `previous_aid` | Tem de estar **presente**; a génese declara `null` | Ausência e `null` não são a mesma afirmação, e qualquer desserializador lê as duas como «nenhum». O parse rejeita a ausência antes de calcular o `aid` |
| Folhas da árvore | A entrada são os **bytes canónicos do evento** e o hash de folha é aplicado **uma vez** | Fecha o ponto «Vetores Merkle» da auditoria: o exemplo recebia 32 bytes e os testes passavam `Vec<u8>` de comprimento variável |
| Lista de eventos vazia | É evidência **completa** para `event_count: 0` e evidência **ausente** para contagem maior | Sem esta regra, um histórico vazio e um histórico não apresentado são indistinguíveis |
| Regra dos papéis | Dividida em duas: comprimentos hex e um papel por assinatura são regras de **bytes** e correm no parse; a **cardinalidade** que cada operação exige é semântica e corre depois da assinatura do emissor | Sem a divisão, um pacote `rotate` com uma só assinatura parava na cardinalidade e nunca chegava à assinatura — o V07b não podia existir |
| Âmbito não implementado | Só é declarado `INCONCLUSIVE` **depois** das etapas que este build implementa | Uma contradição encontrada numa etapa implementada é `FAIL`. Primeiro reportar o âmbito seria desculpar um pacote adulterado com «não sei verificar isto» |
| Dimensões numa parada | O relatório **conserva** as dimensões já decididas quando a verificação para numa etapa posterior | Uma parada em `continuity` não desverifica o manifesto do modelo. Reportar tudo como «não avaliado» esconde o que o verificador realmente fez |
| Predecessor ausente | **Não para** a verificação: marca `continuity` como `INCONCLUSIVE` e segue para as dimensões que ainda se podem verificar | Evidência que falta não é contradição. Parar na etapa 3 deixava `model` e `history` por avaliar quando ambos estavam verificáveis — e um pacote que prova menos deve ser aceite para menos, não reportado como se nada tivesse sido conferido (V03) |
| Etapa num veredito | `failure_stage` só é preenchido quando o verificador **para** numa etapa; um `INCONCLUSIVE` que vem das dimensões não tem etapa | Nomear uma etapa onde nada parou inventa um ponto de falha que não existe |

A rejeição genérica de `left == right` que a rc4 introduziu **não** existe aqui:
duas folhas idênticas produzem uma árvore legítima, e há um teste que o fixa. O
que se rejeita é auto-parear uma folha ímpar.

## 3. §5.1 corrigida — evidência por dimensão no perfil `model-only`

A tabela da rc5 enumerava apenas `model_manifest`, embora o perfil exija também
`history` e `continuity`. Esta é a tabela que o verificador aplica.

| Dimensão | Evidência exigida | Verificação | Se faltar |
|:---|:---|:---|:---|
| `model` | `evidence.model_manifest` (bytes do manifesto) | `SHA-256(bytes)` = `descriptor.model.manifest_hash` | `INCONCLUSIVE` |
| `history` | `evidence.history_events[]` (bytes canónicos de cada evento, em ordem) | `tree_hash(eventos)` = `descriptor.history.history_root` **e** `len(eventos)` = `event_count` | `INCONCLUSIVE` se a contagem for maior que zero e a lista estiver vazia; `FAIL` se a lista contradisser a contagem |
| `continuity` | `predecessor.payload`, `predecessor.signatures`, `predecessor.evidence.model_manifest`, `predecessor.evidence.history_events[]` e `evidence.history_consistency_proof` | `aid` do predecessor recomputado; chave autorizada para aquele `agent_id` e aquela operação, válida no instante declarado; assinatura sobre o `aid`; `previous_aid` = `aid` do predecessor; `agent_id` igual; evidência própria do predecessor verificada; prova de consistência RFC 9162 entre as duas raízes | `INCONCLUSIVE` se o predecessor ou a sua evidência não forem apresentados; `FAIL` se forem apresentados e contradisserem |

As quatro dimensões restantes (`training`, `runtime`, `capabilities`,
`governance`) são `NOT_REQUIRED`. `NOT_REQUIRED` não é `PASS`: é uma dimensão
fora do âmbito da afirmação, e não contribui para o veredito global.

## 4. Ordem de verificação

As etapas, na ordem em que o verificador para:

1. `parse` — JSON estrito: membros duplicados, floats e inteiros fora de
   `[-(2^53-1), 2^53-1]` são rejeitados antes de haver bytes canónicos; os
   comprimentos hex de `signature_bytes` e `public_key` que a §1.2 fixa; um
   papel por assinatura.
2. `schema` — campos desconhecidos rejeitados, não ignorados.
3. `aid_recomputation` — o `aid` do próprio snapshot. **← V07a**
4. **`predecessor_aid_recomputation`** — antes de qualquer assinatura. **← V06**.
   Um predecessor declarado e não apresentado não para aqui: fica registado como
   `continuity` inconclusiva. **← V03**
5. `authorization` — chave na política, algoritmo, `agent_id`, operação, janela
   temporal. **← V04**
6. `signature_verification` — sobre `"ARKHE-AID-SIG-v1\0" || aid`, onde `aid` é
   o texto UTF-8 `sha256:<64hex>` (71 bytes), não os 32 bytes crus. **← V07b**
7. Cardinalidade dos papéis, e só então o âmbito não implementado
   (`rotate` → `INCONCLUSIVE`).
8. `model_evidence` → `history_evidence` → `continuity`, e dentro da
   continuidade: evidência própria do predecessor (**← V14b**) e
   `history_consistency` (**← V02, V14c**).

Cada dimensão decidida fica no relatório mesmo que a verificação pare mais
adiante. O veredito global é `PASS` só se todas as dimensões obrigatórias forem
`PASS`. `FAIL` é contradição (*exit* 1); `INCONCLUSIVE` é evidência insuficiente
(*exit* 2), e quando vem das dimensões em vez de uma parada não traz etapa.

## 5. Fora do âmbito deste build

Declarado e **nunca reportado como `PASS`**:

| O que | Veredito | Porquê |
|:---|:---|:---|
| Perfis `historical` e `full` | `INCONCLUSIVE` | Sem verificação de token RFC 3161 e sem os caminhos de evidência de treino, runtime, capacidades e governança |
| `operation: rotate` que sobrevive às etapas implementadas | `INCONCLUSIVE` | Multi-assinatura, *proof-of-possession* e fronteira de ativação não implementados. Um `rotate` adulterado continua a dar `FAIL`, como o V07b mostra |
| Assinaturas ML-DSA-65 | `INCONCLUSIVE` | Nenhum verificador ML-DSA ligado no caminho do AID |
| Checkpoints, ponta oficial, unicidade da génese (V16) | Ausentes | Nenhum tipo neste módulo. Um pacote prova a transição, não que o snapshot é a ponta, nem que a génese é única. Sem isto não há deteção de clones nem barreira ao *replay* de um snapshot antigo e perfeitamente válido |
| Provas de inclusão (V13d) | Ausentes | A árvore e a prova de consistência estão implementadas; a prova de inclusão de um evento não |

A relação *append-only* já não tem casos em aberto: todos os pares `(N, M)` são
decididos, incluindo `N = 0`, `N = M` e `N < M`.

## 6. Classificação τ

| Afirmação | τ | Nota |
|:---|:---|:---|
| O V06 está congelado com bytes fixos, nos dois níveis | `LEMMA` local | 40 testes a correr |
| Uma génese autorizada passa, e a sua unicidade fica indeterminada | `LEMMA` local para a primeira metade, `PENDING` para a segunda | V01 congelado; V16 não existe |
| Um predecessor declarado e ausente é `INCONCLUSIVE`, sem apagar o que foi verificado | `LEMMA` local | V03 |
| A autorização está na política do verificador, não no pacote | `LEMMA` local | V01 e V04 com o mesmo envelope byte por byte e políticas diferentes |
| O payload está vinculado ao digest e o vínculo é aplicado pela entrada normal do verificador | `LEMMA` local | V06 unitário e V06 integrado, a mesma fixture |
| A operação está coberta pelo `aid` e pela assinatura sobre ele | `LEMMA` local | V07a, V07b, e o teste que repõe a operação e recupera o `aid` original |
| A prova de consistência RFC 9162 está implementada e verificada | `LEMMA` local | Geração por `SUBPROOF` (RFC 6962 §2.1.2) e verificação que reconstrói **as duas** raízes; prova conhecida derivada à mão para `(2, 5)`; passo alterado, truncado, reordenado, excedente, par de raízes errado e prefixo reescrito são todos rejeitados |
| Um histórico que cresce é verificável (`N < M`) | `LEMMA` local | V02a e V02b `PASS` |
| Um prefixo reescrito não passa por extensão | `LEMMA` local | Teste dedicado na função pura |
| A fronteira `N = 0`, `N = M`, `M < N` está fechada | `LEMMA` local | V14a, V14b, V14c |
| As raízes de 3 e 5 folhas e a de duas folhas idênticas | `LEMMA` (RFC 6962) | V13a–V13c, com o hexadecimal calculado por uma segunda implementação independente |
| Ordenação JCS por unidades UTF-16, não por bytes UTF-8 | `LEMMA` (RFC 8785) | Teste com U+FF61 e U+10000, onde as duas ordens divergem |
| `NOT_REQUIRED` não contribui para o veredito global | `LEMMA` local | V20, congelado em cada controlo |
| Um pacote sem eventos é `INCONCLUSIVE`, nunca `PASS` | `LEMMA` local | V02 sem eventos, com a dimensão `model` preservada |
| As catorze decisões da §2 acima | `PROPOSAL` | Fechadas neste build; nenhuma segunda implementação as confirmou ainda |
| Um vetor ML-DSA-65 é congelável com bytes reproduzíveis | `LEMMA` (FIPS 204) | Modo determinístico (`rnd` = `0^32`) e `KeyGen` a partir de ξ, ambos expostos pela `fips204 0.4.6` |
| Um vetor ML-DSA-65 congelado neste repositório | `PENDING` | Falta ligar o verificador ml-dsa-65 e fixar `rnd`, contexto e chave na §1.2 |
| Os restantes 25 vetores da rc5 | `PENDING` | Checkpoints e bifurcação (V05, V09, V16), rotação (V17–V19), carimbo RFC 3161 (V08, V21), provas de inclusão (V13d), e V10–V12 como pacotes: as regras de parse estão congeladas como testes, os pacotes com veredito declarado não |
| Continuidade autorizada offline está verificada | `PENDING` | Requer os 40 vetores |
| Os vetores são verificáveis por terceiros | `PENDING` | Requer o commit publicado |

Quinze vetores congelados, 25 por congelar. O Bloco A está fechado com as
ressalvas acima, e o bloco que faltava para um piloto com agentes reais — a
extensão incremental do histórico — também. O estado de conformidade do AID
continua `PENDING`.
