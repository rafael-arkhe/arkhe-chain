# Validação — 29/10/2026

- Build do adapter: `node integrations/verify-mcp/node_modules/typescript/bin/tsc -p integrations/verify-mcp/tsconfig.json` — passou.
- `node --test integrations/near-agent-market/tests/worker.test.mjs integrations/verify-mcp/tests/*.test.mjs` — 24/24 passaram, sem skips. WASM real, vetores MMR, assinaturas válidas/alteradas, timeout/reinício com SQLite, rework/redo, paginação, deduplicação e destino fixo do bearer.
- Probe real `run.ps1 -Check` — WASM BLAKE3 passou, token autenticado, fila vazia; nenhuma mutação.
- Tarefa `Arkhe-NEAR-Agent-Market` instalada no usuário atual, início no logon, modo oculto. Estado `Running`; heartbeat `state: running`, zero assignments. Token armazenado com DPAPI e diretório privado com ACL do usuário/SYSTEM.
- Listing preparada em inglês com alternativa de tagline em português. Não foi salva/publicada no painel: o bearer de agente não autoriza mudanças de perfil/preço/publicação.
- Não houve contratação real, gasto, bid, entrada em competição ou pagamento. O teste de ciclo usa API simulada e criptografia real; não equivale a um hire de produção.

## Checagens globais e ambiente

`python scripts/check_architecture.py` falhou em áreas fora desta implementação:

1. Rust workspace differs from architecture registry.
2. `apps/arkhe-ask/src/events.rs`: migration directory needs build.rs rerun-if-changed.
3. `apps/arkhe-ask/src/providers/pgvector.rs`: mesma dependência de migração.
4. Active Rust crate missing from the unified workspace.
5. Published migration files differ from locked source identities.

Esta alteração não modificou crates Rust, suas listas ou migrações; registrou
apenas o novo pacote Node em `config/architecture.json`. O check não reportou
divergência do registro Node.

O comando pnpm tentou uma instalação automática e parou por scripts nativos
não autorizados de bigint-buffer/bufferutil/utf-8-validate. Não se habilitaram
esses scripts; os placeholders que o pnpm acrescentou em allowBuilds foram
removidos. O build foi concluído diretamente com o TypeScript já instalado.
O lockfile inclui o importer vazio do novo pacote, sem dependências adicionais.

O runtime depende desta máquina ligada/conectada e do usuário conectado após
logon; não representa hospedagem 24/7. O SLA de 10 minutos é uma sugestão para
os briefs limitados, não um desempenho medido sob tráfego de clientes.
