# Revisão crítica do escopo — Plataforma de custódia

- **Versão:** 1.0
- **Data:** 2026-10-20
- **Status:** análise de escopo; nenhum código produzido
- **Fonte:** texto do cliente recebido em 2026-10-20 (com trechos repetidos)
- **Limite:** não é parecer jurídico, contábil ou de segurança. As recomendações
  legais precisam de validação por advogado habilitado.

---

## 1. Sumário executivo

O escopo tem uma base técnica sensata — Next.js, NestJS, MySQL, JWT, webhook
idempotente, auditoria e separação entre conteúdo editorial e regra comercial —
mas **não está pronto para implementação**. O problema central não é tecnológico:
é a ausência de definição do que está sendo vendido e guardado.

Os onze bloqueios que impedem um MVP seguro:

| # | Bloqueio | Consequência se ignorado |
|---|---|---|
| 1 | "Custódia" e "resgate" sem definição de ativo, titularidade e veículo jurídico | Produto pode ser enquadrado como instituição de pagamento, VASP ou oferta de investimento sem autorização |
| 2 | Mercado Pago tratado como custodiante | Saldo é recebível da conta merchant, não patrimônio separado; risco de bloqueio e insolvência |
| 3 | `external_reference = user_id` como anti-duplicidade | Usuário com dois pedidos, replay ou valor divergente ativa custódia errada |
| 4 | Ativação automática sem desativação | Reembolso, chargeback e cancelamento deixam custódia ativa e passivo aberto |
| 5 | Regra de voucher incompleta | Múltiplos vouchers, corrida de concorrência e vouchers órfãos |
| 6 | CPF único confundido com KYC | Fraude de identidade, laranjas, obrigações de AML não atendidas |
| 7 | Painel administrativo sem MFA/RBAC/dupla aprovação | Um admin comprometido ativa custódia, altera preço ou apaga auditoria |
| 8 | LGPD, retenção, ledger e conciliação ausentes | Impossível provar passivo, atender titular ou sobreviver a auditoria |
| 9 | Oferta, preço, SLA e política de reembolso não definidos | Não há produto para implementar; checkout sem valor legal e suporte |
| 10 | Redis "opcional" | Rate limit e filas quebram ao escalar horizontalmente |
| 11 | Dois domínios sem estratégia de sessão | Token em URL, CORS permissivo, CSRF e sequestro de sessão |

**Recomendação:** congelar o desenvolvimento de custódia, voucher e indicação
até que as decisões **D1–D24** de [DECISOES-PENDENTES.md](DECISOES-PENDENTES.md)
sejam respondidas. Em paralelo, é possível iniciar a Fase 1 (autenticação,
cadastro, contratos, esqueleto administrativo, auditoria e observabilidade), que
não depende da definição do produto financeiro.

---

## 2. O que o escopo acerta

- **Stack coerente e comum** no mercado brasileiro, com boa disponibilidade de
  profissionais.
- **Separação entre conteúdo editorial e regra comercial** — decisão correta
  para Spot, Futuros, Launchpad e Launchpool sem acoplamento a exchanges.
- **Intenção explícita de idempotência** em webhook e de transação em operações
  críticas.
- **Trilha de auditoria** e logs técnicos previstos desde o início.
- **Sem integração com corretoras** — reduz superfície de ataque, dependência
  regulatória e risco operacional.
- **Segredos em variáveis de ambiente** e repositório privado.
- **Dois domínios com papéis claros** (institucional sem checkout; plataforma
  com sistema logado).
- **Preocupação com continuidade** e documentação para outra equipe.

Esses pontos devem ser preservados. A crítica abaixo é sobre o que falta, não
sobre a escolha de stack.

---

## 3. Achados críticos (P0)

### P0-1. O que é "custódia" e de onde sai o "resgate livre"?

**O escopo diz:** "Custódia com resgate livre" e "Custódia com voucher atrelado".
Não define o ativo, o titular, o custodiante, a origem do resgate, a liquidez ou
o que acontece em caso de inadimplência.

Existem três leituras possíveis, com consequências completamente diferentes:

| Leitura | O que é, na prática | Risco |
|---|---|---|
| **A. Bloqueio lógico em banco** | O sistema apenas marca um registro como "custódia ativa"; o dinheiro ficou no Mercado Pago | Não é custódia; é acesso a um contrato. "Resgate" é só mudar status |
| **B. Saldo financeiro sob sua responsabilidade** | Você recebe o valor e passa a dever ao usuário; o resgate é um Pix de saída | Passivo financeiro, risco de liquidez, possivelmente instituição de pagamento (Lei 12.865/2013) |
| **C. Custódia de criptoativos** | Você guarda chaves ou contrata um custodiante | Exige custodiante regulado; "sem corretoras" não elimina a exigência regulatória (Lei 14.478/2022 e regulamentação do BCB) |

**Risco:** contrato, contabilidade, arquitetura e obrigações regulatórias mudam
radicalmente entre A, B e C. Implementar antes de definir gera retrabalho total.
Há ainda risco de o produto ser interpretado como oferta de investimento se
houver promessa de rendimento, e de pirâmide se a recompensa depender de
recrutamento.

