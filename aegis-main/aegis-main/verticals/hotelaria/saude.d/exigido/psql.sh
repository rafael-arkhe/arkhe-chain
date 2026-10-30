#!/bin/sh
# Convenção greenboot: um `exigido/*.sh` que sai diferente de zero REPROVA a
# ilha. O agente não sabe o que este script checa — é o vertical que sabe.
#
# 🔴 Por que existe: a casa já mediu um gate de update que nunca reprovou
# porque lia um `servicos.env` que não existe em ilha nenhuma. A lista ficava
# vazia e o gate devolvia "saudável" incondicionalmente. Aqui a lista vem do
# manifesto, e script nenhum = reprovado, não aprovado por omissão.

set -eu

# `AEGIS_BANCO` é posto pelo motor da ilha ao correr esta verificação.
if [ -z "${AEGIS_BANCO:-}" ]; then
    echo "exigido/banco.sh: AEGIS_BANCO não foi posto pelo motor" >&2
    exit 2
fi

# `psql` é opcional: se não estiver presente, a verificação não pode ser
# feita, e "não pude conferir" NÃO é "está bem". Sai 2 — inconclusivo.
if ! command -v psql >/dev/null 2>&1; then
    echo "exigido/banco.sh: psql não está disponível; inconclusivo" >&2
    exit 2
fi

psql "$AEGIS_BANCO" -tAc "select 1 from aegis_tenant limit 1" >/dev/null
