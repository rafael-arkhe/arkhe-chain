# AEGIS

O núcleo do AEGIS, reconstruído em Rust, **tijolo por tijolo**.

> **Estado: tijolo 1 (vertical de prova) — PROVADO em 28/09/2026.**
> Um vertical novo, do zero, em **1 segundo**: banco criado, contrato
> aplicado, 10 instâncias gravadas, `/health/ready` a `200`, tela no ar.
> **Tijolos 1, 2 e 3 fechados**; tijolo 4 com as duas faces prontas (28/09/2026)
> e o **teste ácido da portaria** fechado a 29/09/2026 — o vertical que está no
> campo, convertido de 1.015 linhas de Python para 158 de manifesto. 181 provas
> verdes, 0 avisos de clippy.

---

## A regra que dá sentido a tudo

> **Um vertical é dado, nunca código.**

Um domínio de cliente — hotelaria, portaria, contagem, condomínio — é **uma
pasta com um `vertical.yaml`**. Nenhum crate deste repositório conhece o slug
de um vertical, e nenhum vertical importa outro. **Acrescentar um domínio =
acrescentar uma pasta.** Não há `switch`, não há `case`, não há nada a
registrar em lado nenhum.

Isto substitui uma coisa concreta: o `GateDaSeed()` do núcleo anterior, um
`switch` **fechado** em `AegisInstalacao.cs` com a lista de verticais, os
gates de seed e o mapa vertical→gate escritos à mão e ligados em runtime a
**nada**. Foi ele que produziu o defeito *"Declarar não implanta"* (14/09/2026):
o vertical era aceite e o gate ficava em `0`, sem nada em vermelho.

O teste disso é literalmente um `grep`, e está no fim deste ficheiro.

---

## Mapa

```
aegis/
├── crates/
│   ├── aegis-ambiente/   O ambiente, lido num sítio só — crate folha
│   ├── aegis-ponte/      As câmaras: o modelo, os nomes, a lista
│   ├── aegis-vertical/   O manifesto: esquema, loader, validação
│   ├── aegis-ontology/   O contrato derivado + o portão de coação
│   ├── aegis-identity/   Pseudónimo, papéis e escopo — regras puras
│   ├── aegis-license/    A cadeia de licença, do emissor que existe
│   ├── aegis-pagina/     O formato da página + a montagem que escreve o vertical
│   ├── aegis-produto/    As operações do produto, como biblioteca
│   ├── aegis-store/      Postgres: pool, RLS, migrações, repositório
│   └── aegis-island/     HTTP, /health, /health/ready, a tela
├── apps/
│   ├── bin/              `aegis` — a casca (linha de comandos)
│   ├── gui/              `aegis-gui` — a janela (Tauri), a MESMA biblioteca
│   └── web/              O frontend Next.js (veio do repo `Safe-Core/security-app`)
├── verticals/
│   ├── hotelaria/        O vertical de prova
│   └── portaria-acesso/  O vertical que está NO CAMPO
└── book.toml + src/      O livro (mdBook), que lê os ficheiros deste repo
```

| crate | o que é | o que **não** é |
|---|---|---|
| `aegis-ambiente` | Banco, raiz do vendor, interpretador, máquina, pasta de dados | **Folha** — não conhece ninguém |
| `aegis-ponte` | As câmaras: nome normalizado, `cameras.txt`, links RTSP/HLS | Não fala com o `go2rtc` — é o modelo, e a regra |
| `aegis-vertical` | Lê e valida o `vertical.yaml` | Não conhece banco, rede ou ilha |
| `aegis-ontology` | O contrato e a coação de uma instância | Não conhece nenhum vertical |
| `aegis-identity` | Pseudónimo, papéis e escopo | **Puro** — não toca em banco nem em rede |
| `aegis-license` | Raiz do vendor → Chave OEM → licença | **Não assina** — nenhuma chave privada entra no núcleo |
| `aegis-pagina` | O formato da página, e a `Montagem` que **grava o `vertical.yaml`** | Não sabe renderizar nem falar de HTTP |
| `aegis-produto` | As operações do produto, com `Resultado` estruturado | Não sabe imprimir — é isso que a torna partilhável |
| `aegis-store` | **Toda** a SQL do sistema | O `PgPool` não sai daqui |
| `aegis-island` | HTTP e a API do produto | Não escreve SQL |
| `apps/bin` | A casca da linha de comandos | Não conhece regra de produto — chama a biblioteca |
| `apps/gui` | A janela (Tauri) | Não conhece regra de produto — chama a biblioteca |

