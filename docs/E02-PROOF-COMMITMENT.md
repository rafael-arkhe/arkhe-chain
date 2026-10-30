# E02 — compromisso de prova em memo (perfil v1)

**Status:** `FROZEN` — `arkhe-e02@1`, 2026-10-23.
**Registo do freeze:** `specs/e02/README.md`; integridade dos ficheiros em
`specs/e02/manifest.json`. Freeze local do perfil devnet; não é release público.
**Âmbito:** devnet. Perfil de transporte e verificação local; não é autoridade.
**Relação com E01:** E02 é um perfil **distinto**. Os recibos E01 continuam
válidos sob o seu próprio perfil e não são reinterpretados por este documento.

Este perfil define como uma transação referencia um artefacto já comprometido
num MMR `arkhe-mmr@1`, e como um verificador local decide entre **verificável** e
**não verificável** sem depender de um servidor, indexer ou API de terceiros.

O memo **não transporta a prova**. Transporta o compromisso que permite ao
verificador localizar a folha, reconstruir a prova a partir de um dataset público
e compará-la com uma root ancorada. Uma prova de inclusão para 2²⁴ folhas tem
cerca de 768 bytes e excede o limite de 566 bytes do memo (`scripts/e01_solana_transport.mjs:40`).

## 0. Não-objetivos

E02 v1 não faz, e o verificador não pode afirmar que faz:

- impor memos a transferências (SPL legacy não tem extensões; `MemoTransfer` é
  extensão de conta e não valida conteúdo);
- provar que o pagador produziu o artefacto referenciado;
- provar completude (que nenhuma folha foi omitida do dataset);
- provar ordem, tempo ou ausência de eventos;
- verificar artefactos de produção — v1 aceita apenas o rótulo `synthetic-poc`;
- operar em mainnet (perfil E03, ainda não especificado);
- atribuir autoridade, admissão ou execução a quem verifica;
- substituir o kernel, o WormGraph ou o `ContainmentGate`.

## 1. Perfis referenciados

| Perfil | Identificador | Onde |
|---|---|---|
| MMR | `arkhe-mmr` v1, digest `bcd07a275061ef385fccdd184030c2358fdd0937477cb0ef30cf8148342f2450` | `specs/mmr/spec/mmr-profile-v1.md` |
| Transporte | `e02-ref` v1 / `e02-anchor` v1 | este documento |
| Folha | `AKG:E02:LEAF:v1\0` | §3.1 |
| Operação | `AKG:E02:OP:v1\0` | §3.2 |
| Dataset | `AKG:E02:DATASET:v1\0` | §4.3 |

As regras de hash, domínios `00/01/02`, bagging e formato de prova são as do
perfil MMR. E02 não altera o perfil nem os golden vectors.

## 2. Formato de fio

### 2.1 Memo de referência

```
ARKHE:REF:v1:<op_id>:<leaf_hash>:<root>:<n>:<anchor_ref>
```

ABNF (bytes ASCII; `HEX64` é minúsculo):

```
reference-memo = "ARKHE:REF:v1:" op-id ":" leaf-hash ":" root ":" n ":" anchor-ref
op-id          = HEX64
leaf-hash      = HEX64
root           = HEX64
n              = %x31-39 *9DIGIT        ; 1..4294967295, sem zeros à esquerda
anchor-ref     = 64*88 base58-char
HEX64          = 64( %x30-39 / %x61-66 )
base58-char    = %x31-39 / %x41-48 / %x4A-4E / %x50-5A / %x61-6B / %x6D-7A
```

| Campo | Bytes | Semântica |
|---|---|---|
| `ARKHE:REF:v1` | 12 + `:` | Prefixo de perfil; não confundir com `ARKHE:ANCHOR:v1`. |
| `op_id` | 64 | `BLAKE3(AKG:E02:OP:v1\0 ‖ kind ‖ 0x00 ‖ subject)` (§3.2). |
| `leaf_hash` | 64 | `BLAKE3(0x00 ‖ leaf_bytes)` do artefacto (§3.1). |
| `root` | 64 | Root do checkpoint `arkhe-mmr@1`. |
| `n` | 1–10 | Número de folhas do MMR. Tem de coincidir com dataset e âncora. |
| `anchor_ref` | 64–88 | Assinatura base58 da transação de ancoragem (§2.2). |

Tamanho máximo: 12 + 5 separadores + 64 + 64 + 64 + 10 + 88 = **307 bytes**.
Mínimo: 274 bytes. Ambos abaixo de 566.

### 2.2 Memo de ancoragem

```
ARKHE:ANCHOR:v1:<root>:<n>:<dataset_digest>
```

| Campo | Bytes | Semântica |
|---|---|---|
| `ARKHE:ANCHOR:v1` | 15 + `:` | Prefixo distinto do de referência. |
| `root` | 64 | Root publicada. |
| `n` | 1–10 | Número de folhas. |
| `dataset_digest` | 64 | `BLAKE3-256` dos **bytes exatos** do ficheiro de dataset (§4). |

