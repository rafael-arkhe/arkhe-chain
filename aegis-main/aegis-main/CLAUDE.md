# AEGIS — o núcleo

> Repo **único** do produto. Rust no centro, o frontend ao lado, e um
> `vertical.yaml` que é a única forma de descrever um domínio de cliente.
>
> **O `CLAUDE.md` da raiz (`../CLAUDE.md`) descreve a CASA** — os módulos
> polyrepo, a frota, a Bridge, o Desktop, a porta de cada coisa. Este descreve
> **este produto**. Os dois são obrigatórios e nenhum substitui o outro: quem
> abre este repo a sério está a trabalhar no produto, e quem o abre de surpresa
> está a trabalhar na casa.

---

## O que isto é

O núcleo do AEGIS reconstruído em Rust, **tijolo a tijolo**, desde 28/09/2026.
Um produto é:

```
aegis/
├── crates/          o domínio, um dono por crate
├── apps/
│   ├── bin/         `aegis` — a casca (linha de comandos)
│   ├── gui/         `aegis-gui` — a janela (Tauri)
│   ├── console/     o console: fork vendorizado do OpenMausBot (Apache-2.0)
│   └── web/         o frontend Next.js (veio do repo `Safe-Core/security-app`)
├── verticals/       um produto de cliente = uma pasta
├── docs/            a referência, GERADA
└── ferramentas/     as provas que correm contra o binário
```

## Um binário, uma janela — e o Bridge deixou de ser outro produto

🔴 Havia um `aegis-bridge` a parte, com o seu próprio executável em C#. Está
**dissolvido**: o que ele fazia entrou aqui como `aegis camera` e como a aba
**Câmeras** do GUI. A tabela abaixo é o que o `aegis-bridge` tinha e onde
ficou:

| Era | Passou a ser |
|---|---|
| `AEGIS-Bridge.exe camera` | `aegis camera` |
| `AegisBridge.cs` (modelo, `cameras.txt`, `Slug`, links RTSP/HLS) | `crates/aegis-ponte` |
| `AegisDoutor` (a conferência) | `aegis-produto::diagnostico` + a aba **Sistema** |
| `AegisLicenca` / `AegisRenovacao` | `aegis-produto` + `aegis licenca` |
| `AegisAtualizador` (GitHub) | `aegis-ambiente` + a aba **Atualização** (a construir) |
| `AegisInstalacao` / `AegisDesinstalacao` | `aegis ilha` (a construir) |
| `AegisMatricula` (frota) | `aegis frota` — **subcomando do mesmo binário** (a construir) |

Um produto com dois programas é um produto com dois modos de divergir, e a
casa mediu que a regra duplicada divergia sempre no primeiro caso de borda.

**Não existe build, gestor de pacotes ou runner de teste na raiz da CASA** —
mas aqui o `Cargo.toml` é a raiz, e `cargo test --workspace` corre tudo.

## E a quarta face: `aegis mcp`

🔴 **A face agêntica é um subcomando**, não um programa — pela regra de cima.
O motor (opencode, MIT) fala MCP em stdio; a mão é o cua-driver (MIT); a
autoridade é este binário. As 11 ferramentas vivem numa tabela **fechada** e
`tools/list` sai da **mesma** tabela que despacha, porque duas listas divergem
e a divergência de um `tools/list` só se descobre em produção.

O **plano dos 30 dias** é `../docs/refatoracao/PLANO-CAMADA-AGENTICA.md`, com
as caixas de check por dia. 🔴 **O que a face agênica provou, e não era código
novo:** a ilha respondia com `{codigo, mensagem}` e **sem gesto** — porque
quem lia por HTTP era a CLI, que tem o terminal à frente. E a `Prontidão`
(`/health/ready`) tem forma **própria** e não é um erro como os outros. As
duas coisas só apareceram quando um **modelo** passou a ler a resposta.

```sh
aegis mcp --vertical verticals/hotelaria --licença … --chave-oem …   # serve
aegis mcp --vertical verticals/hotelaria --lista                     # as ferramentas, e sai
```

