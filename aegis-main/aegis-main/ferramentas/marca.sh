#!/usr/bin/env bash
# 🔴 A marca que o **operador vê** — e só essa.
#
# Porquê uma folha: a marca aparece em cinco sítios que **não conversam entre
# si** (o `electron-builder.yml` empacota, o `index.html` dá o título da aba, o
# `server/brand.ts` serve o que o ecrã mostra, o `app-links.ts` aponta o About
# e o `package.json` dá o nome do pacote). 🔴 Nenhum deles verifica os outros.
# Uma divergência entre dois é um produto que se chama AEGIS na janela e
# OpenMausBot no About — e o sintoma é *um nome errado numa janela de um
# cliente*, que é a falha mais cara que existe nesta casa.
#
#   bash ferramentas/marca.sh            # mede
#   bash ferramentas/marca.sh --ci       # reprova acima do que falta
#
# 🔴 E o que **não** entra na contagem: os thousands de `openmausbot` que são
# identificadores técnicos (o `appId`, o esquema, o nome do pacote, as
# chaves do `sessionStorage`, os testes). O que entra é o que um humano lê na
# cara do produto — e a lista está escrita, com a razão de cada linha.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

C=apps/console
falhas=0
contador=0

# 🔴 `checar` é a função que faz o trabalho: o ficheiro, o padrão que é
# PROIBIDO, e arazão. Escrever a razão aqui é o que impede a lista de crescer
# por preguiça — "não achei mais um sítio" não é uma razão que se possa ler
# daqui a seis meses.
checar() {
  local ficheiro="$1" proibido="$2" razao="$3"
  contador=$((contador + 1))
  if grep -qF "$proibido" "$C/$ficheiro" 2>/dev/null; then
    echo "🔴 $ficheiro ainda diz \"$proibido\""
    echo "     $razao"
    falhas=$((falhas + 1))
  fi
}

# 🔴 `exigir` é o contrário de `checar`: não diz o que é **proibido**, diz o que
# tem de **existir**. 🔴 E a distinção é o que impede a folha de crescer por
# preguiça nos dois sentidos — uma folha só de proibições passa verde num produto
# que não mostra marca nenhuma, que foi exactamente o que o `brand.json`
#.sofrido: o nome e a cor estavam certos e a **marca** não aparecia.
exigir() {
  local ficheiro="$1" exigido="$2" razao="$3"
  contador=$((contador + 1))
  if ! grep -qF "$exigido" "$C/$ficheiro" 2>/dev/null; then
    echo "🔴 $ficheiro não tem \"$exigido\""
    echo "     $razao"
    falhas=$((falhas + 1))
  fi
}

echo "=== a marca que o operador lê ==="

# 1. A janela e a aba.
checar "electron-builder.yml" "productName: OpenMausBot" \
  "é o nome da janela e do instalador que o cliente vê no seu computador"
checar "index.html" "<title>OpenMausBot</title>" \
  "é o título da aba e o que fica no histórico do browser"

# 2. O nome NO ecrã — e este é o que o `brand.json` sobrepõe, mas o
#    `DEFAULT_BRAND` é o que aparece quando não há brand.json, e numa instalação
#    nova não há.
#
# 🔴 **E são DOIS ficheiros, e a folha mede os dois desde o D8.** Havia só um na
# lista (o do `server/`), e o outro — o do `src/lib/` — ficou a dizer o nome do
# upstream. 🔴 O sintoma não era um erro: era a janela a abrir com o nome errado
# quando o `bootstrapBrand` não conseguia buscar `/api/brand` (servidor velho,
# rede lenta, o timeout de 1500 ms), e a ficar assim **sem nada em vermelho**.
# 🔴 Um guard que mede um sítio não guarda o sítio vizinho — e a folha que diz
# "0 por corrigir" é a que mentiu.
checar "server/brand.ts" 'name: "OpenMausBot"' \
  "é o nome de fábrica do servidor: sem brand.json, o operador vê o nome do upstream"
checar "src/lib/brand.ts" 'name: "OpenMausBot"' \
  "é o nome de fábrica do FRONTEND: o que fica quando o /api/brand não responde"

