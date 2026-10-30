#!/usr/bin/env bash
# 🔴 A prova que mexe no ambiente tem de ser **estável em paralelo** — e a
# única forma de o provar é enfiá-la muitas vezes.
#
# 🔴 Isto não é prudência. A cura da prova `a_funcao_normaliza_o_endereco` foi
# ela deixar de exigir que o ambiente esteja calmo — e não `--test-threads=1`,
# que faz a prova passar sem a deixar de estar errada. Este ficheiro corre o
# número **real** de vezes, com os fios em paralelo, porque é o estado em que
# a suite vive.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

N="${1:-30}"
vermelhas=0

# 🔴 O `cd` vai **antes** do `cargo`, e a primeira versão tinha-o depois — o
# `cd "$(dirname …)/.."` é relativo ao script, e a folha foi chamada de outro
# sítio, ficou no `$HOME` e o `cargo` respondeu `could not find Cargo.toml in
# E:\`. 🔴 O sintoma (60 de 60 "vermelhas") era do `cargo`, e a folha/reportou
# como se fosse da **prova** — que foi a leitura errada.
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2

# 🔴 O binário de teste é construido **uma vez** e corrido N vezes. Com
# `cargo test` a cada volta eram 3 minutos por corrida, e o `cargo` do Git Bash
# não estava no `PATH` — as 30 voltaram com `command not found` e a folha
# chamou-lhes "vermelhas".
#
# E a lição, a quinta desta folha: **quando tudo falha sempre, o que falhou não
# é o produto.** Instabilidade verdadeira é intermitente; sempre igual é
# configuração.
# 🔴 O `ls` fica **fora** do `$( )` e a variável é montada à mão. A primeira
# versão pôs o `${AEGIS_TARGET:-…}` **dentro** das aspas do `ls -t`, e o shell
# leu o `2>/dev/null` como parte do padrão: `unexpected EOF while looking for
# matching ')'`, e a folha morre no **parser**, antes de correr uma vez sequer.
#
# 🔴 Sintoma de uma folha que nem chegou a correr. E é o que mais custa a
# diagnosticar: o número de linhas do ficheiro aponta para o ficheiro, e a
# causa está numa linha que já não existe. 🔴 A regra é a da casa: **o
# sintoma aponta para o sítio onde o erro aparece, e a causa raramente lá
# está.**
ALVO="${AEGIS_TARGET:-/e/aegis-target}"
EXE="$(ls -t "$ALVO"/debug/deps/aegis_produto-*.exe 2>/dev/null | head -1)"
if [ -z "$EXE" ]; then
  echo "FALHA: nao achei o binario de teste em $ALVO/debug/deps." >&2
  echo "       Constroi-o com: cargo build -p aegis-produto --tests" >&2
  exit 2
fi

for i in $(seq 1 "$N"); do
  if ! "$EXE" 2>&1 | grep -q 'test result: ok'; then
    vermelhas=$((vermelhas + 1))
    echo "🔴 corrida $i: VERMELHA"
  fi
done

echo
if [ "$vermelhas" -gt 0 ]; then
  echo "FALHA: $vermelhas de $N corridas vermelhas, com os fios em paralelo." >&2
  echo "🔴 Uma prova que depende da ordem das outras nao esta a medir o que" >&2
  echo "   diz medir — e da proxima vez a falha aparece noutra prova, sem" >&2
  echo "   ninguem conseguir aponta-la para ca." >&2
  exit 1
fi
echo "OK  $N corridas, todas verdes, em paralelo."