**Recomendação:**
1. Definir por escrito: ativo custodiado, quem detém a titularidade, quem é o
   custodiante legal, onde o recurso fica, como e quando o resgate é pago.
2. Se for dinheiro: avaliar segregação patrimonial (conta vinculada, escrow ou
   contrato com instituição autorizada). Não usar a conta merchant do MP como
   se fosse conta segregada.
3. Se for criptoativo: contratar custodiante regulado ou remover o termo
   "custódia" do produto. Não simular custódia em banco de dados.
4. Remover qualquer promessa de rendimento ou "resgate garantido" até parecer
   jurídico.
5. Definir o que o voucher representa: desconto, crédito, direito a resgate,
   lock-up ou brinde. Cada um tem tratamento contábil e regulatório distinto.

**Decisões:** D1, D2, D3, D4.

---

### P0-2. Mercado Pago não é custodiante segregado

**O escopo diz:** checkout transparente, `POST /v1/payments`, ativação no
`approved`. Trata o MP como se fosse a "conta da custódia".

**Realidade:** o valor pago entra como recebível da sua conta merchant. O MP pode
reter, bloquear, estornar ou compensar valores; o saldo não é patrimônio
separado dos usuários. Se você promete devolver o valor a qualquer momento, o
risco de liquidez e de insolvência é seu, não do MP.

Além disso, o MP possui termos de uso e lista de atividades restritas. Produtos
com aparência de investimento, criptoativo ou "rendimento" podem ser recusados
ou ter a conta congelada durante a operação.

**Risco:** corrida de resgates sem lastro, bloqueio de conta, passivo não
contabilizado, descumprimento de contrato com o usuário.

**Recomendação:**
1. Confirmar por escrito com o MP (ou com o adquirente) se o modelo é permitido.
2. Modelar o valor recebido como **passivo** (obrigação com usuário), não como
   receita, enquanto houver direito de resgate.
3. Manter conta/ledger separado por usuário e reconciliação diária com o
   extrato/settlement do MP.
4. Definir reserva de liquidez e política de resgate (prazo, limites, fila).
5. Não prometer resgate instantâneo se o MP não liquidar instantaneamente.
6. Ter plano de contingência para bloqueio da conta (novo adquirente, migração,
   comunicação).

**Decisões:** D5, D6, D7.

---

### P0-3. `external_reference = user_id` não evita duplicidade

**O escopo diz:** validar `payment_id` e `external_reference (user_id)` "para não
duplicar".

**Problema:** um usuário pode ter mais de um pedido, mais de uma custódia e mais
de uma tentativa de pagamento. O `user_id` não identifica a operação. Também não
protege contra:

- replay do mesmo webhook;
- dois webhooks concorrentes para o mesmo pagamento;
- pagamento aprovado com valor diferente do pedido;
- pagamento em outra moeda;
- pagamento de outro usuário com `external_reference` adulterado;
- webhook forjado;
- evento fora de ordem (`approved` depois de `refunded`);
- pagamento aprovado sem pedido correspondente.

**Risco:** dupla ativação, custódia com valor errado, voucher consumido duas
vezes, passivo inflado, fraude.

**Recomendação (obrigatória):**
1. Criar `orders` com `id` próprio e `idempotency_key` única. Usar
   `external_reference = order_id` (ou `order:<uuid>`), nunca apenas `user_id`.
2. Criar `payments` com `mp_payment_id` **único** e `order_id` **único**.
3. Criar `payment_events` com chave única do evento (ID do provedor ou hash do
   payload bruto) para deduplicar replay.
4. No webhook: validar assinatura, consultar `GET /v1/payments/{id}` no MP,
   comparar `transaction_amount`, `currency_id`, `status`, `external_reference`
   e pagador com o pedido antes de qualquer ativação.
5. Processar em transação com `SELECT ... FOR UPDATE` no pedido; a transição
   `pending_payment -> paid -> active` deve ser idempotente.
6. Responder 200 rápido, persistir o evento bruto e processar de forma assíncrona
   (fila/outbox). Falha de processamento vai para retry e DLQ, não para perda.
7. Ter job de reconciliação para pagamentos aprovados sem custódia, custódias sem
   pagamento e valores divergentes.

**Decisões:** D8, D9, D10.

---

### P0-4. Ativação automática sem caminho de desativação

**O escopo diz:** ao receber `approved`, ativar automaticamente. Não menciona
`refunded`, `charged_back`, `cancelled`, `in_mediation`, cancelamento pelo
usuário, expiração ou erro operacional.

**Risco:** usuário recebe o dinheiro de volta e continua com custódia ativa;
voucher e recompensa de indicação permanecem; passivo cresce sem lastro.

**Recomendação:**
1. Modelar máquina de estados explícita para pedido, pagamento, custódia,
   voucher e indicação.
2. `refunded`/`charged_back` → suspender custódia, reverter voucher e recompensa,
   registrar evento, notificar usuário e abrir revisão administrativa.
3. `in_mediation` → bloquear resgate e novas operações até decisão.
4. Definir o que acontece se o pagamento for aprovado após a custódia já ter
   sido cancelada.
5. Toda alteração manual de status exige dupla aprovação e auditoria.

