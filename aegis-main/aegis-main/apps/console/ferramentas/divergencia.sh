#!/usr/bin/env bash
# 🔴 A divergência do fork, **medida**.
#
# Um fork que "sincroniza com o upstream" sem medir é uma intenção. Esta é a
# medição, e ela tem um número: acima do orçamento, o fork passou a ser nosso e
# decidir que se assume isso é do dono — não desta folha.
#
#   ./ferramentas/divergencia.sh            # o relatório
#   ./ferramentas/divergencia.sh --ci       # falha se algo estiver fora da Lei
#   ./ferramentas/divergencia.sh --buscar   # traz o upstream para comparar
#
# 🔴 Porque o número não sai de uma lista escrita à mão: uma lista escrita à
# mão diverge do `git diff` no primeiro `git pull`, e o que ficaria verde é a
# lista. O inventário diz **o que** é nosso; o `--buscar` diz **quanto**.

set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARQUIVO="equipa/PATCHES-AEGIS.md"
REMOTE="${AEGIS_CONSOLE_UPSTREAM:-https://github.com/milind-soni/OpenMausBot.git}"

# 🔴 O commit de origem, lido do inventário e **não** escrito aqui. Duas
# listas do mesmo facto divergem, e a que ficaria verde é a do código.
ORIGEM="$(sed -n 's/^| commit de origem | `\([0-9a-f]\{40\}\)`.*/\1/p' "$AQUI/$ARQUIVO" || true)"
[ -n "$ORIGEM" ] || { echo "FALHA: não achei o commit de origem em $ARQUIVO" >&2; exit 2; }

# O que é **nosso** e portanto conta para a divergência. A `LICENSE` e a
# `NOTICE` do upstream **não** entram: a Apache-2.0 exige que fiquem, e mexer
# nelas é perder a atribuição, não ganhar divergência.
NOSSOS=(
  "LEIA-ME.md"
  "LICENCA-ESTE-FORK.md"
  "NOTICE-AEGIS.md"
  "equipa"
  "ferramentas/divergencia.sh"
)

relatorio() {
  echo "origem (upstream): $ORIGEM"
  echo
  echo "o que é nosso (conta para a divergência):"
  local falta=0
  for f in "${NOSSOS[@]}"; do
    if [ -e "$AQUI/$f" ]; then
      echo "  ✓ $f"
    else
      echo "  ✗ FALTA $f"
      falta=$((falta + 1))
    fi
  done
  echo
  echo "ficheiros nossos: $(( ${#NOSSOS[@]} - falta )) / ${#NOSSOS[@]}"
  return $falta
}

case "${1:-}" in
  --buscar)
    CACHE="${TMPDIR:-/tmp}/aegis-console-upstream.git"
    if [ ! -d "$CACHE" ]; then
      git clone --bare --filter=blob:none "$REMOTE" "$CACHE" >/dev/null 2>&1 \
        || { echo "FALHA: não consegui falar com o upstream" >&2; exit 1; }
    else
      git -C "$CACHE" fetch --quiet origin
    fi
    echo "upstream em $CACHE"
    echo "origem registada: $ORIGEM"
    echo "head de hoje:     $(git -C "$CACHE" rev-parse origin/HEAD 2>/dev/null || echo '?')"
    exit 0
    ;;
  --ci)
    relatorio || exit 1
    # 🔴 As duas condições que **não se medem por diff** — medem-se por
    # existência, e são as que decidem se isto é legal.
    if [ -e "$AQUI/enterprise" ]; then
      echo "FALHA: o enterprise/ voltou. É source-available e o white-label exige acordo de parceiro." >&2
      exit 1
    fi
    for f in LICENSE NOTICE; do
      [ -e "$AQUI/$f" ] || {
        echo "FALHA: a $f do upstream não pode faltar (Apache-2.0 §4)." >&2; exit 1; }
    done
    # 🔴 E a terceira, que é a que a casa pagou: o `AGPL` não entra. A
    # extensão de percepção do cua-driver é AGPL-3.0 e a consequência aparece
    # no dia da entrega, não no dia do código.
    if grep -rqiE 'omni[Pp]arser|cua-perception' "$AQUI/package.json" "$AQUI/electron" "$AQUI/scripts" 2>/dev/null; then
      echo "FALHA: há uma referência à percepção do CUA (AGPL-3.0) no que é empacotado." >&2
      exit 1
    fi
    echo "OK: o console está na Lei, o enterprise não voltou, e o AGPL não entrou."
    exit 0
    ;;
  *) relatorio || true ;;
esac