# 2b. E o accent. 🔴 A casa tem UM azul-aço (`#2D77BE`) e o upstream traz **dez**,
#     um por pele. 🔴 A decisão do dono (30/09/2026) foi trocar o **de fábrica** e
#     deixar as peles que o operador escolhe com o acento que ele escolheu — o
#     que muda aqui é o que uma instalação nova mostra, e o `brand.json` leva o
#     resto para uma instalação que o puser.
checar "server/brand.ts" 'accent: "#1084fe"' \
  "é o acento de fábrica: o operador veria o azul do upstream no primeiro arranque"
checar "src/lib/brand.ts" 'accent: "#1084fe"' \
  "idem, no caminho do frontend sem /api/brand"

# 3. O executável e o pacote.
checar "electron-builder.yml" "appId: com.openmausbot.app" \
  "o appId identifica a instalação no sistema; ficar com o dele é o app DELES"
checar "electron-builder.yml" "schemes: [openmausbot]" \
  "o esquema deep-link é o que o operador usa para abrir a app de um link"
checar "package.json" '"desktopName": "com.openmausbot.app.desktop"' \
  "é o nome do .desktop no Linux"

# 4. O About: o nome e os sítios para onde aponta.
checar "src/lib/app-links.ts" 'APP_NAME = "OpenMausBot"' \
  "é o nome no About e no Command Palette"
checar "src/lib/app-links.ts" 'APP_REPOSITORY = "https://github.com/milind-soni/OpenMausBot"' \
  "🔴 o About manda o operador ao GitHub DELE — e o LICENSE_URL sai daqui, então o cliente lê a licença Apache DELES como se fosse a nossa"

# 5. O que NÃO pode estar: a Cloud deles. Um produto que fala com
#    cloud.openmausbot.com é um produto que manda a conversa do cliente para um
#    servidor que não controlamos — e isso não é branding, é **dados a sair**.
# 🔴 E estes dois são o caso que o `grep` **não** distingue: o endereço que
# ficou é o do **comentário** que explica a decisão, e o que interessa é o
# **código**. 🔴 O `grep` achou o endereço em ambos os ficheiros depois da
# correção, e a folha disse que a marca estava por corrigir — quando o que
# estava por corrigir era a folha.
#
# 🔴 A distinção é a mesma que a casa já tem no `regra_do_workspace.rs`: uma
# guarda que varre **declarações** e uma que varre **texto**. Esta varre texto
# de propósito, porque a marca é texto — mas por isso precisa de distinguir a
# **linha** que é código da linha que é nota, e o único jeito é o `grep` de
# linhas que começam com código.
#
# 🔴 A segunda regra do `cloud-account.mjs` é o que **protege** disto: o
# validador só aceita loopback de fixture, e um endereço real num comentário não
# muda o que o programa faz. A folha não precisa de ser mais esperta do que o
# validador — precisa de dizer a verdade.
checar_codigo() {
  local ficheiro="$1" proibido="$2" razao="$3"
  contador=$((contador + 1))
  if grep -v -E '^\s*(//|\*|/\*|#)' "$C/$ficheiro" 2>/dev/null | grep -qF "$proibido"; then
    echo "🔴 $ficheiro ainda USA \"$proibido\" em codigo"
    echo "     $razao"
    falhas=$((falhas + 1))
  fi
}

checar_codigo "electron/cloud-account.mjs" "cloud.openmausbot.com" \
  "isto manda a conta do cliente para um servidor que não é nosso"
checar_codigo "electron/companion-account-service.mjs" "accounts.openmausbot.com" \
  "o companion (o telemóvel) manda a conta do cliente para um servidor que não é nosso"

