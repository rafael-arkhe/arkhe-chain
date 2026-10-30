# Arkhe Enterprise — regras de contribuição

Versão: 1.0. Data: 2026-10-23. Estas regras preservam os contratos atuais. “Norma” descreve o comportamento exigido para alterações; “evidência” descreve verificações efetivamente realizadas. Nenhuma lista equivale a cobertura exaustiva ou novo gate de CI.

## Verdade e fronteiras de confiança

- Consultar [MATURITY.md](MATURITY.md), [VALIDATION.md](VALIDATION.md) e o código antes de declarar capacidade. LEMMA deve ser limitado à propriedade exercitada e ao ambiente registrado; inspeção de código, um teste isolado ou presença em `validation/` não bastam para validar operação externa.
- Identificar fixtures, respostas simuladas, arquivos sintéticos e dependências ausentes. Um teste com Serpro simulado prova o comportamento do cliente, não contrato ou consulta real.
- Preservar autenticação e RBAC existentes. Persona adapta apresentação e nunca amplia acesso. Aplicar autorização no servidor, não apenas em links/botões.
- Não confundir CNPJ consultado, assinatura da conta, certificado, poderes e escopo do ato. SelfDeclared mantém powers_verified=false e external_timestamp=false. Uma tag PowerOfAttorney/ECnpj ou flag do cliente não constitui verificação.
- Não liberar commit por dígitos verificadores ou fallback BrasilAPI. Consulta Serpro de produção coincidente e representação admitida são requisitos separados.
- Não anunciar retenção, quotas, RBB, HSM, timestamp ou conformidade regulatória sem implementação e validação correspondentes.

## Segurança e dados

- Segredos, chaves privadas de usuários, contas locais, bancos e arquivos `.env` não entram no contexto/imagem de build ou repositório. `node_modules` do host é excluído do contexto; dependências instaladas no build fazem parte do runtime standalone por necessidade. O WASM gerado explicitamente permitido é incluído e identificado no manifest.
- Manter sessão, `Cache-Control: no-store`, limites de corpo e checagens Origin para mutações de navegador. Webhooks de serviço têm autenticação própria: o webhook Stripe existente verifica assinatura e não usa Origin de navegador.
- Preservar transações SQLite síncronas com BEGIN IMMEDIATE, WAL, foreign_keys=ON e busy_timeout de 5000 ms no runtime. Testes de contenção podem reduzir esse timeout no banco temporário. Retry de aquisição é limitado e não repete callbacks com efeitos externos; escritas avulsas usam busy_timeout.
- O formulário envia Idempotency-Key ao preview e a preserva após falha de transporte. O servidor mantém o header opcional por compatibilidade; chave repetida com dados diferentes ou preview substituído deve falhar. Não prometer previews independentes para chaves distintas do mesmo usuário: há um preview ativo por usuário.
- Preservar `/api/health`, `/api/ready` e o drain nativo Next. O supervisor standalone tem prazo de 20 segundos; stop timeout deve ser superior. Não prometer conclusão de requisições que excedam esse prazo.

## Implementação e testes

TypeScript está em strict; preferir unknown com narrowing em novas fronteiras em vez de ampliar any existente. O helper legado ainda possui `api<T = any>`: não existe proibição automatizada global de any. Não adicionar eval nem HTML arbitrário sem estratégia de sanitização. Usar componentes client onde a interação exigir.

O workspace usa Rust 1.96.0. Preservar o perfil MMR e paridade Rust/WASM; mudanças de semântica exigem decisão e versionamento. Não afirmar que o Cargo.toml raiz já impõe unwrap_used/expect_used/dbg_macro: esses gates globais não foram encontrados. Para mudanças no binário local, executar testes relevantes, fmt e clippy; isso não significa que toda função pública tenha teste individual ou que nextest tenha sido executado.

Verificar mudanças com cenários relevantes: autorizado/não autorizado nas rotas protegidas, falha e recuperação nas integrações e transações, bancos temporários e nenhuma chamada paga involuntária. Para alterações só documentais, conferir referências e afirmações; não exigir testes artificiais que espelhem texto.

As 17 migrações SQL do workspace são imutáveis e verificadas pelo gate de arquitetura. O schema SQLite do portal é inicializado por store/módulos, com evolução aditiva; não editar checksums históricos nem inventar migração para tabela/coluna ausente.

## Registro de decisões e execução

Manter PRD, arquitetura, design, tarefas e progresso coerentes com maturidade e evidências. Decisões transversais usam [specs/adr](specs/adr/); os limites ADR-008/009/011 também estão resumidos na arquitetura, enquanto ADR-010 tem arquivo próprio. Registrar pendências e regressões sem apagar evidência histórica. Atualizar maturidade para cima somente com evidência nova e escopo explícito, e para baixo quando houver regressão.

Não adicionar infraestrutura distribuída sem requisito e decisão de escopo. A matriz dos 50 tópicos é [RESILIENCE-REVIEW.md](RESILIENCE-REVIEW.md), não uma divisão imutável de “39 irrelevantes”.

Quando Git estiver disponível e houver pedido de commit/PR, preferir mudanças lógicas e mensagens claras, com Conventional Commits quando adotado pelo repositório. Este workspace não forneceu metadados Git para esta entrega; salvar arquivos não equivale a commit ou PR. Não criar fluxo externo, contratação, submissão Speedrun ou contato comercial a partir de um item de backlog.
