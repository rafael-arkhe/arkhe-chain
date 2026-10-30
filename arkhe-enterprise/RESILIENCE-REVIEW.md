# Resiliência do portal — revisão dos 50 tópicos

Data: 2026-10-23. Escopo: uma organização, um processo Next e um arquivo SQLite; verificações locais com dados sintéticos. Os 17 arquivos SQL imutáveis do workspace não são as migrações deste portal: seu schema SQLite é inicializado em `lib/store.mjs` e nos módulos de domínio. Não foram alterados checksums históricos.

## Cinco ações

1. **Contenção SQLite.** `BEGIN IMMEDIATE`, WAL, conexão única por processo e `busy_timeout=5000` já existiam. Foram adicionadas duas novas tentativas de aquisição, com espera exponencial e jitter (20–39 ms e 40–59 ms), além da tentativa inicial. O callback só executa após adquirir o lock e nunca é repetido; transações exigem callbacks síncronos e rollback em falhas. Cada aquisição pode consumir cinco segundos; não é garantia de ausência de `SQLITE_BUSY`. Escritas avulsas continuam protegidas pelo busy timeout SQLite, sem replay automático de efeitos da aplicação. Testes reais com threads verificam recuperação, esgotamento, rollback e callback único.
2. **Schema e consultas.** `foreign_keys=ON`, PKs e restrições UNIQUE já existiam. Testes agora provocam violação FK e unicidade. Índices adicionados nas expirações de sessões/login, ordenação de solicitações/convites e busca de solicitações pendentes por email/chave. O teste usa `EXPLAIN QUERY PLAN` para confirmar os caminhos de sessão, expiração e ordenação. Não existe `tenant_id`; o dashboard executa uma leitura de documentos, filtra RBAC em memória e não apresenta N+1 nesse caminho. Sua varredura ainda é linear: não foi feito benchmark Growth nem adicionada paginação.
3. **Serpro.** GET cadastral admite até três tentativas em 429/502/503/504, com backoff de 200/400 ms e jitter até 99 ms. `Retry-After` é respeitado; acima de dois segundos a operação termina sem antecipar a tentativa. O orçamento de dez segundos inclui token, leitura, tentativas e esperas. O POST de token e falhas de transporte não são repetidos automaticamente. Três operações com falhas transitórias desde o último sucesso abrem o circuito por 30 segundos; há limite de duas operações simultâneas, sem fila. O estado é local ao processo e muda com a rotação de credenciais. Erros de dados/autorização não ganham retry. Nenhum sucesso sintético confirma o serviço real, contrato ou quota. As novas tentativas GET podem aumentar consumo quando habilitado; contrato e orçamento continuam pendentes. Isso não implementa um limite financeiro por minuto.
4. **Operação.** `/api/health` já existia e continua sendo liveness. `/api/ready` consulta SQLite e verifica FK; não exige Serpro, pois suas funções locais continuam disponíveis sem ele. Durante encerramento o marcador de drenagem torna readiness negativa. O Next 15.5.28 instalado já fecha o listener e aguarda requisições em SIGTERM/SIGINT. O entrypoint agora supervisiona o processo, preserva esse tratamento e impõe prazo de 20 segundos antes de SIGKILL. O runtime usa readiness no HEALTHCHECK. Configure stop timeout superior a 20 segundos; após esse prazo requisições podem ser interrompidas. O marcador reside em /tmp e é removido ao terminar.
5. **Preview idempotente.** `Idempotency-Key` opcional (16–128 caracteres ASCII alfanuméricos, `_`, `-`), vinculada ao usuário e ao conteúdo normalizado, armazenada com a resposta na mesma transação do preview. Retry devolve a mesma resposta/expiração; conteúdo diferente ou preview substituído retorna 409. Registros expiram junto ao preview em 15 minutos. O formulário preserva a chave após erro de transporte e gera outra para conteúdo novo. Clientes antigos sem header continuam funcionando. Perfil permanece imutável e não foi tornado editável.

## Matriz corrigida

`Local` significa código e teste no escopo descrito; não certificação operacional. `Adiado` indica ausência deliberada neste estágio, e não irrelevância universal.

