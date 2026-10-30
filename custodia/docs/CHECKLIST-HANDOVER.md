# Checklist de aceite e handover

Objetivo: permitir que outra equipe assuma o projeto sem depender de conhecimento
tácito. Cada item precisa de evidência verificável (link, arquivo, execução,
captura ou registro de aprovação), não apenas declaração.

---

## 1. Portões de início

- [ ] Todas as decisões marcadas como **Sim** em
      [DECISOES-PENDENTES.md](DECISOES-PENDENTES.md) respondidas e registradas.
- [ ] Parecer jurídico sobre custódia, resgate, voucher, indicação e contratos.
- [ ] Aprovação do modelo pelo Mercado Pago/adquirente, por escrito.
- [ ] Modelo contábil aprovado (receita vs. passivo, ledger, conciliação).
- [ ] Política de KYC/AML definida, se houver resgate financeiro.
- [ ] Arquitetura de referência e modelo de ameaças revisados.

---

## 2. Documentação obrigatória

- [ ] `README.md` com visão geral, stack, como rodar, como testar e como
      implantar.
- [ ] Arquitetura (C4 ou equivalente): contexto, containers, componentes,
      fluxos de pagamento, ativação, resgate e reembolso.
- [ ] ADRs (Architecture Decision Records) das decisões relevantes, com data,
      contexto, opções e consequências.
- [ ] OpenAPI/Swagger versionado e cliente TypeScript gerado a partir dele.
- [ ] ERD e dicionário de dados: tabelas, colunas, tipos, nulabilidade,
      índices, constraints e retenção.
- [ ] Máquinas de estado de pedido, pagamento, custódia, voucher e indicação.
- [ ] Documentação de regras de negócio: elegibilidade, voucher, indicação,
      reembolso e resgate.
- [ ] Matriz de variáveis de ambiente por ambiente, com descrição e
      obrigatoriedade (sem valores secretos).
- [ ] Inventário de segredos: onde estão, quem acessa, quando rotacionar (sem
      valores no repositório).
- [ ] Runbooks: deploy, rollback, backup/restore, incidente, conciliação,
      reembolso/chargeback, rotação de chaves e break-glass.
- [ ] Política de branch, revisão, versionamento e release.
- [ ] Guia de onboarding para nova pessoa desenvolver em menos de um dia.

---

## 3. Código e qualidade

- [ ] Lint e typecheck sem erros.
- [ ] Testes unitários, de integração e E2E verdes no CI.
- [ ] Testes obrigatórios: replay de webhook, concorrência de ativação, corrida
      de voucher, reembolso/chargeback, IDOR, rate limit distribuído.
- [ ] Cobertura mínima acordada para regras críticas (não apenas percentual
      global).
- [ ] Migrações versionadas, revisadas e testadas em banco limpo e em cópia de
      produção.
- [ ] Nenhum segredo, chave, token ou credencial no repositório ou no histórico.
- [ ] Nenhum `TODO` crítico sem issue vinculada.
- [ ] Dependências auditadas; licenças compatíveis; SBOM gerado.
- [ ] Build reproduzível e imagem Docker versionada por digest.
- [ ] Feature flags para funcionalidades de risco (voucher, indicação, cartão).

---

## 4. Segurança

- [ ] MFA obrigatório para todos os admins.
- [ ] RBAC com menor privilégio e segregação de funções.
- [ ] Four-eyes para ativação manual, reembolso, voucher, preço e exportação.
- [ ] Auditoria append-only com hash chain e retenção definida.
- [ ] Rate limit por rota, IP, conta e dispositivo, com Redis compartilhado.
- [ ] Proteção contra força bruta, credential stuffing e user enumeration.
- [ ] Senhas com Argon2id/bcrypt forte; pepper em KMS.
- [ ] Refresh token com rotação, detecção de reuso e revogação.
- [ ] Cookies `HttpOnly`, `Secure`, `SameSite` adequado; CSRF protection.
- [ ] CORS por allowlist; CSP, HSTS e demais cabeçalhos.
- [ ] Webhook com assinatura, janela de replay, consulta ativa e idempotência.
- [ ] Nenhum dado de cartão no backend; tokenização no cliente; SAQ A.
- [ ] CPF criptografado, hash para unicidade e mascaramento em logs.
- [ ] Pentest concluído; críticos e altos corrigidos ou aceitos formalmente.
- [ ] Varredura de dependências, containers e IaC sem críticos abertos.
- [ ] Segredos rotacionados após o handover e após qualquer saída de pessoa com
      acesso.

---

## 5. Operação e confiabilidade

