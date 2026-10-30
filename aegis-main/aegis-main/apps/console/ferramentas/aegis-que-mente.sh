#!/usr/bin/env bash
# ðŸ”´ Um `aegis` que mente â€” e que mente **sÃ³** no sitio que a folha tem de
# apanhar.
#
# A primeira versÃ£o devolvia uma lista de ferramentas VAZIA, e a folha
# reprovava no `FALHA: falta <ferramenta>` â€” antes de nunca chegar Ã  linha do
# `sh`. Ou seja: o caso "a folha morde" estava a ser medido pelo motivo errado,
# e teria passado mesmo que a folha aceitasse a mentira. ðŸ”´ Ã‰ o mesmo defeito
# da planta que nÃ£o entra, noutra forma: um caso que reprova por um motivo que
# nÃ£o Ã© o que diz.
#
# Este serve a lista **completa** e mente **apenas** na linha do interpretador.
set -uo pipefail

LISTA='{"jsonrpc":"2.0","id":0,"result":{"tools":[
 {"name":"vertical_manifesto"},{"name":"camera_listar"},{"name":"camera_adicionar"},
 {"name":"camera_remover"},{"name":"licenca_fingerprint"},{"name":"licenca_conferir"},
 {"name":"ilha_vertical"},{"name":"ilha_tipos"},{"name":"ilha_pagina"},{"name":"ilha_saude"},
 {"name":"diagnostico"}]}}'

HONESTO='{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\n  \"linhas\": [\n    {\"codigo\": \"diag.interpretador\", \"situacao\": \"NAOCONFERIDO\", \"medido\": \"conferido de dentro da ilha, nao daqui\"}\n  ],\n  \"veredicto\": \"Nada falta, mas 1 verificacao nao deu para conferir.\"\n}"}],"isError":false}}'

MENTIRA='{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\n  \"linhas\": [\n    {\"codigo\": \"diag.interpretador\", \"situacao\": \"FALTA\", \"medido\": \"nao ha sh nesta maquina\"}\n  ],\n  \"veredicto\": \"Falta 1 coisa(s).\"\n}"}],"isError":false}}'

# ðŸ”´ A folha manda o pedido **por stdin** e os argumentos na linha de
# comandos â€” e Ã© por isso que o `case "$*"` nÃ£o chega: os dois `tools/list` e
# `tools/call` chegam com os mesmos argumentos (`mcp --vertical â€¦ --licenca
# â€¦`), e a distinguishing estÃ¡ no **stdin**, que o `case` nÃ£o vÃª.
#
# A primeira versÃ£o branchesava pelos argumentos e por isso respondia sempre
# com a resposta da `tools/call`; a folha via uma lista de ferramentas com zero
# entradas e reprovava no `FALHA: falta â€¦`. ðŸ”´ O sintoma apontava para a folha
# (`falta vertical_manifesto`) e a causa era o falso mal feito.
pedido="$(cat)"

case "$pedido" in
  *tools/list*) printf '%s\n' "$LISTA" ;;
  *)
    if [ -n "${AEGIS_FALSO_MENTE:-}" ]; then printf '%s\n' "$MENTIRA"
    else printf '%s\n' "$HONESTO"; fi ;;
esac