**Decisões:** D11, D12.

---

### P0-5. Regra de voucher incompleta e sujeita a corrida

**O escopo diz:** "1 voucher por custódia ativa" e "controle de elegibilidade
para vouchers, campanhas de indicação e contratos digitais".

**Perguntas sem resposta:**
- O usuário pode acumular vários vouchers? Onde ficam os excedentes?
- O voucher é reservado no checkout ou aplicado só na ativação?
- Qual a precedência entre voucher de indicação, campanha e cupom manual?
- O voucher expira? Pode ser transferido? Pode ser usado parcialmente?
- O que acontece se o pagamento for recusado depois da reserva?
- O voucher é descontado do valor pago ou vira crédito após a ativação?
- Como impedir que duas requisições concorrentes consumam o mesmo voucher?
- O que acontece com o voucher em caso de reembolso?

**Risco:** voucher consumido duas vezes, voucher preso em pedido abandonado,
usuário com direito adquirido não honrado, prejuízo contábil.

**Recomendação:**
1. Separar **voucher emitido** (wallet) de **voucher aplicado** (reserva) e
   **voucher consumido** (custódia).
2. Criar `voucher_reservations` com TTL e `UNIQUE(voucher_id)` para reserva
   ativa; `voucher_redemptions` com `UNIQUE(voucher_id)` e `UNIQUE(custody_id)`.
3. Definir precedência e limite de uso por custódia (ex.: no máximo um voucher
   por custódia, mas vários na wallet).
4. Definir expiração, revogação, transferência (ou proibição) e tratamento em
   reembolso.
5. Implementar simulação de regra no admin antes de publicar campanha.
6. Versionar a regra de elegibilidade e registrar qual versão foi usada em cada
   voucher/custódia.

**Decisões:** D13, D14, D15.

---

### P0-6. CPF único não é KYC

**O escopo diz:** unicidade de CPF e e-mail, normalização e validação no backend.
Não menciona verificação de titularidade, documento, selfie, PEP, sanções,
monitoramento de transações ou comunicação ao COAF.

**Problema:** validação de dígito verificador só confirma que o CPF é
matematicamente válido; não confirma que pertence à pessoa. Um fraudador pode
usar CPF de terceiro, e contas laranja podem ser criadas em massa.

**Risco:** fraude de identidade, lavagem de dinheiro, contingência regulatória,
perda de conta no MP, responsabilidade civil.

**Recomendação:**
1. Definir se o produto exige KYC (provavelmente sim, se houver resgate
   financeiro). Se sim, escolher provedor e fluxo (documento + prova de vida,
   validação de base cadastral).
2. Definir política de PEP, sanções e países bloqueados.
3. Definir monitoramento de transações e regras de reporte.
4. Tratar CPF como dado sensível: criptografar em repouso, guardar hash
   determinístico para unicidade, mascarar em logs e telas.
5. Definir tratamento para estrangeiros, menores, CNPJ e CPF de falecido.
6. Separar "conta criada" de "conta verificada"; limitar funcionalidades até a
   verificação.

**Decisões:** D16, D17, D18.

---

### P0-7. Painel administrativo é o maior risco de fraude interna

**O escopo diz:** "100% administrável", "regras parametrizáveis". Não especifica
autenticação, autorização, MFA, segregação de funções ou auditoria do admin.

**Risco:** um admin comprometido ou mal-intencionado ativa custódia sem
pagamento, altera preço, concede voucher, lê dados pessoais, exporta a base ou
apaga evidências. Em produto financeiro, isso é o vetor mais provável de perda.

**Recomendação (mínimo):**
1. Conta de admin separada da conta de usuário; MFA obrigatório (TOTP ou chave
   física), sem SMS como único fator.
2. RBAC com papéis: suporte, analista, financeiro, conteúdo, superadmin.
3. Dupla aprovação (four-eyes) para: ativação manual, reembolso, concessão de
   voucher, alteração de preço, alteração de regra de elegibilidade e exportação
   de dados.
4. Sessão curta, timeout por inatividade, revogação de todas as sessões,
   restrição por IP/VPN quando viável.
5. Auditoria append-only de toda mutação, com antes/depois, ator, IP, user agent
   e correlation ID.
6. Proibição de edição direta no banco em produção; acesso via break-glass com
   registro e aprovação.
7. Alertas para ações sensíveis fora do horário e para picos de concessão.

**Decisões:** D19, D20.

---

### P0-8. LGPD, retenção e direitos do titular não estão no escopo

**O escopo diz:** coleta CPF, e-mail, telefone, IP, user agent e dispositivo.
Não menciona base legal, finalidade, retenção, exclusão, portabilidade,
compartilhamento, encarregado (DPO), incidente ou consentimento.

**Risco:** sanções da ANPD, ações de titulares, exposição de dados, perda de
confiança, problemas com o MP e com provedores.

**Recomendação:**
1. Mapear dados e finalidades (ROPA), com base legal por tratamento.
2. Definir retenção: financeiro/fiscal (mínimo 5 anos, salvo obrigação maior),
   logs (90–180 dias), marketing (até revogação), auditoria (5–10 anos).
