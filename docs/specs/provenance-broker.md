# Broker de proveniência

Estado em 17/11/2026: contrato do pacote `packaging/core`. Não é o `CapabilityBroker` de [docs/ACTION-BROKER.md](../ACTION-BROKER.md). Aquele reserva um efeito no host. Este entrega um recibo para outra pessoa conferir. Conferir não reserva efeito.

## O que o broker carrega

Três registros `arkhe-receipt/v1`, cada um assinado por um papel:

| Registro | Emissor | O que a conferência repete |
|---|---|---|
| Admissão | `flow` | Assinatura, chave do arquivo de confiança, hash do assunto e da política que o chamador apresenta |
| Commit | `storage` | Assinatura, raiz recalculada de `raiz_anterior`, quebra de linha, id da admissão, e o vínculo com essa admissão |
| Âncora | `anchor` | Assinatura e o id do commit. Transporte `none` com `pending` fica `INCONCLUSIVE`. Transporte `none` com `confirmed` fica `FAIL` |

O id do recibo é o SHA-256 de `ARKHE-RECEIPT-V1\n` seguido do JSON canônico do corpo. A assinatura Ed25519 cobre os mesmos bytes. O arquivo de confiança nomeia a chave pública de cada papel. Sem `--expect-purpose` igual ao `purpose` desse arquivo, o veredito não fecha em `PASS`.

## O que o broker recusa

Um `PASS` de assinatura não é prova de que o texto do modelo é verdadeiro, de que a ação ocorreu, nem de que um transporte externo confirmou o commit. A superfície atual é o comando `arkhe-provenance-mcp verify` e a ferramenta MCP `verify_receipt`. Os dois devolvem componentes. `overall` é `FAIL` se algum componente é `FAIL`; é `INCONCLUSIVE` se algum é `INCONCLUSIVE` ou `NOT_PERFORMED`; só então é `PASS`.

O servidor em `integrations/verify-mcp` não é este broker. A ferramenta `verify_artifact` deixa a assinatura em `NOT_PERFORMED`.

## Re-provabilidade

Outra pessoa, com o recibo, o arquivo de confiança obtido por outro canal, o assunto e o binário deste pacote, repete o veredito sem `DATABASE_URL` e sem a semente. A demo de um byte está em [packaging/core/demo](../../packaging/core/demo/README.md).
