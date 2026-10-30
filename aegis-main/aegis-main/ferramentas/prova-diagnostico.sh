#!/usr/bin/env bash
# 🔴 A conferência lida **como o agente a lê**: pelo JSON-RPC, pelo `aegis mcp` a
# sério, e pelo mesmo caminho de stdout e stderr que o motor.
#
# 🔴 Porque uma prova que chama a função não prova a ferramenta. A ferramenta é
# o `mcp` em stdio, a serialização pode perder o `gesto` que a regra dos três
# exige, e o `saida` do binário é a única coisa que o motor vê. Foi assim que a
# casa apanhou o `caracteres de outro alfabeto` numa `eprintln!` e o
# `licenca.sem-raiz` num stdout vazio — nenhum dos dois aparece numa chamada de
# função.
#
#   ferramentas/prova-diagnostico.sh            # a conferência
#   ferramentas/prova-diagnostico.sh --recusa   # e a recusa da ilha inacessível
#
# 🔴 Sem `AEGIS_ILHA_URL` e sem `AEGIS_RAIZ_VENDOR` a folha **não corre**: o
# portão recusa com `3`, o binário não escreve nada, e uma folha que imprime
# cabeçalhos vazios e sai com `0` é uma folha que diz que passou sem medir
# nada. O sintoma é indistinguível de "a ferramenta não devolve nada" — e é
# por isso que a ausência se declara à entrada, e não se deixa descoberta.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# 🔴 🔴 **NÃO redirecione a saída desta folha com o PowerShell.**
#
# `> ficheiro` do PowerShell 5.1 escreve **UTF-16LE**, porque o
# `Out-File`/`>` de redirecionamento usa a codificação do sistema e o Windows
# zh-CN é UTF-16. O `grep` do Git Bash lê o ficheiro e não encontra
# `situacao` — e o sintomo é `FALHA: a resposta nao tem linhas nenhuma` contra
# uma resposta com **quatro linhas à vista**.
#
# 🔴 Isto custou-me três tentativas, e a lição é a da casa outra vez: o
# sintoma aponta para o produto (`grep` não casa, a folha diz que a resposta
# não tem linhas) e a causa está **fora** do sítio onde o erro aparece. Para
# ver o que a folha escreveu, leia o ficheiro pelos **bytes**:
#
#     $b = [System.IO.File]::ReadAllBytes('E:\...\out.txt')
#     [System.Text.Encoding]::UTF8.GetString($b)
#
# E a prova, quando corre no Git Bash, escreve em UTF-8 sem problema nenhum —
# o problema é **so** o `>` do PowerShell.
#
# 🔴 O `AEGIS_ILHA_URL` tem de chegar **até à folha**, e a `AEGIS_RAIZ_VENDOR`
# (que é uma chave pública, multi-linha) também. Se não chegarem, medir o
# vazio seria um resultado honesto e enganador — e a folha sai a dizer que
# passou. Por isso a ausência é declarada **à entrada**.
if [ -z "${AEGIS_ILHA_URL:-}" ]; then
  echo "FALHA: o AEGIS_ILHA_URL nao chegou a esta folha (WSLENV)." >&2
  echo "       Sem ele a conferencia pergunta ao vazio, e medir o vazio nao" >&2
  echo "       e medir. Ver o WSLENV no fim desta folha." >&2
  exit 2
fi
if [ -z "${AEGIS_RAIZ_VENDOR:-}" ]; then
  echo "FALHA: o AEGIS_RAIZ_VENDOR tambem nao chegou (WSLENV)." >&2
  echo "       O portao recusa com 3 e o mcp nao escreve nada." >&2
  exit 2
fi

EXE="${AEGIS_BIN:-E:/aegis-target/debug/aegis.exe}"
[ -x "$EXE" ] || { echo "FALHA: nao achei o binario em $EXE (AEGIS_BIN)." >&2; exit 2; }

licenca='crates/aegis-license/fixtures/licenca-hotelaria-windows.json'
chave='crates/aegis-license/fixtures/chave-oem.json'

# 🔴 O `saida` do **binário** é o que interessa, e um `3` é uma recusa. O
# `2>&1` fica de fora de propósito: o `tracing` vai para o stderr, e juntá-lo
# aqui misturaria o log do produto com a resposta do protocolo — que é
# exactamente o defeito que o `mcp` foi feito para não ter.
chamar() {
  printf '%s\n' "$1" | "$EXE" mcp \
    --vertical verticals/hotelaria \
    --licenca "$licenca" --chave-oem "$chave" \
    --machine-id aegis-maquina-de-teste 2>/dev/null || true
}

