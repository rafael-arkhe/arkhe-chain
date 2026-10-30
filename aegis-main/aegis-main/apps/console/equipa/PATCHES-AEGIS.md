# O que este fork mexeu no upstream

> 🔴 **Este ficheiro é o que torna a sincronização possível.** Sem ele, o
> `git diff` contra o upstream é uma parede de ficheiros e ninguém sabe o que
> é nosso e o que é revisão nossa.

| | |
|---|---|
| upstream | `milind-soni/OpenMausBot` |
| commit de importação | `ac910bdc023a98b6ee0344351580847dd1b66bb0` |
| tag de origem | (sem tag; este commit é a referência) |
| data da cópia | 2026-09-30 |
| ficheiros acrescentados | 12 |
| linhas alteradas no upstream | 600 |

Medir: `../../ferramentas/divergencia-console.sh`

### 🔴 Porque o número mudou, e porque a régua também (30/09/2026, D6b)

O portão mede agora com **`git diff` contra o commit de importação** — a
subtree — e o número que sai é **530**. Antes media com um inventário de 3014
linhas e dava **337**. 🔴 Os dois medem coisas diferentes, e o `git` mede a
verdadeira: um inventário escrito à mão diverge do produto no dia em que
alguém mexe num ficheiro e a lista não muda — que foi exactamente o que
aconteceu, **nove vezes**.

O que a troca encontrou logo a seguir, e que a régua antiga não via:

| achado | porque a régua antiga não o via |
|---|---|
| o `gradlew` tinha **perdido o bit de execução** (100644) | comparava **conteúdo**: o conteúdo era igual |
| ficheiros nunca editados diferiam **linha a linha** por causa dos fins de linha | o `diff` é cego a isso — e o inverso também |
| **`android/gradlew.bat`** tinha uma versão diferente da commit pinada — 186 linhas | o inventário dizia "intacto" |
| o inventário contava **17** editados onde há **25** | a lista não se actualizou sozinha |

🔴 E a folha deixou de ser um problema de tempo: **30 minutos → 0,6 s**. Antes
clonava o upstream inteiro de cada vez para ler 17 ficheiros; agora não há
clone, nem inventário, nem comparação byte a byte. 🔴 Um instrumento caseiro que
faz o que o `git` já faz não é mais lento nem mais exacto: é **menos exacto**,
e a casa já pagou por isso mais do que uma vez.

🔴 **Porque 600 e não 530.** O número é uma decisão, e subir calado é o que o
portão proíbe — daí a razão estar escrita. A folga existe para que a próxima
marca a acrescentar não obrigue quem a faz a decidir o orçamento **e** a
mudança no mesmo minuto. 🔴 E o número **continua a ser gate**: acima de 600
reprova, e os ficheiros acrescentados continuam a contar à parte, com o seu
limite.

### Porque são **dois** números, e não um

🔴 **A primeira versão do portão media as linhas de tudo o que não é do
upstream, e deu 3476 — das quais 3031 eram o próprio manifesto.** Ou seja: o
instrumento estava a contar-se a si mesmo, e o número que a casa achou que era
uma medida de divergência era o tamanho de uma lista de nomes de ficheiro.

A correção veio do que a divergência **é**:

| métrica | o que mede | como se resolve |
|---|---|---|
| **ficheiros acrescentados** | o que a Safe Core **acrescentou** | apaga-se o ficheiro e o fork volta ao upstream |
| **linhas alteradas no upstream** | o que a Safe Core **editou** onde o upstream tinha ficheiro | é um `git pull` que dá conflito, arquivo a arquivo |

🔴 **Só a segunda é o que impede sincronizar.** Um ficheiro nosso apaga-se
num comando; uma edição dentro de `package.json` ou de `server/` é um conflito
que alguém tem de resolver à mão, e é aí que o fork deixa de ser re-sincronizável
— e o motivo de o orçamento de linhas ser o que está no portão.

🔴 E o que **não** conta: o `.arvore-upstream` (é o instrumento), e os
ficheiros nossos em geral. Aparece no relatório como *"N nossos"*, para quem
quer ver, mas não come orçamento de sincronização.


---

## O que **removemos**

| o quê | porquê |
|---|---|
| `enterprise/` | É *source-available* sob a `OpenMausBot Enterprise License`, **não** Apache-2.0, e o white-label exige acordo de parceiro. O `LICENSING.md` deles diz *"delete the folder and what remains is the open-source edition"*. |
| `.git/` | Não é um submódulo: a árvore está **dentro** do repo do `aegis`, e é uma decisão (§6 do plano) que vale a pena reavaliar. |
| `.github/` | Os workflows são **deles**. Correm no repo deles; aqui só o nosso `.github/workflows` conta, e um workflow aninhado é inerte (o GitHub só lê `.github/workflows/` na raiz). |