3. Definir fluxo de exclusão: anonimizar o que não tem obrigação de guardar;
   bloquear o resto; registrar a solicitação.
4. Definir DSAR (acesso, correção, portabilidade, eliminação) com prazo e
   responsável.
5. Criptografar CPF e dados sensíveis; mascarar em logs; controlar acesso.
6. Definir política de cookies, analytics e consentimento no site institucional.
7. Ter plano de resposta a incidente com prazos regulatórios e comunicação.
8. Formalizar contratos de operador com provedores (MP, e-mail, SMS, storage,
   observabilidade) e transferência internacional.

**Decisões:** D21, D22.

---

### P0-9. Não existe oferta comercial, preço, SLA ou política de reembolso

**O escopo diz:** tipos de custódia, checkout, vouchers e campanhas. Não diz o
que o usuário compra, quanto custa, o que está incluído, qual o prazo de
ativação/resgate, qual o SLA de atendimento ou qual a política de reembolso.

**Risco:** o time implementa um checkout sem produto; o contrato não tem objeto
e preço; o usuário não sabe o que adquiriu; o suporte não tem regra; o
faturamento e o estorno ficam ambíguos. É impossível testar aceite sem definir
o resultado esperado.

**Recomendação:**
1. Definir catálogo mínimo: nome, descrição, preço, vigência, o que o valor
   inclui e o que não inclui.
2. Definir SLA de ativação (ex.: até X minutos após `approved`), prazo de
   resgate e canal de atendimento.
3. Definir política de reembolso e cancelamento (CDC, 7 dias quando aplicável,
   exceções) e como ela afeta custódia, voucher e indicação.
4. Definir recibos, comprovantes e documentos fiscais.
5. Só então modelar `products`, `orders` e o checkout.

**Decisões:** D23, D24, D27, D30, D31.

---

## 4. Achados altos (P1)

| # | Tema | Problema | Recomendação |
|---|---|---|---|
| P1-1 | Redis | "Opcional" conflita com rate limit, fila de webhook, idempotência e sessão em múltiplas instâncias | Tornar obrigatório em produção; documentar modo single-instance apenas para desenvolvimento |
| P1-2 | Dois domínios | Sem estratégia de cookie, CORS, CSRF, SSO e handoff | Cookies `HttpOnly` no subdomínio da plataforma; link com `returnTo` validado; nunca token na URL; CORS por allowlist |
| P1-3 | Contratos | Aceite por checkbox sem evidência robusta nem nível de assinatura | Snapshot imutável do contrato + hash + timestamp + IP + UA; definir quando exigir assinatura eletrônica qualificada |
| P1-4 | Regras parametrizáveis | Sem versionamento, vigência, simulação, aprovação e rollback | Rule sets versionados, effective_at, dry-run, four-eyes e auditoria |
| P1-5 | Conteúdo editorial | Spot/Futuros podem ser lidos como recomendação de investimento | Disclaimer, revisão jurídica, fluxo editorial com aprovação, versionamento e sanitização de HTML |
| P1-6 | Tickets | "tickets" aparece no banco, mas não há módulo, SLA ou fluxo | Definir escopo: suporte interno, atendimento ao usuário, base de conhecimento, prazos e LGPD |
| P1-7 | Ledger | Não há partidas dobradas nem conciliação | Ledger de dupla entrada, contas por usuário, fechamento diário e conciliação com MP |
| P1-8 | Observabilidade | Sem logs estruturados, métricas, tracing, alertas ou error tracking | JSON logs com correlation ID, métricas de webhook/fila/5xx, alertas, Sentry/OpenTelemetry |
| P1-9 | Backups/DR | Não há RPO/RTO, teste de restauração ou plano de continuidade | Backup diário + binlog/PITR, restauração testada, runbook de desastre |
| P1-10 | CI/CD | GitHub privado sem branch protection, revisão, SAST, secrets scanning | Pipeline com lint, typecheck, testes, migrações, SAST, dependency/container scan, staging e aprovação para produção |
| P1-11 | Testes | Nenhuma estratégia de teste | Unitários de regra, integração com MySQL, replay de webhook, concorrência, contrato MP sandbox, E2E e carga |
| P1-12 | Cartão/PCI | `POST /v1/payments` não basta; cartão exige tokenização no cliente e 3DS | MercadoPago.js/Security Fields; nunca receber PAN/CVV no backend; escopo PCI SAQ A; tratar desafio 3DS |
| P1-13 | E-mail/SMS | Verificação e notificações sem provedor, reputação, bounce ou custo | Provedor transacional, SPF/DKIM/DMARC, bounce/complaint, limites de SMS e proteção contra SMS pumping |
| P1-14 | Impostos/contábil | Receita, passivo, NF-e/NFS-e, IRRF e criptoativos não mencionados | Validar com contador; definir emissão fiscal, retenções e obrigações acessórias |
| P1-15 | Acessibilidade/i18n | Não mencionadas | Definir WCAG 2.1 AA mínimo e se haverá outro idioma |
| P1-16 | Rate limit | Sem números, chave ou storage | Limites por rota + IP + conta + device, com Redis; backoff e captcha após threshold |
| P1-17 | Refresh token | "JWT + refresh seguro" sem detalhes | Rotação, detecção de reuso, hash no banco, revogação, lista de sessões, TTL curto |
| P1-18 | Evidências | Contratos e auditoria sem armazenamento imutável | Object storage com retenção/WORM, hash e URLs assinadas |
| P1-19 | Segredos | `.env` não é suficiente em produção | Secret manager/KMS, rotação, separação por ambiente, scanner de segredos no CI |
| P1-20 | Suporte a incidentes | Sem on-call, runbook, classificação ou comunicação | Runbooks de pagamento, fraude, indisponibilidade e vazamento; simulações |

