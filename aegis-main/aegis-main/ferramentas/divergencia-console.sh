#!/usr/bin/env bash
# 🔴 A divergência do fork do console, **medida pelo próprio git**.
#
#   bash ferramentas/divergencia-console.sh            # mede
#   bash ferramentas/divergencia-console.sh --ci       # mede e reprova
#
# 🔴 A régua é `git diff` contra o **commit de importação** — o *bookmark* da
# subtree, que o inventário nomeia. Não há clone do upstream nem comparação byte
# a byte: o `git` já sabe o que mudou, e o caminho do prefixo já está feito.
#
# ⚠️ **O `.arvore-upstream` ainda existe** — 3014 linhas com o que veio intacto,
# que a **guarda do alfabeto** ainda lê. É a última ligação ao instrumento
# caseiro, e a troca é a mesma que esta folha fez. Fica de fora desta leva de
# propósito: tem provas próprias, e trocar os dois de uma vez é a incoerência
# que o dono apontou.
#
# 🔴 **O que esta folha substituiu, e porquê** (30/09/2026). Antes havia um
# manifesto de 3014 linhas (`.arvore-upstream`) com a lista do que veio intacto,
# e uma folha que comparava byte a byte contra um clone do upstream. Medido:
#
#   * o inventário **divergiu**: contava 17 ficheiros editados e o `git` conta
#     **26**. Nove ficheiros que o inventário jurava intactos não eram;
#   * a folha demorava **30 minutos** por corrida, porque clonava o upstream
#     inteiro para ler 17 ficheiros; esta demora **segundos**;
#   * uma comparação de **conteúdo** é cega ao **modo**: o vendorizado tinha o
#     `gradlew` a 100644 (sem bit de execução) e o inventário dizia "intacto";
#   * e é cega aos **fins de linha**: ficheiros nunca editados apareciam como
#     alterados linha a linha, ou o contrário.
#
# 🔴 Nenhum destes era um erro do `git`. Eram erros de um instrumento escrito à
# mão para fazer o que o `git` já fazia — e a casa já pagou mais do que uma vez
# por instrumentos caseiros que mediam outra coisa.

set -euo pipefail
export LC_ALL=C

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INVENTARIO="$RAIZ/apps/console/equipa/PATCHES-AEGIS.md"

# 🔴 As três colunas do inventário são lidas por **tipos diferentes**: a commit
# é hexadecimal entre plicas, e as duas colunas de orçamento são **números
# pelados**. 🔴 A versão anterior lia tudo com `tr -dc '0-9'`, que é o que
# transforma um "500 (era 400)" em **500400** — e um instrumento que lê mal o
# número não protege nada, e o sintoma não aponta para a leitura.
campo_texto() { sed -n "s/^| $1 | \`\([^\`]*\)\` |$/\1/p" "$INVENTARIO" | head -1; }
campo_numero() { sed -n "s/^| $1 | \([0-9][0-9]*\) |$/\1/p" "$INVENTARIO" | head -1; }

ORIGEM="$(campo_texto 'commit de importação')"
MAX_NOSSO="$(campo_numero 'ficheiros acrescentados')"
MAX_LINHAS="$(campo_numero 'linhas alteradas no upstream')"

[ -n "$ORIGEM" ]     || { echo "FALHA: o inventário não diz o commit de importação" >&2; exit 2; }
[ -n "$MAX_NOSSO" ]  || { echo "FALHA: o inventário não diz o orçamento de ficheiros acrescentados" >&2; exit 2; }
[ -n "$MAX_LINHAS" ] || { echo "FALHA: o inventário não diz o orçamento de linhas" >&2; exit 2; }

# 🔴 O bookmark tem de estar **no nosso histórico**. Sem ele a folha compararia
# contra o vazio e diria que o fork não divergiu de nada — que é a resposta
# que ninguém questiona.
git -C "$RAIZ" cat-file -e "${ORIGEM}^{commit}" 2>/dev/null || {
  echo "FALHA: o commit de importação $ORIGEM não está no repositório." >&2
  echo "🔴 Sem ele não há o que comparar, e uma folha que mede o vazio e diz" >&2
  echo "   'OK' é pior do que nenhuma folha." >&2
  exit 2
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 🔴 `A` = acrescentado (apaga-se e o fork volta ao upstream), `M` = editado (é
# este que impede sincronizar), `D` = apagado (um ficheiro do upstream que
# desapareceu — e que some do `git diff` sem deixar rasto).
git -C "$RAIZ" diff --name-status "$ORIGEM" HEAD -- apps/console > "$TMP/estado"
ACRESCENTADOS=$(awk '$1=="A"' "$TMP/estado" | wc -l | tr -d ' ')
EDITADOS=$(awk '$1=="M"' "$TMP/estado" | wc -l | tr -d ' ')
PERDIDOS=$(awk '$1=="D"' "$TMP/estado" | wc -l | tr -d ' ')

# 🔴 As linhas são só as dos ficheiros que o **upstream também tem**. Um
# ficheiro nosso não come orçamento de sincronização: apaga-se com um comando.
git -C "$RAIZ" diff --numstat "$ORIGEM" HEAD -- apps/console \
  | awk '$1!="-" { print $1 + $2 "\t" $3 }' \
  | grep -vE "	apps/console/(equipa/|LEIA-ME|LICENCA-ESTE-FORK|NOTICE-AEGIS|ferramentas/|\.arvore-upstream)" \
  > "$TMP/linhas" || true
LINHAS=$(awk -F'\t' '{ s += $1 } END { print s + 0 }' "$TMP/linhas")

echo "origem:       $ORIGEM"
echo "acrescentado: $ACRESCENTADOS / $MAX_NOSSO ficheiros que o upstream nao tem"
echo "editado:      $EDITADOS ficheiros que o upstream tambem tem"
echo "linhas:       $LINHAS / $MAX_LINHAS alteradas no upstream"
echo "perdidos:     $PERDIDOS"

if [ "$PERDIDOS" != "0" ]; then
  echo >&2
  echo "🔴 o fork APAGOU ficheiros do upstream:" >&2
  awk '$1=="D" { print "  " $2 }' "$TMP/estado" >&2
  echo "🔴 Um ficheiro apagado some do diff sem deixar rasto, e um fork que" >&2
  echo "   perdeu um ficheiro dele sem querer já não sincroniza." >&2
  exit 1
fi

FALHOU=0
[ "$ACRESCENTADOS" -le "$MAX_NOSSO" ] || FALHOU=1
[ "$LINHAS" -le "$MAX_LINHAS" ] || FALHOU=1

if [ "$FALHOU" != "0" ]; then
  echo >&2
  echo "🔴 O fork passou o orçamento de divergência." >&2
  echo "🔴 Isto não é um erro a corrigir: é uma DECISÃO, e há duas saídas." >&2
  echo "   1. Ainda é re-sincronizável: o que está a mais sai, e o inventário" >&2
  echo "      passa a dizer o que ficou." >&2
  echo "   2. Já não é: assume-se, sobe-se o número no inventário COM A RAZÃO" >&2
  echo "      escrita, e o fork passa a ser nosso a cheio." >&2
  echo "🔴 O que não se faz é subir o número calado — porque um orçamento que" >&2
  echo "   se estica sozinho mede a nada." >&2
  exit 1
fi

echo "OK  dentro do orçamento."
