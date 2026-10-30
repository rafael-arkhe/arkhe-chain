# Custódia — Revisão crítica do escopo

Documento de análise do escopo recebido para a plataforma de custódia com ativação
via Mercado Pago. **Não contém implementação** e não substitui parecer jurídico,
contábil ou de segurança.

| Documento | Conteúdo |
|---|---|
| [docs/REVISAO-CRITICA-ESCOPO.md](docs/REVISAO-CRITICA-ESCOPO.md) | Achados P0/P1, contradições, fluxos, modelo de domínio, RNFs e faseamento |
| [docs/DECISOES-PENDENTES.md](docs/DECISOES-PENDENTES.md) | Decisões que precisam ser tomadas antes do MVP, com recomendação padrão |
| [docs/CHECKLIST-HANDOVER.md](docs/CHECKLIST-HANDOVER.md) | Critérios de aceite e itens de continuidade para outra equipe |

## Resumo dos bloqueios

1. **"Custódia" e "resgate" não estão definidos** — não se sabe qual ativo é
   custodiado, quem o detém, de onde sai o resgate e qual o veículo jurídico.
2. **Mercado Pago não é custodiante segregado** — o saldo é um recebível da
   conta merchant, sujeito a bloqueio, chargeback e insolvência.
3. **`external_reference = user_id` não impede duplicidade** — é preciso
   `order_id`, `payment_id` único, validação de valor/moeda e máquina de estados.
4. **Ativação automática sem caminho de reembolso/chargeback** — falta
   suspensão automática e clawback de voucher/indicação.
5. **"1 voucher por custódia ativa" é incompleto** — não cobre múltiplos
   vouchers ganhos, reserva no checkout, expiração, precedência e concorrência.
6. **CPF único não é KYC** — não há verificação de titularidade, PEP/sanções,
   monitoramento ou prevenção a lavagem.
7. **Segurança do painel administrativo não foi especificada** — MFA, RBAC,
   dupla aprovação e auditoria são obrigatórias para operações financeiras.
8. **LGPD, retenção, reconciliação e contabilidade estão ausentes** — sem
   ledger e conciliação, não há como provar o passivo com usuários.
9. **Redis "opcional"** conflita com rate limit distribuído, filas e
   idempotência em produção.
10. **Dois domínios sem estratégia de sessão/handoff** — risco de token em URL,
    CORS frouxo e CSRF.

## Premissas desta revisão

- Jurisdição Brasil, moeda BRL, idioma português.
- O texto recebido é a fonte única; não há contrato, proposta comercial,
  protótipo ou base de código prévia.
- "Corretora" significa exchange de criptoativos; "custódia" é o termo usado
  pelo cliente, ainda sem definição jurídica.
- Não foram avaliados preço, prazo, time ou fornecedores.
