# Como auditar um recibo

Este diretório é o core empacotado das semanas 0 a 6 no que um terceiro consegue repetir sem o ambiente de quem emitiu.

| Semana | O que este pacote faz | O que não faz |
|---|---|---|
| 0 | Workspace próprio, `Cargo.lock` e este procedimento | Não promove o monorepo a produção |
| 1 | Três recibos com campos fechados: admissão, commit, âncora | Não é o perfil MMR do `arkhe-verify-core` |
| 2 | `arkhe-storage` grava a admissão uma vez; o mesmo arquivo devolve o mesmo commit | Não é o PostgreSQL do runtime |
| 3 | Quem verifica não recebe a semente. Assinatura, hash e vínculo são componentes separados | Não executa teste de um candidato |
| 4 | Fora deste pacote | Não há adaptador de provedor |
| 5 | Fora deste pacote | Nenhum recibo aplica efeito |
| 6 | Fixture pública em `fixtures/gate0` e o comando abaixo | Âncora externa continua inconclusiva |
| 7 | Mais três recibos: artefato com prova de Merkle, ação de agente e veredito de invariante. O papel `invariant` entra na roster | Não executa o agente nem roda o invariante. Nenhum recibo aplica efeito |

Uma execução feita por quem escreveu o código não fecha o Gate 0.

## Gate 0

Um terceiro, com uma cópia deste diretório e sem `DATABASE_URL`, sem PostgreSQL, sem semente e sem a máquina de quem emitiu, reexecuta os seis recibos e obtém os vereditos abaixo. Sem isso, não há produto.

O que você precisa: Rust 1.96.0, este diretório e os arquivos de `fixtures/gate0`.

```powershell
cd packaging\core
cargo run -p arkhe-provenance-mcp --locked -- verify --receipt fixtures\gate0\admission.json --trust fixtures\gate0\trust.json --expect-purpose gate0-lab --subject fixtures\gate0\subject.bin --policy fixtures\gate0\policy.json
cargo run -p arkhe-provenance-mcp --locked -- verify --receipt fixtures\gate0\commit.json --trust fixtures\gate0\trust.json --expect-purpose gate0-lab --admission fixtures\gate0\admission.json
cargo run -p arkhe-provenance-mcp --locked -- verify --receipt fixtures\gate0\anchor.json --trust fixtures\gate0\trust.json --expect-purpose gate0-lab --commit fixtures\gate0\commit.json
cargo run -p arkhe-provenance-mcp --locked -- verify --receipt fixtures\gate0\artifact.json --trust fixtures\gate0\trust.json --expect-purpose gate0-lab --artifact fixtures\gate0\artifact.bin --model fixtures\gate0\model.json --data fixtures\gate0\data.json --pipeline fixtures\gate0\pipeline.json
cargo run -p arkhe-provenance-mcp --locked -- verify --receipt fixtures\gate0\action.json --trust fixtures\gate0\trust.json --expect-purpose gate0-lab --plan fixtures\gate0\plan.json --output fixtures\gate0\artifact.bin --model fixtures\gate0\model.json --artifact fixtures\gate0\artifact.bin
cargo run -p arkhe-provenance-mcp --locked -- verify --receipt fixtures\gate0\action.json --trust fixtures\gate0\trust.json --expect-purpose gate0-lab --plan fixtures\gate0\plan.json --output fixtures\gate0\artifact.bin --model fixtures\gate0\model.json --artifact fixtures\gate0\artifact.bin --invariant fixtures\gate0\verdict.json --expect-invariant invariant.valor-present
cargo run -p arkhe-provenance-mcp --locked -- verify --receipt fixtures\gate0\verdict.json --trust fixtures\gate0\trust.json --expect-purpose gate0-lab --output fixtures\gate0\artifact.bin --action fixtures\gate0\action.json
python audit_receipt.py fixtures\gate0
```