🔴 `AEGIS_ILHA_URL` **não tem default**, e `AEGIS_ILHA_TOKEN` viaja **no
cabeçalho** — nunca no caminho. Ambos os leitores vivem em `aegis-ambiente`, e
a guarda `nenhuma_variavel_de_ambiente_e_lida_fora_do_ambiente` morde quem os
ler por fora (mordeu-me a mim, no teste).

🔴 **E a conferência (`diagnostico`) não recusa por a ilha não estar pronta** —
é a razão de existir. `ilha_saude` recusa (o pedido era legítimo, é o estado
que não o permite), e a conferência é a ferramenta feita *para* essa situação.

🔴 **A conferência não pode mentir sobre o que não mediu**, e quem mediu isso foi
a **prova ao vivo** (`ferramentas/prova-diagnostico.sh`): com a ilha
inacessível, `diag.banco` saía **`FALTA` — "o banco não responde"**. A ilha
estava simplesmente inacessível. 🔴 Um diagnóstico **vermelho** que aponta
para a coisa errada, com a confiança de quem mediu. A regra escrita no código é
*sem `Prontidao` não há medição nenhuma*, e a prova morde por ela.

```sh
AEGIS_ILHA_URL=http://127.0.0.1:8023 bash ferramentas/prova-diagnostico.sh
```

## O console: um fork **vendorizado**, e o que ele custou

🔴 **`apps/console/` é o OpenMausBot dentro deste repo** — 3031 ficheiros
vendorizados a partir do commit `863f94c`, sob Apache-2.0, com o `enterprise/`
(que é *source-available*, não Apache) apagado e a marca deles fora do ecrã.
Não é um submódulo e não é um repo: é uma pasta.

A lei e o inventário vivem ao lado da árvore (`LEIA-ME.md`,
`LICENCA-ESTE-FORK.md`, `NOTICE-AEGIS.md`, `equipa/`), e **o nosso dado nunca
entra nas pastas que o upstream usa** — nem em `skills/`, nem em `.claude/`.
É a mesma classe de defeito da `seed_portaria_acesso.py`, que importava as
seeds alheias: um `git pull` não pode trazer bots de outro cliente.

🔴 **A exclusão da guarda do alfabeto é um manifesto, não um caminho.**
`apps/console/.arvore-upstream` diz quais ficheiros vieram intactos, e a guarda
pula **só** esses: o texto que escrevo dentro da mesma árvore continua lido e
acusado. Sem isto, "ignora `apps/console`" apagaria a protecção exactamente do
sítio onde vai nascer o código novo.

```sh
ferramentas/divergencia-console.sh            # ficheiros, offline
ferramentas/divergencia-console.sh --ci       # + as linhas, contra o upstream
ferramentas/divergencia-console.sh --reescrever   # a lista só sai daqui
```

🔴 **Os dois números estão no inventário** (`12` ficheiros acrescentados, `400`
linhas alteradas no upstream) e o portão lê-los de lá. Duas métricas e não uma:
um ficheiro **nosso** apaga-se e o fork volta ao upstream; o que impede
sincronizar é **editar** um ficheiro que o upstream tem. 🔴 E o portão **morre**
se não conseguir ler o upstream — um clone sem blobs fazia-o imprimir
`linhas: 0` e dizer `OK`, que é a resposta que se quer ouvir. Está contado em
`equipa/PATCHES-AEGIS.md`, com as quatro coisas que a medição apanhou e que
davam todas verde.

🔴 **A marca que o operador vê é o quarto portão** (`ferramentas/marca.sh --ci`),
e o que ela mede não é estilo: são **cinco sítios que não verificam uns aos
outros** — o `electron-builder.yml` empacota, o `index.html` dá o título da
aba, o `server/brand.ts` serve o que o ecrã mostra, o `app-links.ts` aponta o
About, o `package.json` dá o pacote. 🔴 O `LICENSE_URL` **é** a licença que o
cliente lê, e apontava para o GitHub de outro.

