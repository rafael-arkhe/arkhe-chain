#!/bin/sh
# 🔴 **Opcional** de propósito.
#
# Esta prova que um cliente **externo** consegue ligar à base com as suas
# ferramentas. É o mesmo que `@banco` mede, visto de fora — e é por isso que
# vai em `opcional`: sem `psql` na máquina, reprovar a instalação seria
# reprovar por ambiente, e é a isso que a casa chama "ensinar a ignorar o
# vermelho".
#
# Numa imagem de produto com `psql`, este passa a `exigido` — e nessa altura
# está a medir o que `@banco` já mede por dentro. A redundância é
# deliberada: por dentro o motor pode mentir, por fora não.
set -eu
[ -n "${AEGIS_BANCO:-}" ] || { echo "o motor nao passou o banco" >&2; exit 2; }
command -v psql >/dev/null 2>&1 || { echo "inconclusivo: nao ha psql" >&2; exit 2; }
psql "$AEGIS_BANCO" -tAc "select 1 from aegis_tenant limit 1" >/dev/null
