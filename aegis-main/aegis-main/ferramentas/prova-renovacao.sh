#!/usr/bin/env bash
# O ciclo da renovação CONTRA O BINÁRIO.
#
# 🔴 Por que isto é um ficheiro e não um `cargo test`: o que se prova aqui é o
# **gesto**, e o gesto não existe dentro de um teste — existe entre o binário,
# o disco e o emissor. Um teste que chama a biblioteca prova a biblioteca.
#
# E o emissor de verdade está dos outros lados: o `aegis-cli` é quem assina, e
# esta prova responde ao pedido que o BINÁRIO escreveu, com o pedido esse. Não
# há atalho — se o formato do pedido divergir uma vírgula, o emissor recusa, e
# a recusa aparece aqui.
#
# 🔴 E as variantes saem todas **daqui**, e não dos fixtures versionados. Os
# fixtures trazem o fingerprint de `aaaa…` e esta máquina tem o dela; usá-los
# para esperar um motivo específico mediria a máquina errada — a recusa viria
# pelo `licenca.fingerprint`, que é a **primeira** a dispar, e a prova passaria
# a medir outra coisa. A matriz completa de recusas está em
# `crates/aegis-license/tests/renovacao.rs`; aqui o que se prova é o GESTO.
#
#   bash ferramentas/prova-renovacao.sh
#
# 🔴 Sem o `aegis-cli` o resultado é **SKIP com código 0** — como a casa já
# mediu: reprovar por runner limpo ensina a ignorar o vermelho. Mas a prova
# diz que **não correu**, nunca que passou.
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(dirname "$AQUI")"
EMISSOR="$RAIZ/../aegis-cli/src/licenca.js"
FIXTURES="$RAIZ/crates/aegis-license/fixtures"
CHAVES="$FIXTURES/chaves"
# 🔴 O alvo da build é o do `CARGO_TARGET_DIR` quando existe, e não o
# `target/debug` do repo. Este repo compila para **E:** porque o `target` são
# 20 GB e o `C:` encheu — e uma prova que procura o binário num caminho fixo
# diz "SKIP, não correu" numa máquina onde ele está compilado, que é a forma
# mais cara de uma prova não correr: ninguém sabe que ela existe.
ALVO="${CARGO_TARGET_DIR:-$RAIZ/target}"
AEGIS="$ALVO/debug/aegis"
[ -x "$AEGIS" ] || AEGIS="$AEGIS.exe"

falhas=0
passou() { printf '  OK    %s\n' "$1"; }
falhou() { printf '  FALHA %s\n         %s\n' "$1" "$2"; falhas=$((falhas + 1)); }

# ---------------------------------------------------------------------------
# Bancada
# ---------------------------------------------------------------------------
[ -f "$EMISSOR" ] || { echo "SKIP: o aegis-cli não está ao lado — este teste NÃO RODOU"; exit 0; }
[ -x "$AEGIS" ] || { echo "SKIP: o binário não está compilado (cargo build -p aegis) — NÃO RODOU"; exit 0; }
command -v node >/dev/null 2>&1 || { echo "SKIP: sem node — este teste NÃO RODOU"; exit 0; }

# 🔴 A raiz é a do **vendor** e vem do ambiente ou do binário — nunca do
# ficheiro de licença. Uma prova que põe a raiz numa variável dela própria
# prova que a raiz funciona, e não que a raiz se resolve.
[ -n "${AEGIS_RAIZ_VENDOR:-}" ] || \
  AEGIS_RAIZ_VENDOR="$(tr -d '\r\n' < "$CHAVES/vendor-teste.pub")"
[ -n "$AEGIS_RAIZ_VENDOR" ] || { echo "SKIP: sem raiz do vendor — NÃO RODOU"; exit 0; }
export AEGIS_RAIZ_VENDOR

BANCO="$(mktemp -d)"
trap 'rm -rf "$BANCO"' EXIT
OEM="$FIXTURES/chave-oem.json"
LIC="$BANCO/licenca.lic"
PEDIDO="$BANCO/pedido-renovacao.json"