---

## 5. Contradições e lacunas do texto

| Item | O que o escopo diz | Por que é problema | Correção sugerida |
|---|---|---|---|
| Anti-duplicidade | `external_reference = user_id` | Usuário pode ter N pedidos; não amarra pagamento à operação | `external_reference = order_id`; `UNIQUE(mp_payment_id)`; evento idempotente |
| Voucher | "1 voucher por custódia ativa" | Não diz o que fazer com vouchers excedentes nem com reserva | Wallet + reserva + consumo com constraints únicas |
| Redis | "opcional" | Rate limit e fila distribuídos exigem store compartilhado | Obrigatório em produção |
| Ativação | Automática no `approved` | Não há desativação em refund/chargeback | Máquina de estados com suspensão e clawback |
| Sem corretoras | "não depende de APIs de corretoras" | Se houver custódia de cripto, ainda há exigência de custodiante regulado | Definir ativo e custodiante; "sem corretora" ≠ "sem regulação" |
| Custódia | Termo usado sem definição | Pode ser bloqueio lógico, saldo financeiro ou cripto | Definição jurídica e contábil antes do código |
| Conteúdo | "100% administrável" | Sem governança, vira risco de recomendação e XSS | CMS com papéis, revisão, sanitização e disclaimer |
| Tickets | Listado no banco | Não há módulo, SLA ou dono | Incluir ou remover do escopo |
| Dois domínios | "redirecionado de forma transparente" | Sem cookie/CORS/SSO definidos | Handoff com `returnTo` assinado e cookie no subdomínio correto |
| Contratos | "gerenciados por regras" | Regra não substitui assinatura e evidência | Template + snapshot + assinatura conforme risco |
| CPF | Único e validado | Unicidade não é identidade | KYC e verificação de titularidade |
| Resgate | "livre" | Sem fonte de liquidez nem prazo | Política de resgate, lastro e fila |
| SMS | "opcional conforme provedor" | Custo e fraude de SMS pumping | Limites, allowlist de países, monitoramento |
| GitHub | "privado, branches e releases" | Sem CI, revisão e proteção de branch | Pipeline e políticas de merge |
| Admin | "parametrizável" | Sem MFA/RBAC/four-eyes | Controles mínimos de admin financeiro |

---

## 6. Fluxos que precisam de especificação antes do código

Para cada fluxo, o documento de produto deve definir estados, atores, dados,
erros, notificações e critérios de aceite.

### 6.1 Cadastro e verificação
- Ordem: e-mail → CPF → telefone → senha → contratos → verificação de e-mail →
  KYC (se aplicável).
- O que bloqueia o quê: é possível iniciar checkout sem e-mail verificado? Sem
  KYC? Sem contrato aceito?
- Reenvio de código, expiração, limite de tentativas, troca de e-mail.
- Conta duplicada por CPF: mensagem genérica para não revelar existência.
- Consentimentos separados (termos, privacidade, marketing).

### 6.2 Contratos
- Quais contratos são exigidos antes do checkout; o que acontece se uma nova
  versão for publicada com o usuário no meio do fluxo.
- Evidência: snapshot, hash, versão, timestamp, IP, UA, dispositivo.
- Reaceite obrigatório em mudança material; comunicação e prazo.
- Assinatura simples, avançada ou qualificada? Quem assina pela empresa?

### 6.3 Checkout Pix
- Criação do pedido no servidor; valor nunca vem do cliente.
- Reserva de voucher antes ou depois da criação do pagamento.
- QR code, copia e cola, expiração, polling e fallback se o webhook falhar.
- Usuário fecha o app e volta: como retomar o pedido?
- Pix pago com valor menor/maior; pagamento duplicado; pagamento após expiração.

### 6.4 Checkout cartão
- Tokenização no cliente (MercadoPago.js), nunca PAN/CVV no backend.
- 3DS: desafio, redirecionamento, retorno, estados `in_process`/`pending`.
- Parcelamento, juros, antifraude do MP, recusa e nova tentativa sem duplicar
  cobrança.
- O que mostrar enquanto o pagamento está em análise.

### 6.5 Webhook
- Verificação de assinatura (`x-signature`, `x-request-id`, `data.id`), janela de
  replay e idempotência.
- Consulta ativa ao MP antes de confiar no payload.
- Resposta 200 rápida; processamento assíncrono; retry; DLQ; replay manual.
- Eventos fora de ordem e eventos desconhecidos.
- Segurança do endpoint: rate limit, body size, timeout, logs sem PII.

