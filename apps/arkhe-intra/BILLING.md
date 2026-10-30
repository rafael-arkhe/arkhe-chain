# Stripe Billing no Arkhe-Intra (sandbox)

Integração REST server-side, sem dependências adicionais. A API usa a versão
`2025-06-30.basil`; configure o endpoint de eventos com a mesma versão.
A chave secreta e o segredo do webhook são lidos exclusivamente do ambiente do
processo. Não os coloque em `.env`, arquivos de configuração ou scripts.
Checkout hospedado não precisa da chave pública no navegador.

## Preparação

1. No Stripe de teste, configure produtos e preços mensais Starter e Pro. Os
   valores comerciais não são escolhidos pelo código.
2. Para consumo, configure um Billing Meter com agregação `sum`, chave de cliente
   `stripe_customer_id`, chave de valor `value` e evento `arkhe_anchoring_batches`.
   Configure um preço mensal por uso associado ao meter; cada unidade reportada
   é um lote de 1.000 eventos, não um evento individual. Informe esse preço em
   `STRIPE_PRICE_ANCHORING` para incluí-lo no Checkout.
3. Configure o Customer Portal de teste.
4. Para desenvolvimento, use `stripe listen --forward-to
   http://127.0.0.1:3003/api/billing/webhook`. O comando fornece um segredo `whsec_`;
   ele é diferente da chave `sk_test_`. Para um endpoint remoto, use o segredo
   próprio do endpoint e HTTPS.
5. Execute no PowerShell:

   ```powershell
   ./apps/arkhe-intra/scripts/start-billing.ps1 -StarterPrice price_EXEMPLO -ProPrice price_EXEMPLO
   ```

   O script solicita os dois segredos com entrada mascarada, inicia o Next e
   restaura o ambiente do PowerShell ao terminar. Não grava os segredos. Também
   ativa a exigência de cobertura paga para publicação. Fora desse launcher,
   configure `ARKHE_BILLING_ENFORCE=true` explicitamente no ambiente SaaS.

Eventos: `invoice.paid`, `invoice.payment_failed`, `invoice.updated`,
`invoice.voided`, `invoice.marked_uncollectible`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted` e
`checkout.session.completed`.

## API autenticada

Faça login como **owner** na instalação. Todas as operações abaixo exigem o
cookie de sessão e, para POST, o `Origin` configurado em `ARKHE_INTRA_ORIGIN`.
O tenant vem de `ARKHE_BILLING_TENANT_ID`, nunca do corpo da requisição.
Use JSON e um `operationId` único de 8–80 caracteres por intenção; em uma
repetição, envie o mesmo corpo e o mesmo identificador. Respostas de sucesso são
persistidas e reutilizadas. Uma tentativa pendente com mais de 23 horas exige
reconciliação manual antes de nova tentativa, pois a janela de idempotência do
Stripe é limitada. Não troque o identificador após timeout.

| Método e rota | Corpo / resposta |
| --- | --- |
| `GET /api/billing` | status, plano e `anchoringAllowed` |
| `POST /api/billing/customer` | `{ "operationId": "customer-001", "email": "financeiro@example.com" }` |
| `POST /api/billing/checkout` | `{ "operationId": "checkout-001", "plan": "starter" }`; retorna URL hospedada |
| `POST /api/billing/portal` | `{ "operationId": "portal-001" }`; retorna URL do portal |
| `POST /api/billing/invoice` | `{ "operationId": "invoice-001", "amountInCents": 200000, "currency": "usd", "description": "Enterprise mensal", "coverageUntil": 1800000000 }`; substitua o timestamp por um vencimento de cobertura futuro de até 366 dias |
| `POST /api/billing/usage` | `{ "operationId": "anchor-batch-001", "batchQuantity": 1 }` |

As faturas Enterprise são Net 30: cria draft, vincula o item explicitamente,
finaliza e solicita envio. Cobertura Enterprise só é concedida após pagamento,
até `coverageUntil`. A assinatura precisa estar `active`; trials não liberam
ancoragem nesta política. Fatura vencida ou incobrável suspende a publicação;
pagar outra fatura não elimina a pendência. O retorno do Checkout não libera
acesso: o webhook reconcilia o estado no Stripe. Repetições de eventos usam um
ledger durável; eventos atrasados consultam o objeto atual no Stripe.

## Escopo operacional

Este adaptador acompanha o modelo atual de **uma instalação / um tenant e um
processo Node**, com SQLite persistente no diretório privado do Intra. Não execute
várias instâncias de worker contra o mesmo estado: as filas de processamento
serializam operações dentro de um processo. Faça backup do SQLite junto com a
instalação. Monitore falhas de entrega no Stripe e reenvie eventos perdidos.

O bloqueio está conectado à publicação Rekor em `documents.publish`. O serviço
WormGraph não é chamado por este aplicativo: o produtor de lotes precisa chamar a
rota de consumo após confirmar a ancoragem, mantendo um identificador estável por
lote e uma outbox própria para tentativas. Não reportar a tentativa antes da
confirmação. Não há cálculo automático de cotas ou ponte de autorização para
ContainmentGate neste adaptador.

A migração PostgreSQL `20261021000014_stripe_billing.sql` prepara o cadastro cloud
com tenant textual e RLS forçado, sem conceder mutação aos clientes. Ela não é o
armazenamento usado pelo aplicativo local e requer um worker cloud com privilégios
específicos antes de ser usada. Nenhuma migração é aplicada automaticamente.

Referências: [Checkout](https://docs.stripe.com/api/checkout/sessions/create),
[Billing Meter Events](https://docs.stripe.com/api/billing/meter-event/create),
[Webhooks](https://docs.stripe.com/events/manage-webhook-endpoints),
[Finalização de fatura](https://docs.stripe.com/api/invoices/finalize).