Tamanho máximo: 156 bytes. A transação de ancoragem contém **exatamente uma**
instrução Memo e é assinada pelo pagador. O pagador é o publisher observado; a
sua identidade não é, por si, uma raiz de confiança.

### 2.3 Regras de canonicalidade

Um parser E02 v1 MUST rejeitar, antes de qualquer verificação criptográfica:

1. bytes `> 0x7F` ou bytes de controlo (`< 0x20`), incluindo `\n`;
2. comprimento total superior a 566 bytes;
3. número de tokens de `split(':')` diferente de 8 (referência: `ARKHE`, `REF`,
   `v1`, `op_id`, `leaf_hash`, `root`, `n`, `anchor_ref`) ou 6 (âncora:
   `ARKHE`, `ANCHOR`, `v1`, `root`, `n`, `dataset_digest`);
4. campos vazios, espaços, `+`, `-`, `0x` ou separadores extra;
5. hex com maiúsculas, comprimento diferente de 64, ou re-encode diferente;
6. `n` com zero à esquerda, `"0"`, ou `> 4294967295`;
7. `anchor_ref` que não descodifique para exatamente 64 bytes ou cujo re-encode
   base58 não seja idêntico ao campo;
8. prefixo desconhecido, incluindo versões futuras (`v2`, `V1`).

Re-encode idêntico é obrigatório: a canonicalidade faz parte do compromisso.
Duas codificações do mesmo valor não podem ambas verificar.

## 3. Folha, operação e rótulo

### 3.1 `leaf_bytes`

```
leaf_bytes = ASCII("AKG:E02:LEAF:v1\0") ‖ canonical_json(artifact)
leaf_hash  = BLAKE3(0x00 ‖ leaf_bytes)        ; aplicado pelo perfil MMR
```

`artifact` tem exatamente estas chaves, sem outras:

```json
{
  "artifact": "<string ASCII 0x20-0x7E, 1..256 bytes>",
  "kind": "e01-run",
  "label": "synthetic-poc",
  "producer": "<hex64 da chave pública Ed25519>",
  "subject": "<hex64>",
  "v": 1
}
```

`kind` ∈ {`e01-run`, `gguf-supply-chain`, `stage8-alert`, `gov-synthetic`}.
`label` ∈ {`synthetic-poc`, `production`}; v1 aceita apenas `synthetic-poc` e o
verificador MUST rejeitar `production` com `LABEL_OUT_OF_SCOPE`.

| `kind` | `subject` |
|---|---|
| `e01-run` | SHA-256 do payload E01 (`type,v,genesis,run,profile,n,root,dataset`) |
| `gguf-supply-chain` | Digest do bundle de supply-chain verificado |
| `stage8-alert` | Digest do alerta exportado |
| `gov-synthetic` | Digest do bundle governamental sintético |

`subject` e `producer` são compromissos; E02 não verifica que o produtor assinou
o artefacto. Essa verificação pertence ao perfil do artefacto, não ao E02.

### 3.2 `op_id`

```
op_id = BLAKE3( ASCII("AKG:E02:OP:v1\0") ‖ UTF8(kind) ‖ 0x00 ‖ hex_decode(subject) )
```

`op_id` é derivável do artefacto e por isso verificável: o verificador MUST
recalcular `op_id` a partir da folha encontrada e comparar com o memo. Um `op_id`
arbitrário é inválido.

### 3.3 JSON canónico

- UTF-8, apenas ASCII imprimível dentro de strings;
- chaves ordenadas por byte, sem duplicados;
- sem espaços ou newlines;
- apenas inteiros (`v: 1`), sem floats, booleanos nulos ou expoentes;
- máximo 1024 bytes.

## 4. Dataset de folhas

O dataset é a única fonte de provas. Sem ele, `(leaf_hash, root, n)` não permite
reconstruir um caminho de inclusão.

### 4.1 Forma

```json
{
  "n": 5,
  "root": "<hex64>",
  "leaves": ["<hex de leaf_bytes>", "..."],
  "proofs": [
    {"index": 0, "steps": [{"kind": "node", "direction": "right", "hash": "<hex64>"}]}
  ],
  "provenance": {"kid": "<string>", "sig": "<hex128>"},
  "profile": {"digest": "bcd0...", "id": "arkhe-mmr", "version": 1},
  "v": 1
}
```

- `leaves.length` MUST ser `n`; `1 <= n <= 4096`;
- cada `leaf_bytes` MUST ter comprimento par, `<= 1040` bytes;
- `root` MUST ser recalculado a partir de `leaves`; divergência invalida o dataset;
- se `proofs` existir, cada caminho MUST coincidir com o recalculado;
- `proofs` é opcional; o verificador reconstrói sempre que possível.

### 4.2 Limites

| Limite | Valor |
|---|---|
| Ficheiro de dataset | 16 MiB |
| Folhas | 4096 |
| `leaf_bytes` | 1040 bytes |
| Passos por prova | 32 |

### 4.3 Proveniência

`provenance.sig` é Ed25519 sobre
`ASCII("AKG:E02:DATASET:v1\0") ‖ canonical_json(dataset sem provenance)`.