### 6.6 Ativação de custódia
- Pré-condições: pagamento aprovado, valor/moeda conferidos, contrato aceito,
  KYC aprovado, voucher válido.
- Transação única: pagamento + custódia + voucher + ledger + auditoria.
- Concorrência: dois webhooks iguais ao mesmo tempo.
- Pós-condições: e-mail, dashboard, recibo, prazo de resgate.
- Falha parcial: como compensar sem deixar custódia ativa sem pagamento.

### 6.7 Resgate
- Quem pode solicitar, em qual janela, com qual antecedência.
- Para onde vai o dinheiro/ativo (conta do titular? mesma origem?).
- Verificações: titularidade, KYC, saldo, custódia ativa, bloqueios.
- Prazo, fila, limite diário, aprovação manual acima de valor.
- Comprovante, ledger, imposto e comunicação.
- O que acontece se o resgate falhar no meio.

### 6.8 Voucher
- Emissão, elegibilidade, validade, revogação, transferência (se houver).
- Reserva no checkout, liberação por timeout, consumo atômico.
- Precedência e limite por custódia.
- Reembolso e chargeback: estorno do voucher ou crédito?
- Comunicação de voucher expirando.

### 6.9 Indicação
- Código/link, vínculo no cadastro, prevenção de autoindicação e contas
  duplicadas.
- Gatilho da recompensa: cadastro, verificação, primeiro pagamento aprovado,
  custódia ativa por N dias.
- Janela de maturação, cap por usuário, limite de campanha, orçamento.
- Clawback em reembolso/chargeback/fraude.
- O que configura pirâmide: evitar recompensa por recrutamento sem transação
  real; limitar níveis; disclosure.

### 6.10 Reembolso, cancelamento e chargeback
- Quem pode solicitar, prazo, canal e regras (CDC, 7 dias de arrependimento
  quando aplicável).
- Estorno total/parcial; custódia suspensa/cancelada; voucher e indicação
  revertidos; ledger compensado.
- Mediação do MP; prazo de resposta; evidências.
- Comunicação ao usuário e registro de auditoria.

### 6.11 Administração
- Ativar/desativar custódia manualmente (com four-eyes).
- Reprocessar webhook e conciliar pagamento.
- Conceder/revogar voucher e ajustar campanha.
- Publicar conteúdo e contrato.
- Exportar dados (com aprovação e log).
- Consultar trilha de auditoria.

### 6.12 Encerramento de conta
- O que fazer com custódia ativa, saldo, voucher, indicação e obrigações
  fiscais.
- Anonimização versus retenção legal.
- Prazo, confirmação e comunicação.

---

## 7. Modelo de domínio mínimo sugerido

Não é um schema final; é o conjunto mínimo de entidades e invariantes para
suportar o escopo com segurança. Nomes em inglês para código; descrição em
português.

### 7.1 Entidades

| Entidade | Papel | Campos críticos |
|---|---|---|
| `users` | Conta do usuário | `id`, `email_norm UNIQUE`, `cpf_hash UNIQUE`, `cpf_enc`, `phone_e164`, `status`, `email_verified_at`, `kyc_status` |
| `user_credentials` | Senha | `user_id`, `password_hash`, `algo`, `updated_at` |
| `refresh_tokens` | Sessão | `id`, `user_id`, `token_hash`, `family_id`, `expires_at`, `revoked_at`, `reuse_detected_at` |
| `email_verification_tokens` | Verificação | `token_hash`, `expires_at`, `used_at` |
| `contracts` / `contract_versions` | Contratos | `version`, `body_hash`, `effective_at`, `published_at`, `immutable_snapshot` |
| `contract_acceptances` | Evidência | `user_id`, `contract_version_id`, `accepted_at`, `ip`, `user_agent`, `evidence_hash`; imutável |
| `products` | Oferta | `type` (`FREE_REDEMPTION`, `VOUCHER_LOCKED`), `price_cents`, `currency`, `active` |
| `orders` | Pedido | `id`, `user_id`, `product_id`, `amount_cents`, `status`, `idempotency_key UNIQUE`, `voucher_id`, `expires_at` |
| `payments` | Pagamento | `order_id UNIQUE`, `mp_payment_id UNIQUE`, `status`, `status_detail`, `amount_cents`, `currency`, `method`, `payer_email`, `approved_at`, `refunded_at` |
| `payment_events` | Webhooks | `event_key UNIQUE`, `type`, `payload_json`, `received_at`, `processed_at`, `attempts`, `last_error` |
| `custodies` | Custódia | `user_id`, `order_id UNIQUE`, `product_id`, `status`, `activated_at`, `redeemed_at`, `voucher_id` |
| `custody_events` | Histórico | `custody_id`, `from_status`, `to_status`, `actor`, `reason`, `created_at` |
| `vouchers` | Wallet | `code UNIQUE`, `type`, `value`, `status`, `expires_at`, `issued_to`, `rule_version_id` |
| `voucher_reservations` | Reserva | `voucher_id UNIQUE`, `order_id`, `expires_at` |
| `voucher_redemptions` | Consumo | `voucher_id UNIQUE`, `custody_id UNIQUE`, `redeemed_at` |
| `referral_codes` / `referrals` | Indicação | `referrer_id`, `referred_user_id UNIQUE`, `status`, `qualified_at`; impedir autoindicação |
| `referral_rewards` | Recompensa | `referral_id`, `beneficiary_id`, `status`, `matured_at`, `reversed_at` |
| `ledger_accounts` / `ledger_entries` | Contabilidade | Partidas dobradas; `amount_cents`, `direction`, `reference_type`, `reference_id`; soma zero por transação |
| `audit_logs` | Auditoria | `actor_type`, `actor_id`, `action`, `entity`, `before_json`, `after_json`, `ip`, `hash_prev`, `hash`; append-only |
| `admin_users` / `roles` / `permissions` | Admin | MFA, RBAC, sessão, status |
| `rule_sets` | Regras | `key`, `version`, `value_json`, `effective_from`, `approved_by`, `published_at` |
| `content_pages` / `content_versions` | CMS | Draft/published, versão, autor, agendamento, sanitização |
| `notifications` / `email_events` | Comunicação | Template, status, bounce, complaint |
| `tickets` / `ticket_messages` | Suporte | Definir se entra no MVP |
| `webhook_outbox` | Eventos de domínio | Publicação confiável pós-commit |