🔴 **E o que estava ligado não era o nome: eram DOIS SERVIDORES.** A conta
Cloud levava email, token e resumo das máquinas para `cloud.openmausbot.com`, e
o companion levava o registo de quem liga o telemóvel para
`accounts.openmausbot.com`. 🔴 A cura é `""` e **não** um endereço
nosso-em-breve: o default de um produto empacotado *é* o de produção, e um
default que aponta para outro continua a funcionar depois de o fork ser
entregue. O `""` desliga, e `--morde` prova que a folha morde.

🔴 **O `OpenCode` é motor NATIVO do upstream** (`server/drivers/acp/opencode-go.ts`,
driver `opencode`, `spawnArgs ["acp"]`), e descobre o catálogo com
`opencode models --verbose`. A integração que o plano tratava como risco de
configuração é código do upstream — e o rótulo que o operador vê é **AIP**,
porque a regra do `CLAUDE.md` da casa é essa.

---

## A regra que dá sentido a tudo

> **Um vertical é dado, nunca código.**

Um domínio de cliente — hotelaria, portaria, contagem, condomínio — é **uma
pasta com um `vertical.yaml`**. Nenhum crate conhece o slug de um vertical, e
nenhum vertical importa outro. **Acrescentar um domínio = acrescentar uma
pasta.** Não há `switch`, não há `case`, não há nada a registar em lado nenhum.

O teste é literalmente um `grep`, e corre no `cargo test`:

```sh
grep -rn hotelaria crates apps --include=*.rs | grep '/src/'   # não devolve nada
```

Isto substitui o `GateDaSeed()` do núcleo anterior — um `switch` **fechado** em
`AegisInstalacao.cs` com a lista de verticais e o mapa vertical→gate escritos à
mão e ligados em runtime a **nada**. Foi ele que produziu o defeito *"Declarar
não implanta"* (14/09/2026): o vertical era aceite e o gate ficava em `0`, sem
nada em vermelho.

---

## Comandos que funcionam

```sh
# 🔴 O alvo da build NÃO é o `target/` do repo nesta máquina: são 20 GB e o
# `C:` encheu (medido a 29/09/2026, 849 MB livres). O `E:` é o disco que a casa
# já reserva para artefactos — dados do Podman, ISO, e agora a build.
#
# Isto não é um `.cargo/config.toml` versionado: um caminho absoluto no repo
# parte o CI, que corre em outro sítio. É ambiente **desta** máquina, e as
# provas e os testes respeitam-no.
export CARGO_TARGET_DIR='E:egis-target'

# 🔴 E o `CARGO_BUILD_JOBS` **já não se exporta**: está em `.cargo/config.toml`,
# versionado. A CI punha `CARGO_BUILD_JOBS: "2"` numa variável de ambiente desde
# o primeiro arranque, e aqui isso vivia só no que alguém se lembrava de
# exportar — com o `reqwest`+`rustls` da face agêntica a entrar, o `rustc`
# morreu com `rustc-LLVM ERROR: out of memory` e `The paging file is too
# small`, que **não parece falta de memória**: parece uma build avariada, e o
# sintoma aponta para o `rustc` e não para a máquina.
#
# 🔴 O `CARGO_TARGET_DIR` **tem** de continuar a ser exportado, e por um motivo
# que o config não resolve: um caminho absoluto parte a CI, que corre noutro
# sítio. A consequência de o esquecer é o `target` nascer no `C:` — medido a
# 29/09/2026, **1,7 GB num build de prova**, com o `C:` a 849 MB. No fim do
# `.cargo/config.toml` há a linha comentada para quem a quiser tornar
# permanente **nesta** máquina; o que impede é a CI, e é por isso que fica à
# mão. 🔴 Antes de qualquer build, confirme:
#     ls -d "$CARGO_TARGET_DIR" 2>/dev/null || echo 'CARGO_TARGET_DIR NAO ESTA POSTA'