| Recibo | Resultado que fecha o gate | Código de saída |
|---|---|---|
| Admissão (`kind: admission`, emissor `flow`) | `overall` `PASS`. Os hashes do assunto e da política batem com os arquivos | 0 |
| Commit (`kind: commit`, emissor `storage`) | `overall` `PASS`. A raiz é recalculada e o id da admissão coincide | 0 |
| Âncora (`kind: anchor`, emissor `anchor`) | `overall` `INCONCLUSIVE`. A assinatura confere e o componente `anchor` fica `INCONCLUSIVE` | 2 |
| Artefato (`kind: artifact`, emissor `storage`) | `overall` `PASS`. A folha é reconstruída dos quatro digests e a prova dobra até a raiz escrita; os quatro arquivos batem | 0 |
| Ação **sem** o veredito (`kind: agent-action`, emissor `flow`) | `overall` `INCONCLUSIVE`, `llm_output` `INCONCLUSIVE`. Assinada não é verificada | 2 |
| Ação **com** o veredito nomeado | `overall` `PASS`, `llm_output` `PASS`. O axioma é descarregado | 0 |
| Veredito (`kind: invariant`, emissor `invariant`) | `overall` `PASS`. Nomeia a ação, confere os bytes e `held` é verdadeiro | 0 |

O par de comandos da ação é o contraste que importa, e é a razão de serem dois: o **mesmo** recibo, com as **mesmas** chaves, vai de `INCONCLUSIVE` a `PASS` só porque um veredito assinado por outro papel o acompanha e você nomeou qual invariante exige. Tire o `--expect-invariant` e volta a `INCONCLUSIVE`: sem nomeação não há política, e sem política não há descarga.

A recomputação em Python cobre os hashes, o encadeamento, o id de cada um dos seis recibos a partir do corpo canônico, e o fold de Merkle do artefato. Ela não verifica assinatura. Hash certo com assinatura ruim não é confirmação. Os dois comandos entram no gate, e escrever a mesma conta duas vezes é o ponto: se o Python e o Rust discordarem, um dos dois está errado.

`PASS` significa que a assinatura confere com a chave pública do arquivo de confiança que você escolheu nomear, e que o hash que você calculou é o hash escrito no recibo. Não autoriza efeito, não confirma transporte externo e não prova que o arquivo existia em outro lugar.

As chaves de `fixtures/gate0` são vetores de laboratório. A semente está no fonte de propósito. Elas não são raiz de confiança de nenhum tenant. Um emissor real gera chaves com `arkhe-flow keygen`, publica só o `trust.json` e guarda o segredo fora deste diretório. O auditor confere o campo `purpose` com o valor que recebeu por outro canal. Sem `--expect-purpose`, o veredito fica `INCONCLUSIVE`.

A roster de `fixtures/gate0` tem quatro papéis: `flow`, `storage`, `anchor` e `invariant`. O quarto existe porque o veredito de invariante não pode ser assinado pela chave do agente. Três coisas independentes garantem isso: o `sign_body` recusa quando o papel do segredo não bate com o `issuer`; o `check_signer` recusa um `issuer` que a roster não lista; e uma roster que não lista `invariant` não descarrega nada. Uma roster de três papéis continua válida para os três primeiros recibos.

## Os seis recibos

A admissão é emitida por `arkhe-flow`. O corpo traz tenant, operação e os SHA-256 do assunto e da política. A política deste pacote é `{"effect":"none","schema":"arkhe-policy/v1"}` em JSON canônico, sem espaço. Efeito nenhum é o contrato.

O commit é emitido por `arkhe-storage` depois que a admissão verifica. A raiz é SHA-256 da string UTF-8 `raiz_anterior`, uma quebra de linha `\n`, e o id da admissão. A primeira raiz anterior é 64 zeros. Repetir o mesmo arquivo de admissão devolve o commit já gravado. Outro arquivo com o mesmo id conflita e não grava.

A âncora nomeia o commit, o transporte, a referência e o estado observado. Transporte `none` com estado `pending` permanece `INCONCLUSIVE`. Transporte `none` com estado `confirmed` é `FAIL`. Este pacote não tem cliente de transporte; um estado `confirmed` de outro transporte também fica `INCONCLUSIVE`.