# 6. A cor. 🔴 O `DEFAULT_BRAND` leva o `#2D77BE`, e é o que o `applyBrand`
#    escreve nas variáveis. Mas o **`--color-accent` do CSS** é o que a janela
#    mostra **antes** de o `applyBrand` correr, e é o que fica se ele não
#    correr. 🔴 São dois lugares para a mesma decisão, e um guard que mede o
#    primeiro e ignora o segundo deixa a decisão a meio.
#
# 🔴 E aqui a folha mede **duas** Occorrências: o `:root` e a pele `midnight`
#    (que é a de fábrica no servidor). As outras 8 peles ficam com o acento que
#    o operador escolheu — decisão do dono, 30/09/2026, e o motivo está escrito
#    em `equipa/PATCHES-AEGIS.md`.
contador=$((contador + 1))
# 🔴 O `grep -c` com `|| echo 0` **soma**: quando o `grep` não casa devolve `1`
# e imprime `0`, e o `||` acrescenta outro `0`. A folha recebeu `"0\n0"` e
# o `[` respondeu `integer expected` — e **continuou**, com o `if` a falhar e a
# contagem de falhas a ficar errada. 🔴 Um `test` que reprova por ter lido mal o
# número não protege nada, e o sintoma (`integer expected`) não aponta para o
# `grep`.
n_accents_padrao="$(grep -c '^[[:space:]]*--color-accent: #2D77BE;' "$C/src/styles.css" 2>/dev/null | head -1)"
case "$n_accents_padrao" in
  ''|*[!0-9]*) n_accents_padrao=0 ;;
esac
if [ "$n_accents_padrao" -lt 2 ]; then
  echo "🔴 src/styles.css: o acento de fábrica ainda não é o da casa"
  echo "     O :root e a pele midnight são o que o operador vê no primeiro"
  echo "     arranque, antes do applyBrand. Encontrados $n_accents_padrao de 2."
  grep -n '^\s*--color-accent: #' "$C/src/styles.css" | head -3 | sed 's/^/       /'
  falhas=$((falhas + 1))
fi

# 🔴 E a razão acima foi escrita de propósito numa **linha só**, depois de
# partir uma string com `\` a meio. 🔴 O `\` no fim de uma linha dentro de
# aspas duplas escapa o próprio newline, o texto da linha seguinte é lido como
# argumento, e a primeira palavra dele vira um **comando**: a folha imprimiu
# `LICENSE_URL: command not found` no meio do relatório e **saiu com 0**.
#
# 🔴 O que se aprende: um erro de shell que não mata a folha é o pior deles,
# porque a folha continua a falar. E o sintoma (`command not found`) não aponta
# para a causa (uma string partida), que está três linhas acima.

# 7. O comando que o operador **copia**. 🔴 Este apareceu porque o `package.json`
#    passou a chamar-se `aegis-console` (D7) e a tela continuou a dizer
#    `npx openmausbot pair` — 🔴 ou seja, o comando que o produto manda copiar
#    **deixou de funcionar**, e o sintoma é um integrador a receber um erro de
#    "package not found" de um produto que ele acabou de instalar.
#
# 🔴 Não é o mesmo caso que o `LICENSE_URL`, e a diferença é o que o torna pior:
#    uma licença errada lê-se errada; um comando quebrado **não avisa**, e o
#    primeiro a vê é o cliente. 🔴 A regra: **o que o operador copia é
#    interface**, e a interface não pode ficar a olhar para o nome antigo.
checar "src/components/ConnectedWorkspacesSettings.tsx" "npx openmausbot" \
  "é um comando que o operador copia, e o pacote já não se chama assim"
checar "src/components/RemoteComputerSection.tsx" "openmausbot pair" \
  "é o comando de parear que a tela manda copiar"
checar "src/components/SettingsModal.tsx" "openmausbot pair" \
  "o mesmo comando, no texto que explica o pareamento"
checar "src/components/ServerPairingCard.tsx" "openmausbot pair" \
  "o mesmo comando, no cartão de pareamento"

# 🔴 E o **endereço** que o operador escreve no campo. O `placeholder` dizia
#    `https://c-…openmausbot.com or computer.tailnet.ts.net` — 🔴 e o primeiro
#    dos dois não existe para nós: o `--tunnel` que servia em `*.openmausbot.com`
#    é infraestrutura **dele** (o `cloudflared` sobre o domínio dele), e a
#    decisão 1 do plano é que a ilha se alcança **por tailnet**. 🔴 Um campo que
#    sugere um endereço que não resolve é pior do que um campo vazio: o
#    operador escreve, espera, e o erro não diz que o endereço não existe.
checar "src/components/RemoteComputerSection.tsx" "openmausbot.com" \
  "é o endereço que o operador é convidado a escrever, e esse servidor é de outro"