export AEGIS_TESTE_BANCO='postgres://aegis:aegis_t1@[::1]:55499/aegis_t1'   # ver §6
export AEGIS_RAIZ_VENDOR="$(cat crates/aegis-license/fixtures/chaves/vendor-teste.pub)"

cargo test --workspace          # 251 provas
cargo clippy --workspace --all-targets   # tem de dar 0
cargo run -p aegis -- --help

# o produto
aegis vertical listar verticals
aegis ilha instalar --vertical verticals/hotelaria --licenca … --chave-oem …
aegis ilha servir   --vertical verticals/hotelaria --porta 8020
aegis ilha estado   --vertical verticals/hotelaria   # sai 3 se não estiver pronto

# a licença, em dois tempos
aegis licenca fingerprint
aegis licenca conferir --vertical … --licenca … --chave-oem …
aegis licenca renovar --licenca <instalada>              # escreve o pedido
aegis licenca renovar <resposta> --licenca … --chave-oem …   # confere e grava

# a documentação, gerada do código
aegis referencia              # escreve docs/REFERENCIA.md
aegis referencia --verificar  # sai 3 se já não bater com o código

# o frontend
cd apps/web && npm install --legacy-peer-deps && npm run dev   # http://localhost:3002
```

🔴 **Os códigos de saída** são `0` feito · `1` falhou · `2` uso inválido ·
`3` **recusado com motivo**. O `3` é separado do `1` porque *"não posso"* e
*"não consegui"* pedem ações diferentes de quem decide o que fazer a seguir. E
quem decide o número é `aegis_produto::Resultado::saida()` — **a única função
do produto que decide um número**, e as três faces usam-na.

---

## Invariantes — não contorne

Cada um existe porque o núcleo anterior pagou por não a ter. A lista completa
com o "porquê" está no `README.md` e no `CLAUDE.md` da raiz; aqui está o que
**quebra** se a violares.

1. **Uma autoridade de schema.** As migrações de `crates/aegis-store/migracoes/`
   são a única fonte, com `sha256` conferido. **Alterar uma migração já aplicada
   é erro.** *(O anterior tinha duas em disputa — `create_all` e o carimbo de
   Alembic — e a frota pagou com `DuplicateColumnError` numa noite.)*

2. **Toda a SQL vive no `aegis-store`.** O `PgPool` não sai do crate, e
   `abrir_tx` é `pub(crate)` — é o **único** caminho a `aegis_objeto` e
   `aegis_aresta`. *(O anterior: 457 de 700 arquivos com `AsyncSession` na mão,
   sem costura — daí o "cada vez que mexo é dias e dias".)*

3. **O isolamento é do banco, e o serviço não o contorna.** `aegis.tenant_id` é
   um GUC de sessão lido por política RLS, e a ilha **serve** com um role
   `NOBYPASSRLS`. 🔴 Isto não é higiene: superuser tem `BYPASSRLS`, e servir com
   o dono é servir sem isolamento nenhum. Foi o que a checagem `@isolamento`
   apanhou na primeira execução.

4. **A licença é conferida antes de qualquer peça.** `ilha instalar` recusa com
   `3` **sem criar uma única tabela**. A raiz do vendor vem do ambiente ou do
   binário — **nunca do ficheiro**; a chave esperada é a raiz, nunca
   `assinatura.por`.

5. **O portão de coação é único.** `Contrato::coagir` é o único lugar onde uma
   propriedade vira tipo, e vem **antes** do SQL.

6. **Erro tem código fechado — e código, frase *e* gesto.** A tela traduz por
   `codigo()` e **nunca** por casamento de texto. 🔴 E o `gesto` não é opcional:
   a casa já pagou por um erro que mandava *"Renovar a licença"* para um gesto
   que não existia, e por um `humano()` que devolvia o texto técnico com o
   caminho dentro em vez da frase.

7. **A casca não decide nada.** A CLI e a janela chamam as mesmas funções e
   recebem o mesmo `Resultado`. Uma CLI com a lógica dentro obriga a GUI a
   reimplementá-la, e nasce o **segundo produto** — a mesma classe do pseudónimo
   em quatro sítios.

8. **Uma ilha corre um produto.** Há um tenant só (`TENANT_DA_ILHA`) e o produto
   vive na coluna `vertical` dele. Dar um tenant a cada produto foi a primeira
   versão, e os produtos conviviam: medido, os tipos do anterior ficaram na
   ilha ao lado dos do novo.

---

## O frontend vive aqui, e o que isso mudou

O `apps/web/` veio do repo `Safe-Core/security-app` (1.406 ficheiros). O
motivo é o mesmo que está no `README.md`: **um produto é um repo**, e o
frontend e aquilo que ele serve mudam juntos.

🔴 **O que a mudança partiu, e o que foi corrigido.** O frontend era
`safe-core/security-app/` e era montado por caminho em **cinco** sítios. Todos
passaram a `aegis/apps/web/`:

| Onde | O que |
|---|---|
| `ontology-module/compose.yaml` | o bind mount `../security-app:/app` |
| `safetag-web/deploy-public-spas.sh` | `${SECURITY_APP_PUBLIC:-…}` — o default mudou, a variável continua a ganhar |
| `safetag-web/sync-to-security-app.sh` | idem |
| `ontology-module/compose.instance.yaml` | um comentário |
| `.github/workflows/frota-release.yml` (raiz da casa) | um comentário |

🔴 **E o workflow do frontend mudou de sítio e de tag.** O GitHub **só lê**
`.github/workflows/` na raiz do repo — um workflow aninhado em `apps/web/` é
inerte, e é a mesma armadilha do `.github/` que a casa já pagou. Passou para
`.github/workflows/web-imagem.yml`, com `context: apps/web`.

E a tag passou de `v*` para **`web-v*`**: no repo antigo `v*` não era de
ninguém, e agora seria um espaço disputado entre o frontend e o núcleo. É a
mesma razão pela qual a casa usa `desktop-v` e `bridge-v` — **a tag é o
namespace do produto**.

⚠️ **Uma tag `v*` que já exista no `Safe-Core/security-app` continua lá.** O
workflow novo só apanha `web-v*`; é preciso reemitir a tag no repo certo, ou
lançar pela primeira vez com o namespace novo. Decide-se quando houver a
primeira release do frontend neste repo.

---

## Documentação: gerada, e verificada

A queixa que motivou isto — *"documentação densa, mal atualizada"* — não se
cura com escrever melhor. Cura-se com fazer a documentação **não poder divergir**
do produto.

- **`docs/REFERENCIA.md`** é gerada por `aegis referencia`: a árvore de
  comandos sai do `clap`, o vocabulário de recusa (46 motivos em 4 famílias)
  sai dos próprios enums, e a tabela dos crates traz o que cada um **não** faz.
- **`aegis referencia --verificar`** sai com `3` quando o ficheiro já não bate
  com o código. Corre no `cargo test` **e** no CI — em dois sítios, de propósito.
- **O resto do texto vive ao lado do código**: as decisões estão nas `doc` dos
  crates e no `README.md`, e a explicação de um artefacto gerado vai para o
  `LEIA-ME.md` ao lado (é o que impede que o `vertical.yaml`, que é gerado,
  perca comentários a cada guardado).

🔴 **A fraqueza, dita:** cada enum de recusa ganha um `todos()` escrito à mão ao
lado de si, e **o compilador não o liga ao enum**. O que se apanha é código
repetido, frase vazia, gesto vazio e lista a esvaziar; o que **não** se apanha
é um motivo que ficou de fora da lista.

---

## Documentação do produto: `mdBook`

O livro navegável sai de `book.toml` + `src/`, e **consome os mesmos ficheiros
Markdown que já estão no repo** — `README.md`, `docs/REFERENCIA.md`, os
`LEIA-ME.md`. 🔴 É este o ponto: uma plataforma de documentação só não dá
retrabalho se **ler os ficheiros do repo**. Uma que guarde o texto na plataforma
reintroduz exactamente a divergência que a referência gerada acabou de matar.

```sh
bash ferramentas/prova-docs.sh      # constrói e confirma que não há link partido
```

O livro é **estático** e a ilha serve-o pelo mesmo `axum` que serve a tela.
Não há CDN, não há analytics, não há conta — e a documentação de um cliente sem
internet é a mesma que a de quem tem.

---

## Pegadinhas (sintoma → causa → o que fazer)

A lista completa está na skill `aegis` (§6), na raiz da casa. As que são
**deste** repo:

- 🔴 **`AEGIS_TESTE_BANCO` recusado com o banco de pé.** No Windows o
  reencaminhamento de portas do Podman cai às vezes **só no IPv6**:
  `netstat -ano | findstr 55499` mostra `TCP [::1]:55499 ... LISTENING`. A URL
  tem de ser `postgres://…@[::1]:55499/…`. O erro do `sqlx` **não diz isto** —
  vem *"pool timed out"*. A guarda `esta_suite_precisa_de_um_banco` já imprime o
  diagnóstico.

