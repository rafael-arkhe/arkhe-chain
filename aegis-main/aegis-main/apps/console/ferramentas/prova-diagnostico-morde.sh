#!/usr/bin/env bash
# ðŸ”´ A folha tem de **rejeitar a mentira** â€” e a Ãºnica forma honesta de o
# provar Ã© um `aegis` que mente, nÃ£o plantar o defeito na folha.
set -uo pipefail
cd /c/Users/Proton/Documents/apps/safe-core/aegis || exit 1

: "${AEGIS_ILHA_URL:?falta a ilha}"
: "${AEGIS_RAIZ_VENDOR:?falta a raiz}"
F=ferramentas/prova-diagnostico.sh
cp ferramentas/aegis-que-mente.sh /tmp/aegis-falso
chmod +x /tmp/aegis-falso

echo "=== 1. a folha contra um aegis HONESTO ==="
if AEGIS_BIN=/tmp/aegis-falso bash "$F" >/tmp/t1.out 2>/tmp/t1.err; then
  echo "   passou (OK)"
else
  echo "   ðŸ”´ REPROVOU, e devia passar: $(cat /tmp/t1.err)"
  exit 1
fi

echo "=== 2. a folha contra um aegis que MENTE (o sh em FALTA) ==="
if AEGIS_FALSO_MENTE=1 AEGIS_BIN=/tmp/aegis-falso bash "$F" >/tmp/t2.out 2>/tmp/t2.err; then
  echo "   ðŸ”´ PASSOU com a mentira, e devia reprovar"
  exit 1
else
  motivo="$(head -2 /tmp/t2.err | tr '\n' ' ')"
  case "$motivo" in
    *interpretador*)
      echo "   reprovou pelo motivo CERTO: $motivo (OK)" ;;
    *)
      echo "   ðŸ”´ reprovou, mas pelo motivo ERRADO: $motivo"
      echo "      (a folha nao chegou a ver a mentira)"
      exit 1 ;;
  esac
fi

echo
echo "OK  a folha rejeita a mentira, e rejeita-a pela razao certa."
rm -f /tmp/aegis-falso