A assinatura dá **proveniência**, não integridade: a integridade vem de a root
recalculada coincidir com a root ancorada. Um dataset não assinado pode ser
íntegro; um dataset assinado por uma chave desconhecida não é confiável. O
verificador MUST mostrar `kid` e `assinado: sim/não`, e MUST NOT tratar a
assinatura como substituto da root ancorada.

## 5. Algoritmo de verificação

Entrada: assinatura de transação (base58), dataset, recibo da transação de
referência, recibo da transação de ancoragem e cluster esperado `devnet`.

1. `signature` não canónica → `INVALID_INPUT`; cluster diferente de `devnet` →
   `CLUSTER_NOT_ALLOWED`.
2. Obter a transação por RPC ou usar um recibo `getTransaction`
   (`encoding: json` ou `jsonParsed`) capturado. Recibo ausente →
   `RECEIPT_MISSING`; assinatura ou formato divergente → `RECEIPT_MISMATCH`;
   falha de rede, erro ou timeout → `RPC_UNAVAILABLE`.
3. Exigir `meta.err == null`; caso contrário `TX_FAILED`.
4. Exigir exatamente uma instrução Memo; zero → `MEMO_MISSING`, mais de uma →
   `MEMO_MULTIPLE`.
5. Descodificar a instrução com §2.3. Qualquer falha → `MEMO_MALFORMED`
   (prefixo desconhecido → `MEMO_PROFILE_UNKNOWN`; comprimento superior a 566
   bytes → `MEMO_TOO_LARGE`). Exigir perfil de referência.
6. Descodificar o dataset com §4. Falha → `DATASET_INVALID`.
7. Localizar em `leaves` a folha com `BLAKE3(0x00 ‖ leaf_bytes) == leaf_hash`.
   Zero → `LEAF_NOT_IN_DATASET`; mais de uma → `LEAF_AMBIGUOUS`.
8. Recalcular `root'` e a prova a partir de `leaves`. `n != leaves.length` →
   `N_MISMATCH`. `root' != root` → `ROOT_MISMATCH`.
9. Chamar `verify_mmr(leaf_bytes, n, proof_json, root)` do
   `arkhe-verify-wasm`. `false` ou erro → `PROOF_INVALID`.
10. Obter a transação `anchor_ref`, com as mesmas regras de 2–3. Falha →
    `ANCHOR_NOT_FOUND`.
11. Exigir nela exatamente uma instrução Memo com §2.2. Divergência de root, `n`
    ou `dataset_digest` → `ANCHOR_ROOT_MISMATCH`, `ANCHOR_N_MISMATCH` ou
    `ANCHOR_DATASET_MISMATCH`.
12. Extrair o artefacto de `leaf_bytes` (após o prefixo de §3.1) e exigir JSON
    canónico: não parseável ou re-encode diferente → `ARTIFACT_INVALID`.
    Recalcular `op_id`; divergência → `OP_ID_MISMATCH`.
13. Exigir `label == "synthetic-poc"`; caso contrário `LABEL_OUT_OF_SCOPE`.
14. Só se 1–13 passarem, o resultado é `VERIFIED`.

### 5.1 Saída

```json
{
  "outcome": "VERIFIED" | "NOT_VERIFIABLE",
  "reason": null | "<REASON_CODE>",
  "observation_warning": "O verificador E02 não autentica recibos RPC. A verificação offline é reprodutível, mas a fidelidade ao estado on-chain depende do canal de observação. Um adversário que controle esse canal pode fabricar recibos e um dataset coerentes.",
  "observed": {
    "root": "<hex64>",
    "n": 5,
    "anchor_ref": "<base58>",
    "anchor_slot": 123,
    "anchor_payer": "<base58>",
    "cluster": "devnet",
    "dataset_digest": "<hex64>",
    "dataset_origin": "<path ou URL>",
    "provenance_kid": null,
    "signed": false
  },
  "statement": "O pagador da transação referenciou o artefacto A; A está incluído na root R (n=5); R foi publicada pelo pagador P no slot S; o dataset recomputa R. Isto não prova quem produziu A nem que A é verdadeiro."
}
```

`statement` é obrigatório. Em `VERIFIED` MUST usar a redação acima. Em
`NOT_VERIFIABLE` MUST ser `Não verificável (<REASON>). Nenhuma afirmação foi
confirmada.`; campos de `observed` ainda não conhecidos ficam `null`. O
verificador MUST NOT escrever "verificado" quando `outcome` é `NOT_VERIFIABLE`,
nem omitir `reason`. `signed` significa apenas que o dataset declara uma
proveniência; não é uma verificação criptográfica dessa proveniência.

### 5.2 Falha-fechada

Qualquer exceção, campo ausente, divergência ou indisponibilidade produz
`NOT_VERIFIABLE`. Não existe sucesso parcial e não existe fallback para uma root
diferente. O estado é recalculado de zero em cada verificação; não há cache
persistente que possa sobreviver a uma mudança de dataset.

