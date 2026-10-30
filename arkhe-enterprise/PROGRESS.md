# Arkhe Enterprise — progresso

Revisão documental das referências Serpro: [SERPRO-SERVICES.md](SERPRO-SERVICES.md). Conferidos OAuth2, trial/produção/schema, pré-requisitos Datavalid e papel opcional do Serprobots. Sem chamadas autenticadas/pagas ou mudanças de runtime. O contrato é não confirmado; o job diário completo não foi demonstrado; verificadores externos de representação continuam pendentes de implementação e validação.

Data: 2026-10-23. Portal single-org e representação Fase 0 validados localmente, com dados sintéticos. Piloto externo pendente. Contratação/habilitação Serpro não confirmadas. [MATURITY.md](MATURITY.md) define o escopo das classificações, sem certificação de produção.

## Entregas locais

| Entrega | Evidência e limite |
| --- | --- |
| Portal e personas | /enterprise, /enterprise/perfis, /enterprise/onboarding; oito personas, doze setores e generic; RBAC existente |
| Preview e perfil | Hash, expiração, isolamento por usuário e commit único; corrida A+B 201/409, um evento e remoção dos previews |
| CNPJ | Validação numérica e alfanumérica; consulta Serpro fail-closed com respostas sintéticas nos testes |
| Representação | Assinatura Ed25519 e hashes documentais no WormGraph Rust; generic/internal; sem poderes verificados ou timestamp externo |
| Browser piloto | 13 screenshots e oito verificações desktop/mobile; dados sintéticos e bloqueio sem Serpro |
| Resiliência T1–T5 | SQLite, índices/FK/planos, circuito Serpro, readiness/drain e preview idempotente; concluídas localmente |
| Standalone atual | Podman rootless, usuário node, raiz somente leitura; oito verificações e três screenshots; HTTP 200 durante SIGTERM e persistência após reinício |
| Checks | 72 testes Node, 235 Python, TypeScript, arquitetura e build Linux; dois testes Rust do motor na revisão anterior |

O relatório do [browser piloto](validation/2026-10-23/pilot/browser-report.json) e o da [resiliência standalone](validation/2026-10-23/resilience-standalone/container-report.json) são execuções distintas. As capturas anteriores não foram regeneradas nesta consolidação documental. Os manifests vinculam fontes de cada revisão; alterações posteriores de Markdown não invalidam os resultados históricos, mas não correspondem automaticamente aos hashes antigos.

## Correções já realizadas

- Registro do pacote integrations/solana-proof e fronteira vendor exata para output/meteora-dbc-program; gate de arquitetura passou.
- Lockfile reconciliado antes da verificação frozen; o comando frozen verifica consistência, não conserta um lockfile inconsistente.
- Chromium headless tornou o fluxo navegável e inspecionável; empacotamento standalone foi validado separadamente no Linux.
- Concorrência de previews, prioridade CNAE e fallback generic foram fixados em testes.
- Representação ficou separada do cadastro; ausência de Serpro ou verificador externo não é contornada.
- Circuito Serpro isolado por configuração de credenciais nos testes, mantendo o comportamento de proteção do runtime.

## Pendente e próximo passo

| Item | Situação |
| --- | --- |
| T6 — Serpro real | Conta/contrato/orçamento precisam de confirmação privada; nenhuma chamada paga realizada |
| T7 — poderes externos | Procuração/e-CNPJ/QSA sem verificadores operacionais neste fluxo; piloto externo bloqueado |
| RBB/HSM/TSA | Não demonstrados operacionalmente no portal |
| Enforcement setorial | Retenção, legal hold, quotas e requisitos dos presets continuam propostas |
| TLS/proxy, CI remoto e deploy público | Pendentes, sem alegação de prontidão para produção |
| Capacidade e preços | Hipóteses, sem benchmark Growth ou custo contratado |
| Multi-tenancy | Fora do escopo |

Speedrun: **preparar após os requisitos do piloto**, conforme decisão do usuário. Não há decisão pendente sobre “agora ou depois”. Nenhuma submissão ou contato ACIEG foi realizado. O backlog não autoriza contratar ou enviar mensagens.

## Consolidação dos seis documentos

Foram integrados [PRD](PRD.md), [arquitetura](ARCHITECTURE.md), [design](DESIGN.md), [regras](RULES.md), [tarefas](TASKS.md) e este progresso. O texto-base foi corrigido onde divergente do código: versões, caminhos, login, tabelas, tokens CSS, estado T1–T5 e parâmetros de resiliência. Não se introduziram fallback cadastral, novos prazos de shutdown ou header obrigatório no servidor por meio da documentação. Nenhum commit Git, PR, compra ou publicação foi criado.


## Infraestrutura local

Foram adicionados métricas protegidas, logs HTTP JSON, integrity_check no startup, snapshot online e restore isolado, configurações Caddy e runbook. Passaram cinco verificações de infraestrutura e uma captura HTTPS no Linux; relatório em [infrastructure/report.json](validation/2026-10-23/infrastructure/report.json). Suíte atual: 72 testes app, 235 Python, TypeScript/arquitetura/build Linux aprovados. O teste ampliado de backup também rejeita auditoria alterada e arquivo inválido no startup.

TLS público, ativação do backup diário, cópia off-host e limites cgroup não estão demonstrados. Templates de systemd não foram instalados ou ativados. Não houve mudança na VM, contratação, API paga, submissão ou contato comercial. Detalhes em [INFRASTRUCTURE-REVIEW.md](INFRASTRUCTURE-REVIEW.md) e [RUNBOOK.md](RUNBOOK.md).