extrair() {
  # O `text` é um JSON dentro de um JSON. Sem `jq` (o `node` também não é
  # garantido numa máquina de bancada), o que fica é o bruto — e uma folha
  # que precisa de `jq` não corre na máquina onde a coisa se prova.
  #
  # 🔴 A ordem é **corpo primeiro, escapes depois**, e a primeira versão fez
  # ao contrário: desfazia `\\n` e `\\"` antes de tirar o invólucro, e o
  # invólucro já não casava. A regra é a mesma do `ilha.rs` — *estado
  # primeiro, corpo depois* — e por uma razão que é a mesma: quando as duas
  # coisas se misturam, o sintoma passa a ser "o produto falou uma língua
  # estranha".
  sed 's/^.*"text"://; s/","type":"text".*$//' \
    | sed 's/\\n/\n/g; s/\\"/"/g'
}

echo "=== a lista que o agente recebe ==="
lista="$(chamar '{"jsonrpc":"2.0","id":0,"method":"tools/list"}')"
[ -n "$lista" ] || { echo "FALHA: o mcp nao respondeu ao tools/list." >&2; exit 1; }
echo "$lista" | grep -o '"name":"[a-z_]*"' | sed 's/"name":"/  /; s/"$//' | sort
for t in vertical_manifesto camera_listar licenca_conferir ilha_saude diagnostico; do
  echo "$lista" | grep -q "\"name\":\"$t\"" || { echo "FALHA: falta $t" >&2; exit 1; }
done
echo "OK  as cinco estao na lista que o agente le"

echo
echo "=== a conferencia, como o agente a le ==="
chamada="$(chamar '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"diagnostico","arguments":{}}}')"
[ -n "$chamada" ] || { echo "FALHA: a ferramenta nao respondeu." >&2; exit 1; }

# 🔴 E aconference **nao recusa** por a ilha nao estar pronta. E a razao de
# existir: um agente que pede "diz-me o que esta errado" e leva um erro em vez
# da resposta e um produto que nao responde a pergunta.
if echo "$chamada" | grep -q '"isError":true'; then
  echo "FALHA: a ferramenta RECUSOU. A conferencia existe para explicar a" >&2
  echo "       recusa, e nao para a repetir." >&2
  exit 1
fi
echo "$chamada" | extrair | grep -E '"(codigo|medido|situacao|veredicto|conserto)"' \
  | sed 's/^/  /' || true

# 🔴 E a chave `ilha` tem de trazer o que a ilha disse, quando não a houve. É o
# que impede a conferencia de embrulhar "nao consegui falar com a ilha" num
# `diag.*` que ninguem sabe ler.
# 🔴 🔴 O `TMP` tem de ser **declarado ANTES** do primeiro `grep` que o usa.
#
# A folha usava-o no `if` do motivo da ilha e só o declarava vinte linhas mais
# abaixo — e o sintoma foi `grep: /tmp: Is a directory`, que é a forma que o
# shell tem de dizer *"a variável estava vazia"*. 🔴 Um `grep` a ler um
# caminho vazio é o pior tipo de falha de folha: não diz o que devia dizer, e
# o `set -e` não a apanha porque o `grep` devolveu `1` e estava num `if`.
#
# E a ordem das operações é a mesma do `ilha.rs` — *estado primeiro, corpo
# depois* — e pela mesma razão: quando as duas se misturam, o sintoma passa a
# ser "o produto falou uma língua estranha".
TMP="/tmp/aegis-diag-$$.txt"
trap 'rm -f "$TMP"' EXIT
echo "$chamada" | extrair > "$TMP"

echo
# 🔴 O motivo da ilha é protegido com `|| true`, e não por descuido: sob
# `set -e` um `grep` sem casamento mata a folha com o código do `grep` (1), e
# o sintoma é uma folha que sai a `1` sem stderr nenhum, no meio da
# conferência. E `1` sem dizer nada é indistinguível de "a prova reprovou por
# um defeito do produto" — que é a leitura errada e a mais cara.
if grep -q '"ilha"' "$TMP"; then
  echo "  a chave 'ilha' troux o motivo da falta (a ilha nao respondeu):"
  # 🔴 As **duas** linhas: o motivo e a frase, e não só a chave. Um
  # `grep -o '"ilha".*'` que devolve `{` e mais nada parece uma chave vazia
  # — e a leitura errada é "a ilha não disse nada", que é o contrário do que a
  # folha queria mostrar.
  sed -n '/"ilha"/,/}/p' "$TMP" | head -4 | sed 's/^/    /' || true
else
  echo "  (a ilha respondeu, e a conferencia mediu o que ela disse)"
fi

# 🔴 E a conferência tem de ser **honesta** sobre o que não mediu. Uma
# conferência que diz "não deu para conferir" é a resposta certa; uma que
# transforma "não perguntou" em "falta" é a mentira que a casa já pagou duas
# vezes.
#
# 🔴 E tem de ser coerente: se **tudo** é `NaoConferido`, o veredicto não pode
# dizer "falta". A prova morde pelo `situacao` de cada linha, e não pelo
# veredicto — que é texto, e o texto muda-se sozinho.
#
# 🔴 O padrão é `"situacao" *: *"[A-Z]+"` e não `"situacao":"[A-Z]*"` porque o
# `text` é um JSON **dentro** de um JSON: o `serde_json` escreve o objeto
# interno com os dois-pontos seguidos de espaço. E a contagem é feita sobre o
# `text` **já desescapado** — na resposta crua os `\n` são a dupla barra do
# JSON e o `grep` conta zero. Foi esta a lição de três tentativas: a folha
# acusou a resposta de não ter linhas com quatro linhas à vista, e o culpado
# era o meu `sed`.

