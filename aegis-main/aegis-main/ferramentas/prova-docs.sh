#!/usr/bin/env bash
# A prova de que o livro **sai do repo** e não de uma cópia.
#
# 🔴 Por que isto é uma prova e não uma receita: a promessa do livro é que ele
# não pode divergir do produto, porque cada capítulo é um `{{#include}}` de um
# ficheiro que já está versionado. Essa promessa **cai** no dia em que alguém
# copia um README para dentro de `src/` "para dar jeito" — e a partir daí há
# duas documentações, e a que se lê é a errada.
#
# O que se mede, em três coisas:
#
#   1. cada `src/*.md` é um `{{#include}}` — e nada mais;
#   2. o ficheiro incluído **existe** (o `mdbook` já falha se não, e aqui
#      falamos antes, com o nome do ficheiro);
#   3. o livro **constrói** — e sai sem CDN, que é o que faz a documentação
#      de uma ilha sem internet ser a mesma que a de quem tem.
#
#   bash ferramentas/prova-docs.sh
#
# 🔴 Sem o `mdbook` o resultado é **SKIP com código 0**: a prova mede ESTADO
# desta máquina, e reprovar por runner limpo ensina a ignorar o vermelho. Mas
# ela diz que **não correu**, nunca que passou.
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(dirname "$AQUI")"

falhas=0
passou() { printf '  OK    %s\n' "$1"; }
falhou() { printf '  FALHA %s\n         %s\n' "$1" "$2"; falhas=$((falhas + 1)); }

echo "== o livro sai do repo? =="

# ---------------------------------------------------------------------------
# 1. Nenhum capítulo é uma cópia.
# ---------------------------------------------------------------------------
# 🔴 O único conteúdo permitido num `src/*.md` é a linha do `{{#include}}`.
# Qualquer outra coisa é a cópia que a regra promete que não existe — e o
# sintoma dela é um livro que discorda do README sem que ninguém mexa no
# README.
for f in "$RAIZ"/src/*.md; do
  nome="$(basename "$f")"
  [ "$nome" = "SUMMARY.md" ] && continue
  corpo="$(grep -v '^[[:space:]]*$' "$f")"
  if ! printf '%s' "$corpo" | grep -q '{{#include'; then
    falhou "$nome tem conteúdo próprio" \
      "um capítulo que escreve em vez de incluir é a segunda cópia da \
       documentação — e a que ninguém actualiza."
  elif [ "$(printf '%s\n' "$corpo" | grep -c '{{#include')" != "1" ] ||
           [ "$(printf '%s\n' "$corpo" | grep -vc '{{#include')" != "0" ]; then
    falhou "$nome tem mais do que o include" \
      "o capítulo tem texto que não vem do repo"
  else
    passou "$nome é um include, e só"
  fi
done

# ---------------------------------------------------------------------------
# 2. O que é incluído existe.
# ---------------------------------------------------------------------------
for f in "$RAIZ"/src/*.md; do
  [ "$(basename "$f")" = "SUMMARY.md" ] && continue
  # 🔴 O caminho é **somado**, e não é `cd` para dentro do ficheiro. Esta prova
  # corre no Git Bash do Windows, onde `cd ficheiro` falha com "Not a
  # directory" — o que produzia cinco falsos negativos com o livro à vista.
  # E o `tr -d '\r'` não é updates de estilo: o `git` pode entregar ficheiros
  # com CRLF mesmo no Linux, e um `\r` colado ao fim do caminho torna um
  # ficheiro que **existe** num caminho que não existe.
  alvo="$(sed -n 's/.*{{#include *\([^}]*\)}.*/\1/p' "$f" | head -1 | tr -d '\r')"
  [ -z "$alvo" ] && continue
  pasta="$(cd "$(dirname "$f")" 2>/dev/null && pwd)"
  caminho="$pasta/$alvo"
  if [ -f "$caminho" ]; then
    passou "$(basename "$f") → $alvo existe"
  else
    falhou "$(basename "$f") → $alvo" "o ficheiro incluído não existe ($caminho)"
  fi
done

# ---------------------------------------------------------------------------
# 3. O livro constrói, e sai sem CDN.
# ---------------------------------------------------------------------------
if ! command -v mdbook >/dev/null 2>&1; then
  echo "SKIP: o mdbook não está instalado — este teste NÃO RODOU"
  exit 0
fi

saida=$(cd "$RAIZ" && mdbook build 2>&1)
if [ $? -ne 0 ]; then
  falhou "o livro constrói" "$saida"
else
  passou "o livro constrói"
fi

# 🔴 Sem CDN. Um livro que busca a fonte no Google Fonts fica em Times New Roman
# **exatamente** no sitio onde a ilha vive — que é uma máquina sem internet.
# E a falha é invisível: o build passa, o site abre, e só se vê abrindo-o.
cdns=$(grep -rho "https://[a-z0-9.-]*\(googleapis\|gstatic\|unpkg\|jsdelivr\|cdnjs\)[^\"']*" \
  "$RAIZ/book" 2>/dev/null | sort -u)
if [ -z "$cdns" ]; then
  passou "o livro não pede nada à rede"
else
  falhou "o livro não pede nada à rede" "pede: $cdns"
fi

# E a busca tem de estar **embutida**, senão no `file://` — ou numa ilha sem
# rede — desaparece sem erro nenhum.
if [ -f "$RAIZ/book/searchindex.js" ] || ls "$RAIZ"/book/searchindex*.js >/dev/null 2>&1; then
  passou "o índice de busca está no livro"
else
  falhou "o índice de busca está no livro" \
    "sem ele a busca só funciona com servidor — e `copy-js` está ligado no \
     book.toml para ela funcionar sem"
fi

echo
if [ "$falhas" -eq 0 ]; then
  echo "OK  o livro sai do repo, constrói, e não depende da rede"
  exit 0
fi
echo "FALHA  $falhas verificacao(oes)"
exit 1
