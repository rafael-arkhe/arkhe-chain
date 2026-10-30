# Arkhe Enterprise

[Avaliação dos serviços Serpro](SERPRO-SERVICES.md): Consulta CNPJ, Datavalid e Serprobots, com fontes oficiais e limites de integração. Contratos continuam não confirmados; nenhuma integração adicional foi ativada.

Portal integrado ao projeto existente em `apps/arkhe-intra`.

- `/enterprise`: dashboard com dados reais acessíveis à conta, personas e inspeção de evidências.
- `/enterprise/perfis`: oito personas, doze setores e fallback genérico.
- `/enterprise/onboarding`: preview e registro imutável da configuração local, exclusivo da governança.
- `/verificar` e `/verificar/e02`: verificadores existentes, acessíveis a partir do portal.

Execute o app pelo comando habitual `pnpm dev:intra` e entre com uma conta existente. No ambiente padrão: `http://127.0.0.1:3003/enterprise`.

Leia [a revisão de arquitetura](ARCHITECTURE.md), [a validação com screenshots](VALIDATION.md), [a maturidade](MATURITY.md) e [o gate cadastral](CNPJ-REGISTRY.md). Os protótipos originais estão preservados em `stitch_arkhe_enterprise_verification_platform`.

Os presets registram requisitos propostos. A confirmação não provisiona serviços nem ativa retenção, quotas, RBB, HSM ou ICP-Brasil. O catálogo tem hash de integridade, sem assinatura de autoridade. A instalação continua com uma organização; personas não concedem permissões.

A confirmação exige consulta cadastral de produção Serpro configurada no servidor. Sem credenciais ou com dados divergentes, o perfil não é confirmado. Consulta cadastral não comprova representação legal.

A [política faseada](REPRESENTATION-POLICY.md) acrescenta declaração assinada e anexos por hash para generic interno. O [standalone](STANDALONE.md) foi validado em contêiner Podman com imagem em formato Docker. Procuração/e-CNPJ, Serpro real e liberação de piloto externo continuam pendentes; contratação está não confirmada.


## Documentos canônicos

| Documento | Responsabilidade |
| --- | --- |
| [PRD.md](PRD.md) | Produto, requisitos, aceite, não objetivos e hipóteses comerciais |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, fontes, dados, APIs e fronteiras de confiança |
| [DESIGN.md](DESIGN.md) | Tokens e componentes implementados, estados e limites de acessibilidade |
| [RULES.md](RULES.md) | Regras de contribuição e distinção entre normas e gates demonstrados |
| [TASKS.md](TASKS.md) | T1–T5 concluídas localmente, dependências e aceite das pendências |
| [PROGRESS.md](PROGRESS.md) | Histórico resumido, evidência e próxima etapa |

[MATURITY.md](MATURITY.md) continua sendo a referência de estado, acompanhada de [VALIDATION.md](VALIDATION.md). Os seis documentos foram consolidados com o código atual, sem substituir as políticas detalhadas de representação, procurement, resiliência e standalone. Preços e metas no PRD são hipóteses; Serpro permanece não confirmado e Speedrun fica posterior aos requisitos do piloto.


Operação: [RUNBOOK.md](RUNBOOK.md) descreve TLS/proxy, métricas protegidas, logs, backup/restore e incidentes; [INFRASTRUCTURE-REVIEW.md](INFRASTRUCTURE-REVIEW.md) confronta os 19 tópicos com o runtime real. Templates de backup e Caddy ficam em [ops/enterprise](../ops/enterprise/), sem agendamento ou deploy público ativados.

[Recibos Pix opcionais](PIX-RECEIPTS.md): consumo WASM e avaliação sintética com pin do operador. Desativados por padrão; sem liquidação, arquivo de recibos, RLS ou ativação de onboarding.