---

## Correr

```sh
# 1. Um Postgres
podman run -d --name aegis-pg -p 55499:5432 \
  -e POSTGRES_USER=aegis -e POSTGRES_PASSWORD=aegis_t1 -e POSTGRES_DB=aegis_t1 \
  docker.io/library/postgres:17-alpine

# 2. A licença — a raiz é a do VENDOR e nunca vem do ficheiro
export AEGIS_BANCO='postgres://aegis:aegis_t1@127.0.0.1:55499/aegis_t1'
export AEGIS_RAIZ_VENDOR="$(cat crates/aegis-license/fixtures/chaves/vendor-teste.pub)"

# 3. A ilha
cargo run -p aegis -- ilha servir   --vertical verticals/hotelaria   --licenca crates/aegis-license/fixtures/licenca-desta-maquina.json   --chave-oem crates/aegis-license/fixtures/chave-oem.json   --porta 8020

# 3. A tela
#    http://127.0.0.1:8020
```

Outros comandos:

```sh
aegis vertical listar verticals          # o catálogo
aegis vertical ver verticals/hotelaria   # o manifesto, em JSON
aegis licenca fingerprint                # o fingerprint desta máquina
aegis ilha instalar --vertical … --licenca … --chave-oem …   # idempotente
aegis ilha estado   --vertical …         # sai com 3 se não estiver pronto
```

Códigos de saída: `0` feito · `1` falhou · `2` uso inválido ·
`3` **recusado com motivo**. O `3` é separado do `1` porque *"não posso"* e
*"não consegui"* pedem ações diferentes de quem decide o que fazer a seguir.

---

## Provar

```sh
# 183 provas: manifesto, página, coação, identidade, licença, renovação, ilha,
# produto, vocabulário, referência, as três faces, 20 contra o Postgres real
cargo test --workspace

# As 20 de integração só correm com o banco a apontar. Sem isto, dizem
# SKIP — e SKIP é inconclusivo, nunca verde.
export AEGIS_TESTE_BANCO='postgres://aegis:aegis_t1@127.0.0.1:55499/aegis_t1'
cargo test -p aegis-store --test integracao

cargo clippy --workspace --all-targets   # tem de dar 0
```

🔴 **No Windows, o `127.0.0.1` acima pode estar recusado com o banco de pé.**
O reencaminhamento de portas do Podman cai às vezes **só no IPv6**:
`netstat -ano | findstr 55499` mostra `TCP [::1]:55499 ... LISTENING`. Nesse
caso a URL é `postgres://aegis:aegis_t1@[::1]:55499/aegis_t1`. O erro do
`sqlx` **não diz isto** — vem *"pool timed out"*. A guarda
`esta_suite_precisa_de_um_banco` liga antes de correr e imprime o
diagnóstico por esta ordem.

---

## A referência: documentação que não pode divergir

> A queixa nº2 — *"documentação densa, mal atualizada"* — não se cura com
> escrever melhor. Cura-se com fazer a documentação **não poder divergir** do
> produto.

```sh
aegis referencia                             # escreve docs/REFERENCIA.md
aegis referencia --verificar                 # sai com 3 se já não bater
```

O que sai de lá:

- **A árvore de comandos**, introspeccionada do próprio `clap` — a mesma
  estrutura que responde ao `--help`. Não há lista escrita à mão, e portanto
  não pode haver um comando no programa que não esteja lá.
- **O vocabulário de recusa inteiro** — 46 motivos em 4 famílias, com o
  código, a frase e o gesto de cada um, vindos dos próprios enums.
- **Os códigos de saída**, e **os crates com o que cada um não faz**.

🔴 **E a guarda que a faz valer.** Um ficheiro gerado que ninguém regenera é a
mesma queixa noutra forma: passa a descrever um produto que não existe, e
**parece** a verdade. `--verificar` sai com `3` — recusa, não falha — e há
uma prova que o corre no `cargo test` e um passo no CI. Verifiquei que morde:
reescrevi **uma frase** de um motivo e a referência passou a recusar.

E foi ela que pagou o custo de ser útil logo no primeiro minuto:

