# Design partners

Aberto em 17/11/2026. Semanas 6 a 16 do core empacotado. Este arquivo é o quadro. Não é tração.

O Gate 0 continua o da [auditoria](../../packaging/core/HOW_TO_AUDIT.md): um terceiro reexecuta um recibo sem o ambiente de quem emitiu. Esta fase não o substitui.

## 1. Quem entra

ICP desta fase: o wedge do [§6](segmentos.md), fornecedor AI-nativo ou agência de agentes. O produto dele chama um modelo e uma saída pode virar ferramenta, publicação, pagamento ou merge. A pessoa que responde é quem decide se essa saída segue.

Fica de fora, como na oferta: quem pede selo, custódia, AGI, ou que o Arkhe assine no lugar da equipe.

Duas superfícies, no máximo cinco fornecedores ao mesmo tempo:

| Superfície | Onde está | O que o fornecedor faz |
|---|---|---|
| SDK | `packaging/core/sdk/arkhe_sdk.py` | O processo dele chama `verify_http` ou `verify_mcp` e lê `overall` |
| MCP | `arkhe-provenance-mcp mcp` | O host de ferramenta chama `verify_receipt` por stdio |

`PASS` não autoriza efeito. `INCONCLUSIVE` não é sucesso. O MCP em `integrations/verify-mcp` continua o outro servidor: digest e canonicalização, com assinatura `NOT_PERFORMED`. Ligar um fornecedor nele e seguir adiante não conta como integração.

## 2. Lema condicional

A frase “há disposição a pagar por verificação” é um LEMMA só com o Gate 1 preenchido por um pagamento que outra pessoa possa apontar.

Até lá a frase é CONJECTURE. Não sobem a LEMMA: interesse, piloto, preço dito numa entrevista, fatura emitida pelo próprio autor, verificação do fixture `gate0-lab`, nem execução deste SDK na máquina de quem escreve o código.

## 3. Dez entrevistas

Esta seção não é o [experimento 01](experimento-01.md). Aquele pergunta só qual prova o comprador enterprise exige e o que o fornecedor usa hoje, e bloqueia engenharia de go-to-market até a regra de contagem. As linhas abaixo são a conversa posterior, com episódio e, só depois de um veredito no processo dele, a pergunta de preço.

Descoberta. Três perguntas sobre um episódio passado, as mesmas do [piloto](piloto.md). A quarta, só depois de o fornecedor ver um veredito real no processo dele: se pagariam para repetir essa verificação em produção, e quanto. A resposta, inclusive zero e inclusive recusa, entra na coluna. Não entra como receita.

Nome só com consentimento de anotar. Até lá, cargo e organização.

| # | Data | Cargo | Organização | Episódio | Rodou SDK ou MCP no processo dele | Preço que disse | Seguimento |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| 6 | | | | | | | |
| 7 | | | | | | | |
| 8 | | | | | | | |
| 9 | | | | | | | |
| 10 | | | | | | | |

Contagem em 17/11/2026: zero.

## 4. Fornecedores na integração

Três a cinco. Uma linha só entra quando o processo do fornecedor, fora desta máquina, devolve um veredito de um recibo que não seja o fixture de laboratório. O teste `sdk/test_sdk.py` não preenche a tabela.

| # | Data | Organização | Superfície | Id do recibo | `overall` | Ambiente deles |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

Contagem em 17/11/2026: zero.

O host MCP aponta o binário:

```json
{
  "mcpServers": {
    "arkhe-provenance": {
      "command": "arkhe-provenance-mcp",
      "args": ["mcp"]
    }
  }
}
```

A ferramenta é `verify_receipt`. O chamador manda o recibo, o arquivo de confiança e `expect_purpose`. O processo não abre `DATABASE_URL`.

## 5. Gate 1

Fecha com um cliente, que não é o autor, pagando por verificação em produção. Produção aqui significa o recibo e a chave de confiança do cliente, no processo do cliente, com pagamento identificável. O fixture `gate0-lab` não qualifica.

| Data | Pagador | Referência do pagamento | Id do recibo em produção | `overall` | Quem mais viu |
|---|---|---|---|---|---|
| | | | | | |

Contagem em 17/11/2026: zero. O Gate 1 está aberto. A disposição a pagar permanece a CONJECTURE do §2. Uma fatura `draft` de `packaging/core` não preenche a tabela.