O artefato é emitido por `arkhe-storage` e é o primeiro recibo com recomputação interna: a folha é SHA-256 de `arkhe-storage-leaf/v1`, e depois os quatro digests separados por `\n`; os nós são SHA-256 de `node`, o filho esquerdo e o direito, também por `\n`. A folha desta fixture está no índice 1 de três, então a prova carrega um passo à esquerda e um à direita, e um índice errado não dobra por acaso. Os quatro componentes de vínculo — `artifact`, `model`, `data`, `pipeline` — ficam `NOT_PERFORMED` se você não passar os arquivos, e aí o veredito é `INCONCLUSIVE`: um recibo conferido sem os arquivos não é `PASS`.

A ação de agente é emitida por `flow` e nomeia o plano, a saída, o modelo e o agente. Ela **sempre** carrega `axiom: llm_output_unverified`, e esse campo nunca é reescrito: um corpo que o troque é recusado no schema, antes da assinatura ser olhada. O componente `produced` liga a saída que a ação assinou ao artefato que o storage comprometeu.

O veredito de invariante é emitido pelo papel `invariant`. Ele nomeia a ação pelo id do recibo — que é o hash do corpo assinado, então nomeá-lo amarra plano, saída, modelo e agente de uma vez —, repete o digest da saída que leu, e diz se o invariante se sustentou. `held: false` é recibo legítimo: uma execução recusada vale assinar, e um veredito que não se sustentou descarrega nada.

Um veredito só descarrega o axioma se o componente `output` tiver passado. Se você não trouxe os bytes, ou trouxe outros, o veredito fala de um digest que você não confirmou: `llm_output` fica `INCONCLUSIVE` no primeiro caso e `FAIL` no segundo. Inverta um bit do `artifact.bin` e confira: a assinatura continua `PASS`, e `output`, `produced` e `llm_output` vão a `FAIL`.

O id do recibo é o SHA-256 de `ARKHE-RECEIPT-V1\n` seguido do JSON canônico do corpo. A assinatura Ed25519 cobre esses mesmos bytes. O JSON canônico ordena as chaves, não tem espaço e escapa strings como o `serde_json`.

## Endpoint

`arkhe-provenance-mcp verify` não lê `DATABASE_URL`.

`arkhe-provenance-mcp serve` escuta em `127.0.0.1:8080`. `GET /health` responde `verify: ready`. Sem `DATABASE_URL`, `postgres` é `absent` e o processo sobe. Com `DATABASE_URL`, o processo conecta e cria `provenance_observations` antes de aceitar pedido. Se a URL existe e o banco não conecta, o processo termina: a persistência pedida não está disponível. O veredito criptográfico não espera essa tabela.

`POST /v1/verify` recebe o recibo, o arquivo de confiança, `expect_purpose` e os hashes ou ids que o chamador calculou. A resposta é o mesmo veredito do comando. Se o banco está pronto, a linha gravada é uma observação. Ela não muda `overall`. Se a gravação falha, `persistence` fica `UNAVAILABLE` e o veredito calculado continua na resposta.

O crate compila sem banco. A SQL é texto em tempo de execução. Não há macro `sqlx` que exija `DATABASE_URL` no build. O servidor antigo em `archive/phase-a-mcp` exigia a URL e a tabela `usage_events`, e delegava a verificação a outro HTTP. Esse arquivo não é este servidor. Este não mede royalty e não chama preflight.

## O que ainda falta para chamar isto de produto

O Gate 0 fecha quando outra pessoa, fora deste ambiente, executa os sete comandos e vê a tabela acima. Até lá o pacote é o procedimento, não a confirmação.

Um `PASS` na ação com o veredito diz que um invariante nomeado, assinado por uma chave que não é a do agente, leu os bytes que você está segurando e se sustentou. Não diz que o invariante era o teste adequado da tarefa: essa é pergunta de política, e é por isso que você tem de nomeá-lo. Também não diz que o invariante rodou aqui — este pacote não executa invariante nenhum, só confere o recibo de quem executou.