| # | Tópico | Resultado no escopo atual |
| --- | --- | --- |
| 1 | Race conditions | Local: disputa A+B e contenção SQLite testadas; falhas busy continuam possíveis |
| 2 | Deadlocks | Sem locks distribuídos; contenção e upgrade de transação SQLite exigem cuidado |
| 3 | Transações | Local: commit, auditoria e consumo do preview atômicos |
| 4 | ACID | SQLite/WAL; durabilidade depende também de disco, volume e operação |
| 5 | Isolamento | Padrão SQLite; não introduzido read_uncommitted/shared cache |
| 6 | Optimistic locking | Perfil imutável e comparação de preview; não há versão geral de linha |
| 7 | Pessimistic locking | BEGIN IMMEDIATE já usado; não SELECT FOR UPDATE |
| 8 | Connection pooling | Uma DatabaseSync por processo; sem pool ou múltiplas instâncias |
| 9 | N+1 | Dashboard tem uma leitura de documentos; RBAC linear em memória |
| 10 | Índices | PKs existentes e índices direcionados adicionados |
| 11 | Otimização | Planos direcionados conferidos; sem benchmark de capacidade |
| 12 | EXPLAIN | EXPLAIN QUERY PLAN em testes; não EXPLAIN ANALYZE Postgres |
| 13 | FKs | PRAGMA já ativo; rejeição de órfão testada |
| 14 | Unicidade | PKs/UNIQUE já no schema; preview por usuário e perfil id=1 |
| 15 | Migrações | SQL workspace imutável; schema do portal separado e aditivo |
| 16 | Migração sem downtime | Não validada; single-org também pode exigir disponibilidade |
| 17 | Réplicas | Adiado |
| 18 | Replication lag | Sem réplica neste portal |
| 19 | Sharding | Adiado |
| 20 | Particionamento | Adiado |
| 21 | Invalidação de cache | React Query invalida dados após mutações; API no-store |
| 22 | Redis eviction | Sem Redis |
| 23 | Cache stampede | Sem cache backend; limite de consultas Serpro simultâneas |
| 24 | Cache distribuído | Adiado |
| 25 | Idempotência | Preview com chave; perfil único, retry de commit retorna conflito |
| 26 | Retry | SQLite na aquisição e GET Serpro em respostas transitórias |
| 27 | Backoff | Limitado e testado |
| 28 | Jitter | Limitado e testado |
| 29 | Circuit breaker | Serpro por processo; cooldown 30 segundos |
| 30 | Rate limiting | Login já limitado; Serpro tem concorrência limitada, sem quota financeira temporal |
| 31 | Balanceamento | Sem múltiplas instâncias |
| 32 | Escala horizontal | Não suportada/validada pelo portal |
| 33 | Escala vertical | Recursos ajustáveis; capacidade ainda não medida |
| 34 | Reverse proxy | TLS/proxy público pendente; Next não substitui proxy |
| 35 | Fila | Não adicionada; operações externas atuais são síncronas |
| 36 | DLQ | Sem fila neste portal |
| 37 | Worker | Motor Rust local por processo filho; não worker durável de ancoragem |
| 38 | Scheduler | Não adicionado ao portal |
| 39 | EDA | Eventos de auditoria existem; nenhum broker obrigatório inferido |
| 40 | Webhooks | Billing existente verifica assinatura Stripe; não há webhook Enterprise de provas |
| 41 | Retry de webhook | Billing possui deduplicação/reconciliação; entrega de webhook de provas ausente |
| 42 | Consistência eventual | Não declarar ancoragem externa a partir do recibo WormGraph local |
| 43 | Transações distribuídas | Não implementadas; SQLite não torna HTTP Serpro atômico |
| 44 | Outbox | Não necessário para as leituras Serpro; exigiria desenho antes de publicação durável |
| 45 | CQRS | Não adicionado |
| 46 | Event sourcing | Auditoria append-only não equivale por si só a reconstruir todo estado do portal |
| 47 | Backpressure | Duas consultas Serpro simultâneas; rejeição imediata acima do limite |
| 48 | Graceful shutdown | Drain nativo Next preservado e supervisor com prazo |
| 49 | Health | Liveness existente; readiness SQLite adicionada |
| 50 | Tracing | OpenTelemetry não adicionado; diagnóstico local ainda limitado |

## Fontes primárias e limites

- [SQLite Transactions](https://www.sqlite.org/lang_transaction.html): BEGIN IMMEDIATE também pode falhar com SQLITE_BUSY; não elimina toda contenção.
- [SQLite PRAGMA](https://www.sqlite.org/pragma.html#pragma_busy_timeout): timeout é por conexão e é limitado.
- [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting): recomenda proxy para exposição pública. O comportamento de drain foi conferido também no start-server.js da versão 15.5.28 instalada, não inferido apenas da documentação mais recente.

Os testes de resiliência usam respostas sintéticas Serpro. Contratação/habilitação continuam não confirmadas, poderes de representação externa continuam pendentes e Speedrun permanece após os requisitos do piloto. Nada nesta revisão libera produção regulada ou deploy público.