### 7.2 Invariantes (devem virar constraints/testes)

1. `UNIQUE(mp_payment_id)` em `payments`.
2. `UNIQUE(order_id)` em `payments` e em `custodies`.
3. `UNIQUE(event_key)` em `payment_events`.
4. `UNIQUE(voucher_id)` em `voucher_reservations` e `voucher_redemptions`.
5. `UNIQUE(custody_id)` em `voucher_redemptions`.
6. `UNIQUE(referred_user_id)` em `referrals`; `referrer_id <> referred_user_id`.
7. `UNIQUE(user_id, contract_version_id)` em `contract_acceptances`.
8. Nenhuma custódia `active` sem pagamento `approved` e contrato aceito.
9. Nenhum resgate sem custódia `active` e KYC aprovado (se exigido).
10. Soma de débitos e créditos do ledger = 0 por transação.
11. Valor pago = valor do pedido (ou pedido ajustado por voucher), em centavos,
    mesma moeda.
12. Registros financeiros e de auditoria não são deletados; no máximo
    anonimizados.

### 7.3 Máquinas de estado

```
Order:    draft -> pending_payment -> paid -> activated
                         |              |-> expired
                         |-> cancelled  |-> refunded
Payment:  pending -> approved -> refunded | charged_back
              |-> rejected | cancelled | in_process -> approved
Custody:  pending_activation -> active -> redemption_requested -> redeemed
                                  |-> suspended (refund/chargeback/fraude)
                                  |-> cancelled | expired
Voucher:  issued -> reserved -> consumed
              |-> expired | revoked | released
Referral: invited -> registered -> qualified -> rewarded -> reversed
```

### 7.4 Notas específicas de MySQL

- MySQL 8, `utf8mb4`, timezone UTC, `DATETIME(6)`.
- Dinheiro em `BIGINT` de centavos; nunca `FLOAT`/`DOUBLE`. Se precisar de
  precisão maior, `DECIMAL(18,2)` com arredondamento explícito.
- MySQL não tem índice único parcial. Para "uma custódia ativa por usuário",
  usar coluna gerada (`active_key`) que é `NULL` quando inativo e
  `user_id:product_id` quando ativo, com `UNIQUE(active_key)`, ou tabela separada
  `active_custodies`.
- `SELECT ... FOR UPDATE` para ativação, consumo de voucher e resgate.
- Migrações versionadas e revisadas; nunca `synchronize: true` em produção.
- IDs: `BINARY(16)` (UUIDv7) ou `CHAR(26)` (ULID); padronizar e documentar.
- Collation para e-mail: normalizar para minúsculas na aplicação; não confiar em
  collation case-insensitive para unicidade.

---

## 8. Requisitos não funcionais mensuráveis (proposta)

Números sugeridos para discussão; precisam ser validados com o negócio.

