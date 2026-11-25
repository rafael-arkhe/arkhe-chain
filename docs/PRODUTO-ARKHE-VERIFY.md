# Arkhe Verify — produto e instrução de construção

Aberto em 19/11/2026. Este arquivo é um documento só: a pessoa que nunca viu o
repositório entende o que se vende e por quê, e quem escreve código recebe o
contrato, os limites e o teste que fecha cada item, sem precisar de outro texto.

O que ele **não** faz: não declara produto pronto, não adota preço, não registra
cliente e não promove nada que o repositório não execute. Todo número aqui tem
comando ao lado. Onde não houver comando, está escrito que é hipótese.

---

## 0. Três leitores, uma fonte

| Quem lê | O que procura | Onde começa |
|---|---|---|
| Quem decide comprar | Que problema isto resolve, o que fica com ele, o que não é prometido | §1, §9, §10 |
| Quem implanta | Superfícies, rede, assentos, medidor, custódia de chave | §3, §5, §6 |
| Quem escreve o código (humano ou AI coder) | Contrato de bytes, invariantes, backlog com teste de aceite, proibições | §2, §4, §6, §7, §8 |

Se o AI coder ler só uma seção, leia a §2. Ela é a única parte do sistema que uma
refatoração bem-intencionada destrói sem perceber.

O **Anexo A** é avaliação de encaixe, não produto: as calculadoras da reforma
tributária do consumo publicadas pela Receita Federal como implementação de
referência externa, e o que seria preciso para vender homologação rastreável a
fornecedor de software fiscal. Nada dele entra nos marcos da §7 até alguém
decidir que entra.

---

## 1. A decisão de produto

### A frase

> **Arkhe Verify entrega um verificador portátil de recibos assinados: outra
> pessoa, com os mesmos bytes e a raiz de confiança que ela mesma configurou,
> chega ao mesmo veredito componente por componente, fora do ambiente de quem
> emitiu.**

Trinta segundos, para quem decide: antes de uma saída de modelo virar efeito, a
equipe vê quais bytes foram conferidos, qual chave assinou, por que essa chave é
confiável, qual política autorizou e o que foi observado sobre a execução. O
checker viaja com o artefato e não pertence a quem o produziu.

### O produto é um binário, não uma plataforma

O que se empacota e se entrega é o workspace **`packaging/core`** — cinco crates
Rust, 3.571 linhas, 34 testes. Ele compila sem banco de dados, verifica sem rede,
e sobe como processo em loopback ou numa rede interna.

O produto **não** é o monorepo. O monorepo é o laboratório: kernel, cognição,
cadeia, GovTech, Intra, 38 crates e nove pacotes Node. Vender o monorepo é vender
um ambiente de pesquisa, e os próprios documentos dele recusam essa leitura
(`docs/STATUS.md`: módulos de cognição são *reference implementations*, AGI é
`PENDING / NOT DEMONSTRATED`).

Uma exceção, e só uma: `integration/arkhe-exec-adapter` está do lado do
laboratório e é a peça que o produto precisa absorver a seguir. §3 explica por
quê, e P-06 diz como.

### Colisão de nome, resolvida aqui

Existem dois verificadores no repositório e eles **não** são o mesmo:

| Caminho | O que é | Entra no produto? |
|---|---|---|
| `packaging/core/crates/*` | `arkhe-receipt/v1`: seis recibos, assinatura Ed25519, Merkle próprio, assentos e medidor | **Sim. É o produto.** |
| `verification/crates/arkhe-verify-*` | Perfil MMR/C2PA/GGUF/licença do monorepo, golden vectors, WASM | Não nesta versão |
| `integrations/verify-mcp` | MCP antigo: digest e canonicalização, assinatura `NOT_PERFORMED` | **Não.** Ligar um cliente aqui não conta como integração |

Um AI coder que receber "implemente o verificador" e abrir `verification/` está no
crate errado. O nome do produto é Arkhe Verify; o nome do binário é
`arkhe-provenance-mcp`; os crates do monorepo mantêm os nomes que já têm.

### Para quem

Fornecedor AI-nativo ou agência de agentes que vende a enterprise — o ICP #1 de
`docs/mercado/segmentos.md`. O produto dele chama um modelo, e uma saída pode
virar ferramenta, publicação, pagamento ou merge. O comprador enterprise pede uma
prova antes de assinar. A hipótese, com confiança declarada de 0,55–0,70 e zero
conversas registradas, é que essa prova hoje sai de planilha ou PDF com uma
pessoa dona.

Finanças, saúde e setor público brasileiro (ANPD, CGU, TCU) ficam **fora da
entrada**. Expansão, não wedge.

### Fora da oferta, em qualquer versão

Dever fiduciário, custódia jurídica, certificado de conformidade, selo
regulatório. Verificação de documento oficial brasileiro. AGI ou orquestração
autônoma. Modelo com autoridade de escrita. Garantia de que a infraestrutura não
falha. Validação X.509/ICP-Brasil. Habilitação de PSP.

Quem pede qualquer um desses itens não é este comprador, e a conversa termina
sem demo.

---

## 2. O corte que não se negocia

Nove invariantes. Cada um tem o ponto do código que o sustenta. **Mudar qualquer
um deles não é refatoração: é outro produto.** Um AI coder que precise violar um
destes para fazer um teste passar deve parar e escrever o conflito, não contornar.

**I1 — Veredito não é prova.** `PASS` significa duas coisas, e só duas: a
assinatura confere sob a chave pública do arquivo de confiança que o chamador
nomeou, e o hash que o chamador calculou é igual ao hash escrito no recibo. Não
significa que o artefato está certo, que a ação aconteceu, que a âncora foi
confirmada, nem que o arquivo existiu em outro lugar.

**I2 — `PASS` não autoriza efeito.** Nada no produto aplica efeito. A política do
pacote é literalmente `{"effect":"none","schema":"arkhe-policy/v1"}`
(`arkhe_flow::policy_bytes`). Efeito nenhum é o contrato, não uma limitação
temporária a remover depois.

**I3 — Campo de resultado nunca vem da entrada.** O broker e o verificador
recalculam. Um `trusted: true` recebido do chamador é entrada não confiável, e
não existe campo assim no schema. `arkhe_flow::verify` deriva todos os
componentes; nenhum é copiado do corpo.

**I4 — O id do recibo é o hash do corpo assinado.** `receipt_id(body) =
SHA256("ARKHE-RECEIPT-V1\n" || canonical(body))`, e a assinatura Ed25519 cobre
esses mesmos bytes. Id que não recomputa é `schema: FAIL` antes de a assinatura
ser olhada (`verify`, primeiro bloco). Nomear um recibo pelo id amarra todo o
corpo de uma vez.

**I5 — O conjunto de campos de cada `kind` é fechado.** `require_keys` compara a
lista ordenada de chaves com a lista esperada e recusa diferença — campo extra,
campo faltante, qualquer um. Acrescentar um campo útil a um `kind` existente
quebra todos os recibos já emitidos. Campo novo exige `kind` novo ou schema novo.

**I6 — O axioma não se reescreve.** Todo recibo `agent-action` carrega
`axiom: "llm_output_unverified"`. Um corpo que troque esse valor é recusado no
schema, antes da assinatura. Saída de modelo é proposta, não observação.

**I7 — Descarga exige três coisas independentes.** O axioma só sai se: (a) um
recibo `invariant` acompanhar a ação, (b) o chamador nomear qual invariante exige
(`--expect-invariant`), e (c) os bytes da saída estiverem na mesa e conferirem.
Sem nomeação não há política; sem política não há descarga. E o veredito de
invariante não pode ser assinado pela chave do agente: `sign_body` recusa papel
que não bate com o `issuer`, `check_signer` recusa `issuer` fora da roster, e uma
roster sem o papel `invariant` não descarrega nada.

**I8 — `INCONCLUSIVE` e `NOT_PERFORMED` não são sucesso.** A álgebra é: qualquer
`FAIL` → `FAIL`; senão qualquer `INCONCLUSIVE` ou `NOT_PERFORMED` →
`INCONCLUSIVE`; senão `PASS` (`fn finish`). Um recibo conferido sem os arquivos
de vínculo nunca é `PASS`. Transporte `none` com `observed: confirmed` é `FAIL`,
não otimismo.

**I9 — Quem verifica não recebe a semente.** O emissor gera chave com
`arkhe-flow keygen`, publica **só** o `trust.json` com chaves públicas, e guarda
o segredo fora do diretório. As sementes de `fixtures/gate0` estão no fonte de
propósito: são vetores de laboratório e não são raiz de confiança de tenant
nenhum.

---

## 3. O que já roda, conferido em 19/11/2026

### Inventário do produto

```
packaging/core/                      workspace Rust independente (Cargo.lock próprio)
  crates/arkhe-flow/         1.977 + 101 linhas   schemas, assinatura, verify, fixture Gate 0
  crates/arkhe-storage/        148 +  34 linhas   admissão gravada uma vez, commit idempotente
  crates/arkhe-provenance-mcp/ 449 + 157 linhas   CLI verify, HTTP serve, MCP stdio
  crates/arkhe-platform/       357 +  64 linhas   assentos, medidor, fatura draft, SLA
  crates/arkhe-anonymize/      246 +  38 linhas   supressão de identificador direto
  sdk/arkhe_sdk.py                               cliente Python: verify_http, verify_mcp
  fixtures/gate0/                                14 arquivos, fixture pública
  deploy/                                        Dockerfile, compose em rede internal, assentos
  demo/tamper.py                                 contraste de um byte, 17 condições
  anpd-sandbox/                                  piloto local sintético, anpd_submission: not_sent
  audit_receipt.py                               recomputação independente em Python
  HOW_TO_AUDIT.md                                procedimento do Gate 0
```