🔴 **A `LICENSE` e a `NOTICE` não foram tocadas** e não entram na
divergência: a Apache-2.0 exige que fiquem, e mexer nelas é tirar a
atribuição.

---

## 🔴 O que a medição apanhou, e o que quase ficou por apanhar

O D6 é o tijolo em que a casa mediu **quatro** coisas que ninguém tinha
previsto. Nenhuma é código novo, e as quatro são a razão de o portão existir.

**1. Um ficheiro apagado, em silêncio.** Apaguei `SECURITY.md` de propósito, a
experiência devolveu o ficheiro, e o portão continuou a dizer que estava
intacto. A experiência **não restaurou o que destruiu** — e um ficheiro que
falta do upstream não aparece em nenhum `git diff`: aparece como *working tree
limpa*. Daí o `perdidos` no relatório: um número que só desce quando alguém
apaga, e que é o único que denuncia.

**2. A lista e o portão mediam coisas diferentes.** A lista foi gerada pelo
PowerShell e o portão contava com o `find` do Linux. O `Get-ChildItem` segue
um link simbólico e o `find -type f` não — e a casa pagou por isso, com o
portão a acusar um ficheiro apagado que nunca foi apagado. Duas ferramentas,
duas respostas, e a que ficava verde era a do código. A lista só pode sair de
`../../ferramentas/divergencia-console.sh --reescrever`.

**3. O portão que dizia `0` quando não media nada.** Um clone *blobless*
(`--filter=blob:none`) traz as árvores e não os conteúdos. A leitura falhava,
o ficheiro contava como "não editado", e o portão imprimia `linhas: 0` e
`OK dentro do orçamento` com um ficheiro do upstream editado. 🔴 Um portão que
não mede e se declara verde é pior do que nenhum portão: dá a resposta que se
quer ouvir. Agora ele **morre**, com a razão, se não conseguir ler um blob.

**4. Os fins de linha fabricavam o número.** Com `core.autocrlf=true` (o
padrão do Windows), o `git show` que repõe um ficheiro do upstream devolve-o
com CRLF. Uma alteração de **uma** linha foi contada como **268** — porque
`diff` via as duas cópias linha a linha. E o `git hash-object` dizia *"igual"*,
porque reaplica o filtro de limpeza ao medir: **media uma coisa diferente da
que estava no disco**, que é a forma mais cara de um verificador mentir.
Corrigido na raiz pelo `.gitattributes` do repo (`apps/console/** -text`), e
verificado byte a byte: **3031 de 3031** ficheiros intactos são idênticos ao
upstream.

🔴 E o que estas quatro têm em comum: **todas** davam *verde*. Nenhuma era um
defeito de código, e nenhuma delas aparece numa revisão de diff.


---

## O que **acrescentamos** (ficção zero: não tocamos no upstream)

Tudo o que é AEGIS vive em pastas que o upstream não tem, e que ele não tem
como ter — porque a lista de bots, as skills e o registo do MCP são **dado**,
e dado de um cliente não vai para o repo de outro:

| pasta | o que é |
|---|---|
| `equipa/` | o team em Markdown, as skills, o registo do MCP, o motor, e este inventário |
| `ferramentas/divergencia.sh` | a medição |
| `LEIA-ME.md` · `LICENCA-ESTE-FORK.md` · `NOTICE-AEGIS.md` | quem é isto e o que se deve a quem |

🔴 **A pasta de dado é `equipa/` e não `.claude/skills/`.** O opencode lê
skills de `.opencode/` e de `~/.config/opencode`; o fork do OpenMausBot lê as
suas de `skills/`. Manter o AEGIS **fora** das duas é o que garante que um
`git pull` do upstream **não traz bots de outro cliente** para esta
instância — que é a mesma classe de defeito da `seed_portaria_acesso.py` que
importava as seeds alheias.

---

## 🔴 O que já mexemos: o D7 (30/09/2026), e o que custou