Toda saída MUST incluir `observation_warning` com o aviso de §5.1, tanto em
`VERIFIED` como em `NOT_VERIFIABLE`; a UI MUST exibi-lo junto ao `statement`.
`VERIFIED` significa consistência das entradas sob as condições do perfil, não
autenticação do recibo nem prova autossuficiente de existência on-chain. Um
adversário que controle o canal de observação pode fabricar um tripleto coerente.
Os statements de §5.3 MUST ser apresentados com esse contexto obrigatório.

Se houver `proofs` pré-computadas, cada caminho MUST coincidir, passo a passo
(tipo, direção e os 32 bytes do hash), com a prova reconstruída para o respetivo
índice. Divergência produz `PROOF_INVALID`, antes da comparação do digest de
dataset com a âncora. A prova entregue ao WASM continua a ser a reconstruída.
Uma prova malformada ou fora dos limites é `DATASET_INVALID`.

### 5.3 Redação bilingue fixada

Os símbolos A, R, P e S representam os valores observados; `n` representa a
contagem validada (o exemplo de §5.1 usa 5). PT-BR continua a saída padrão do
código atual. Esta secção fixa a tradução EN, sem afirmar que existe seletor
de idioma na UI.

**PT-BR — VERIFIED:** “O pagador da transação referenciou o artefacto A; A está
incluído na root R (n=5); R foi publicada pelo pagador P no slot S; o dataset
recomputa R. Isto não prova quem produziu A nem que A é verdadeiro.”

**EN — VERIFIED:** “The transaction payer referenced artifact A; A is included
in root R (n=5); R was published by payer P at slot S; the dataset recomputes R.
This does not prove who produced A or that A is true.”

**PT-BR — NOT_VERIFIABLE:** “Não verificável (<REASON>). Nenhuma afirmação foi
confirmada.”

**EN — NOT_VERIFIABLE:** “Not verifiable (<REASON>). No claim was confirmed.”

`<REASON>` é o código de erro, sem tradução. Estes statements descrevem o
resultado sobre as entradas fornecidas; recibos offline sintéticos não passam a
ser evidência de observação on-chain por produzirem `VERIFIED`.

## 6. Modelo de confiança

| Proposição | E02 prova? |
|---|---|
| O signatário da transação referenciou o artefacto A | **Sim**, porque o memo está coberto pela assinatura da transação. |
| A está incluído na root R | **Sim**, por prova de inclusão `arkhe-mmr@1`. |
| R corresponde ao dataset publicado | **Sim**, se a root recalculada coincidir. |
| R foi publicada no slot S pelo pagador P | **Sim**, observado via RPC. |
| P é honesto ou autorizado | **Não.** |
| O artefacto A é verdadeiro ou de produção | **Não.** v1 só aceita PoC sintético. |
| O dataset contém todas as folhas | **Não.** Inclusão não é completude. |
| A transação ocorreu antes/depois de outra | **Não.** Sem ordem ou tempo provados. |
| O verificador tem autoridade | **Não.** `PortableVerifier ⇏ EnforcementAuthority`. |
| O código do verificador está correto | **Não.** O binário WASM e o parser integram a TCB local. |

Em E02/devnet, a base observável é o dataset público reprodutível e a root
ancorada, com publisher de chave única para PoC. Não há quórum nem log de
transparência implementado neste perfil. O publisher de chave única faz parte
da TCB operacional de publicação; a inclusão não demonstra a sua honestidade.
Multisig 2-of-3 e ancoragem externa são requisitos do desenho futuro de mainnet,
fora da autorização de E02. Um log de transparência pode tornar equivocações
detetáveis sob as suas próprias hipóteses de consulta e consistência; não prova
correção nem veracidade dos artefactos.

**Limite dos recibos offline.** O verificador atual não reconstrói nem verifica
a assinatura Ed25519 da transação a partir do JSON fornecido e não verifica
consenso Solana. Compara identificadores, estado e compromissos das entradas.
Uma alteração inconsistente pode ser detetada, mas um recibo fabricado ou
alterado de forma coerente pode produzir `VERIFIED`. Isto inclui campos como
slot e pagador: não ficam autenticados pela simples presença de uma assinatura
base58 no JSON. As afirmações sobre publicação on-chain na tabela acima são
condicionais à autenticidade da transação observada via RPC. Para conferir o
smoke independentemente, obter novamente ambas as transações de uma fonte RPC
devnet escolhida pelo leitor e comparar os memos, signatários e estado; a saída
offline isolada não é uma prova trustless de publicação.

## 7. Invariantes

