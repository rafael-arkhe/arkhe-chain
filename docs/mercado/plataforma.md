# Plataforma

Aberto em 17/11/2026. Meses 4 a 9, em cima do core em `packaging/core`. Isto é o formato que um operador sobe na rede dele. Não é um contrato de serviço, não tem cliente e não cobra.

O [Gate 1](design-partners.md) continua aberto. Um rascunho de fatura não é pagamento.

## Onde sobe

`packaging/core/deploy/compose.yaml` coloca o PostgreSQL e o verificador numa rede `private` com `internal: true`. Nenhum porto é publicado no host. Quem alcança o processo é quem já está nessa rede. Isto é um host. Não cria malha entre sites: a malha, se existir, é a rede que o operador já opera.

A imagem `arkhe-provenance-mcp:local` não foi construída nesta máquina. O `Dockerfile` ao lado do compose é o roteiro. A senha do arquivo é `change-me`. Trocar antes de usar, e não versionar a troca.

Sem esse compose, o mesmo binário sobe em loopback:

```powershell
$env:ARKHE_SEATS = "deploy\seats.json"
$env:ARKHE_METER_DIR = "deploy\meter"
arkhe-provenance-mcp serve --bind 127.0.0.1:8080
```

`deploy/seats.example.json` traz o assento `example` inativo. Enquanto estiver inativo, o endpoint responde 403. Sem `ARKHE_SEATS`, o servidor continua o da auditoria: verifica e não mede.

## Assentos

O arquivo `arkhe-seats/v1` declara `seat_limit` e a lista. Assento ativo acima do limite impede o processo de subir. Assento desconhecido ou inativo não entra no medidor. O cabeçalho é `X-Arkhe-Seat`. Cada pedido também manda `Idempotency-Key`. A mesma chave com o mesmo recibo conta uma unidade. A mesma chave com outro recibo responde 409 e não soma.

O limite de exemplo é 5. Nenhum assento foi vendido.

## Medição e fatura

Cada veredito completo, inclusive `FAIL` e `INCONCLUSIVE`, grava uma linha em `events.jsonl` no diretório do medidor. A unidade é 1. O comando lê esse diretório:

```powershell
arkhe-platform bill --meter deploy\meter --price-book price.json --out invoice.json
```

O livro de preço tem de trazer `status: operator-supplied`. Outro status, inclusive `not-adopted`, recusa a fatura. Não há preço da Arkhe neste repositório. O operador escreve o valor em centavos, no arquivo dele.

A saída é `arkhe-invoice-draft/v1`, `status: draft`, `collects_payment: false`. O comando não envia a fatura e não recebe dinheiro. A primeira gravação da chave de idempotência é a que a fatura soma. Uma repetição devolve o veredito recalculado e não altera a linha.

A tabela `provenance_observations`, quando `DATABASE_URL` existe, continua um registro de observação. Não é a fatura. Sem banco, a verificação segue e a fatura sai do diretório.

## SLA

`arkhe-platform sla` compara sondas do operador com uma janela que o operador declarou. Sem sonda, o relatório fica `INCONCLUSIVE`. Sonda que falha acima do limiar dele fica `FAIL`. Janela coberta pelas sondas dele fica `COVERED`. Os três trazem `customer_commitment: false`. `COVERED` é a leitura das sondas de quem as escreveu. Não é disponibilidade vendida, nem crédito, nem mês medido para um cliente.

Nesta máquina não houve janela de cliente. O relatório de produção não existe.