| Área | Requisito |
|---|---|
| Disponibilidade | 99,9% mensal para API e checkout; janela de manutenção comunicada |
| Webhook | ACK p95 < 300 ms; processamento p95 < 30 s; retry com backoff; DLQ após 5 tentativas |
| API | p95 < 500 ms em rotas comuns; checkout p95 < 2 s (excluindo provedor) |
| Recuperação | RPO ≤ 5 min (binlog/PITR); RTO ≤ 1 h; restauração testada trimestralmente |
| Sessão | Access token 10–15 min; refresh 7 dias com rotação e detecção de reuso |
| Senha | Argon2id (mínimo 64 MB, 3 iterações) ou bcrypt cost ≥ 12; pepper em KMS |
| Rate limit | Cadastro 5/h/IP e 3/h/device; login 10/15 min/IP e 5/15 min/conta; recuperação 3/h/e-mail; pagamento 10/h/usuário; webhook 100/s/IP com burst |
| TLS | 1.2+; HSTS; redirect HTTP→HTTPS; certificados renovados automaticamente |
| Cabeçalhos | CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors` |
| Cartão | Nunca trafegar PAN/CVV no backend; tokenização no cliente; SAQ A |
| Logs | JSON estruturado, correlation ID, sem CPF/cartão/senha/token; retenção 90–180 dias |
| Auditoria | Append-only, hash chain, retenção 5–10 anos, acesso restrito |
| Backups | Diário completo + binlog; cópia off-site; teste de restore |
| LGPD | DSAR em até 15 dias; incidente comunicado nos prazos aplicáveis; ROPA atualizado |
| Testes | Cobertura mínima de regras críticas; testes de concorrência e replay obrigatórios |

---

## 9. Faseamento recomendado

### Fase 0 — Decisões e compliance (bloqueante)
- Responder todas as decisões marcadas como **Sim** em
  [DECISOES-PENDENTES.md](DECISOES-PENDENTES.md), com prioridade para D1–D24.
- Parecer jurídico sobre custódia, resgate, voucher, indicação e contratos.
- Aprovação do modelo pelo MP/adquirente.
- Modelo de dados, ameaças e arquitetura de referência.
- Definição de KYC/AML e retenção.

### Fase 1 — Fundação (não depende de custódia)
- Monorepo, CI/CD, ambientes, observabilidade.
- Cadastro, normalização, unicidade, senha, verificação de e-mail.
- Login, refresh rotativo, sessões, rate limit, antifraude básico.
- Contratos versionados e aceite com evidência.
- Admin com MFA/RBAC/auditoria.
- CMS mínimo e páginas institucionais.

### Fase 2 — Pagamento e custódia (Pix)
- Produto único, preço no servidor, pedido idempotente.
- Checkout Pix transparente.
- Webhook assinado, consulta ativa, evento idempotente, fila e DLQ.
- Ativação transacional, máquina de estados, ledger e reconciliação.
- Painel de exceções e reprocessamento.

### Fase 3 — Cartão, reembolso e voucher
- Tokenização, 3DS, parcelamento.
- Reembolso, chargeback, suspensão e clawback.
- Wallet de vouchers, reserva, consumo e expiração.
- Conciliação financeira completa.

### Fase 4 — Indicação, conteúdo e suporte
- Campanhas de indicação com elegibilidade e maturação.
- CMS completo, revisão editorial, disclaimers.
- Tickets e notificações.
- Relatórios administrativos.

### Fase 5 — Endurecimento e handover
- Pentest, teste de carga, DR, runbooks.
- Documentação final, ADRs, data dictionary, SBOM.
- Transferência de acessos, domínios, contas e segredos.

**Corte mínimo de MVP:** um produto, Pix, sem indicação, sem múltiplos vouchers,
com revisão manual de exceções. Ainda assim, **não lançar** antes de resolver os
bloqueios P0-1 a P0-9.

---

## 10. Critérios de aceite técnicos (exemplos testáveis)

1. Replay do mesmo webhook `approved` 100 vezes produz exatamente um pagamento
   processado e uma custódia ativa.
2. Dois webhooks `approved` concorrentes para o mesmo pedido produzem uma única
   ativação; o segundo é no-op auditado.
3. Webhook com valor divergente não ativa custódia; gera alerta e registro.
4. Webhook com assinatura inválida é rejeitado e não altera estado.
5. `refunded`/`charged_back` suspende custódia, reverte voucher/recompensa e
   registra auditoria em até 1 minuto.
6. Usuário não acessa custódia, pagamento ou contrato de outro usuário (IDOR).
7. Admin sem MFA não acessa; admin sem permissão não executa ação; toda mutação
   é auditada.
8. Aceite de contrato permanece íntegro após publicação de nova versão.
9. Voucher não pode ser consumido duas vezes, nem ficar reservado após
   expiração do pedido.
10. Duas requisições concorrentes de resgate não pagam duas vezes.
11. Rate limit funciona com duas instâncias da API (Redis compartilhado).
12. Restauração de backup em ambiente limpo reproduz o estado até o minuto
    anterior ao incidente.
13. Nenhum log contém CPF completo, cartão, senha ou token.
14. Checkout não aceita valor, produto ou voucher definidos pelo cliente.
15. Contrato e política de privacidade estão versionados e acessíveis.
16. Pedido expirado não pode ser pago e ativado sem revisão.
17. Pagamento aprovado órfão é detectado pela reconciliação em até 24 h.
18. E-mail de verificação expira e é de uso único.
19. Troca de senha revoga todas as sessões.
20. Exportação de dados exige permissão, aprovação e auditoria.

---

## 11. Riscos residuais e limites

- **Risco regulatório** é o maior e não se resolve com código. Sem parecer
  jurídico, o projeto não deve avançar para produção.
- **Risco de parceiro:** o MP pode recusar ou encerrar a conta; é preciso plano B.
- **Risco de fraude:** CPF único e rate limit não impedem fraude organizada;
  KYC e monitoramento são necessários se houver resgate.
- **Risco de escopo:** "100% administrável" e "regras parametrizáveis" podem
  explodir em complexidade; limitar o MVP.
- **Risco de continuidade:** documentação e handover precisam de critérios
  verificáveis, não apenas boa intenção.

Esta revisão não substitui teste de penetração, auditoria contábil, avaliação de
fornecedores ou due diligence societária.