| ID | Invariante |
|---|---|
| `E02-1` | Todo memo E02 v1 tem `<= 566` bytes ASCII e o número exato de campos de §2. |
| `E02-2` | Hex é minúsculo e canónico; base58 re-encoda para os mesmos bytes. |
| `E02-3` | `leaf_hash` do memo é exatamente `BLAKE3(0x00 ‖ leaf_bytes)` da folha única encontrada. |
| `E02-4` | `root` do memo, do dataset e da âncora são o mesmo valor. |
| `E02-5` | `n` do memo, do dataset e da âncora são o mesmo valor. |
| `E02-6` | `verify_mmr` é chamado com a prova reconstruída do dataset, nunca com prova fornecida pelo utilizador. |
| `E02-7` | `anchor_ref` resolve para uma transação com exatamente um memo `ARKHE:ANCHOR:v1` e `dataset_digest` igual ao ficheiro usado. |
| `E02-8` | `op_id` é recalculado do artefacto e comparado; nunca é aceito como identificador opaco. |
| `E02-9` | v1 só aceita `label = synthetic-poc`; `production` é rejeitado. |
| `E02-10` | Qualquer falha produz `NOT_VERIFIABLE` com `reason`; não existe `VERIFIED` parcial. |
| `E02-11` | O `statement` distingue referência de autoria e inclusão de veracidade. |
| `E02-12` | O verificador não escreve estado, não assina e não concede autoridade. |
| `E02-13` | Toda saída declara que os recibos RPC não são autenticados e que a fidelidade ao estado on-chain depende do canal de observação; nenhum statement isolado é prova de existência on-chain. A UI exibe o aviso junto ao statement. |

## 8. Vetores de teste obrigatórios

Positivos:

1. referência válida com `n=1` (root = folha);
2. referência válida com `n=5` (duas peaks, bag à direita);
3. referência válida com `n=7` (três peaks, bag à esquerda);
4. dataset com `proofs` pré-computadas coincidentes com as recalculadas;
5. dataset com `provenance` válida (mostra `signed: true`).

Negativos (cada um com o `reason` esperado):

6. memo com 567 bytes; 7. hex maiúsculo; 8. `n` com zero à esquerda;
9. `anchor_ref` com caracteres fora de base58; 10. prefixo `ARKHE:REF:v2`;
11. campo vazio; 12. colchetes ou espaço; 13. `leaf_hash` ausente do dataset;
14. duas folhas com o mesmo `leaf_hash`; 15. root do dataset diferente do memo;
16. `n` do memo diferente de `leaves.length`; 17. prova de outra folha;
18. `anchor_ref` inexistente; 19. âncora com root diferente; 20. âncora com
`dataset_digest` de outro ficheiro; 21. `op_id` arbitrário; 22. `label=production`;
23. dataset com 4097 folhas; 24. JSON com chaves duplicadas; 25. `meta.err`
não nulo; 26. zero ou duas instruções Memo na mesma transação; 27. artefacto
não canónico dentro de `leaf_bytes`.

Cada vetor é um ficheiro JSON com entrada, saída esperada e `reason`. Os vetores
positivos MUST ser verificados também com `verify_mmr` compilado de Rust para
garantir paridade com o builder JS.

### 8.1 Cobertura executada e propriedades de implementação

Os casos 1–27 estão materializados em
`verification/vectors/e02/conformance/*.json` (o caso 26 tem dois ficheiros).
Há ainda os casos 28–31: `n` da âncora divergente, folha com 1041 bytes,
prova com 33 passos e declaração de proveniência malformada. São 32 ficheiros,
cada um com entrada, saída esperada, `reason` e invariantes associados.
`scripts/e02_conformance.test.mjs` executa-os em Node e no motor browser com o
mesmo WASM Rust, comparando as saídas completas. Os vetores de fio continuam
independentes de BLAKE3 em `scripts/e02_memo_commitment.test.mjs`.

A [matriz de conformidade](E02-CONFORMANCE.md) mapeia invariantes, regras e
limites aos testes. Limites de 16 MiB são construídos em memória, evitando um
ficheiro de fixture de 16 MiB. Não-escrita/não-assinatura, exceções, conteúdo do
statement e limites da observação RPC são propriedades de implementação,
testadas fora dos vetores de fio. Timeout RPC pertence ao transporte devnet;
o verificador offline não faz chamadas de rede.

Base58 canónico é uma representação única: acrescentar `1` inicial acrescenta
um byte zero e não é outra codificação dos mesmos bytes. Testa-se comprimento
descodificado incorreto e round-trip; não se inventa um vetor impossível de
re-encode diferente para o mesmo valor. `kid` desconhecido e assinatura
criptograficamente inválida mas bem formada NÃO são motivos de rejeição em v1:
a proveniência é declarativa. O caso negativo 31 testa formato, não confiança;
a validade criptográfica do positivo 5 é testada separadamente.

## 9. Arestas de implementação

