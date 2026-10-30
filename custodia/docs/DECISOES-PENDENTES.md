# Decisões pendentes antes do MVP

Cada item precisa de resposta registrada (data, responsável e evidência). As
recomendações são padrões técnicos, não decisões de negócio.

Legenda de bloqueio: **Sim** = impede início; **Condicional** = depende do
modelo escolhido; **Não** = pode avançar com padrão técnico.

Os IDs D1–D22 correspondem aos achados críticos P0-1 a P0-8 da
[revisão crítica](REVISAO-CRITICA-ESCOPO.md); D23–D24 correspondem ao P0-9.
D25–D45 cobrem lacunas adicionais.

---

## A. Produto, custódia e jurídico

| ID | Decisão | Opções | Recomendação | Bloqueia |
|---|---|---|---|---|
| D1 | O que exatamente é custodiado? | Saldo em BRL; criptoativo; direito contratual; apenas bloqueio lógico | Definir antes de codar. Se não há guarda real, renomear o produto (ex.: "plano" ou "assinatura") e não usar "custódia" | Sim |
| D2 | Quem detém o recurso e onde ele fica? | Conta MP; conta bancária da empresa; conta vinculada/escrow; custodiante regulado | Conta vinculada/escrow ou custodiante regulado. Conta merchant do MP não é segregação patrimonial | Sim |
| D3 | O que significa "resgate livre"? | Pix imediato; D+1; fila com prazo; crédito interno | Definir prazo, limites, fonte e fila. Não prometer instantaneidade sem lastro | Sim |
| D4 | Qual o veículo jurídico e quem contrata? | PJ própria; SPE; parceiro regulado | Parecer jurídico. Contrato com regras de segregação, risco e insolvência | Sim |
| D23 | Qual a oferta comercial? | Produto único; catálogo; faixas | Definir o que o usuário compra, preço, o que está incluído, SLA e política de reembolso | Sim |
| D24 | Existe rendimento, benefício ou promessa de retorno? | Não; renda fixa; variável; benefício não financeiro | Se houver retorno, tratar como produto de investimento e validar com CVM/BCB. Sem promessa no MVP | Sim |

---

## B. Mercado Pago e segregação

| ID | Decisão | Opções | Recomendação | Bloqueia |
|---|---|---|---|---|
| D5 | O MP aprovou este modelo? | Sim; não; não consultado | Consultar por escrito antes do desenvolvimento. Guardar a resposta | Sim |
| D6 | Qual o tratamento contábil do valor recebido? | Receita; passivo; conta vinculada | Passivo com ledger por usuário, até o resgate. Validar com contador | Sim |
| D7 | Qual a política de liquidez e contingência? | Reserva 100%; parcial; sem reserva | Reserva integral ou política formal aprovada; plano B de adquirente | Sim |

---

## C. Pagamento, webhook e ativação

| ID | Decisão | Opções | Recomendação | Bloqueia |
|---|---|---|---|---|
| D8 | Qual chave amarra pagamento e operação? | `user_id`; `order_id`; `order_id` + `payment_id` | `external_reference = order_id`, `UNIQUE(mp_payment_id)`, evento idempotente | Sim |
| D9 | Como validar o webhook? | Confiar no payload; só assinatura; assinatura + consulta ativa | Validar `x-signature`/`x-request-id` e consultar `GET /v1/payments/{id}` | Sim |
| D10 | Como processar e reconciliar? | Síncrono; fila + DLQ; fila + DLQ + conciliação diária | Persistir evento, ACK 200, processar em fila, DLQ e conciliação diária | Sim |

---

## D. Reembolso, chargeback e exceções

| ID | Decisão | Opções | Recomendação | Bloqueia |
|---|---|---|---|---|
| D11 | O que acontece em refund/chargeback? | Manual; automático; híbrido | Suspender automaticamente, reverter voucher/recompensa e abrir revisão | Sim |
| D12 | Ativação manual é permitida? | Livre; four-eyes; proibida | Four-eyes com justificativa e auditoria | Sim |

---

## E. Voucher

| ID | Decisão | Opções | Recomendação | Bloqueia |
|---|---|---|---|---|
| D13 | Qual a natureza do voucher? | Desconto; crédito; direito a resgate; brinde | Definir contrato e contabilização. Se resgatável, é passivo | Sim |
| D14 | Vários vouchers por usuário? | Não; wallet com limite; ilimitado | Wallet + no máximo um por custódia + reserva com TTL | Sim |
| D15 | Voucher em reembolso/expiração | Devolver; cancelar; converter | Devolver se não consumido; clawback se consumido | Sim |

---

## F. Identidade, KYC e antifraude

| ID | Decisão | Opções | Recomendação | Bloqueia |
|---|---|---|---|---|
| D16 | KYC é obrigatório? | Não; no cadastro; antes do resgate | Antes do resgate no mínimo; documento + prova de vida ou base cadastral | Sim |
| D17 | PEP, sanções e monitoramento | Nenhum; triagem; contínuo | Triagem na abertura + monitoramento proporcional ao risco | Sim |
| D18 | CPF, estrangeiros e menores | Texto puro; hash; criptografia + hash | Criptografia + hash determinístico; mascarar logs; definir estrangeiro/menor/CNPJ | Sim |
| D25 | Antifraude | Rate limit; device; risco; manual | Rate limit + device fingerprint + velocity + captcha + fila de revisão | Condicional |
| D26 | Bloqueio por IP | Sim; não; risco | Evitar bloqueio cego (CGNAT); usar risco e limites por conta/dispositivo | Não |