| O que a referência expôs | O que era |
|---|---|
| `--chave_oem` em vez de `--chave-oem` | O gerador imprimia o `id` do `clap` em vez do nome da flag — **comandos que não correm** |
| 13 opções com célula vazia | Opções sem `--help`, invisíveis até haver quem as listasse |
| `ErroPagina` e `ErroMontagem` sem `gesto()` | A regra é *código, frase **e gesto***; sem gesto, a tela deixa o operador sem acção |
| `ErroMontagem::humano()` a devolver `self.to_string()` | A tela mostrava o texto técnico com o caminho dentro, em vez da frase |

🔴 **A fraqueza, dita na própria referência:** cada enum ganha um `todos()`
escrito à mão ao lado de si, e **o compilador não o liga ao enum**. Um motivo
novo entra no `match` e fica de fora da lista. O que se apanha é o resto —
código repetido, frase vazia, gesto vazio, lista a esvaziar; o que **não** se
apanha é um motivo ausente, e apanha-o a pessoa que abre a referência à
procura dele.


### A prova pelo negativo

A regra do repo é testável com um `grep`, e o `grep` é a prova:

```sh
grep -rn hotelaria crates apps --include=*.rs | grep '/src/'
# não devolve nada
```

O slug de um vertical **não pode** aparecer no código de produção. Nos
ficheiros de teste aparece, e tem de aparecer: é a lista de slugs que o
guarda **proíbe**.

---

## As sete regras estruturais

Cada uma existe porque o núcleo anterior pagava por não a ter.

1. **Uma autoridade de schema.** As migrações de `aegis-store/migracoes/` são
   a única fonte, com `sha256` conferido. Alterar uma migração depois de
   aplicada é **erro**. *(O anterior tinha duas em disputa — `create_all` e o
   carimbo de Alembic — e a frota pagou com `DuplicateColumnError` numa
   noite.)*

2. **Toda a SQL vive no `aegis-store`.** O `PgPool` não sai do crate. *(O
   anterior: 457 de 700 arquivos com `AsyncSession` na mão, sem costura —
   daí "cada vez que mexo é dias e dias".)*

3. **O isolamento é do banco, e o serviço não o contorna.** `aegis.tenant_id` é
   um GUC de sessão lido por política RLS, e a ilha **serve** com um role
   `NOBYPASSRLS` — o dono só migra. 🔴 Isto não é higiene: servir com o dono é
   servir sem isolamento nenhum, porque superuser tem `BYPASSRLS`. Foi o que a
   checagem `@isolamento` apanhou na primeira execução, e numa ilha de um só
   tenant era invisível.

4. **A licença é conferida antes de qualquer peça.** `aegis ilha instalar` recusa
   com `3` **sem criar uma única tabela** quando a licença não bate. A raiz do
   vendor vem do ambiente ou do binário — nunca do ficheiro.

5. **O portão de coação é único.** `Contrato::coagir` é o único lugar onde uma
   propriedade vira tipo, e vem **antes** do SQL. *(No anterior o tipo era
   garantido nos handlers e não no modelo, com pelo menos três caminhos de
   escrita sem coação nenhuma.)*

6. **Um vocabulário de config — e ele é o `aegis-ambiente`.** Um lugar para
   ler banco, raiz do vendor, interpretador e máquina. Nenhum segundo
   interpretador. *(🔴 Esta regra esteve muito tempo escrita no README e
   **ausente do código**: as variáveis eram lidas em cinco sítios por quatro
   crates, e `AEGIS_RAIZ_VENDOR` em **dois** — a regra da raiz do vendor em
   duas versões, que é a que mais dói quando diverge. O crate folha e a guarda
   `nenhuma_variavel_de_ambiente_e_lida_fora_do_ambiente` fecham-na.)*

7. **Erro tem código fechado.** A tela traduz por `codigo()` e **nunca** por
   casamento de texto: casar dentro da frase quebraria no dia em que a frase
   fosse reescrita, e passaria a dizer outra coisa que a medição não disse.

### E a licença se prova contra o emissor, não contra ela própria

Os fixtures em `crates/aegis-license/fixtures/` são **emitidos pelo
`aegis-cli`** (`ferramentas/gerar-fixtures.mjs`). A prova não é um teste da
forma canónica: é o Node ter assinado e o Rust **conferir** — o que só
acontece se a forma canónica for byte a byte igual.

As chaves dos fixtures são de **teste** e estão publicadas de propósito: um
fixture assinado pela raiz de produção seria uma licença válida na máquina de
um cliente. A prova `a_raiz_de_teste_nao_é_a_de_producao` diz que são mesmo
raízes diferentes.

## Um produto, duas faces

