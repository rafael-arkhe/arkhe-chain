#!/bin/sh
# 🔴 A prova do Construtor corre contra uma **cópia** do vertical, nunca
# contra o repositório.
#
# Duas vezes esta prova estragou o ficheiro que estava a provar: um
# `git checkout` de limpeza reverteu a correção do vocabulário
# (`objectSet` → `object_set`) **depois** de ela estar feita e verificada.
# A guarda apanhou as duas — mas a guarda não devia ter sido o que me
# salvou. Uma prova que mexe na coisa que prova é uma fonte de corrupção
# com plagiarism de-li-o-bem.
set -eu

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
COPIA="$(mktemp -d)"
cp -r "$RAIZ/verticals/hotelaria" "$COPIA/"
cp -r "$RAIZ/crates/aegis-license/fixtures" "$COPIA/fixtures"

BANCO="${AEGIS_BANCO:?defina AEGIS_BANCO}"
: "${AEGIS_RAIZ_VENDOR:=$(cat "$COPIA/fixtures/chaves/vendor-teste.pub")}"
export AEGIS_RAIZ_VENDOR
# 🔴 O alvo da build é o do `CARGO_TARGET_DIR` quando existe, e não o
# `target/debug` do repo. Este repo compila para **E:** porque o `target` são
# 20 GB e o `C:` encheu — e uma prova que procura o binário num caminho fixo
# diz "SKIP, não correu" numa máquina onde ele está compilado, que é a forma
# mais cara de uma prova não correr: ninguém sabe que ela existe.
# 🔴 A licença é a da **plataforma**, e a máquina é **nomeada** — pelo mesmo
# motivo da prova da troca de produtos: a licença é `node-lock` sobre máquina +
# sistema, e um fixture emitido na bancada Windows é recusado num runner Linux,
# e bem recusado. Com a ilha recusada, `/health` nunca responde e a prova falha
# com um `curl` que não diz porquê.
PLATAFORMA=windows
[ "$(uname -s 2>/dev/null || echo Windows)" = "Linux" ] && PLATAFORMA=linux
MAQUINA_DE_TESTE=aegis-maquina-de-teste
LICENCA="$COPIA/fixtures/licenca-hotelaria-$PLATAFORMA.json"
[ -f "$LICENCA" ] || { echo "  FALHOU: não há licença de $PLATAFORMA — gere-as com node ferramentas/gerar-fixtures.mjs"; exit 1; }

ALVO="${CARGO_TARGET_DIR:-$RAIZ/target}"
BIN="$ALVO/debug/aegis"
# 🔴 `-j 2`: nesta bancada o `rustc` morre com `STATUS_STACK_BUFFER_OVERRUN`
# a compilar com o paralelismo todo. O CI leva o mesmo em `CARGO_BUILD_JOBS`.
[ -x "$BIN" ] || cargo build -j 2 --manifest-path "$RAIZ/Cargo.toml" -p aegis

PORTA="${AEGIS_PROVA_PORTA:-8031}"
"$BIN" ilha servir --vertical "$COPIA/hotelaria" \
  --licenca "$LICENCA" \
  --chave-oem "$COPIA/fixtures/chave-oem.json" \
  --machine-id "$MAQUINA_DE_TESTE" \
  --porta "$PORTA" >"$COPIA/ilha.log" 2>&1 &
ILHA=$!
limpar() { kill "$ILHA" 2>/dev/null || true; rm -rf "$COPIA"; }
trap limpar EXIT

i=0
subiu=nao
while [ "$i" -lt 30 ]; do
  if curl -fsS "http://127.0.0.1:$PORTA/health" >/dev/null 2>&1; then subiu=sim; break; fi
  i=$((i + 1)); sleep 1
done

# 🔴 Se a ilha não subiu, o resto da prova ia falhar no primeiro `curl` com
# um "connection refused" que não diz nada — e o log da ilha, que diz tudo,
# ficava num ficheiro temporário apagado no `trap`. Este é o ponto: uma
# prova que não consegue ver a causa é uma prova que obriga a adivinhar.
[ "$subiu" = "sim" ] || {
  echo "  FALHOU: a ilha não respondeu em /health depois de 30 s."
  echo "  O que ela disse:"
  sed 's/^/    /' "$COPIA/ilha.log" || echo "    (sem log)"
  exit 1
}

falhou() { echo "  FALHOU: $1"; exit 1; }

antes=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORTA/p/reservas-do-dia")
[ "$antes" = "404" ] || falhou "a página nova devia dar 404 antes de existir"

codigo=$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  "http://127.0.0.1:$PORTA/construtor/nova" \
  -d "slug=reservas-do-dia" \
  -d "colunas=reserva.codigo,reserva.entrada,reserva.saida,reserva.situacao")
[ "$codigo" = "303" ] || falhou "criar a página devia dar 303, deu $codigo"

[ -f "$COPIA/hotelaria/paginas/reservas-do-dia.json" ] || falhou "a página não foi escrita"
grep -q reservas-do-dia "$COPIA/hotelaria/vertical.yaml" || falhou "o manifesto não a declara"

depois=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORTA/p/reservas-do-dia")
[ "$depois" = "200" ] || falhou "a ilha devia ver a página sem reiniciar, deu $depois"

linhas=$(curl -sS "http://127.0.0.1:$PORTA/api/v1/paginas/reservas-do-dia" \
  | sed 's/.*"total":\([0-9]*\).*/\1/')
[ "${linhas:-0}" -ge 1 ] || falhou "a tabela saiu vazia"

# E o vertical gerado volta a instalar.
"$BIN" ilha instalar --vertical "$COPIA/hotelaria" \
  --licenca "$LICENCA" \
  --chave-oem "$COPIA/fixtures/chave-oem.json" \
  --machine-id "$MAQUINA_DE_TESTE" >/dev/null \
  || falhou "o vertical gerado deixou de instalar"

echo "  OK  antes=404  gravar=303  depois=200  linhas=$linhas  reinstala=sim"
echo "  (o repositório não foi tocado: a prova correu em $COPIA)"