| Aresta | Decisão |
|---|---|
| Node não tem BLAKE3 nativo | Usar o alvo `nodejs` do `arkhe-verify-wasm`, não uma reimplementação. O alvo é construído em `verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js` (`--out-dir` do `wasm-pack` resolve relativo à crate, não à raiz). Confirmado neste workspace: Rust 1.96.0, `wasm-pack` 0.14.0, `blake3_hex("abc") == 6437b3ac…9d85`. |
| `verify_mmr` espera `hash` como `[u8; 32]` (array JSON), os vetores usam hex | Adaptador obrigatório hex→array, com teste de paridade contra `verification/vectors/mmr/*.json`. |
| MMR builder em JS | Replicar `mmr/inclusion.rs` (domínios `00/01/02`, `mmr_size`, bagging direita-para-esquerda) e validar contra `verification/vectors/mmr/*.json`. Feito em `scripts/e02_mmr.mjs`: 1, 3, 4, 5 e 7 folhas coincidem com os vetores e com `verify_mmr`. |
| RPC | Apenas devnet, allowlist explícita, timeout de 15 s, sem retry após estado ambíguo. O RPC é usado para obter transações, não como raiz de confiança. |
| Dataset remoto | Se for servido por URL, mostrar origem e digest; nunca substituir silenciosamente por outro dataset. |
| Recibo `getTransaction` | Aceitar `encoding: json` e `jsonParsed`; resolver o programa por `programId` ou `programIdIndex`; exigir `meta.err == null` e `signatures[0]` igual à assinatura pedida. |
| Verificação offline | `scripts/e02_verify.mjs` implementa §5 a partir de dois recibos JSON e do ficheiro de dataset, sem RPC. `node scripts/e02_verify.mjs --receipt … --anchor … --dataset …` sai 0 apenas em `VERIFIED`. |
| Ancoragem devnet | `scripts/e02_anchor.mjs` constrói o dataset a partir de artefactos, envia uma transação Memo `ANCHOR` e, opcionalmente, uma `REF`, confirma por `getSignatureStatuses` e captura os recibos por `getTransaction`. O `--airdrop` é opt-in; nunca há retry cego. |
| Chaves | O ficheiro de chave contém apenas uma seed hex de 32 bytes (modo `0600`) e nunca é impresso. `init` escreve-o com `wx`, recusando sobrescrever. Não há custódia nem assinatura fora das transações Memo. |
| Faucet | O faucet público de devnet é limitado por IP; `--airdrop` é opt-in e o erro é reportado como `airdrop failed: …`. Um 429 não deve ser contornado com retries agressivos: usar uma conta devnet já financiada. |
| Falha parcial | Se a `REF` falhar depois da `ANCHOR`, o comando termina com erro e não escreve `ref.json`; a âncora já publicada permanece verificável por si. |
| Token | Fora do âmbito. E02 não exige nem verifica transferência de token; não há acoplamento entre o perfil e qualquer mint. |

### 9.1 Comandos

```
node scripts/e02_anchor.mjs init --keypair <seed.txt>
node scripts/e02_anchor.mjs dataset --out <dataset.json> --artifact <a.json> [--artifact <b.json> ...]
# Proveniência opcional: acrescentar --keypair <seed.txt> ao comando dataset.
# kid = chave pública base58; sig = Ed25519 sobre o preimage de §4.3.
node scripts/e02_anchor.mjs anchor --keypair <seed.txt> --dataset <dataset.json> --out <dir> [--artifact <a.json>] [--index <n>] [--no-reference] [--airdrop <lamports>]
node scripts/e02_anchor.mjs fetch --signature <base58> --out <receipt.json>
node scripts/e02_verify.mjs --receipt <ref.json> --anchor <anchor.json> --dataset <dataset.json>
```

## 10. Decisões fechadas para v1

1. **Fechada.** `anchor_ref` é a assinatura base58 (64–88 chars) da transação de
   ancoragem. O endereço de conta canónica com histórico de roots fica para E03.
2. **Fechada.** A proveniência do dataset é opcional e apenas exibida
   (`signed: true`/`false`). Não altera o memo: o formato de §2 é fixo e
   acrescentar campos exigiria `v2`.
3. **Fechada.** Devnet: ficheiro público no repo e digest dos bytes exatos no
   memo de âncora. A revisão do repo usada deve ser identificável e o ficheiro
   ancorado deve ser preservado sem alterações. E03 tem como direção uma release
   assinada (ou URL fixa com digest); os requisitos finais pertencem a E03.
4. **Fechada.** Devnet: chave única com aviso explícito de PoC e ausência de
   quórum. Mainnet: multisig 2-of-3. E02 não autoriza mainnet.
5. **Fechada.** PT-BR é a saída padrão de v1. As redações PT-BR e EN de §5.3
   ficam fixadas; a tradução não muda `outcome`, `reason` ou os campos observados.

### Retomada verificada em 2026-10-23

O resumo de retomada antecede a implementação presente no workspace. Parser,
builder MMR, verificador offline, ancorador e UI já existem; isso não confirma
publicação do dashboard. Nesta primeira etapa os recibos da demonstração eram
sintéticos e não houve envio de transações. O smoke real executado depois está
registado em §11; as fixtures da UI continuam sintéticas.

- `require('blake3')`: `MODULE_NOT_FOUND`. O alvo Node do WASM local funciona e
  os testes de paridade MMR passam; o pacote npm não é necessário.
- `verification/vectors/e02/*.json`: vetores de fio do parser, executados em Node
  puro sem BLAKE3. Não são provas MMR nem evidência de transação on-chain.
- `dataset --keypair`: gera proveniência Ed25519 opcional com chave pública
  base58 em `kid`; a UI continua apenas a exibir a declaração, sem autenticar
  confiança no publisher. Assinar altera os bytes/digest do dataset: fazê-lo
  antes da ancoragem, nunca substituir o ficheiro já comprometido.
- Devnet usa chave única para PoC. Mainnet permanece fora do perfil E02 e exige
  multisig 2-of-3; não há implementação mainnet autorizada por este perfil.