- 🔴 **Um caminho relativo ao CWD numa prova de integração.** O CWD é a pasta
  do crate, não a raiz do repo. Já mordeu **duas** vezes
  (`um_produto.rs` e `referencia.rs`) e o sintoma é sempre o mesmo: *"a prova
  falha e o ficheiro está certo"*.

- 🔴 **Um verbo `?` em falta.** Uma validação cujo resultado se deita fora
  **não roda**, e o compilador só avisa. Quatro provas passavam a aceitar
  manifestos com arestas para o vazio. **Por isso `clippy` é gate, não
  decoração** — e `-D warnings` no CI.

- 🔴 **Um `.env` no contexto de build do frontend** faria o Next inlinar o
  `NEXT_PUBLIC_*` na imagem, e ela voltaria a ser uma imagem por cliente. O
  `Dockerfile` recusa; o `.gitignore` do repo também.

- 🔴 **`.env.local` é da máquina, nunca do repo.** O `apps/web/.env.local` tem o
  `NEXT_PUBLIC_*_API_URL` de cada instalação.

- 🔴 **`npm install --legacy-peer-deps`** é obrigatório no frontend (React 19 +
  Radix). Sem a flag, o install falha por conflitos de peer.

- 🔴 **O `target/` são 20 GB e o `C:` encheu.** Compilar aqui sem
  `CARGO_TARGET_DIR` acaba em `There is not enough space on the disk (os error
  112)`, e a mensagem **não diz que é o disco** — parece uma falha de build.
  E o que se estraga é o frontend que veio agora para aqui: `node_modules` são
  934 MB e `.next` 1,7 GB.