O `aegis` é um binário sem runtime, e a **casca não decide nada**: cada comando
chama [`aegis_produto`](crates/aegis-produto/src/lib.rs), recebe um
[`Resultado`](crates/aegis-produto/src/lib.rs) e imprime-o. O código de saída vem
de `Resultado::saida()` — **a única função do produto que decide um número**.

Isso é o que impede a GUI de ser um segundo produto. Uma CLI com a lógica
dentro obriga a janela a reimplementá-la, e a divergência aparece quando alguém
já mandou um cliente instalar por uma delas — a mesma classe do pseudónimo em
quatro sítios.

E a propriedade é **provada**, não afirmada. `apps/bin/tests/um_produto.rs` chama
a biblioteca, corre o binário com os mesmos argumentos, e compara os códigos —
inclusive no caminho da **recusa**, que é onde a diferença custaria mais.
`apps/gui/src-tauri/tests/tres_faces.rs` faz o mesmo pela terceira face.

### A janela

`apps/gui` é Tauri sobre a **mesma** biblioteca. Ela acrescenta o que o
terminal não tem — o **motivo** e o **gesto** lado a lado, sem o código de
processo pelo meio — e é por isso que `Resultado` traz os dois em vez de uma
frase só. O trabalho longo vai para uma thread dedicada, para a instalação
não congelar a interface.

A janela é uma página só, sem `npm`, sem bundle: é o que a casa precisa numa
máquina de campo com o resto fechado.

### E o `/health` não é o gate

`/health` responde `200` quando o processo acorda. **`/health/ready` é o
gate**: exige banco **e** tenant ativo **e** o marcador do seed na versão que
o manifesto pede. Foi medido no núcleo anterior que a ilha subia, o
`/health` devolvia `200`, e o primeiro acesso não funcionava — nada em
vermelho.

---

## A renovação: o gesto que a recusa mandava fazer e não existia

A recusa `licenca.expirada` diz ao operador **"Renovar a licença"**. Antes de
29/09/2026 não havia caminho nenhum para renovar — e um erro que aponta para
uma ação inexistente é pior do que um "erro", porque o "erro" pelo menos
admite que ninguém sabe.

O gesto é o **mesmo request/response da ativação**, em dois tempos, porque o
problema é o mesmo: a licença vence e a máquina de campo pode nunca ter
falado com a nuvem.

```sh
aegis licenca renovar --licenca <a-licenca-instalada>
#   escreve pedido-renovacao.json AO LADO da licença. Mande a quem emite.

aegis licenca renovar <resposta> --licenca <…> --chave-oem <…>
#   confere a cadeia e grava a licença de dentro.
```

### O envelope não pode virar estoque

A resposta sai do PC de quem emite e viaja por pendrive, e-mail ou WhatsApp.
Sem amarras, um envelope capturado renovaria licença para sempre — e revogação
não significaria nada. São seis, e cada uma fecha o que as outras não fecham:

| # | Amarra | O que fecha |
|---|---|---|
| 1 | o **nonce** (`pedido_id`) | uma resposta só vale para o pedido que responde. É o que invalida as respostas velhas no instante em que se tira um pedido novo |
| 2 | a **janela** (72 h) | vencida, não revive |
| 3 | o **node-lock do envelope** | resposta de outra máquina é recusada aqui, e não lá na emissão |
| 4 | a **cadeia inteira** da licença de dentro | não há "versão rápida" do gate |
| 5 | o **`licenca_id` inalterado** | renovação não é instância nova — senão a cota do parceiro conta caixas que não existem |
| 6 | o **não-encurta** | responder duas vezes ao mesmo pedido é um downgrade |

E o pedido pendente **não é apagado** ao aplicar: ele *é* a memória de qual
pedido está vivo.

🔴 **O que o pedido pendente NÃO faz** — e a primeira versão desta secção
dizia que fazia. Medido contra o binário: **reaplicar a mesma resposta volta a
escrever a mesma licença e sai com `0`**. O pedido não é consumido, e
consumi-lo tinha um custo — se a escrita falhasse depois de o consumir, o
técnico ficava sem caminho nenhum.

A garantia contra o replay é o **não-encurta**, e ela mede contra o documento
que está **no disco**, que é a única coisa contra a qual reaplicar uma
resposta antiga tentaria derrubar o que a ilha tem. O nonce fecha o resto: uma
resposta de **outro** pedido não entra.

### Duas coisas que só a prova apanhou