- Pump.fun `create_v2`: `EXTERNAL-UNVERIFIED` nesta retomada; não foi inspecionada
  IDL nem instrução on-chain. Token e lançamento permanecem fora deste trabalho.

## 11. Tabela τ

| Afirmação | τ | Nota |
|---|---|---|
| O memo suporta até 566 bytes | `LEMMA` | `scripts/e01_solana_transport.mjs:40` e documentação Solana. |
| Uma prova de 2²⁴ folhas excede 566 bytes | `LEMMA` | 24 × 32 = 768 bytes, mais metadados. |
| `verify_mmr` existe e verifica inclusão `arkhe-mmr@1` | `LEMMA` | `verification/crates/arkhe-verify-wasm/src/lib.rs:92`. |
| A root de um MMR é recomputável a partir das folhas | `LEMMA` | `mmr/inclusion.rs` e golden vectors. |
| O memo é coberto pela assinatura da transação | `LEMMA` | Semântica de transação Solana. |
| Um dataset público elimina a necessidade de servidor de provas | `CONJECTURE` | Exige builder JS parity-tested. |
| O ancorador com multisig + Rekor reduz a confiança a log + dataset | `CONJECTURE` | Desenho; não implementado. |
| E02 v1 é executável sem dependências npm novas | `IMPLEMENTAÇÃO PARCIAL` | Só usa `node:*` e o WASM local; testado neste workspace. |
| `parseMemo` aplica §2.3 e separa `MEMO_TOO_LARGE`, `MEMO_MALFORMED` e `MEMO_PROFILE_UNKNOWN` | `IMPLEMENTAÇÃO PARCIAL` | `scripts/e02_memo_commitment.mjs`: 13 testes originais e 14 vetores de fio; composição com recibos RPC reais no smoke. Os 27 casos de §8 foram executados; matriz em `docs/E02-CONFORMANCE.md`. |
| O builder JS reproduz `arkhe-mmr@1` e concorda com o WASM em 1–7 folhas | `IMPLEMENTAÇÃO PARCIAL` | `scripts/e02_mmr.mjs`; paridade com `verification/vectors/mmr/*.json` e `verify_mmr`. |
| O verificador offline executa §5 sobre entradas no formato de recibos | `LEMMA` | `scripts/e02_verify.mjs`, 11 testes reproduzidos em 2026-10-23; composição CLI e paridade com o browser testadas. Os recibos usados nos testes são sintéticos: este resultado não demonstra ancoragem real. |
| A verificação §5 corre no browser com o mesmo WASM do crate | `IMPLEMENTAÇÃO PARCIAL` | `apps/arkhe-intra/lib/e02-browser.mjs` (port sem APIs de Node, WASM injetado) e `/verificar/e02`; paridade deep-equal com o servidor nos vetores positivo e negativos (`apps/arkhe-intra/tests/e02.test.mjs`); validado à mão num browser real com veredicto idêntico ao CLI. O WASM do browser e o parser integram a TCB local (§6). |
| Um recibo capturado alimenta o verificador sem transformação | `LEMMA` | Teste de composição CLI em `scripts/e02_anchor.test.mjs` ("anchor receipts feed the verifier CLI"). |
| As fixtures da UI commitam artefactos reais do repo | `LEMMA` | `apps/arkhe-intra/public/e02/fixtures/`: folhas `output/stage10-gguf/bundle.json` e `output/stage8-detection.json` com BLAKE3 e chaves de laboratório reais; recibos ainda sintéticos (ver linha seguinte). |
| A ancoragem e a recolha por RPC funcionam em devnet | `LEMMA` | Smoke real em 2026-10-23: ANCHOR no slot 514359515 e REF no slot 514359520, ambas finalized; dataset assinado de 2 folhas e CLI `VERIFIED`. Evidências em `docs/evidence/2026-10-23-e02-devnet-smoke/`. Escopo: uma execução PoC, não garantia geral de disponibilidade RPC. |
| Os casos obrigatórios de §8 e a declaração E02-13 são executados | `LEMMA` | `scripts/e02_conformance.test.mjs`, 32 vetores, fronteiras, exceções, não-escrita/não-assinatura e falsificação coerente com aviso; 109 testes E02 no total e typecheck aprovados em 2026-10-23. Matriz: `docs/E02-CONFORMANCE.md`. Não é auditoria externa. |
| Existe código E02 implementado | `IMPLEMENTAÇÃO PARCIAL` | Parser, MMR builder, verificador offline, ancorador devnet, UI browser+servidor e 109 testes reproduzidos em 2026-10-23; typecheck da UI aprovado; smoke real de ancoragem concluído (evidências abaixo). |

### Histórico do financiamento e smoke — 2026-10-23

`getBalance` em `https://api.devnet.solana.com`, compromisso `confirmed`,
devolveu **0 lamports** no slot `514359084` para a conta pública
`Bws6Zes8RJGgApCWk8gSYbToF9YGD3h8imwrtNLbhsjj`. Não foi solicitado
airdrop nem enviada transação nessa consulta inicial. A falta de fundos foi
resolvida na etapa seguinte; a seed local não deve ser partilhada.

