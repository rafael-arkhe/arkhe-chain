# Caminho B: Stripe em modo de teste

## Escopo e estado

O adaptador HTTP está implementado, com runner opt-in e testes locais. A execução
contra a conta Stripe do usuário está **pendente da chave de teste**. O usuário
autorizou usar sua conta de teste quando configurar a chave. Não houve criação de
objeto Stripe nem chamada autenticada ao fornecedor nesta etapa.

Os testes usam transporte simulado e PostgreSQL real. Não confundir esse resultado
com validação real do vendor. A atestação de plataforma permanece mock. A assinatura
do bridge significa que o serviço observou a resposta por HTTPS; Stripe não assina
esse `DestinationEvidence` com Ed25519.

Resultado local: nove testes do adaptador passaram, somados a 23 da base, total
**32**, sem falhas/ignorados. Formatação e Clippy com `-D warnings` passaram.
Saída capturada em `artifacts/stripe-local-tests-20261026.log`.

## Executar na conta de teste

Configure `STRIPE_TEST_SECRET_KEY` localmente usando o gerenciador de segredos ou o
terminal. Não cole a chave no chat, README, arquivos rastreados ou logs. O código
recusa chaves live e respostas com `livemode=true`.

Use uma base PostgreSQL de teste separada, com a mesma conta/sandbox Stripe entre
execuções. Não troque a conta no meio de um journal existente.

```powershell
$env:DATABASE_URL = 'postgres://ritual_test:local_test_only@127.0.0.1:55439/ritual_test'
$env:ARKHE_RUN_STRIPE_TEST = '1'
cargo run --example stripe_test
```

Alternativamente, `scripts/run_stripe_test.ps1` lê a variável do processo ou do
escopo User sem imprimir a chave, executa o runner e captura somente a observação
sanitizada em `artifacts/stripe-provider-test.json`.

O runner aplica as migrações, emite desafio, produz atestação mock e análise,
autoriza pelo `ContainmentGate::authorize_admitted` real com uma política de demo,
aceita o pedido e adquire a tentativa. Depois envia **dois POSTs idênticos** à
Stripe com a mesma chave de idempotência e exige o mesmo PaymentIntent ID.
Um GET recupera o recurso antes da confirmação no Arkhe.

O pagamento é exclusivamente de teste: 50 centavos USD com `pm_card_visa`. O schema
aceita somente 50..100 centavos USD. Nenhum cartão real ou credencial de cliente
é solicitado. Uma execução normal cria dados de teste na conta Stripe.

`STRIPE_TEST_OPERATION` identifica o pedido lógico; o padrão é fixo. Repetir com
esse padrão não cria outra operação deliberadamente. Alterá-lo cria novo efeito
e pode criar outro PaymentIntent de teste.

As chaves Ed25519 do runner são fixtures públicas, inadequadas para produção.
O modelo e a análise são simulados. A demonstração fecha a integração de destino,
não a confiança de hardware.

## Idempotência e falhas

Chave externa: `arkhe-effect-v1-` + effect_id em hex. O payload e o efeito precisam
corresponder ao registro persistido e ao epoch adquirido. Nenhuma chamada de rede
é feita com lock SQL mantido.

O journal persiste instante inicial, prazo de POST, chave e digest antes de acessar
o fornecedor. Dentro de 23 horas, entregas repetem o POST com a mesma chave e
conteúdo. Com ID conhecido, um GET pode reconciliar após essa janela. Sem ID e
com janela encerrada, bloqueia novo POST e exige reconciliação manual.

Timeout e erro HTTP não provam falha definitiva. O recurso pode ter sido criado.
`requires_action`, `processing` ou outro status não gera evidência de sucesso.
Não há reenvio automático de um efeito Arkhe em `unknown`; o runner apenas consulta
o ID conhecido. A extensão de retry do `Store` segue restrita ao destino SQL.

O journal não persiste corpo bruto, `client_secret`, secret key ou dados de cartão.
Persistem ID do recurso, request ID, status e observação normalizada. O bridge
assina somente após validar modo de teste, amount, currency e metadata de vínculo.

## Fontes primárias

- [Idempotência Stripe](https://docs.stripe.com/api/idempotent_requests): a retenção
  mínima documentada é de 24 horas; reutilizar chave após remoção pode criar outro
  pedido. Ausência de resultado não comprova inexistência de efeito.
- [Criar PaymentIntent](https://docs.stripe.com/api/payment_intents/create): suporta
  criação e confirmação em uma chamada.
- [Recuperar PaymentIntent](https://docs.stripe.com/api/payment_intents/retrieve):
  consulta pelo ID; não se assume endpoint de consulta pela chave de idempotência.
- [Testes Stripe](https://docs.stripe.com/testing): modo sandbox e PaymentMethod de
  teste, sem movimentação de fundos reais.

## Correções à avaliação anexada

Teste verde é evidência experimental para o cenário exercitado, não `THEOREM`
sobre o protocolo. A cadeia de confiança de produção é **não implementada/não
validada**, não uma impossibilidade refutada. O caminho real de Reject está em
`actual_containment_gate_evaluates_policy_and_effect_mapping`; o teste
`policy_denies_attested_operation` também cobre negação, com política fixture.