| ficheiro | o quê | porquê | divergência |
|---|---|---|---|
| `server/brand.ts` | `DEFAULT_BRAND` = `AEGIS` | a **§6** da Apache-2.0 não dá direitos de marca, e o `LICENSING.md` deles é explícito: um produto sobre OpenMausBot **precisa do seu nome** sem acordo de parceiro | 1 linha |
| `src/lib/app-links.ts` | `APP_NAME`, `APP_REPOSITORY`, `DOCS_URL`, `FEEDBACK_URL`, `PRO_URL`, `LICENSE_URL` | 🔴 o `LICENSE_URL` **é** a licença que o cliente lê, e apontava para o GitHub de outro | 8 linhas |
| `electron-builder.yml` | `appId`, `productName`, `artifactName` (×3), `schemes`, `repo`, e as **duas** leis no pacote | o `appId` e o `schemes` mudam **junto** — o sistema emparelha-os, e um de cada lado deixa a app de abrir ou instala ao lado da do upstream | 9 linhas |
| `package.json` | `name`, `description`, `homepage`, `repository.url`, `desktopName` | o `author` **fica** o do upstream: é atribuição de quem escreveu o código, e reescrevê-la seria apagá-la | 5 linhas |
| `index.html` | `<title>` | é o que fica no histórico do browser do cliente | 1 linha |
| `electron/cloud-account.mjs` | `CLOUD_ORIGIN` = `""`, e o validador só aceita loopback de fixture | 🔴 **dados a sair**: uma conta Cloud leva email, token e resumo das máquinas para um servidor que a Safe Core não opera | 5 linhas |
| `electron/companion-account-service.mjs` | `DEFAULT_COMPANION_CONTROL_PLANE_URL` = `""` | 🔴 o mesmo: o registo de quem liga o telemóvel ia para `accounts.openmausbot.com` | 2 linhas |

**Total: 6 ficheiros, 31 linhas** — dentro do orçamento de 12/400, e as 31
linhas são quase todas comentários que dizem **porquê**.

🔴 **O que não está na lista, e é o mais importante:** nada disto é
*estilização*. São **identificação** (o nome na janela, o executável, o
`.desktop`, o esquema) e **destino dos dados** (dois servidores que não são
nossos). 🔴 Um fork com a marca certa e a Cloud ligada é um produto que manda a
conversa do cliente para outro sítio, e o nome na janela não chega para
compensar.

🔴 E a decisão que fica escrita: **o endereço de fábrica é `""`, e não "o
nosso, para já"**. Um default de produto empacotado *é* o de produção, e um
default que aponta para outro continua a funcionar depois de o fork ser
entregue. O `""` **desliga** a funcão, e quem a precisar aponta-a com
`OMB_CONTROL_PLANE_URL` — que é um registo consciente, e não um
esquecimento.

🔴 **E uma coisa que a folha `ferramentas/marca.sh` apanhou a si mesma:** a
primeira versão acusava os dois ficheiros da Cloud porque o `grep` via o
endereço **no comentário** que explica a decisão. A folha dizia que a marca
estava por corrigir quando o que estava por corrigido era a folha — a mesma
distinção que o `regra_do_workspace.rs` já fazia entre *declarar* e *varre
texto*. A folha passou a distinguir a linha que é **código** da linha que é
**nota**, e `--morde` prova que ela morde (planta o `DEFAULT_BRAND` antigo e
confirma que reprova).

## O que vamos mexer, e o que isso custa

Isto era verdade até ao **D7** (30/09/2026), e a tabela de cima tem o que
 mudou desde então. O que vem a seguir continua por fazer, e vai aqui uma linha
 por ficheiro, com a razão — e a divergencia.sh conta.

🔴 **O que o plano prevê mexer, e porquê cada um:**

| onde | o quê | porquê | o que custa se for para o lado errado |
|---|---|---|---|
| `package.json` | nome, descrição, `desktopName`, `author` | o **branding** | a janela e o instalador dizem "OpenMausBot" ao cliente |
| `electron/` | ícone, título, paleta | a **cara** do produto | um produto de outro dono no ecrã |
| `server/` | a mensagem que diz que o **nome** é registado | licença | o operador é avisado de usar uma marca que não é nossa |
| `server/` | o rótulo do motor na cara do operador ("AIP") | a regra do `CLAUDE.md` | o operador vê o nome de um terceiro |

🔴 **E o que NÃO se mexe, nunca:**

- `server/drivers/` — o motor entra por **configuração** (`opencode acp` fala
  ACP em stdio), e acrescentar um driver é *divergência de propósito* à
  espera de o opencode ser um engine nativo do upstream.
- `server/harness/`, `server/contracts.ts` — o SPI, que o upstream promete
  manter pequeno.
- tudo o que é **`go2rtc`, `cua-driver`, Tailscale, Electron** — as
  dependências, e uma divergência aí é uma divergência de segurança.

---

## Como se actualiza

1. `ferramentas/divergencia.sh --buscar` — traz a tag nova do upstream
2. o diff mostra o que mudou **nas nossas linhas** (o resto é o upstream a
   andar)
3. o que colide, resolve-se **à mão** e anota-se aqui
4. `ferramentas/divergencia.sh --orcamento 12 400` — actualiza o orçamento
   **com uma razão escrita**, e essa razão é a única coisa que justifica
   subir o número