Toolchain: Rust 1.96.0 (`rust-toolchain.toml` da raiz). Python 3 para o auditor e
o SDK. Nada mais é obrigatório para verificar.

### Execução de 19/11/2026

```powershell
cd packaging\core
cargo test --locked --workspace
```

**34 testes aprovados, nenhum reprovado, nenhum ignorado.** Distribuição por
target: 24 em `arkhe-flow`, 4 em `arkhe-provenance-mcp`, 3 em `arkhe-platform`,
2 em `arkhe-anonymize`, 1 em `arkhe-storage`.

Dois vereditos do Gate 0 foram reexecutados nesta data e bateram com a tabela de
`HOW_TO_AUDIT.md`: a ação de agente sem o veredito nomeado fica `INCONCLUSIVE`
com `llm_output: INCONCLUSIVE`; a mesma ação, com o mesmo recibo e as mesmas
chaves, acompanhada do veredito e com `--expect-invariant invariant.valor-present`,
vai a `PASS` com `llm_output: PASS`. `python audit_receipt.py fixtures/gate0`
recomputou as dezoito condições, todas verdadeiras.

Isto **não** fecha o Gate 0. Uma execução feita por quem escreveu o código não
fecha nada; a §7 define o que fecha.

### Os seis recibos

| `kind` | Emissor | O que afirma | Veredito que fecha o gate |
|---|---|---|---|
| `admission` | `flow` | tenant, operação, SHA-256 do assunto e da política | `PASS`, exit 0 |
| `commit` | `storage` | raiz recalculada, id da admissão coincide | `PASS`, exit 0 |
| `anchor` | `anchor` | commit, transporte, referência, estado observado | `INCONCLUSIVE`, exit 2 |
| `artifact` | `storage` | folha reconstruída dos quatro digests, prova dobra até a raiz | `PASS`, exit 0 |
| `agent-action` | `flow` | plano, saída, modelo, agente, mais o axioma | `INCONCLUSIVE` sozinho; `PASS` com veredito nomeado |
| `invariant` | `invariant` | nomeia a ação pelo id, repete o digest lido, diz se sustentou | `PASS`, exit 0 |

A âncora fica `INCONCLUSIVE` **por projeto**: este pacote não tem cliente de
transporte. Ver P-02 na §6.

### O vizinho que o produto vai absorver

`integration/arkhe-exec-adapter`, no workspace da raiz, é a peça mais próxima do
produto sem estar nele. Ela transforma uma execução de agente em evidência
admitida ou numa exclusão que carrega o motivo, e **roda um invariante
determinístico de verdade** (`invariant.no-direct-identifier`), com registro
fail-closed: id que não está no registro é excluído, classe de tarefa sem
invariante no perfil é recusada pelo kernel como `missing worker evidence
policy`, e um `WorkerExecutionRecord` que o próprio agente escreveu sobre o
próprio trabalho não pode ocupar o lugar da análise. 21 testes passam
(`cargo test -p arkhe-exec-adapter --locked`, 19/11/2026).

`src/receipt.rs` já produz **o corpo** do recibo `invariant` que o `arkhe-flow`
sabe assinar — e nada além disso: não assina e não guarda chave, porque o sentido
do papel separado é que esse processo não pode liberar o próprio trabalho. Os
dois lados não se ligam por Cargo: `arkhe-flow` vive em `packaging/core` e as
duas manifests usam herança `workspace = true`, que o Cargo resolve contra o
workspace externo. A forma é fixada por um vetor que os dois conferem —
`integration/arkhe-exec-adapter/tests/flow_receipt.rs` de um lado, o braço
`invariant` de `validate_body` no `arkhe-flow` do outro. Ele também registra os
dois digests dos mesmos bytes, blake3 (o que o kernel viu) e sha256 (o que o
campo `*_sha256` do recibo exige), sem renomear nenhum. Ver P-06.

### O que fica fora do produto v1

`apps/arkhe-intra` é a vitrine do piloto: fluxo de três assinaturas Ed25519
(autoria, revisão, governança), trilha, exportação de pacote JSON, verificação
offline e laudo A4, em `http://127.0.0.1:3003`. Útil na conversa; não é o core
que se implanta no ambiente do comprador.

`kernel/`, `cognition/`, `barrier/`, `state/`, `probes/`, `formal/`, `eval/`,
`integration/arkhe-gov`, `salesforce-arkhe-integration/`, `kernel/arkhe-chain`:
laboratório. Nenhum entra numa proposta.

---

## 4. Contratos congelados

Esta seção é a especificação executável. Um AI coder deve poder reimplementar o
verificador em outra linguagem lendo só o que está aqui, e chegar ao mesmo
veredito byte por byte. **Qualquer mudança nesta seção é uma versão nova de
schema (`/v2`), nunca uma edição de `/v1`.**

### 4.1 JSON canônico, preimage, id

`canonical(value)` serializa: chaves de objeto ordenadas lexicograficamente por
código, nenhum espaço, `null`/`true`/`false` literais, números pelo `Display` de
`serde_json::Number`, strings escapadas como `serde_json::to_string`, arrays e
objetos sem espaço após `,` ou `:`.

```
preimage(body)    = b"ARKHE-RECEIPT-V1\n" || canonical(body).as_bytes()
receipt.id        = hex(SHA256(preimage(body)))
receipt.signature = hex(Ed25519_sign(secret, preimage(body)))
```

O domínio inclui o `\n`. Esquecê-lo produz ids que não recomputam.

### 4.2 Arquivos de identidade

```json
// arkhe-secret/v1 — SEGREDO. Nunca publicar, nunca versionar, nunca enviar ao verificador.
{ "schema": "arkhe-secret/v1", "role": "flow", "seed_hex": "<64 hex>" }

// arkhe-trust/v1 — público. É isto que o auditor recebe.
{ "schema": "arkhe-trust/v1", "purpose": "<rótulo combinado por outro canal>",
  "keys": { "flow": "<64 hex>", "storage": "<64 hex>", "anchor": "<64 hex>", "invariant": "<64 hex>" } }

// arkhe-receipt/v1
{ "schema": "arkhe-receipt/v1", "id": "<64 hex>", "body": { }, "signer": "<64 hex>", "signature": "<128 hex>" }
```

Papéis: `flow`, `storage`, `anchor`, `invariant`. Uma roster de três papéis
continua válida para os três primeiros recibos. `purpose` é conferido pelo
auditor contra o valor que recebeu **por outro canal**; sem `--expect-purpose` o
componente `purpose` fica `NOT_PERFORMED` e o veredito, por I8, `INCONCLUSIVE`.

### 4.3 Corpos, campo por campo

Conjuntos fechados. `issuer` é obrigatório e fixo por `kind`. `<hex64>` é
exatamente 64 caracteres hexadecimais minúsculos.

```
admission    { issuer: "flow",      kind: "admission",    tenant: <1..128>, operation: <1..128>,
               subject_sha256: <hex64>, policy_sha256: <hex64> }

commit       { issuer: "storage",   kind: "commit",       admission_id: <hex64>,
               previous_root: <hex64>, root: <hex64>, leaf_index: <u64 <= 1_000_000> }

anchor       { issuer: "anchor",    kind: "anchor",       commit_id: <hex64>,
               transport: <1..64>, reference: <0..256>, observed: "pending" | "confirmed" }

artifact     { issuer: "storage",   kind: "artifact",     artifact_sha256: <hex64>, model_sha256: <hex64>,
               data_sha256: <hex64>, pipeline_sha256: <hex64>, merkle_root: <hex64>,
               merkle_profile: "arkhe-storage-merkle/v1", merkle_proof: ["L:<hex64>" | "R:<hex64>", ...],
               leaf_index: <u64 <= 1_000_000> }

agent-action { issuer: "flow",      kind: "agent-action", plan_sha256: <hex64>, output_sha256: <hex64>,
               model_sha256: <hex64>, agent_id: <1..128>, axiom: "llm_output_unverified" }

invariant    { issuer: "invariant", kind: "invariant",    action_id: <hex64>, output_sha256: <hex64>,
               invariant_id: <1..128>, invariant_version: <1..128>, held: <bool> }
```

Contas derivadas:

```
commit.root  = hex(SHA256(previous_root || b"\n" || admission_id))        // strings UTF-8
primeira raiz = "0" * 64
statement    = hex(SHA256(b"arkhe-storage-leaf/v1\n" || artifact || b"\n" || model
                          || b"\n" || data || b"\n" || pipeline))
leaf_node    = hex(SHA256(b"leaf\n" || statement))
node(l, r)   = hex(SHA256(b"node\n" || l || b"\n" || r))
```

O fold da prova: para cada passo, `L:` quer dizer que o irmão está à esquerda, e
o lado tem de bater com a paridade do cursor (`cursor % 2 == 1`); lado que não
bate é recusado, então um índice errado não dobra por acaso. `cursor /= 2` a cada
passo.

`held: false` é recibo legítimo e assinável: uma execução recusada vale registrar,
e um veredito que não se sustentou descarrega nada.

### 4.4 Veredito

```json
{ "schema": "arkhe-verdict/v1", "receipt_id": "<hex64>", "kind": "<kind>",
  "overall": "PASS" | "FAIL" | "INCONCLUSIVE",
  "components": { "<nome>": "PASS" | "FAIL" | "INCONCLUSIVE" | "NOT_PERFORMED" | "NOT_APPLICABLE" },
  "persistence": "NOT_PERFORMED" | "RECORDED" | "UNAVAILABLE",
  "notes": ["..."] }
```