# O emissor, em vez única. 🔴 `privada` é a chave de **TESTE** do repo, e é
# por isso que o que sai daqui é uma licença de bancada e não uma licença de
# cliente: a raiz de teste é recusada pela raiz de produção, e essa recusa é
# uma das provas do verificador.
cat > "$BANCO/emitir.mjs" <<EMISSOR
import { readFileSync, writeFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import { pathToFileURL } from "node:url";

const m = await import(pathToFileURL(process.env.AEGIS_EMISSOR).href);
const [, , pedidoPath, saida, modo] = process.argv;
const pedido = JSON.parse(readFileSync(pedidoPath, "utf8"));
const privada = createPrivateKey(
  readFileSync(process.env.AEGIS_CHAVE_PARCEIRO, "utf8"),
);

// O pedido que a resposta responde. Só o "outro" troca o nonce; o resto
// responde ao pedido real, que é o que a prova está a medir.
const alvo = modo === "outro" ? { ...pedido, pedido_id: "00000000-0000-4000-8000-000000000000" } : pedido;

const licenca = m.montarEnvelope({
  tipo: m.TIPO_LICENCA,
  payload: m.montarLicenca({
    parceiro: alvo.parceiro,
    seed: alvo.seed,
    host: alvo.host,
    fingerprint: alvo.fingerprint,
    prazo: "180d",
    emitidaEm: alvo.em,
    licencaId: alvo.licenca_id,
  }),
  privada,
});

const resposta = m.montarResposta({
  pedido: alvo,
  decisao: modo === "negar" ? "negar" : "renovar",
  motivo: modo === "negar" ? "contrato nao renovado para este periodo" : "",
  ...(modo === "negar" ? {} : { licenca }),
  emitidaEm: alvo.em,
  privada,
});
writeFileSync(saida, JSON.stringify(resposta, null, 2) + "\n");
EMISSOR

export AEGIS_EMISSOR="$EMISSOR"
export AEGIS_CHAVE_PARCEIRO="$CHAVES/parceiro-teste.key"

emitir() { # emitir <saida> <modo>
  node "$BANCO/emitir.mjs" "$PEDIDO" "$1" "$2" 2>&1
}

# O que a casca devolve: o código e o texto. 🔴 A prova compara pelo **código**,
# nunca pela frase — a casa já mediu que casar texto dentro da frase quebra no
# dia em que a frase é reescrita, e passaria a dizer outra coisa.
conferir() { # conferir <nome> <codigo-esperado> <resposta> [args...]
  local nome="$1" esperado="$2"; shift 2
  local saida codigo
  saida=$("$AEGIS" "$@" 2>&1); codigo=$?
  if [ "$codigo" -ne 3 ]; then
    falhou "$nome" "esperava recusa (3) e saiu com $codigo: $saida"
  elif ! printf '%s' "$saida" | grep -q "\[$esperado\]"; then
    falhou "$nome" "esperava o motivo [$esperado] e saiu com: $saida"
  else
    passou "$nome"
  fi
}

cp "$FIXTURES/licenca-ok.json" "$LIC"
echo "== o ciclo da renovacao, contra o binario =="

# ---------------------------------------------------------------------------
# 1. O primeiro tempo
# ---------------------------------------------------------------------------
saida=$("$AEGIS" licenca renovar --licenca "$LIC" 2>&1); codigo=$?
if [ "$codigo" -eq 0 ] && [ -f "$PEDIDO" ]; then
  passou "o primeiro tempo escreve o pedido ao lado da licenca"
else
  falhou "o primeiro tempo escreve o pedido" "saida=$codigo: $saida"
  echo "FALHA  o pedido nao existe — o resto da prova mediria nada"
  exit 1
fi

# 🔴 O pedido tem de ser do **formato que o emissor lê**. Campo a mais ou a
# menos é um pedido que ninguém sabe responder, e o sintoma na bancada seria
# "a máquina tirou o pedido e o parceiro diz que não reconhece".
saida=$(node -e '
  const fs = require("node:fs");
  const { pathToFileURL } = require("node:url");
  const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  // 🔴 O import tem de ser uma URL `file://`. Um caminho Windows cru dá
  // `ERR_UNSUPPORTED_ESM_URL_SCHEME`, e o erro aponta para o esquema em vez
  // de apontar para o caminho — que é a combinação mais cara de errar.
  import(pathToFileURL(process.env.AEGIS_EMISSOR).href).then((e) => {
    e.lerPedidoRenovacao(p);
  });
' "$PEDIDO" 2>&1)
if [ -z "$saida" ]; then
  passou "o emissor de verdade le o pedido que o binario escreveu"
else
  falhou "o emissor le o pedido" "$saida"
fi

# ---------------------------------------------------------------------------
# 2. O segundo tempo
# ---------------------------------------------------------------------------
if [ -z "$(emitir "$BANCO/ok.json" ok)" ]; then
  passou "o emissor de verdade assina uma resposta para esse pedido"
else
  falhou "o emissor assina a resposta" "$(emitir "$BANCO/ok.json" ok)"
fi

saida=$("$AEGIS" licenca renovar "$BANCO/ok.json" --licenca "$LIC" --chave-oem "$OEM" 2>&1); codigo=$?
if [ "$codigo" -eq 0 ]; then
  passou "a resposta renova e grava"
else
  falhou "a resposta renova e grava" "saida=$codigo: $saida"
fi

# 🔴 O que fica no disco é a licença **de dentro**. Copiar o envelope poria
# `tipo: resposta` no lugar da licença, e o verificador leria um documento que
# não é licença — sem `expira_em` no payload.
tipo=$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).tipo)' "$LIC" 2>&1)
if [ "$tipo" = "licenca" ]; then
  passou "o que se gravou e a licenca de dentro, nao o envelope"