- [ ] Ambientes separados: desenvolvimento, staging e produção.
- [ ] CI/CD com aprovação para produção e rollback documentado.
- [ ] Backup diário + binlog/PITR; cópia off-site.
- [ ] Restauração testada em ambiente limpo, com evidência de data e resultado.
- [ ] RPO/RTO definidos e monitorados.
- [ ] Health checks, métricas, dashboards e alertas de:
      webhook, fila/DLQ, pagamentos órfãos, divergência de valor, 5xx, latência,
      login anômalo, ações de admin e espaço em disco.
- [ ] Error tracking (Sentry ou equivalente) com correlação.
- [ ] Logs estruturados sem PII, com retenção e acesso restrito.
- [ ] Plano de capacidade e limites conhecidos (MySQL, Redis, filas).
- [ ] Runbook de incidente testado; on-call e escalonamento definidos.
- [ ] Plano de contingência para bloqueio da conta do MP.
- [ ] Rotina de conciliação diária e fechamento mensal documentada.

---

## 6. Compliance e LGPD

- [ ] ROPA (registro de operações de tratamento) atualizado.
- [ ] Base legal por tratamento e aviso de privacidade publicado.
- [ ] Política de retenção e eliminação implementada.
- [ ] Fluxo de DSAR (acesso, correção, portabilidade, eliminação) com prazo.
- [ ] DPO/encarregado nomeado e canal publicado.
- [ ] Plano de resposta a incidente com prazos e comunicação.
- [ ] Contratos de operador com MP, e-mail, SMS, storage, observabilidade e KYC.
- [ ] Transferência internacional mapeada e regularizada.
- [ ] Consentimento de cookies/analytics no site institucional.
- [ ] Contratos versionados, com snapshot, hash e evidência de aceite.
- [ ] Documentos fiscais e contábeis definidos com contador.

---

## 7. Produto e atendimento

- [ ] Catálogo, preço, vigência e escopo de cada produto documentados.
- [ ] SLA de ativação, resgate e atendimento publicados.
- [ ] Política de reembolso/cancelamento publicada e refletida no código.
- [ ] Fluxo de suporte e tickets definido (mesmo que por e-mail no MVP).
- [ ] Comunicação transacional revisada (verificação, pagamento, ativação,
      reembolso, resgate, voucher expirando).
- [ ] Textos legais e disclaimers de conteúdo editorial aprovados.
- [ ] Acessibilidade mínima (WCAG 2.1 AA) verificada nas telas críticas.

---

## 8. Transferência de acessos

- [ ] Repositório GitHub: organização, permissões, branch protection, releases.
- [ ] VPS/cloud: conta, IAM, chaves SSH, firewall, snapshots.
- [ ] DNS e registrar: titularidade, contatos, renovação.
- [ ] Certificados SSL e automação de renovação.
- [ ] Conta Mercado Pago: titularidade, credenciais, webhook, contato.
- [ ] Provedores: e-mail, SMS, storage, monitoring, KYC, error tracking.
- [ ] Secret manager/KMS: ownership e política de acesso.
- [ ] Domínios institucional e da plataforma, com responsáveis.
- [ ] Acessos de suporte e break-glass documentados.
- [ ] Revogação de acessos de quem sai; rotação de segredos compartilhados.

---

## 9. Critérios de aceite funcionais (amostra)

- [ ] Replay de webhook aprovado não duplica pagamento nem custódia.
- [ ] Webhooks concorrentes resultam em uma única ativação.
- [ ] Valor/moeda divergentes bloqueiam ativação e geram alerta.
- [ ] Assinatura inválida é rejeitada sem alterar estado.
- [ ] Refund/chargeback suspende custódia e reverte voucher/recompensa.
- [ ] Voucher não é consumido duas vezes e é liberado no timeout.
- [ ] Usuário não acessa dados de outro usuário (IDOR).
- [ ] Admin sem MFA/permissão não executa ação sensível.
- [ ] Contrato aceito permanece íntegro após nova versão.
- [ ] Rate limit funciona com múltiplas instâncias.
- [ ] Restauração de backup reproduz o estado esperado.
- [ ] Nenhum log contém CPF completo, cartão, senha ou token.
- [ ] Checkout não aceita valor/produto/voucher definidos pelo cliente.
- [ ] Pedido expirado não ativa custódia sem revisão.
- [ ] Pagamento órfão é detectado pela conciliação.

A lista completa está na seção 10 de
[REVISAO-CRITICA-ESCOPO.md](REVISAO-CRITICA-ESCOPO.md).

---

## 10. Sign-off

| Área | Responsável | Evidência | Data | Status |
|---|---|---|---|---|
| Jurídico/regulatório | | | | |
| Contábil/fiscal | | | | |
| Produto | | | | |
| Arquitetura | | | | |
| Segurança | | | | |
| LGPD | | | | |
| Operação/SRE | | | | |
| Atendimento | | | | |
| Handover técnico | | | | |
