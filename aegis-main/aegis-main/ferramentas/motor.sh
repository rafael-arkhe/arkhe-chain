#!/usr/bin/env bash
# 🔴 O motor é **pino** — e o pino é uma **ficha de configuração**, não código.
#
# Porquê uma folha: o `opencode` é motor **nativo** do fork (o driver
# `server/drivers/acp/opencode-go.ts`, `spawnArgs ["acp"]`), e portanto o que
# resta do D8 não é integração — é a configuração que o dono tem de levar a uma
# máquina nova sem ninguém_a_descobrir nada. 🔴 A palavra do plano é *"nada
# descoberto à mão"*, e isso é uma frase sobre um ficheiro, não sobre um
# documento.
#
#   bash ferramentas/motor.sh          # mede
#   bash ferramentas/motor.sh --ci     # reprova o que falta
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

EQUIPA=apps/console/equipa
C=apps/console
falhas=0
contador=0

checar() {
  local ficheiro="$1" razao="$2"
  contador=$((contador + 1))
  if [ ! -e "$C/$ficheiro" ]; then
    echo "🔴 falta $ficheiro — $razao"
    falhas=$((falhas + 1))
  fi
}

echo "=== o motor é pado ==="

# 1. A ficha do motor. 🔴 E o `driver` tem de ser o **nativo** (`opencode`), e
#    não `customAcp`: o upstream mantém o CLI, descobre o catálogo com
#    `opencode models --verbose` e passa o modelo escolhido por
#    `session/set_config_option`. 🔴 `customAcp` seria um caminho mais longo para
#    o mesmo sítio, e um caminho que o upstream não testa.
checar "equipa/engine.json" "é a ficha que o fork copia no arranque"
contador=$((contador + 1))
if ! grep -q '"driver": "opencode"' "$EQUIPA/engine.json" 2>/dev/null; then
  echo '🔴 engine.json não usa o driver nativo "opencode"'
  echo "     O OpenCode é motor nativo do upstream (server/drivers/acp/opencode-go.ts)."
  echo "     Usar customAcp seria um caminho mais longo para o mesmo sítio."
  falhas=$((falhas + 1))
fi

# 2. E o rótulo é o nosso. 🔴 A regra da casa: o runtime aparece como **AIP**.
contador=$((contador + 1))
if ! grep -q '"displayName": "AIP"' "$EQUIPA/engine.json" 2>/dev/null; then
  echo '🔴 engine.json não dá o rótulo AIP ao motor'
  echo "     A regra do CLAUDE.md da casa: o runtime aparece como AIP, nunca"
  echo "     com o nome de um terceiro."
  falhas=$((falhas + 1))
fi

# 3. O registo do MCP. 🔴 E o comando é o **binário de produto**, não um
#    plugin: sem licença válida o processo não arranca, e isso é o portão.
checar "equipa/mcp.json" "é o registo do aegis mcp que o motor lê"
contador=$((contador + 1))
if ! grep -q '"command": "aegis"' "$EQUIPA/mcp.json" 2>/dev/null; then
  echo '🔴 mcp.json não aponta para o binário "aegis"'
  echo "     O servidor MCP é o binário de produto a correr, e não um plugin."
  falhas=$((falhas + 1))
fi
contador=$((contador + 1))
# 🔴 O bloco `args` é lido até ao `]` que o fecha, e não com um `grep -A20`.
# 🔴 A primeira versão usava `-A20` e acusou o `mcp.json` de passar a chave nos
# argumentos — 🔴 quando a chave está no `env`, que é **onde ela deve estar**, e
# vinte linhas depois do `args`. 🔴 O sintoma ("o produto passa a chave no
# comando") apontava para o ficheiro, e o culpado era a janela de leitura.
# 🔴 E uma guarda que acusa o ficheiro certo pela razão errada é a forma mais
# cara de uma guarda: a pessoa vai corrigir o ficheiro e estragar o que estava
# bem.
args_bloco="$(sed -n '/"args"/,/\]/p' "$EQUIPA/mcp.json" 2>/dev/null)"
if printf '%s' "$args_bloco" | grep -qE 'CHAVE_OEM|chave-oem=|--chave-oem +[^"]*\.json'; then
  echo "🔴 mcp.json passa a Chave OEM nos argumentos"
  echo "     Uma chave num args aparece no ps de qualquer processo da máquina."
  echo "     No bloco lido:"
  printf '       %s\n' "$args_bloco" | head -8
  falhas=$((falhas + 1))
fi

# 4. O time em Markdown. 🔴 E vive em `equipa/`, **nunca** em `skills/` nem em
#    `.claude/` — que são pastas do upstream. 🔴 Um `git pull` que trouxesse
#    bots de outro cliente para esta instância é a mesma classe de defeito da
#    seed_portaria_acesso.py, que importava as seeds alheias.
checar "equipa/AEGIS.md" "é o AGENTS.md do AEGIS"
contador=$((contador + 1))
if [ -d "$C/skills" ] && grep -rqiE "AEGIS|agente do AEGIS" "$C/skills" 2>/dev/null; then
  echo "🔴 a pasta skills/ do upstream tem conteudo nosso"
  echo "     O nosso dado vive em equipa/. Um git pull tem de poder trazer"
  echo "     o upstream inteiro sem trazer o bot de outro cliente."
  falhas=$((falhas + 1))
fi

echo
echo "verificados: $contador    por corrigir: $falhas"

if [ "${1:-}" = "--ci" ] && [ "$falhas" -gt 0 ]; then
  echo >&2
  echo "FALHA: o motor não está pado." >&2
  exit 1
fi
[ "${1:-}" = "--ci" ] && echo "OK  o motor está pado e é o nosso."

# ---------------------------------------------------------------------------
# A folha tem de morder: trocar o driver e ver que reprova
# ---------------------------------------------------------------------------
#
# 🔴 E planta-se o `driver`, e não o `displayName`: o driver é a decisão que
# muda o **comportamento** (nativo vs `customAcp`), e um displayName trocado
# numa folha que só lê texto provaria que o `grep` funciona.
if [ "${1:-}" = "--morde" ]; then
  F="$EQUIPA/engine.json"
  cp "$F" "$F.morde.bak"
  restaura() { mv "$F.morde.bak" "$F"; }
  trap restaura EXIT

  sed -i 's/"driver": "opencode"/"driver": "customAcp"/' "$F"
  if ! grep -q '"driver": "customAcp"' "$F"; then
    echo "FALHA: o defeito NAO foi plantado, e este caso nao mediu nada." >&2
    exit 1
  fi
  if bash "$0" --ci >/dev/null 2>&1; then
    echo "FALHA: a folha passou com o motor trocado de nativo para customAcp." >&2
    exit 1
  fi
  echo "OK  a folha reprovou quando o motor deixou de ser o nativo."
  exit 0
fi

exit 0