else
  falhou "o que se gravou e a licenca de dentro" "o ficheiro tem tipo=$tipo"
fi

# E a licença gravada tem de continuar a **conferir** — o teste mais óbvio do
# mundo, e o único que deteta "gravou-se um documento que ninguém vai ler".
saida=$("$AEGIS" licenca conferir --vertical "$RAIZ/verticals/hotelaria" \
  --licenca "$LIC" --chave-oem "$OEM" 2>&1); codigo=$?
if [ "$codigo" -eq 0 ]; then
  passou "a licenca gravada continua a conferir pelo verificador"
else
  falhou "a licenca gravada confere" "saida=$codigo: $saida"
fi

# ---------------------------------------------------------------------------
# 3. As recusas do GESTO
# ---------------------------------------------------------------------------
emitir "$BANCO/negada.json" negar >/dev/null 2>&1
conferir "quem emitiu recusou, e o motivo volta em palavras" "renovacao.recusada" \
  licenca renovar "$BANCO/negada.json" --licenca "$LIC" --chave-oem "$OEM"

emitir "$BANCO/outro.json" outro >/dev/null 2>&1
conferir "uma resposta de outro pedido nao vale" "renovacao.pedido-outro" \
  licenca renovar "$BANCO/outro.json" --licenca "$LIC" --chave-oem "$OEM"

conferir "sem a Chave OEM a renovacao recusa" "licenca.sem-chave-oem" \
  licenca renovar "$BANCO/ok.json" --licenca "$LIC"

# 🔴 Sem pedido pendente não se aplica nada. E é por isso que o pedido **não**
# é apagado ao aplicar.
mv "$PEDIDO" "$BANCO/pedido-guardado.json"
conferir "sem pedido pendente nada e aplicado" "renovacao.sem-pedido" \
  licenca renovar "$BANCO/ok.json" --licenca "$LIC" --chave-oem "$OEM"
mv "$BANCO/pedido-guardado.json" "$PEDIDO"

# 🔴 A MESMA resposta outra vez **tem de passar**, e é contra-intuitivo: o
# pedido pendente não é consumido. A garantia contra o replay é o não-encurta,
# que mede contra o documento do disco. Esta linha existe para FIXAR o
# comportamento — a primeira versão da documentação dizia o contrário, e a
# documentação estava errada.
saida=$("$AEGIS" licenca renovar "$BANCO/ok.json" --licenca "$LIC" --chave-oem "$OEM" 2>&1); codigo=$?
if [ "$codigo" -eq 0 ]; then
  passou "reaplicar a mesma resposta reescreve a mesma licenca (e nao encurta)"
else
  falhou "reaplicar a mesma resposta" "saida=$codigo: $saida"
fi

# E o que a pendencia realmente fecha: um pedido novo invalida a resposta velha.
"$AEGIS" licenca renovar --licenca "$LIC" >/dev/null 2>&1
conferir "um pedido novo invalida a resposta antiga" "renovacao.pedido-outro" \
  licenca renovar "$BANCO/ok.json" --licenca "$LIC" --chave-oem "$OEM"

# ---------------------------------------------------------------------------
echo
if [ "$falhas" -eq 0 ]; then
  echo "OK  o ciclo da renovacao esta fechado nas duas faces"
  exit 0
fi
echo "FALHA  $falhas verificacao(oes)"
exit 1