# 8. 🔴 A face do **produto**: nome, cor e a MARCA. (D7b, 30/09/2026)
#
# 🔴 Os três são medidos **aqui** porque o que está a ser medido é uma
# **declaração** — e uma declaração mede-se lendo a fonte. 🔴 O
# *comportamento* (escreve quando não há, nunca sobrescreve a do operador) é
# medido pela suite do console, a correr o produto, e não por `grep`: a casa
# retirou os 60 testes por regex precisamente porque regex prova texto.
exigir "server/brand.ts" 'name: "AEGIS"'   "é o nome que a instalação nova mostra quando não há brand.json"
exigir "server/brand.ts" 'accent: "#2D77BE"'   "é o azul-aço da casa, e a paleta é o accent único"
exigir "server/brand.ts" 'data:image/svg+xml;base64,'   "🔴 a MARCA. Nome e cor sem logo é um produto que se identifica e não se vê — e o sintoma (uma tela com o nome certo e o espaço do logo vazio) não diz que falta o logo, diz que a marca está mal"
# 🔴 E a feature que autoriza a aplicar o ficheiro. 🔴 Este caso é a razão de a
# marca não aparecer: o `loadBrand` pedia `whitelabel`, que esta edição não tem,
# e o `brand.json` era lido e deitado fora sem uma linha de erro.
exigir "server/brand.ts" 'isEntitled("marca")'   "é a feature que esta edição tem. Pedir whitelabel era meio: o ficheiro era lido, validado e descartado, e o operador via a marca de fábrica sem saber porquê"

echo
echo "sites verificados: $contador    por corrigir: $falhas"

if [ "${1:-}" = "--ci" ] && [ "$falhas" -gt 0 ]; then
  echo >&2
  echo "FALHA: a marca que o operador vê ainda é a do upstream." >&2
  exit 1
fi
[ "${1:-}" = "--ci" ] && echo "OK  a marca é do AEGIS em tudo o que o operador lê."