Os dezenove componentes, sempre todos presentes, `NOT_APPLICABLE` quando o `kind`
não os usa: `anchor`, `artifact`, `binding`, `data`, `held`, `llm_output`,
`merkle`, `model`, `output`, `pipeline`, `plan`, `policy`, `produced`, `purpose`,
`recompute`, `schema`, `signature`, `signer`, `subject`.

Álgebra (I8) e código de saída: `PASS` → 0, `INCONCLUSIVE` → 2, `FAIL` → 1. Um
chamador que trate só `exit != 0` como erro perde a distinção entre "não
conferiu" e "conferiu e está errado". Isso é bug do chamador.

`persistence` nunca altera `overall`. Gravação que falha deixa `UNAVAILABLE` e o
veredito calculado continua na resposta.

### 4.5 Plataforma

```json
// arkhe-seats/v1 — assento ativo acima do limite impede o processo de subir
{ "schema": "arkhe-seats/v1", "seat_limit": 5,
  "seats": [ { "id": "<id>", "label": "<1..128>", "active": false } ] }

// arkhe-meter/v1 — uma linha por veredito completo, em events.jsonl
{ "schema": "arkhe-meter/v1", "idempotency_key": "<chave>", "seat": "<id>",
  "receipt_id": "<hex64>", "overall": "PASS" | "FAIL" | "INCONCLUSIVE", "units": 1 }

// arkhe-price-book/v1 — status OBRIGATORIAMENTE operator-supplied
{ "schema": "arkhe-price-book/v1", "status": "operator-supplied",
  "currency": "<AAA>", "unit_price_minor": 0 }

// arkhe-invoice-draft/v1 — saída de `bill`
{ "schema": "arkhe-invoice-draft/v1", "status": "draft", "collects_payment": false,
  "currency": "...", "unit_price_minor": 0,
  "lines": [ { "seat": "...", "units": 0, "amount_minor": 0 } ], "total_minor": 0 }
```

Regras que valem como teste: `FAIL` e `INCONCLUSIVE` também contam uma unidade —
o trabalho foi feito. A mesma `Idempotency-Key` com o mesmo recibo conta uma vez
e devolve o veredito recalculado. A mesma chave com **outro** recibo responde 409
e não soma. Livro de preço com qualquer `status` diferente de `operator-supplied`
— inclusive `not-adopted` — recusa a fatura. **Não existe preço da Arkhe neste
repositório, por decisão.**

`arkhe-platform sla` compara sondas do operador com uma janela que o operador
declarou: sem sonda, `INCONCLUSIVE`; sonda acima do limiar dele, `FAIL`; janela
coberta, `COVERED`. Os três trazem `customer_commitment: false`. `COVERED` é a
leitura das sondas de quem as escreveu, não disponibilidade vendida.

---

## 5. As cinco superfícies

| # | Superfície | Comando / entrada | Abre banco? | Mede? |
|---|---|---|---|---|
| 1 | CLI | `arkhe-provenance-mcp verify --receipt … --trust … --expect-purpose …` | Não, nunca | Não |
| 2 | HTTP | `serve --bind 127.0.0.1:8080`; `GET /health`, `POST /v1/verify` | Se `DATABASE_URL` | Se `ARKHE_SEATS` |
| 3 | MCP | `arkhe-provenance-mcp mcp`, stdio, ferramenta única `verify_receipt` | Não | Não |
| 4 | SDK | `packaging/core/sdk/arkhe_sdk.py`: `verify_http`, `verify_mcp` | — | — |
| 5 | On-prem | `deploy/compose.yaml`, rede `private` com `internal: true`, nenhuma porta publicada | Sim | Sim |

Detalhes que são contrato, não implementação:

- `verify` **não lê `DATABASE_URL`**. Verificação não depende de persistência.
- `serve` sem `DATABASE_URL`: `postgres: absent`, processo sobe. Com
  `DATABASE_URL`, conecta e cria `provenance_observations` **antes** de aceitar
  pedido; se a URL existe e o banco não conecta, o processo termina — a
  persistência pedida não está disponível, e fingir que está é pior.
- `ARKHE_SEATS` exige `ARKHE_METER_DIR`. Sem `ARKHE_SEATS`, o servidor verifica e
  não mede; `/health` responde `seats: absent`.
- Com assentos, `POST /v1/verify` exige `X-Arkhe-Seat` e `Idempotency-Key`:
  faltando, 400; assento desconhecido ou inativo, 403.
- A tabela `provenance_observations` é registro de observação, **não** é a fatura.
  A fatura sai do diretório do medidor.
- O host MCP aponta o binário:

```json
{ "mcpServers": { "arkhe-provenance": { "command": "arkhe-provenance-mcp", "args": ["mcp"] } } }
```

### Caminho mais curto para um terceiro ver o produto

```powershell
cargo run -p arkhe-provenance-mcp --locked -- verify --receipt fixtures\gate0\admission.json --trust fixtures\gate0\trust.json --expect-purpose gate0-lab --subject fixtures\gate0\subject.bin --policy fixtures\gate0\policy.json
```

```powershell
python demo\tamper.py
```

O segundo é a demo de um byte: o assunto intacto confere; um byte invertido deixa
`signature: PASS` e `subject: FAIL`, porque a assinatura cobre o hash antigo, não
o arquivo na mesa. A âncora do commit original permanece `INCONCLUSIVE` e não
promove o byte novo. O script sai 1 se qualquer uma das dezessete condições
esperadas mudar. Medição nesta máquina em 19/11/2026: 0,70 s, com a última linha
`FAILED no byte adulterado; a ancora nao cobre esse byte, e o veredito nao
descarrega bytes que voce nao tem` — o caminho de sucesso. A medição de
17/11/2026 registrada em `docs/mercado/fundo-e-noventa-dias.md` foi 0,46 s; as
duas são a mesma conta em máquinas com carga diferente, e nenhuma é benchmark.

Os dois comandos rodam a partir de `packaging\core`, e o segundo depois de
`cargo build -p arkhe-provenance-mcp`.

---

## 6. Backlog de construção

Dez itens entre o que roda hoje e o que um operador paga. Cada um tem a mesma
forma, de propósito: **por quê / entrada / saída / teste que fecha / limite / o
que não fazer**. O item só está pronto quando o teste existe no repositório e
passa num ambiente que não é o de quem escreveu.

---