Após o utilizador informar o airdrop, a consulta confirmou 5 SOL devnet.
Foi gerado um dataset assinado novo, sem alterar as fixtures sintéticas da UI.
A âncora e a referência foram enviadas uma vez cada, recolhidas via RPC e
confirmadas novamente como `finalized`, sem erros. O genesis observado coincide
com devnet. O CLI retornou `VERIFIED`; a assinatura Ed25519 do dataset também
foi verificada separadamente.

Evidência reproduzível: [README do smoke](evidence/2026-10-23-e02-devnet-smoke/README.md),
dataset, recibos reais, saída do CLI e confirmação RPC no mesmo diretório.
O bloqueio de financiamento/smoke foi resolvido. O status era então
`SPEC CANDIDATE — NOT FROZEN`. A ronda posterior fechou a cobertura dos 27
casos obrigatórios de §8 e acrescentou E02-13: 109 testes passaram, incluindo
32 ficheiros de conformidade com paridade Node/browser e propriedades de
implementação; o typecheck da UI também passou. Ver `docs/E02-CONFORMANCE.md`.
O freeze local foi formalizado depois dessa validação, como `arkhe-e02@1`;
ver §11.1. A publicação de um release não é inferida do freeze.
Nenhum token foi lançado e nenhuma publicação do dashboard é inferida deste smoke.

### 11.1 Freeze local — `arkhe-e02@1`

Em 2026-10-23 o perfil devnet foi congelado com decisões 1–5 fechadas, invariantes
E02-1..E02-13, cobertura funcional de §8 executada, smoke real com transações
finalizadas e validação local documentada. Evidência e changelog estão em
`specs/e02/`; o manifest SHA-256 identifica os bytes deste documento, da matriz,
dos vetores, do código e das evidências. O manifest não é assinatura nem nova
root on-chain; não altera o digest BLAKE3 do dataset já ancorado.

Não foi identificada regra específica de E02 que imponha revisão externa como
pré-condição de freeze. Este freeze é local, sem auditoria independente. Revisão
externa fica pendente para avaliar qualquer release com alegações de segurança
de produção; E03/mainnet continua fora do perfil e exige os seus próprios gates.
Não se declara aprovação externa nem se reutilizam gates de outros perfis.

O workspace não é um checkout Git nesta execução: nenhuma tag nem release Git
foi criada. A identidade local do artefacto é o manifest; uma futura publicação
deve transportar os mesmos bytes e registrar a revisão/tag correspondente.
Mudanças normativas posteriores exigem uma nova versão do perfil e novo registo
de integridade; o manifest congelado não deve ser refeito silenciosamente.

## 12. Referências

- `scripts/e01_solana_transport.mjs` — transporte Memo, limite de 566 bytes, allowlist devnet.
- `scripts/e02_memo_commitment.mjs` — parser e construtores de §2, JSON canónico,
  `leaf_bytes`/`op_id`, dataset. Testes em `scripts/e02_memo_commitment.test.mjs`.
- `scripts/e02_mmr.mjs` — builder/verificador MMR em JS, adaptador para
  `verify_mmr` e digest do dataset. Testes em `scripts/e02_mmr.test.mjs`.
- `scripts/e02_verify.mjs` — verificador §5 offline (recibos + dataset), CLI e
  `statement`. Testes em `scripts/e02_verify.test.mjs`.
- `scripts/e02_anchor.mjs` — dataset, chaves, ancoragem devnet, confirmação e
  recolha de recibos. Testes em `scripts/e02_anchor.test.mjs`.
- `apps/arkhe-intra/lib/e02-browser.mjs` — port do verificador §5 para o browser
  (sem APIs de Node, WASM injetado, fail-closed); a prova de inclusão é sempre
  `verify_mmr` do WASM, nunca a implementação JS. Paridade com o servidor testada
  em `apps/arkhe-intra/tests/e02.test.mjs`.
- `apps/arkhe-intra/components/e02-verifier.tsx` — `/verificar/e02`: verificação
  primária no browser (`public/verifier`, alvo web do mesmo crate via
  `scripts/build_verifier.py`), botão de comparação no servidor e CLI documentado.
- `apps/arkhe-intra/public/e02/fixtures/` — dataset com folhas reais
  (`output/stage10-gguf/bundle.json`, `output/stage8-detection.json`) e recibos
  sintéticos até haver conta devnet financiada (README no diretório).
- `docs/E01-SOLANA-TRANSPORT.md` — limites e ausência de custódia de chave.
- `specs/mmr/spec/mmr-profile-v1.md` — perfil MMR congelado.
- `verification/crates/arkhe-verify-core/src/mmr/inclusion.rs` — builder e verificador.
- `verification/crates/arkhe-verify-wasm/src/lib.rs` — `verify_mmr`.
- `verification/tests/golden_vectors.json` — vetores de paridade.
- `integration/arkhe-gov/README.md`, `docs/STAGE8-DETECTION.md`,
  `docs/STAGE10-GGUF.md` — artefactos rotulados como sintéticos.