---

## G. Painel administrativo e auditoria

| ID | Decisão | Opções | Recomendação | Bloqueia |
|---|---|---|---|---|
| D19 | Controles do admin | Senha; MFA; MFA + RBAC + four-eyes | MFA obrigatório + RBAC + four-eyes para dinheiro/voucher/preço | Sim |
| D20 | Auditoria e break-glass | Log comum; append-only; WORM | Append-only com hash chain; break-glass aprovado e auditado | Sim |

---

## H. LGPD, contratos e conteúdo

| ID | Decisão | Opções | Recomendação | Bloqueia |
|---|---|---|---|---|
| D21 | Programa de LGPD | Mínimo; completo | ROPA, bases legais, retenção, DSAR, DPO, contratos de operador | Sim |
| D22 | Incidente, cookies e transferência | Informal; formal | Plano de incidente, consentimento, contratos e transferência internacional | Sim |
| D27 | Contratos e nível de assinatura | Checkbox; e-sign simples; ICP-Brasil | Checkbox com snapshot/hash para MVP; qualificada se o jurídico exigir | Sim |
| D28 | Conteúdo editorial | Admin livre; revisão | Editor + revisor + disclaimer + versionamento + sanitização | Condicional |
| D29 | Suporte/tickets | MVP; fase 4; fora | E-mail estruturado no MVP; tickets na fase 4 | Não |

---

## I. Comercial, fiscal e meios de pagamento

| ID | Decisão | Opções | Recomendação | Bloqueia |
|---|---|---|---|---|
| D30 | Quem paga a taxa do MP e como aparece? | Absorvida; repassada; híbrida | Definir no contrato e no recibo; conciliar valor líquido | Condicional |
| D31 | Emissão fiscal e contábil | NF-e/NFS-e; recibo; nenhum | Validar com contador; emitir documento por pagamento e por resgate | Condicional |
| D32 | Pix no MVP ou Pix + cartão? | Pix; cartão; ambos | Pix no MVP; cartão após 3DS/tokenização e testes | Não |
| D33 | Parcelamento e juros | Sem; com; por faixa | Definir e simular antes de exibir no checkout | Condicional |

---

## J. Indicação e regras parametrizáveis

| ID | Decisão | Opções | Recomendação | Bloqueia |
|---|---|---|---|---|
| D34 | Indicação entra no MVP? | Sim; fase 4; não | Fase 4. Evitar multinível e recompensa por recrutamento sem pagamento real | Não |
| D35 | Gatilho e clawback da indicação | Cadastro; KYC; pagamento; custódia ativa N dias | Pagamento aprovado + janela de maturação + clawback | Condicional |
| D36 | Elegibilidade parametrizável | Código fixo; regra versionada | Rule set versionado com vigência, simulação e aprovação | Sim |

---

## K. Arquitetura, operação e handover

| ID | Decisão | Opções | Recomendação | Bloqueia |
|---|---|---|---|---|
| D37 | Redis | Opcional; obrigatório | Obrigatório em produção para rate limit, fila e idempotência | Sim |
| D38 | Dois apps ou um com host routing? | 2 Next; 1 Next com hosts | 2 apps (institucional e plataforma) + cookie no subdomínio da plataforma | Sim |
| D39 | Handoff entre domínios | Token na URL; cookie compartilhado; `returnTo` | `returnTo` validado por allowlist; nunca token na URL | Sim |
| D40 | ORM, IDs e dinheiro | Prisma/TypeORM/Drizzle; UUID/ULID; centavos | ORM com migrações versionadas; UUIDv7/ULID; `BIGINT` centavos | Não |
| D41 | Observabilidade, backup e CI | Básico; completo | Logs estruturados, métricas, alertas, PITR, restore testado, CI com SAST | Sim |
| D42 | Testes e pentest | Unitários; integração; completo | Unit + integração MySQL + replay/concorrência + E2E + pentest antes do go-live | Sim |
| D43 | Gestão de segredos | `.env`; secret manager | Secret manager/KMS, rotação e separação por ambiente | Sim |
| D44 | SLOs e limites de rate | Informais; documentados | RPO/RTO, p95, limites por rota e alertas documentados | Sim |
| D45 | Handover | Informal; checklist | README, ADRs, OpenAPI, ERD, runbooks, SBOM, acessos e segredos | Sim |

---

## Ordem sugerida

1. **Semana 1:** D1–D7, D23–D24 (produto, custódia, jurídico, contábil, MP).
2. **Semana 1–2:** D8–D15, D27 (pagamento, ativação, voucher, reembolso, contrato).
3. **Semana 2:** D16–D22 (KYC, admin, LGPD).
4. **Semana 2–3:** D37–D45 (arquitetura, operação, handover).
5. **Depois:** D25–D26, D28–D36 (antifraude, conteúdo, fiscal, cartão, indicação).

Enquanto D1–D7 não forem respondidas, qualquer código de custódia é descartável.
A Fase 1 (auth, contratos, admin, observabilidade) pode começar.