**P-01 — Custódia de chave de emissor**
*Por quê:* hoje a semente é um JSON em disco (`arkhe-secret/v1`). Um comprador
enterprise pergunta onde a chave vive antes de perguntar o preço.
*Entrada:* um backend de assinatura atrás de trait, com a implementação de
arquivo como caso padrão.
*Saída:* `arkhe-flow` assina por um `Signer` abstrato; pelo menos um backend
externo (PKCS#11, KMS do operador ou agente local) atrás de feature flag.
*Teste que fecha:* o mesmo corpo, assinado pelo backend de arquivo e pelo backend
externo, produz recibos que ambos verificam sob a mesma chave pública; e um teste
que recusa semente vinda de variável de ambiente.
*Limite:* custódia de operador não é custódia qualificada nem HSM certificado, e
o documento não deve dizer que é.
*Não fazer:* enviar segredo pelo endpoint, guardar semente no mesmo diretório do
`trust.json`, ou aceitar chave privada em corpo HTTP.

---

**P-02 — Cliente de transporte de âncora**
*Por quê:* `anchor` fica `INCONCLUSIVE` porque o pacote não observa transporte
nenhum. É o único recibo que nunca pode fechar sozinho, e o comprador nota.
*Entrada:* um transporte com inclusão verificável — Rekor/Sigstore é o candidato,
e o repositório já tem `integrations/cosign` e `docs/ARC-MEMO-REKOR.md` como
leitura.
*Saída:* um verificador de inclusão que transforma `observed: confirmed` em
`anchor: PASS` **só** quando a prova de inclusão recalculada bate com um
checkpoint que o auditor configurou à parte.
*Teste que fecha:* três casos — inclusão válida contra checkpoint configurado →
`PASS`; mesma prova contra outro checkpoint → `FAIL`; `confirmed` sem prova →
`INCONCLUSIVE`, nunca `PASS`.
*Limite:* inclusão num log autentica pertencimento a um checkpoint. Não autentica
o fato de fora. I1 continua valendo.
*Não fazer:* aceitar `observed: confirmed` como suficiente; confiar em checkpoint
devolvido pelo mesmo transporte sem âncora configurada à parte.

---

**P-03 — Identidade do chamador no endpoint**
*Por quê:* `X-Arkhe-Seat` é um cabeçalho de texto. Qualquer processo na rede
`private` passa por qualquer assento ativo. Isso é medidor, não autenticação, e
está documentado como medidor — mas um operador que publique o porto se engana.
*Entrada:* autenticação do chamador separada do assento, com o assento continuando
a ser a unidade de medição.
*Saída:* mTLS ou token assinado por chave do operador, verificado antes de
`require_active`; `/health` passa a declarar `auth: <modo>`.
*Teste que fecha:* pedido sem credencial → 401 antes de qualquer cálculo de
veredito; credencial válida com assento inativo → 403; credencial de um assento
usada para medir outro → 403 e nenhuma linha no medidor.
*Limite:* autenticar o chamador não muda o veredito criptográfico. Um chamador
autenticado que manda bytes errados continua levando `FAIL`.
*Não fazer:* derivar identidade do `X-Arkhe-Seat`; publicar porto no host sem
este item fechado.

---

**P-04 — Distribuição assinada do binário**
*Por quê:* "baixe e rode o verificador" só é uma frase defensável se o download
for verificável sem confiar no canal.
*Entrada:* build reprodutível por plataforma e um artefato assinado.
*Saída:* binários para Windows, Linux e macOS; checksums; assinatura; e a imagem
`arkhe-provenance-mcp:local` do `deploy/Dockerfile` **efetivamente construída** —
hoje ela não foi construída em nenhuma máquina.
*Teste que fecha:* dois builds do mesmo commit, em máquinas diferentes, produzem
o mesmo digest; e um script que verifica a assinatura do artefato antes de
executá-lo.
*Limite:* build reprodutível não é atestação de cadeia de suprimentos.
*Não fazer:* publicar release sem checksum; versionar a senha substituída de
`change-me` do compose.

---

**P-05 — Roster multi-tenant**
*Por quê:* `trust.json` é um arquivo com um `purpose`. Um fornecedor com cinco
clientes precisa de cinco raízes separadas, e nenhuma delas pode validar recibo da
outra.
*Entrada:* resolução de roster por tenant, mantendo o `purpose` como o campo que o
auditor confere por canal independente.
*Saída:* `expect_purpose` continua obrigatório; o endpoint resolve a roster por
tenant e **recusa** recibo cujo `tenant` da admissão não corresponda à roster
resolvida.
*Teste que fecha:* recibo do tenant A verificado contra a roster do tenant B →
`signer: FAIL`; rotação de chave do tenant A não afeta veredito de recibo antigo
do tenant A emitido sob a chave anterior, se a roster antiga for a nomeada.
*Limite:* separação de roster não é isolamento de dados. Quem compartilha processo
compartilha memória.
*Não fazer:* uma roster global que aceite qualquer `issuer` conhecido; inferir
tenant do cabeçalho de assento.

---

**P-06 — Fechar o laço do invariante**
*Por quê:* `packaging/core` confere o recibo de quem executou um invariante e não
executa nenhum; `integration/arkhe-exec-adapter` executa um de verdade e não
assina. Entre os dois há uma fronteira de workspace, e hoje ninguém atravessa.
É a lacuna mais mal entendida do produto: `PASS` em `llm_output` quer dizer que
*alguém* assinou que o invariante se sustentou.
*Entrada:* o `Registry`/`Invariant` do exec-adapter, o `receipt.rs` que já monta o
corpo, e o vetor compartilhado de `tests/flow_receipt.rs`.
*Saída:* um caminho executável de ponta a ponta — rodar o invariante, obter o
corpo, assiná-lo com o segredo do papel `invariant`, e verificar a ação com
`--invariant` e `--expect-invariant`. Duas rotas aceitáveis, e a escolha é
arquitetural: extrair o núcleo do invariante para um crate que as duas workspaces
possam depender por caminho sem herança de workspace, ou manter dois processos e
passar o corpo por arquivo, com o vetor como contrato.
*Teste que fecha:* um teste que roda `invariant.no-direct-identifier` sobre bytes
reais, assina o recibo resultante com a chave do papel `invariant`, e obtém `PASS`
em `llm_output` pelo `arkhe-provenance-mcp verify`; mais o negativo: um byte
invertido no artefato produz `held: false` assinado — recibo legítimo — e
`llm_output: FAIL` na ação.
*Limite:* o veredito não diz que o invariante era o teste adequado da tarefa. Essa
é pergunta de política, e é por isso que o chamador tem de nomeá-lo (I7).
*Não fazer:* assinar veredito com a chave do agente; dar chave ao processo que
executa o invariante; executar invariante com rede; deixar o runner escolher qual
invariante aplicar; renomear um digest blake3 para um campo `*_sha256`.

---

**P-07 — Observabilidade do operador**
*Por quê:* `provenance_observations` tem quatro colunas. Um operador que cobra por
veredito precisa reconciliar medidor, banco e fatura.
*Entrada:* o medidor em arquivo continua a fonte da fatura (é ele que o auditor
recalcula).
*Saída:* um comando de reconciliação que compara `events.jsonl` com as linhas do
banco e reporta divergência por assento e por período.
*Teste que fecha:* medidor com uma linha que o banco não tem, e vice-versa, produz
relatório que nomeia as duas e sai diferente de zero.
*Limite:* reconciliação não é auditoria contábil.
*Não fazer:* mover a fonte da fatura para o banco; permitir que falha de gravação
mude `overall`.

---

**P-08 — Portões do repositório verdes**
*Por quê:* a campanha de 28/10/2026 (`docs/PRODUCT-QUALITY-2026-10-28.md`)
reprovou a liberação integral por quatro gates. Um comprador técnico que pedir o
repositório vai rodá-los. **Três ainda reprovam em 19/11/2026, e o achado de cada
um mudou desde outubro** — a lista abaixo é a medição desta data, não a cópia
daquele documento.
*Entrada:* o estado medido hoje:

| Gate | Hoje | Achado exato |
|---|---|---|
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | **Reprova** | `verification/crates/arkhe-verify-core/src/provenance_broker.rs:209`, `fn state_verdict<'a>(data: &'a Value) -> &'a str`: lifetime explícito elidível. O `large_enum_variant` de outubro em `cognition/arkhe-rag/src/decoder.rs` **já foi resolvido**, com `#[allow]` e justificativa escrita ao lado |
| `cargo fmt --all --check` | **Reprova** | pelo menos `orchestration/arkhe-runtime/tests/preview_executor.rs:29` |
| `python scripts/check_architecture.py` | **Reprova** | `integration/arkhe-exec-adapter` está em `Cargo.toml` e **não** está em `rust_members` de `config/architecture.json`. Nenhum outro membro divirge |
| Lock de migrações (QA-002) | **Fechado** | `20261026000018_wormgraph_fencing.sql` está registrada em `config/migrations.lock.json` |
| Advisories de dependência (QA-003) | Aberto | triar por artefato distribuído, feature habilitada e caminho alcançável |

*Saída:* os três primeiros saem 0; os advisories triados com o veredito escrito por
artefato, não um número agregado.
*Teste que fecha:* os três comandos acima saem 0 em execução limpa, com log
preservado em `docs/evidence/`.
*Limite:* scan de dependência não prova exploração no produto, e gate verde não é
produção qualificada.
*Não fazer:* rodar formatador global no repositório — corrija só o arquivo que o
gate aponta (ver §8, regra de bytes); silenciar lint com `allow` sem registrar o
porquê ao lado, como o `decoder.rs` fez.

---

**P-09 — Cobrança real, quando e se**
*Por quê:* a fatura é `draft` com `collects_payment: false`, por decisão. Trocar
isso é decisão comercial, não técnica, e vem **depois** do Gate 1.
*Entrada:* Gate 1 fechado (§7): um pagador que não é o autor.
*Saída:* nada, até lá. Quando houver, a fatura emitida precisa referenciar as
linhas do medidor que a compõem.
*Teste que fecha:* a soma das linhas referenciadas é igual ao `total_minor`, e
uma linha já faturada não entra em fatura nova.
*Limite:* fatura emitida pelo próprio autor não fecha o Gate 1 (§2 de
`docs/mercado/design-partners.md`).
*Não fazer:* adotar preço no repositório; mudar `collects_payment` antes do Gate 1;
tratar uma fatura `draft` como receita.

---

**P-10 — Documento de verificação para o comprador**
*Por quê:* `HOW_TO_AUDIT.md` é escrito para quem já leu o repositório. O auditor do
comprador recebe um ZIP e tem uma tarde.
*Entrada:* o procedimento do Gate 0, sem contexto de monorepo.
*Saída:* um pacote autocontido — binário, `trust.json` do emissor, recibos, bytes,
e um procedimento em uma página que termina numa tabela de vereditos esperados.
*Teste que fecha:* uma pessoa que não trabalhou no código executa o procedimento
numa máquina limpa e obtém a tabela, sem perguntar nada.
*Limite:* esse é literalmente o Gate 0. Enquanto não acontecer, o pacote é o
procedimento, não a confirmação.
*Não fazer:* incluir a semente no pacote; incluir fixture de laboratório como se
fosse recibo de produção.

---

## 7. Ordem e portões

Marcos com critério de saída que outra pessoa pode apontar. Intenção não é marco.

| Marco | Entrega | Critério de saída | Estado em 25/11/2026 |
|---|---|---|---|
| **M0** | O que já existe | 34 testes, fixture pública, demo de um byte, procedimento escrito | **Feito** |
| **M1 — Gate 0** | P-10, P-04 | Um terceiro, sem `DATABASE_URL`, sem PostgreSQL, sem semente e sem a máquina do emissor, reexecuta os sete comandos de `HOW_TO_AUDIT.md` e obtém a tabela | **Aberto (kits CI + atestação prontos)** — Run `45625806852` (`cebf25e0`) gerou e validou os kits Linux/Windows/macOS (com `LICENSE-APACHE`/`LICENSE-MIT`), `RELEASE-SHA256SUMS` e bundle Sigstore OIDC; aguarda execução por terceiro fora do ambiente do autor |
| **M2 — Implantável** | P-01, P-03, P-04, P-05, P-08 | O compose sobe numa rede do operador, com autenticação de chamador, chave em custódia dele, e os quatro gates do repositório verdes | **Parcial (CI + Docker + Compose verdes; QA-003 pendente)** — Run `45625806852` construiu `arkhe-provenance-mcp:local` (`sha256:fc55e2...`) e validou `compose.yaml` (`internal: true` + PostgreSQL + seats + `CallerToken` + rosters); em `d:\arkhe` raiz permanecem pendências da Fase A (`cargo fmt` de outros módulos e triagem QA-003) |
| **M3 — Âncora e invariante** | P-02, P-06, R-02 | `anchor: PASS` existe contra checkpoint configurado à parte; um invariante é executado por um runner isolado e o recibo dele fecha o contraste; versão exata exigível (`--expect-invariant-version`) | **Feito** — P-02, P-06 e R-02 (`--expect-invariant-version` sem alterar schema `/v1`) validados localmente e em CI multiplataforma (`42` testes workspace + `29` `external-signer`) |
| **M4 — Gate 1** | P-07, P-09 | Um cliente, que não é o autor, paga por verificação em produção: recibo e raiz de confiança **dele**, no processo **dele**, com pagamento identificável | **Aberto** — P-07 (`arkhe-platform reconcile`) implementado e testado; P-09 permanece bloqueado por regra até haver cliente pagante externo |

O que explicitamente **não** sobe de conjectura a lema: interesse, piloto, preço
dito numa entrevista, fatura emitida pelo próprio autor, verificação do fixture
`gate0-lab`, ou execução do SDK na máquina de quem escreve o código. A frase "há
disposição a pagar por verificação" permanece CONJECTURE até a tabela do Gate 1
ter uma linha.

Contagens em 19/11/2026: entrevistas de descoberta, 0. Fornecedores integrados
fora desta máquina, 0. Pagamentos, 0.

---

## 8. Regras para quem escreve o código

Dirigido a AI coders e a quem revisa o que eles produzem. Estas regras vêm da
prática do repositório, não de estilo.

### Não afirme o que não mediu

O registro de um resultado nomeia o comando, a data e o que ficou fora. "Testes
passaram" sem contagem e sem alvo não é evidência. "Pronto para produção" não se
escreve: `docs/STATUS.md` e `docs/PRODUCTION-READINESS-2026-10-24.md` recusam essa
leitura mesmo com build e testes verdes, e essa recusa é um ativo do produto, não
modéstia.

Quando um teste não foi executado, escreva que não foi, com o motivo. Vinte testes
ignorados por falta de PostgreSQL são vinte testes ignorados, não vinte testes
aprovados.

### Bytes são evidência

`.gitattributes` tem `* -text` e isso é **load-bearing**. Nunca normalize fim de
linha, nunca rode formatador global no repositório, nunca "arrume" indentação de
arquivo que não está no escopo da mudança. Os bytes de milhares de arquivos entram
em hash; normalizar muda todos eles e invalida manifesto e vetor congelado.

`MANIFEST.sha256`, `golden-vectors-v1.json`, `config/migrations.lock.json` e as
fixtures de `packaging/core/fixtures` são congelados. Alterar um deles é uma
mudança deliberada, com registro, nunca efeito colateral.

### Determinismo em teste de variante

Se um teste gera arquivo temporário por variante, **o nome do arquivo tem de
conter o hash do conteúdo**, e o interpretador tem de rodar com `-B`. O mesmo
nome reaproveitado faz um `.pyc` velho executar a variante anterior, e o teste
passa medindo a coisa errada.

Diretório temporário: o scratchpad da sessão. Trabalho que fica: `D:`. Nunca
escreva em `C:\Users\<usuário>`.

### Como acrescentar um teste

Testes do produto vivem em `#[cfg(test)]` no próprio crate (24 em `arkhe-flow`,
onde está a semântica). Um teste novo de verificação tem de seguir a forma dos que
existem: construir o corpo, assinar, verificar, e **asseverar o componente**, não
só o `overall`. Asseverar só `overall` deixa passar o caso em que o componente
certo mudou para `NOT_APPLICABLE`.

Para cada mudança que toque a §4, acrescente o caso negativo junto do positivo.
Um byte invertido tem de aparecer no teste.

### Quando a mudança enfraquece um veredito

Se fazer um teste passar exigir: aceitar campo do chamador como resultado, tratar
`INCONCLUSIVE` como sucesso, deixar `PASS` autorizar algo, reescrever o axioma,
ou permitir que o agente assine o próprio veredito — **pare**. Escreva o conflito
em uma linha e proponha a alternativa. Nenhuma dessas mudanças é aceitável, mesmo
que o teste seja legítimo e a mudança pareça pequena.

### Commits

Prefixo de escopo, minúscula, declarativo, o que mudou e não o que se pretendia:
`runtime: POST /v1/tasks admits a finished run, or excludes it with a reason.`
Um commit que desfaz algo diz que desfaz. Não acrescente mudança que ninguém
pediu — há commit no histórico cuja única função foi desfazer exatamente isso.

### Comandos de referência

O produto, a partir de `packaging\core`:

```powershell
cargo test --locked --workspace
```

```powershell
cargo clippy --all-targets --locked -- -D warnings
```

```powershell
python audit_receipt.py fixtures\gate0
```

```powershell
python demo\tamper.py
```

O laboratório, a partir da raiz, para não quebrar o monorepo ao mexer no produto:

```powershell
python scripts\check_architecture.py
```

```powershell
cargo test --workspace --locked
```

`packaging/core` tem `Cargo.toml` e `Cargo.lock` próprios e **não** é membro do
workspace da raiz: `cd packaging\core` antes de qualquer comando de cargo do
produto.

---

## 9. Como isto se vende

### A oferta, em uma tarde

Cabe numa reunião, na máquina de quem assiste. Entra: o binário em loopback, um
recibo que a equipe emite com a chave que ela gerou, a verificação do pacote
exportado por **ela**, e a lista do que continua na responsabilidade dela —
chave, política, máquina. Sai: Rekor (salvo se já configurado), GovTech, cadeia,
GPU, TEE, preço de tabela.

### As três perguntas, antes de abrir o produto

1. Qual foi a última vez em que uma saída de modelo entrou num documento ou numa
   decisão de verdade?
2. O que vocês fizeram antes de deixar isso seguir? Quem olhou?
3. O que aconteceu quando ninguém conseguia mostrar depois o que foi aceito?

Qualifica para um segundo encontro quando as três respostas descrevem um episódio
passado e a pessoa termina a verificação ela mesma. Desqualifica quando o pedido é
certificado, custódia, agente autônomo ou que o Arkhe assine no lugar da equipe.

"Você usaria?" não qualifica. "Você compraria?" entra depois da demo, registrado
como dito, nunca como receita.

### Postura de preço

Não há preço adotado, e isso é decisão registrada, não omissão. O operador escreve
o valor no arquivo dele, com `status: operator-supplied`; a fatura sai `draft` e
não cobra. Leituras de preço de terceiros ficam no deck como leitura de fonte, não
como faixa do Arkhe.

### O que defende isto de ser copiado

Checker separado de quem produz, política que tem de ser nomeada para descarregar
qualquer coisa, e um pacote que um terceiro recalcula. Isso só é defesa **depois**
que o terceiro verifica sem o autor presente. Até o Gate 0 fechar, é arquitetura
demonstrada em local — e dizer mais do que isso numa conversa com fundo é perder
a conversa seguinte.

---

## 10. As perguntas que um humano faz

**"Se proveniência não é prova, o que eu estou comprando?"**
A repetição do veredito. Se outra pessoa, com os mesmos bytes e a mesma raiz de
confiança, não chega ao mesmo resultado componente por componente, não houve
verificação — houve um relato. O produto é a diferença entre essas duas coisas.
Continua não sendo prova do mundo.

**"Então `PASS` não garante nada?"**
Garante exatamente duas coisas, e por isso é útil: a assinatura confere sob a
chave que **você** nomeou, e o hash que **você** calculou é o que está escrito.
O que nunca garante é que o artefato está certo ou que o efeito ocorreu. Um
sistema que prometesse isso estaria mentindo, e você descobriria no primeiro
incidente.

**"Por que a âncora fica `INCONCLUSIVE`? Está quebrado?"**
Está correto. Este pacote não tem cliente de transporte, então não observou
confirmação nenhuma. `confirmed` com transporte `none` é `FAIL`, porque é uma
afirmação que ninguém sustentou. P-02 fecha isso com inclusão verificável, e nem
assim a âncora passa a provar o fato de fora.

**"O modelo assinou a ação. Isso não basta?"**
Não. Uma saída de modelo que declara ter agido é uma proposta, não a observação de
que a ação ocorreu — por isso todo recibo de ação carrega
`axiom: llm_output_unverified`, e por isso o axioma não é reescrevível. Sai só com
um invariante nomeado por você, assinado por uma chave que não é a do agente,
sobre bytes que você está segurando. Tire a nomeação e volta a `INCONCLUSIVE`.

**"Vocês rodam o invariante?"**
Hoje, não. O pacote confere o recibo de quem rodou. P-06 constrói o runner. Mesmo
depois dele, o veredito não diz que o invariante era o teste adequado da tarefa:
essa é pergunta de política, e é por isso que você tem de nomeá-lo.

**"Quantos clientes?"**
Zero. Zero pagamentos, zero pilotos feitos por outra pessoa, zero entrevistas
registradas. A única tração honesta neste momento seria uma verificação concluída
por quem não escreveu o código, e ela é o critério do M1.

**"Onde fica a minha chave privada?"**
Hoje, num arquivo que você guarda, fora do diretório do verificador. Quem verifica
nunca recebe a semente. P-01 acrescenta backend de custódia; e nem com ele o
produto vai dizer "HSM certificado", porque não seria.

**"Isso atende LGPD, AI Act, SOC 2?"**
Não. Não há parecer, selo, certificação ou atestação de conformidade, e o
repositório recusa essa leitura em todos os lugares onde ela poderia caber. O
motor de `anpd-sandbox` rodou sobre registro sintético com
`anpd_submission: not_sent` — o que não abre sandbox da ANPD, não atende CGU e não
atende TCU. O que o produto entrega é evidência recalculável, que o seu time de
compliance pode usar como insumo. O parecer é dele.

**"Dá para rodar sem internet e sem banco?"**
Sim, e é o caso padrão. `verify` não abre `DATABASE_URL`. `serve` sem
`DATABASE_URL` sobe com `postgres: absent`. O compose põe tudo numa rede
`internal: true` e não publica porta no host.

**"Por que o repositório é tão maior que o produto?"**
Porque é um laboratório, e o produto é a parte dele que outra pessoa consegue
repetir. Essa separação está escrita em `packaging/core/HOW_TO_AUDIT.md` desde a
semana 0, e esta é a razão de o produto ter workspace próprio.

---

## Anexo A — Homologação rastreável com a referência RTC

Aberto em 19/11/2026, revisto no mesmo dia depois de ler o lote de exemplos
publicado. Este anexo é avaliação de encaixe, não trabalho adotado: nada aqui
foi implementado, nenhuma conversa aconteceu, e os itens R-01 a R-05 não entram
nos marcos da §7 até alguém decidir que entram.

Nesta revisão foram lidos os exemplos e a documentação dos repositórios. **A
execução e o registro continuam sem verificação independente.**

### A.1 Os três repositórios, lidos em 19/11/2026

| Repositório | Forma | O que faz |
|---|---|---|
| `ReceitaFederal/calculadora-rtc-regime-regular` | API REST Java/Spring Boot 3.5.16, Java 21+, Maven, SQLite + Flyway, MIT. Tag 1.6.1, 8 commits em `main` | Calcula CBS, IBS e Imposto Seletivo no regime geral, citando a LC 214/2025. Serve as tabelas de referência como dados abertos (classificações tributárias, fundamentações legais, NCM, NBS, alíquotas por UF), calcula base unificada, gera XML do grupo de tributação e valida XML contra XSD. **Tem perfil offline**, que lê um SQLite pré-gerado |
| `ReceitaFederal/calculadora-rtc-simples-nacional` | API REST Java/Spring Boot, mesma pilha, MIT. Tag 0.0.6, 5 commits | Calcula CBS e IBS no Simples Nacional. Só JSON, sem XML e sem Imposto Seletivo. Observabilidade com erro por item, código `VSN-*`, e consulta de atividades por data |
| `ReceitaFederal/calculadora-rtc-gerador-danfse` | Serviço HTTP em Go 1.27+, com build WASM, Taskfile, Dockerfile, MIT. Tag 1.0.0, 3 commits | Gera o PDF do DANFSe a partir do XML de uma NFS-e. Entrada `application/xml` até 5 MiB por omissão, parâmetros `stc` e `canhoto`. Não calcula tributo nenhum |

Quatro fatos que mudam como isto se escreve:

- **Nenhum dos três declara status normativo.** Não há frase dizendo que o
  cálculo é o oficial, nem ressalva dizendo que não vincula o contribuinte. As
  únicas referências legais são as citações da LC 214/2025 e a linha padrão de
  licença. A reivindicação defensável fica estreita, e a §A.8 a escreve.
- **Nenhum dos três publica vetor de teste.** Nos dois Java os testes são de
  integração e dependem do banco gerado. Mas o regime geral **publica um lote de
  exemplos**, e esse lote é material de teste de verdade: §A.3.
- **São novos e se movem.** 3 a 8 commits, versões 1.6.1 / 0.0.6 / 1.0.0,
  atualizações em outubro de 2026.
- **O `flyway/` existe no regime geral e não existe no Simples Nacional.**
  Conferido em 19/11/2026 por leitura direta dos dois caminhos: no regime geral,
  `flyway/flyway-pro.conf` responde com conteúdo e aponta
  `flyway.url=jdbc:sqlite:file:./calculadora/db/calculadora-pro.db` e
  `flyway.locations=filesystem:./flyway/sql`; no Simples Nacional, o mesmo
  caminho responde `404: Not Found` na branch padrão. Ver R-05.

### A.2 O que a calculadora é, e o que o invariante é

A distinção decide se o produto se sustenta, e é fácil de errar:

**A calculadora é a implementação de referência.** É um segundo motor, externo,
versionável, publicado por quem escreve a regra.

**O invariante é a condição decidível que o Arkhe verifica.** Formulada para que
dê uma resposta e não uma opinião: *para cada item obrigatório, as duas execuções
retornam resultados válidos e os campos fiscais comparados coincidem, sob uma
política identificada.*

A política continua tendo de dizer **quais operações importam, quais campos
devem coincidir e o que bloqueia uma liberação**. Isso não sai do colo do
comprador, e I7 continua inteira: `discharge` não julga se o invariante é teste
adequado da tarefa, e empurra a pergunta de volta para quem chama.

O que a referência externa compra é mais estreito e mais útil do que "o teste
certo passou a existir": **uma parte dessa decisão passa a ser verificável por
terceiros.** Se a política diz quais campos comparar, outra pessoa confere que a
comparação foi feita, com qual motor, sobre quais bytes, e com que resultado.
O juízo sobre a política permanece juízo. É esse o ganho para P-06 e para I7, e
não mais que esse.

### A.3 O lote publicado, item por item

O arquivo `docs/exemplos.md` do regime geral traz uma operação de observabilidade
com **quatro itens**, e o quarto tem erro proposital. Lido em 19/11/2026:

| Item | O que é | Resultado esperado |
|---|---|---|
| 1 | Arroz de cesta básica, redução de 100% | calculado |
| 2 | Cerveja com Imposto Seletivo; a base de CBS/IBS é derivada da base do IS somada ao IS | calculado, com grupo `IS` e grupo `IBSCBS` |
| 3 | Serviço de educação, redução de 60% | calculado; `vBC` 1200.00, `pAliqEfet` 3.52, `vCBS` 42.24, `vIBS` 0.48 |
| 4 | NCM `02013000` não vinculada à cClassTrib `200035` | `INCONSISTENCIA_ENTRADA`, com erro `REG-011` |

O que esse lote ensina sobre o desenho do recibo, e cada ponto é consequência:

- **O erro é por item, com ponteiro.** A forma é
  `{code: "REG-011", title, pointer: "#/itens/3/ncm", detail}`. Um relatório de
  homologação pode apontar o campo exato, e não "o lote falhou".
- **A resposta é HTTP 200 mesmo com item em erro.** Quem integra tem de ler o
  `estadoItem` de cada item: `CALCULADO`, `CALCULO_SIMULADO`,
  `INCONSISTENCIA_ENTRADA`, `NAO_IMPLEMENTADO` ou `FALHA_TECNICA`. Tratar 200
  como sucesso do lote é o primeiro erro de integração disponível.
- **Os totais somam apenas os itens calculados.** Comparar total contra total,
  sem comparar item a item, esconde exatamente o item 4.
- **O endpoint sem observabilidade recusa o lote inteiro com 422** por causa do
  item 4. Então a granularidade é escolha de endpoint, e a homologação quer o de
  observabilidade. Mas o XML é gerado a partir da resposta de `POST /regime-geral`,
  não da de observabilidade — os dois caminhos não são intercambiáveis.
- **`CALCULO_SIMULADO` não é `CALCULADO`.** A partir de 2027 `aliquotasNominais`
  é obrigatório e antes disso é proibido; cálculo com alíquota informada sai como
  `CALCULO_SIMULADO`, com o header `x-warning-dados-simulados`. O lote de exemplo
  usa `dhFatoGerador` de 2027 **e** informa alíquotas, então os itens calculados
  dele são simulados. A política tem de dizer se simulado é evidência admissível,
  e o recibo tem de registrar que era.
- **As alíquotas de referência estão cadastradas só para 2026.** De 2027 em
  diante a consulta responde 404 e a alíquota vem do payload. Quer dizer que "a
  data da tabela" não é um pino suficiente: o recibo precisa dizer **de onde veio
  a alíquota**, da base ou do chamador.
- **A escala decimal muda entre endpoints.** Os valores de tributo vêm como
  string com duas casas (`"42.24"`); a base unificada vem com oito
  (`870.00000000`). Comparação de campo precisa de escala declarada, não de
  igualdade de float.
- **`dataHoraEmissao` está obsoleto; o campo é `dhFatoGerador`.** O tempo que
  importa é o do fato gerador, não o da execução.

O arquivo não declara status dos exemplos. São exemplos de uso, não vetores
assinados, e não há resultado esperado completo para conferir — a resposta
publicada é resumida, com `"...": "..."` em dois dos quatro itens.

### A.4 O que o recibo precisa fixar

A tag facilita a leitura. **Os digests identificam o que foi executado.** O
conjunto mínimo:

| O que fixar | Por quê |
|---|---|
| Commit de origem da calculadora | tag é rótulo móvel; commit é o código |
| Digest do executável efetivamente usado | o jar construído aqui pode não ser o jar construído lá |
| Digest da base SQLite efetivamente usada | `calculadora-pro.db` é onde vivem as tabelas; dois bancos dão dois números |
| `dhFatoGerador` da operação | o tempo da regra, que não é o tempo da execução |
| As entradas submetidas a **cada** motor | o payload do fornecedor e o payload da referência têm de ser os mesmos bytes, ou a comparação é de outra coisa |
| Versão do ERP ou do motor do fornecedor | o lado que está sendo homologado |
| A origem das alíquotas | base de referência ou `aliquotasNominais` do chamador |
| A política de comparação | quais campos, com qual escala, e quais `estadoItem` são admissíveis |

**Isso cabe no schema congelado, sem campo novo.** O conjunto acima é um
manifesto de homologação: um JSON que o chamador escreve e hasheia. Então:

- `invariant_id` nomeia a **condição**: por exemplo `invariant.rtc.regime-geral`.
- `invariant_version` carrega o **digest do manifesto**. O campo aceita 128
  caracteres, e um sha256 em hex ocupa 64. A tag entra junto, para leitura
  humana: `1.6.1+manifesto=<64 hex>`.
- Um recibo `artifact` pode comprometer o pacote inteiro com os quatro digests
  da folha: resultado, manifesto, payload e política de comparação.

Nenhum campo de `invariant` muda, então I5 continua valendo e recibo já emitido
continua verificando.

**E agora o furo, conferido no código hoje:** `discharge` compara apenas
`invariant_id` com `--expect-invariant`. O `invariant_version` está no corpo, é
assinado, e **nunca é comparado com nada que o chamador exija**. Se o manifesto
vai no `invariant_version`, então sem R-02 o manifesto fica assinado e não
exigido — um veredito produzido com outro jar, outro banco e outra política
descarrega o axioma igual, desde que o id bata. Enquanto R-02 não existir, a
alternativa que funciona hoje é pôr o digest dentro do próprio `invariant_id`,
que é o campo que o chamador nomeia.

### A.5 O que cada peça preenche no recibo

O encaixe não pede campo novo:

| Recibo | Campo | O que o RTC põe ali |
|---|---|---|
| `admission` | `subject_sha256` | os bytes da operação submetida aos dois motores |
| `admission` | `operation` | a rota usada, por exemplo a observabilidade do regime geral |
| `agent-action` | `output_sha256` | o resultado que o motor do fornecedor produziu |
| `agent-action` | `model_sha256` | o manifesto da §A.4 |
| `invariant` | `invariant_id` | a condição nomeada |
| `invariant` | `invariant_version` | o digest do manifesto |
| `invariant` | `held` | os campos comparados coincidiram, para todos os itens obrigatórios, sob a política identificada |
| `artifact` | `artifact_sha256` | o PDF do DANFSe |
| `artifact` | `data_sha256` | o XML da NFS-e que entrou |
| `artifact` | `model_sha256` | o digest do renderizador, na tag usada |
| `artifact` | `pipeline_sha256` | os passos da renderização, com `stc` e `canhoto` |

Duas ressalvas sobre o DANFSe, porque a versão anterior deste anexo afirmou de
mais. O recibo vincula o PDF produzido ao XML recebido, ao digest do
renderizador e aos parâmetros. **A reprodução byte a byte precisa ser medida**,
com o build WASM fixado: a existência do WASM estabelece *uma forma de executar
o renderizador*, e nada além disso. Se o PDF carregar data de geração embutida,
o digest do arquivo não serve e a folha tem de comprometer o conteúdo.

### A.6 O primeiro teste de aceite

Parte do lote publicado, que já tem o item inválido de fábrica.

1. Rode o lote de quatro itens contra a observabilidade do regime geral, com o
   commit, o digest do jar e o digest do banco fixados no manifesto.
2. Confronte com a saída de um ERP. Na primeira demonstração, com uma saída
   sintética **identificada como sintética** no manifesto — não como dado de
   fornecedor.
3. Introduza uma diferença de **um centavo** em um campo comparado. O item 3 do
   lote serve: `vCBS` de `42.24` para `42.25`.
4. Preserve o item 4 inválido como está.

O que o Arkhe tem de fazer, e é isto que o teste mede:

- apontar a divergência **com o valor exato**, nomeando item e campo, e não "o
  lote divergiu";
- marcar o item 4 como **inconclusivo**, não como falha do fornecedor: a
  referência não produziu resultado comparável, então não há comparação a
  reprovar;
- permitir que outra pessoa chegue às mesmas conclusões a partir do pacote, sem
  a máquina de quem rodou;
- e, se o digest do banco ou do executável mudar, apresentar a execução como
  **nova referência de comparação**, não como adulteração do histórico.

O quinto ponto é o que separa isto de um relatório qualquer: se os itens voltarem
`CALCULO_SIMULADO`, como no lote publicado, o relatório tem de dizer isso na
cara, e a política tem de ter decidido antes se simulado homologa.

### A.7 Backlog RTC

Mesma forma da §6. Nenhum destes está nos marcos da §7.

---

**R-01 — Perfil de invariante do regime geral**
*Por quê:* é o item que torna uma parte da decisão de homologação verificável por
terceiros, em vez de declarada.
*Entrada:* a calculadora do regime geral no perfil offline, com o SQLite
pré-gerado; o `Registry`/`Invariant` do `arkhe-exec-adapter`; e a política de
comparação escrita antes, com campos e escala.
*Saída:* um `Invariant` cujo `check` submete os mesmos bytes aos dois motores,
compara só os campos que a política nomeia, e devolve uma condição decidível por
item, sem rede.
*Teste que fecha:* o lote publicado da §A.3 produz `held: true` quando os campos
comparados coincidem nos itens obrigatórios; a diferença de um centavo produz
`held: false` com o campo e os dois valores na nota; o item 4 sai inconclusivo e
não como divergência; e a calculadora indisponível produz exclusão com motivo,
nunca `held: true`.
*Limite:* coincidência de campo com a implementação publicada não é parecer
tributário nem conformidade. §A.8.
*Não fazer:* chamar a API pela rede dentro do invariante; comparar total contra
total; tratar HTTP 200 como sucesso do lote; tratar indisponibilidade como
sucesso; comparar valores como float.

---

**R-02 — Exigir a versão, não só o id**
*Por quê:* §A.4. Sem isso, o manifesto fica assinado e não exigido, e o pino não
pina nada.
*Entrada:* o `discharge` como está.
*Saída:* `--expect-invariant-version` com a comparação em `discharge`, por
igualdade exata. Até existir, a convenção de pôr o digest dentro do
`invariant_id`, escrita e adotada.
*Teste que fecha:* veredito com `invariant_version` diferente do exigido deixa
`llm_output` em `FAIL`, com a nota nomeando as duas versões; e um teste que
confirma que nenhum campo de `invariant` mudou, para que recibo antigo continue
verificando.
*Limite:* prender a versão não diz que a versão era a correta para o
`dhFatoGerador` da operação. Isso é política do operador, e o manifesto só a
registra.
*Não fazer:* acrescentar campo ao `kind` `invariant` (I5); comparar versão por
ordenação semântica.

---

**R-03 — Casos versionados com evidência reexecutável**
*Por quê:* §A.1 — não há vetor publicado, e o lote de exemplos tem a resposta
resumida, com reticências em dois itens. É a contribuição mais direta do Arkhe.
*Entrada:* o lote publicado como semente, a calculadora numa versão fixa, e o
manifesto da §A.4.
*Saída:* um pacote com casos versionados, critério por campo, resultado esperado
completo e evidência reexecutável; mais um comando que corre a implementação de
um terceiro contra ele.
*Teste que fecha:* reexecutar na mesma versão e com o mesmo banco reproduz todos
os casos; mudar o digest do banco muda os casos que dependem dele e **só** esses,
e o relatório nomeia quais; o item inválido continua inválido.
*Limite:* caso versionado não é tabela oficial nem substitui a fonte. É o que
uma execução identificada devolveu.
*Não fazer:* congelar caso sem registrar commit, digest do jar e digest do banco;
publicar caso derivado de dado de pessoa real.

---

**R-04 — Recibo de artefato do DANFSe, com determinismo medido**
*Por quê:* exercita os quatro digests da folha Merkle sobre um caso que o
comprador reconhece.
*Entrada:* o serviço Go, o build WASM fixado, e um XML de NFS-e.
*Saída:* um recibo `artifact` com PDF, XML, digest do renderizador e os passos
com `stc` e `canhoto`; e o procedimento de reexecução no WASM.
*Teste que fecha:* **primeiro**, duas renderizações da mesma entrada, mesma
versão e mesmos parâmetros, comparadas byte a byte. Se baterem, o digest do PDF
entra na folha; se não baterem, a folha compromete o conteúdo e o teste registra
o que varia. Depois: parâmetro trocado produz digest diferente e o recibo antigo
vai a `FAIL`.
*Limite:* a disponibilidade de WASM estabelece uma forma de executar o
renderizador. Não estabelece reprodução byte a byte, e não estabelece que o
auditor conseguirá rodá-lo no navegador dele.
*Não fazer:* assumir determinismo sem medir as duas renderizações.

---

**R-05 — Simples Nacional: a origem da base**
*Por quê:* o README manda copiar uma pasta `flyway/` descrita como presente no
repositório e aponta para a própria URL do repositório como fonte dos scripts.
Conferido em 19/11/2026: `flyway/flyway-pro.conf` responde `404` na branch padrão
do Simples Nacional, e **existe no regime geral**, apontando
`filesystem:./flyway/sql` e o banco `calculadora/db/calculadora-pro.db`. O README
também usa 8082 na tabela de endpoints e 8080 nas instruções de execução.
*Entrada:* os dois repositórios, e os códigos `VSN-*` da observabilidade.
*Saída:* ou um caminho de instalação que feche localmente — possivelmente usando
o `flyway/` do regime geral, se os scripts servirem aos dois —, ou o registro
escrito de que não fecha, de qual passo falha e de qual arquivo falta. O segundo
é resultado legítimo e vale mais que um contorno silencioso.
*Teste que fecha:* o perfil offline sobe e devolve o mesmo resultado duas vezes;
ou existe um registro datado nomeando o arquivo ausente.
*Limite:* este regime não tem Imposto Seletivo nem XML, então o encaixe é menor
que o de R-01.
*Não fazer:* reconstruir por engenharia reversa o banco que falta e chamar isso
de calculadora da Receita; presumir que o `flyway/sql` do regime geral serve ao
Simples Nacional sem conferir o conteúdo.

### A.8 A linha comercial, e as frases que não se podem dizer

A linha é **homologação rastreável para fornecedores de software fiscal**. O
entregável é um relatório que a equipe de QA e a área fiscal conseguem conferir
antes de aprovar uma versão, e que um terceiro reexecuta a partir do pacote.

**Antes de apresentar isso como capacidade demonstrada**, dois marcos de
engenharia: a passagem do `arkhe-exec-adapter` pela fronteira de workspace
(P-06) e a reexecução offline. Enquanto os dois não fecharem, é desenho com teste
de aceite escrito, e é assim que se fala dele.

**Pode dizer:** "os campos que a política nomeia coincidem com os da
implementação publicada pela Receita Federal, executada no commit X, com o jar
de digest Y e o banco de digest Z, sobre estes bytes — e um terceiro recalcula
isso sozinho."

**Não pode**, e cada uma por um motivo diferente:

- "conformidade com a Receita", "cálculo oficial", "homologado pela Receita" —
  nenhum dos três repositórios declara status normativo, então a frase não tem
  base, nem no software nem na lei.
- "o tributo devido está correto" — o invariante compara dois motores em campos
  escolhidos. Não é parecer tributário, e I1 continua valendo.
- "certificado", "aprovado" — não há ato de ninguém.
- "o fornecedor está homologado" — a política decide o que bloqueia liberação, e
  a política é do comprador. O Arkhe entrega o relatório, não o selo.

A licença MIT permite redistribuir e empacotar, inclusive o perfil offline. Isso
é permissão de direito autoral, não endosso.

**Isto não é o ICP #3.** A §1 exclui verificação de documento oficial, e
`docs/mercado/segmentos.md` põe ANPD, CGU e TCU como expansão. Nada aqui vende a
órgão público nem verifica documento oficial: usa uma implementação de referência
MIT, publicada por um órgão, e vende a quem escreve software fiscal. A distinção
fica escrita porque, sem ela, alguém lê o anexo como deriva para o segmento
excluído.

O calendário legal da reforma não foi verificado aqui e não é afirmado em nenhuma
linha deste anexo. As datas que aparecem — `dhFatoGerador` de 2027 no lote,
alíquotas de referência cadastradas só para 2026, vigência 2026–2026 de PIS e
COFINS — são o que a documentação do repositório diz, não leitura da lei.

## 11. Registro de claims deste documento

| Afirmação | Estado | Onde se confere |
|---|---|---|
| 41 testes passam em `packaging/core` (42 com `--features external-signer`), Clippy `-D warnings` verde, 0 reprovados | FACT, 21/11/2026 | `cd packaging\core; cargo test --locked --workspace` + `docs/evidence/2026-11-21-arkhe-verify-commercial-readiness/RESULTS.md` |
| P-01 (`ReceiptSigner` + `external-signer` + recusa env), P-02 (inclusão RFC 6962 contra checkpoint configurado), P-03 (auth 401/403 separada do assento), P-05 (rosters multi-tenant + rotação), P-06 (laço `invariant.no-direct-identifier` sem chave no runner), P-07 (`reconcile`) passam | FACT, 21/11/2026 | `docs/evidence/2026-11-21-arkhe-verify-commercial-readiness/RESULTS.md` |
| Kit autocontido Gate 0 (`arkhe-verify-gate0-kit.zip`) gera `SHA256SUMS`, 0 segredos privados e passa nos 7 comandos Gate 0 | FACT, 21/11/2026 | `cd packaging\core; python -B scripts/verify_release.py --kit dist/arkhe-verify-gate0-kit --run-gate0` |
| Clippy (`--workspace --all-targets --locked -- -D warnings`), `cargo fmt --all --check` e `check_architecture.py` passam na raiz | FACT, 21/11/2026 | `docs/evidence/2026-11-21-arkhe-verify-commercial-readiness/RESULTS.md` |
| A ação de agente vai de `INCONCLUSIVE` a `PASS` só com veredito nomeado | FACT, 21/11/2026 | os dois comandos de `HOW_TO_AUDIT.md`, seção Gate 0 |
| As dezoito condições do auditor Python recomputam | FACT, 21/11/2026 | `python -B audit_receipt.py fixtures\gate0` |
| Um byte invertido deixa assinatura `PASS` e assunto `FAIL` | FACT, 21/11/2026 | `python -B demo\tamper.py` |
| O produto compila e verifica sem banco e sem rede | FACT | `verify` não lê `DATABASE_URL`; `serve` sobe com `postgres: absent` |
| Um invariante determinístico roda de verdade, com registro fail-closed, e 21 testes passam | FACT, 19/11/2026 | `cargo test -p arkhe-exec-adapter --locked` |
| O lock de migrações está completo | FACT, 19/11/2026 | `20261026000018_wormgraph_fencing.sql` em `config/migrations.lock.json` |
| A imagem `arkhe-provenance-mcp:local` foi construída | **FACT, 25/11/2026** | Run `45625806852` (`build-docker-image`): `sha256:fc55e21615680ad014734b09b77f7f8acf242dbf6c4e896c76de005aae7fcb48`, CLI/R-02 + `compose.yaml` validados (`docs/evidence/2026-11-25-phase-b-alpha-release/RESULTS.md`) |
| R-02 (`--expect-invariant-version`), `LICENSE-APACHE`/`LICENSE-MIT` e atestação Sigstore OIDC dos kits Linux/Windows/macOS passam em CI | **FACT, 25/11/2026** | Run `45625806852` (`cebf25e0`), 5/5 jobs `success`, `docs/evidence/2026-11-25-phase-b-alpha-release/RESULTS.md` |
| Um terceiro reexecutou os recibos fora deste ambiente | **FALSO hoje** | Gate 0 / M1 |
| Existe disposição a pagar por verificação | CONJECTURE | Gate 1 / M4, tabela vazia |
| O ICP #1 é o comprador certo | CONJECTURE, confiança 0,55–0,70 | `docs/mercado/experimento-01.md`, 0 conversas |
| Verificação recalculável é defesa competitiva | CONJECTURE | só vira defesa quando o terceiro verifica sem o autor |
| O recibo satisfaz exigência de regulador | **não afirmado** | nenhuma seção deste documento o afirma |
| Os três repositórios RTC da Receita existem, são MIT, e nenhum declara status normativo | FACT, 19/11/2026 | leitura das três páginas e da página da organização, registrada no Anexo A |
| Sem `expect_invariant_version` (19/11/2026), `discharge` comparava só `invariant_id`; com R-02 (25/11/2026), `--expect-invariant-version` exige igualdade exata | FACT, 25/11/2026 | `crates/arkhe-flow/src/lib.rs`, `fn discharge` |
| O lote publicado do regime geral tem quatro itens, com erro por item (`REG-011`, com ponteiro) e um item inválido de fábrica | FACT, 19/11/2026 | `docs/exemplos.md` do regime geral, lido no bruto |
| A resposta é HTTP 200 com item em erro, e o endpoint sem observabilidade recusa o lote inteiro com 422 | FACT, 19/11/2026 | mesmo arquivo |
| As alíquotas de referência estão cadastradas só para 2026; de 2027 a consulta responde 404 | FACT, 19/11/2026 | mesmo arquivo. É o que o repositório diz, não leitura da lei |
| `flyway/flyway-pro.conf` existe no regime geral e responde `404` no Simples Nacional | FACT, 19/11/2026 | leitura direta dos dois caminhos; R-05 |
| O perfil offline do regime geral fecha e é determinístico | HIPÓTESE não testada | R-01 |
| O PDF do DANFSe é determinístico byte a byte | **não medido** | primeiro passo de R-04 |
| Homologação rastreável é capacidade demonstrada | **FALSO hoje** | depende de P-06 e da reexecução offline; §A.8 |
| O RTC é um wedge melhor que o ICP #1 | CONJECTURE | nenhuma conversa, nenhum fornecedor, nenhum preço |

Linha nova entra neste documento com um fato que outra pessoa possa apontar:
teste com comando e data, tela, conversa datada, preço dito, recusa dita. Uma
execução de quem escreveu o código não fecha portão nenhum.

---

### Arquivos que este documento substitui como ponto de partida

Nenhum. Ele costura o que já estava separado: `packaging/core/HOW_TO_AUDIT.md`
(procedimento), `docs/mercado/*` (oferta, segmentos, piloto, plataforma, design
partners), `docs/whitepaper/verificacao-reprovavel.md` (posição),
`docs/specs/evidence-bus.md` e `docs/specs/provenance-broker.md` (contratos),
`docs/PRODUCT-QUALITY-2026-10-28.md` (achados abertos) e `docs/STATUS.md`
(limites). Quando um desses mudar, esta cópia fica velha; a fonte continua lá.