- 🔴 **Uma prova que mexe no ambiente parte as outras, e o sintoma aponta para
  a função.** `set_var`/`remove_var` são globais ao **processo**, e o
  `cargo test` corre as provas em **fios** desse processo: duas provas que
  tocam a mesma variável escrevem no mesmo sítio ao mesmo tempo.
  Medido a 30/09/2026: `a_funcao_e_a_variavel` reprovava com *"a função e a
  variável discordam"*, e a função estava certa — a causa era a ordem.
  `--test-threads=1` **não** é a cura (faz passar sem deixar de estar errado);
  a cura é a prova **deixar de exigir que o ambiente esteja calmo**, e medido:
  `ferramentas/prova-estavel.sh 40` = 40 corridas verdes em paralelo.
  🔴 E a guarda do alfabeto é o que apanhou dois caracteres chineses **que eu
  escrevi numa frase em português** — e o ficheiro era `.sh`, no meio do
  `ferramentas/`.

- 🔴 **O `postinstall` corre `scripts/link-cesium.mjs`**, que liga o build do
  Cesium em `public/cesium`. **Não apague esse link.**

---

## Quando acaba

Cada tijolo tem um critério de *"isto substitui o antigo"*, e **o antigo só sai
quando o novo provou**. O que está feito e o que não está está na tabela do
`README.md`.