# ---------------------------------------------------------------------------
# A folha tem de **morder**
# ---------------------------------------------------------------------------
#
# 🔴 Uma folha que passa com a lista vazia passa com a lista vazia para sempre,
# e a lista vazia é o estado de um produto que ainda não trocou o nome. Plantar
# o defeito, medir, e **dizer que se plantou** — porque já happenede aqui três
# vezes: a planta que não entrava, e o caso que julgava a folha pelo motivo
# errado.
#
# 🔴 E o que se planta é o **nome de fábrica** (`DEFAULT_BRAND`), e não o
# `productName`: o primeiro é o que aparece sem `brand.json`, que é o estado de
# uma instalação nova — e é o que mudou primeiro. Plantar o `productName` seria
# mais fácil e provaria menos.
if [ "${1:-}" = "--morde" ]; then
  BRAND="$C/server/brand.ts"
  cp "$BRAND" "$BRAND.morde.bak"
  restaura() { mv "$BRAND.morde.bak" "$BRAND"; }
  trap restaura EXIT

  # 🔴 A planta substitui **o valor todo** (`name` e `accent` de uma vez) e não
  # só o nome. 🔴 A primeira versão casava `{ name: "AEGIS" }` — que deixou de
  # existir quando o `accent` entrou no `DEFAULT_BRAND` (D8) — e o `sed` não
  # fez nada. 🔴 O caso 4/reportou *"a folha deixou de funcionar"* quando o que
  # tinha acontecido era que **não se plantou nada**: a mesma confusão da planta
  # do `--test-threads`, e a razão de a planta ser verificada logo a seguir.
  sed -i 's/export const DEFAULT_BRAND: Brand = {[^}]*}/export const DEFAULT_BRAND: Brand = { name: "OpenMausBot", accent: "#1084fe" }/' "$BRAND"
  if ! grep -q 'name: "OpenMausBot"' "$BRAND"; then
    echo "FALHA: o defeito NAO foi plantado, e este caso nao mediu nada." >&2
    grep -n 'DEFAULT_BRAND' "$BRAND" >&2
    exit 1
  fi
  if bash "$0" --ci >/dev/null 2>&1; then
    echo "FALHA: a folha passou com o nome de fabrica trocado." >&2
    exit 1
  fi
  echo "OK  a folha reprovou quando o nome de fabrica voltou ao upstream."

  # 🔴 E o **mesmo** caso no **segundo** `DEFAULT_BRAND` — o do frontend. 🔴 A
  # primeira versão do `--morde` só plantava no do servidor, e por isso o do
  # frontend podia voltar ao nome do upstream sem que nada reparasse: a folha
  # `--ci` media os dois, mas o `--morde` só provava um. 🔴 Um caso que prova
  # metade das coisas de que a folha guarda dá a confiança das duas metades.
  BRAND_FRONT="$C/src/lib/brand.ts"
  cp "$BRAND_FRONT" "$BRAND_FRONT.morde.bak"
  restaura_front() { mv "$BRAND_FRONT.morde.bak" "$BRAND_FRONT"; }
  trap 'restaura; restaura_front' EXIT

  sed -i 's/export const DEFAULT_BRAND: Brand = {[^}]*}/export const DEFAULT_BRAND: Brand = { name: "OpenMausBot" }/' "$BRAND_FRONT"
  if ! grep -q 'name: "OpenMausBot"' "$BRAND_FRONT"; then
    echo "FALHA: o defeito do frontend NAO foi plantado, e este caso nao mediu nada." >&2
    exit 1
  fi
  if bash "$0" --ci >/dev/null 2>&1; then
    echo "FALHA: a folha passou com o DEFAULT_BRAND do frontend trocado." >&2
    exit 1
  fi
  echo "OK  a folha reprovou tambem com o DEFAULT_BRAND do frontend trocado."

  # 🔴 E o caso que **esta** folha existia para não calar: a MARCA.
  #
  # 🔴 Os casos acima trocam o **nome**, e o nome é o que se vê primeiro. A
  # marca é o que se vê **depois** de o nome estar certo, e por isso é a que
  # desaparece em silêncio: nome certo, cor certa, e o espaço do logo vazio. O
  # sintoma não diz *"falta o logo"* — diz *"a marca está mal"*, e ninguém
  # sabe onde procurar.
  #
  # 🔴 E sem este caso a folha passava com a `MARCA_DO_PRODUTO` sem `logo`:
  # `exigir` conta um sítio, e um sítio que ninguém prova que morde é um sítio
  # que pode deixar de ver.
  # 🔴 Este caso é o **terceiro** a mexer em `server/brand.ts`, e com backups
  # separados o último restore escribvia por cima do primeiro: a planta ficava
  # no ficheiro, e a folha seguinte acusava o produto do que ela própria tinha
  # plantado. 🔴 Foi o que aconteceu a 30/09/2026 — e o sintoma era a folha a
  # dizer *"a marca que o operador vê ainda é a do upstream"* com um upstream
  # que já não estava lá.
  #
  # A cura é o caso correr num **subshell**, com o trap dele próprio: assim o
  # restore é o último a falar e não há dois backups do mesmo ficheiro a lutar.
  (
    trap - EXIT
    BRAND="$C/server/brand.ts"
    cp "$BRAND" "$BRAND.logo.bak"
    trap 'mv "$BRAND.logo.bak" "$BRAND"' EXIT

    sed -i 's/logo: `data:image\/svg+xml;base64,${LOGO_AEGIS_BASE64}`,/logo: undefined,/' "$BRAND"
    if grep -q 'data:image/svg+xml;base64,${LOGO_AEGIS_BASE64}' "$BRAND"; then
      echo "FALHA: o logo NAO foi removido, e este caso nao mediu nada." >&2
      exit 1
    fi
    if bash "$0" --ci >/dev/null 2>&1; then
      echo "FALHA: a folha passou com a marca do produto SEM logo." >&2
      echo "🔴 E e o caso mais caro dos tres: o nome certo, a cor certa, e o" >&2
      echo "   espaco da marca vazio — o sintoma nao diz que falta o logo." >&2
      exit 1
    fi
  ) || exit 1
  echo "OK  a folha reprovou tambem com a marca do produto sem logo."
  # 🔴 O `--morde` **nao** verifica se deixou a planta, e é de propósito: o
  # restore deste caso acontece num subshell, mas o dos dois anteriores só
  # corre no `EXIT` do processo — e uma verificação feita aqui dentro veria o
  # ficheiro ainda com a planta do caso 1, e acusar o produto do que ele mesmo
  # plantou. 🔴 O que garante "a folha ficou intacta" é o **passo seguinte**:
  #     marca.sh --ci && marca.sh --morde && marca.sh --ci
  # É o que o CI corre, e é a única ordem em que a pergunta faz sentido.
  exit 0
fi

exit 0