linhas="$(grep -oE '"situacao" *: *"[A-Z]+"' "$TMP" || true)"
total="$(printf '%s\n' "$linhas" | grep -c '"situacao"' || true)"
falta="$(printf '%s\n' "$linhas" | grep -c 'FALTA' || true)"
naoc="$(printf '%s\n' "$linhas" | grep -c 'NAOCONFERIDO' || true)"
if [ "$total" -eq 0 ]; then
  echo "FALHA: a resposta nao tem linhas nenhuma. Isto e do shell, nao do" >&2
  echo "       produto: o que a folha recebeu foi:" >&2
  sed 's/^/  | /' "$TMP" | head -20 >&2
  exit 1
fi

echo
echo "  linhas: $total total, $falta em falta, $naoc nao conferidas"
if [ "$falta" -gt 0 ] && [ "$naoc" -eq "$total" ]; then
  echo "FALHA: ha linhas em falta e todas as outras nao conferidas, o que e" >&2
  echo "       impossivel e mostra que a situacao esta a ser misturada." >&2
  exit 1
fi
if grep -q 'não deu para conferir' "$TMP" && [ "$falta" -gt 0 ]; then
  echo "FALHA: o veredicto diz que nao deu para conferir E ha linhas em" >&2
  echo "       falta. Uma das duas esta errada." >&2
  exit 1
fi
# 🔴 E a linha do `sh` nunca é `FALTA` quando ninguém o mediu: quem pergunta de
# fora não tem `sh` para medir, e dizer que falta manda o operador instalar um
# interpretador numa máquina onde o problema é outro.
#
# 🔴 Este é o caso que a folha tem de rejeitar, e ele é **a única coisa** que
# esta prova prova. A resposta real é `NAOCONFERIDO`, e uma folha que
# aceitasse `FALTA` também a aceitaria — passaria sempre e diria que protege.
# O jeito de o provar é com um `aegis` que **mente**, e não plantando o defeito
# nesta folha: plantar aqui só provaria que o `grep` não casa, que foi
# precisamente a confusão em que caí três vezes.
if grep -A6 '"diag.interpretador"' "$TMP" | grep -q 'FALTA'; then
  echo "FALHA: a linha do interpretador disse FALTA, e quem pergunta de fora" >&2
  echo "       nao tem sh para medir. So pode ser NaoConferido." >&2
  exit 1
fi
echo "OK  a conferencia respondeu, nao recusou, e nao mediu o que nao mediu"

# 🔴 Como se chama esta folha, e o sintoma de a não chamar.
#
# Esta prova corre em **bash**, e o `bash` desta máquina é o do WSL. O WSL
# **não** herda as variáveis do Windows a não ser as que estão em `WSLENV` — e
# o `AEGIS_RAIZ_VENDOR` é uma chave multi-linha, que precisa de `WSLENV` com o
# sufixo `/p` para passar com os CRLF intactos.
#
# A primeira versão desta folha media o **vazio** e saía a dizer `OK`: o
# `endereco()` devolvia a recusa certa, o `diagnostico` respondia com
# `NaoConferido` em tudo, e o veredicto era honesto — *"Nada falta, mas 4
# verificação(ões) não deu para conferir"*. 🔴 **Um resultado honesto e
# enganador**: a folha confirmava que a conferência funciona, e nunca chegou a
# falar com a ilha. A prova tinha de declarar a ausência **à entrada**, e é o
# que ela faz agora.
#
# No Git Bash (que é o `bash` que o `aegis/CLAUDE.md` prescreve) as variáveis
# do Windows chegam directamente, e a folha corre sem isto.
#
# ---
#
# 🔴 **Como se prova que esta folha morde**, e porque não é plantando o defeito
# nela própria:
#
#     AEGIS_BIN=/caminho/para/um/aegis-que-mente bash ferramentas/prova-diagnostico.sh
#
# Um `aegis` que responde `FALTA` na linha do `sh` tem de fazer a folha
# reprovar. Plantar o defeito na **folha** provaria outra coisa — que o `grep`
# não casa com o texto que eu escrevi — e foi a confusão em que caí: troquei
# `grep -q 'FALTA'` por um padrão impossível, a folha passou, e concluí *"a
# guarda deixou de funcionar"*. Passou porque **deixou de olhar**.
#
# 🔴 E o simétrico importa: uma guarda fraca não falha, ela **para de
# queixar-se**, e uma prova que só corre contra o caminho verde não vê isso.