**O que se grava é a licença de dentro, nunca o ficheiro recebido.** A
resposta é um envelope `tipo: resposta` com a licença aninhada; copiar o
ficheiro tal e qual punha `tipo: resposta` no lugar da licença, e o
verificador leria um documento que não é licença — sem `expira_em` no payload.
É uma asserção no teste, não uma nota.

**A ordem das conferências é a defesa.** Um envelope forjado tem de sair por
`licenca.assinatura` e não por um dos motivos da renovação — senão o técnico
culpa o emissor por um ficheiro que alguém fabricou. E uma licença que
encurta *e já venceu* sai por `licenca.expirada`, que é a ordem certa: o gesto
que daí decorre ("renovar") leva a um pedido novo, e o que vier desse pedido
é do emissor.

### A prova

18 provas, e os fixtures são **assinados pelo `aegis-cli`** — o emissor de
verdade. Cada motivo de recusa tem a sua fixture, e nenhuma é a mesma
resposta com a data trocada: é isso que distingue "a regra existe" de "a
regra existe **e esta é a que disparou**".

---

## O construtor: uma página nasce sem Python

O `vertical.yaml` é um **artefacto gerado** — a primeira linha do ficheiro
diz isso, e a explicação do produto vive no `LEIA-ME.md` ao lado. Um YAML que
vai e volta por uma estrutura perde comentários, e perdê-los a cada guardado
tornaria o ficheiro pior a cada uso, sem ninguém dar por isso.

O caminho, medido:

```
GET  /construtor/<slug>          o editor: os blocos montados, e os tipos
POST /construtor/<slug>          acrescenta um bloco (formulário, sem JS)
  └─► Montagem::gravar()         valida ANTES, escreve páginas + manifesto
GET  /p/<slug>                   a tela, com os dados do tenant
```

A gravação do editor é **a mesma** do produto — `Montagem::gravar`, a mesma
função que confirma antes de escrever. Um editor com escrita própria é a forma
mais direta de editor e produto divergirem, e ninguém vê.

### A prova

```sh
sh ferramentas/prova-construtor.sh
#   OK  antes=404  gravar=303  depois=200  linhas=2  reinstala=sim
#   (o repositório não foi tocado: a prova correu numa cópia)
```

A prova corre contra uma **cópia** do vertical, nunca contra o repositório — e
isso não é preciosismo: duas vezes um `git checkout` de limpeza reverteu a
correção do vocabulário da página **depois** de ela estar feita e verificada, e
o commit gravou a versão partida. Uma prova que mexe na coisa que prova é uma
fonte de corrupção.

E o detalhe que fecha o ciclo: **`/p/<slug>` relê o manifesto do disco.** Sem
isso, guardar no editor só mudava a tela depois de reiniciar a ilha — e o
operador vê "guardei" e não vê nada, que é o sintoma que faz um construtor
parecer partido.

E há uma guarda que torna isto durável: `cargo test` carrega e valida **toda a
página de todo o vertical**. Um `objectSet` em vez de `object_set` — que é
exatamente o que aconteceu — deixa de ser um 404 numa tela de cliente e passa a
ser um teste vermelho.

## O teste ácido: a portaria

O tijolo 1 provou um vertical que **ninguém nunca usou**. Isso prova o
caminho; não prova que o caminho serve um produto real. Então o vertical que
**está no campo** — `portaria-acesso`, o controle de acesso por LPR — foi
convertido de `seed_portaria_acesso.py` (1.015 linhas de Python) para um
manifesto de 158 linhas, e instalado a sério.

A conta é boa. O que o teste **achou** é que vale mais.

### O produto sabia demais sobre os outros

A seed passava a vida a **aposar as páginas do vertical anterior**, e para
saber o que tinha de aposar **importava as seeds dos outros** — literalmente,
`from app.utils import seed_contagem_sacos as contagem`, para ir buscar slugs
de página. O comentário do próprio código admite o risco, e a justificação
dele é a confissão:

> *"deriving beats listing"* — e a derivação **era** o import.

Um produto que lê o código de outro deixa de ser um produto e passa a ser um
grafo de dependências entre produtos. Trocar a ordem de instalação muda o
resultado, e ninguém descobre até a tela abrir errada — na casa de um
cliente.

E a própria seed, nas suas próprias 1.015 linhas, descreve o sintoma que a
regra provoca: *"o cliente abriria o produto da contagem dentro da guarita"*.

