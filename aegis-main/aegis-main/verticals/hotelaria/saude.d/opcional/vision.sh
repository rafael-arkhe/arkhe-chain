#!/bin/sh
# `opcional/*.sh` que falha só APARECE. Serve para quem é útil mas não é
# necessário — a visão do hotel, por exemplo.
#
# Neste tijolo a hotelaria não tem serviço de visão, então a verificação é
# honesta: diz que não há, e sai 0. Um `exit 0` cego seria pior — diria
# "está tudo bem" sem ter conferido nada.

echo "vision: hotelaria não declara serviço de visão neste vertical"
exit 0