A cura é responder à pergunta certa: **de quem é a culpa?** Não é do produto
novo — é da **instalação**. Os tipos que o manifesto declara são seus; tudo o
resto pertence a quem saiu. O produto nunca menciona o anterior, nem pelo
nome, e por isso não há nada a manter em sincronia.

### A tela da guarita ia deixar de ser ao vivo

As páginas da seed tinham `refresh_seconds: 15` — o "ao vivo" da guarita. O
formato de página do núcleo novo **não tinha campo para isso**. Teria ficado
fora sem ninguém dar por isso, e a única pista seria um operador a dizer que
a tela deixou de atualizar.

`refresh_segundos` e `icone_nav` entraram no formato, e `0` é **recusado**:
zero não é "sem refresh", é um pedido de atualização a cada zero segundos, e
uma página que pede isso nunca mais responde.

### Eu tinha um tenant por produto, e eles conviviam

Este é o achado que humilha. Na troca medida — portaria instalada, hotelaria
por cima — os tipos do produto anterior **ficaram na ilha ao lado dos do
novo**. Um `select` na basevia, e lá estavam a `camera` e o `local` da guarita
ao lado do `hospede` e do `quarto` do hotel.

É literalmente o bug que a docstring da seed descreve, e eu tê-lo
reproduzido na reconstrução, ao alto, é a prova de que o teste ácido valia a
pena. A correção é que **uma ilha corre um produto**: há um tenant só
(`TENANT_DA_ILHA`) e o produto vive na coluna `vertical` dele.

```
antes:   tenant ilha -> portaria-acesso   camera, local, unidade
depois:  tenant ilha -> hotelaria         hospede, quarto, reserva, unidade
         aposados: 2   tenants: 1

licença da hotelaria NAO instala a portaria  ->  [licenca.seed-uso]
```

A última linha é a regra da licença provada **duas vezes numa**: mesma
máquina, mesmo parceiro, mesma Chave OEM — e a licença de um produto não abre
outro. A recusa diz `licenca.seed-uso`, que é o motivo certo, e não "erro".

### O que este teste ainda não prova

Está escrito para não se fingir: os dois verticais são de **demonstração**.
Nada disto diz que a garantia de um produto real sobrevive a um carregamento
de dados de campo, a uma migração de um vertical com histórico, nem a uma
licença que o parceiro emissor real emite. São os tijolos seguintes.

---

## O tijolo 1, em detalhe

**O provador é `hotelaria`** — hoje uma seed de 380 linhas, deliberadamente
fora do Bridge "até ciclo funcional completo". É real, é barata e nunca foi
entregue. Contagem e Portaria já rodam: usá-las provaria que o caminho novo
reproduz o que já existe, o que não é a mesma coisa.

**O que entra:** o manifesto, o contrato, a migração, o tenant, o catálogo, a
API e a tela. **O que não entra:** Tauri, CLI completa, multi-tenant, AIP,
marketplace. É um vertical inteiro, do zero, e nada mais.

**A régua:** do zero ao cliente, em menos de um dia. Medido: **1 segundo**.

**O que este tijolo não prova, e está escrito para não se fingir:** o
`grep` garante que o slug não está no código, mas não garante que a página é
bonita, nem que a instalação numa máquina Windows limpa funciona, nem que o
licenciamento node-locked está certo. Isso são os tijolos seguintes, e cada
um com a sua prova.

---

## O que vem a seguir

| tijolo | entrega |
|---|---|
| 2 | ✅ **Fechado** — `aegis-identity` (pseudônimo, papéis e escopo) e `aegis-license` (a cadeia completa). Três regras que viviam em 4 lugares e 3 linguagens passam a uma cada |
| 3 | ✅ **Fechado** — a página é um contrato com round-trip, a ilha desenha-a, e o Construtor **regenera o `vertical.yaml`** a partir do que foi montado |
| 4 | 🔶 **As duas faces feitas e provadas** — `aegis-produto` (biblioteca) + `apps/bin` (casca) + `apps/gui` (janela Tauri). Falta a parte de **frota** (o produto gerir a frota de ilhas) |
| 5 | Repo e docs: um dono por crate, doc gerada do código |
| 6 | AIP/DAG/agentes ganham caminho padrão **ou saem do repo** |

Cada tijolo tem um critério de *"isto substitui o antigo"*, e o antigo só sai
quando o novo provou. **Produção está congelada** — nada do que está no ar
(OuroVille, LPR, `aegis-desktop`, `aegis-bridge`) é tocado.
