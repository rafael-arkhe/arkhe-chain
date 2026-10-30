-- 0001_nucleo.sql — o esquema do núcleo.
--
-- 🔴 ESTA É A ÚNICA AUTORIDADE DE SCHEMA DO AEGIS.
--
-- O núcleo anterior tinha duas: o `init_db` rodava `create_all` (construindo
-- o schema de HOJE a partir dos modelos) e, se não encontrasse
-- `alembic_version`, carimbava o banco em HEAD. A primeira `alembic upgrade
-- head` da frota reexecutou as 128 migrações sobre um schema já completo e
-- morreu com `DuplicateColumnError: column "template_id" of relation
-- "workshop_apps" already exists`.
--
-- Aqui só existe esta pasta. Aplica-se em ordem, uma vez, com a soma
-- conferida — e uma migração cujo checksum mudou depois de aplicada é um
-- ERRO, não um "deixa como está".
--
-- O esquema é **neutro de domínio**: nenhuma tabela aqui é de um vertical.
-- Tudo o que um domínio tem é `aegis_objeto.tipo` + `propriedades` em JSONB.
-- Foi medido que o modelo do núcleo anterior já era assim (224 tabelas, zero
-- de domínio) — o que muda aqui é que agora isso é uma ESCOLHA REGISTRADA, e
-- não um accidents que ninguém escreveu.

-- ---------------------------------------------------------------------------
-- L Ledger de migrações
-- ---------------------------------------------------------------------------
create table if not exists aegis_migracao (
    versao     integer primary key,
    aplicada_em timestamptz not null default now(),
    checksum   text not null,
    nome       text not null
);

-- ---------------------------------------------------------------------------
-- Tenant
-- ---------------------------------------------------------------------------
create table if not exists aegis_tenant (
    id          uuid primary key default gen_random_uuid(),
    slug        text not null unique,
    nome        text not null,
    ativo       boolean not null default true,
    -- 🔴 O marcador do seed. `/health/ready` compara isto com a versão que o
    -- manifesto pede: uma ilha com o seed velho responde `200` no `/health` e
    -- **tem** de recusar no `/health/ready`.
    seed_versao integer not null default 0,
    criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Objetos — a ontologia inteira
-- ---------------------------------------------------------------------------
create table if not exists aegis_objeto (
    id             uuid primary key default gen_random_uuid(),
    tenant_id      uuid not null references aegis_tenant(id) on delete cascade,
    tipo           text not null,
    -- A chave que faz "uma linha por placa", "um por reservação". `null`
    -- significa instância sem identidade própria (linha de log, por exemplo).
    chave_canonica text,
    propriedades   jsonb not null default '{}'::jsonb,
    versao         integer not null default 1,
    -- 🔴 O hash do conteúdo, assinado a cada escrita. É o que permite provar
    -- que uma instância não mudou por fora do sistema.
    signed_hash    text not null,
    criado_em      timestamptz not null default now(),
    atualizado_em  timestamptz not null default now(),
    -- Soft delete: o registo some das telas mas fica auditável.
    removido_em    timestamptz
);

-- O índice que toda tela usa: as instâncias vivas de um tipo, de um tenant.
create index if not exists ix_aegis_objeto_tipo
    on aegis_objeto (tenant_id, tipo)
    where removido_em is null;

-- A identidade canônica é única **entre as vivas** — um soft delete tem de
-- liberar a chave, senão o mesmo cliente volta e não cabe.
create unique index if not exists ux_aegis_objeto_canonica
    on aegis_objeto (tenant_id, tipo, chave_canonica)
    where chave_canonica is not null and removido_em is null;

-- Busca de propriedade. É o que substitui as 123 extrações `.astext` do
-- núcleo anterior por um índice GIN em vez de um scan.
create index if not exists ix_aegis_objeto_propriedades
    on aegis_objeto using gin (propriedades jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- Arestas — os links
-- ---------------------------------------------------------------------------
create table if not exists aegis_aresta (
    id         uuid primary key default gen_random_uuid(),
    tenant_id  uuid not null references aegis_tenant(id) on delete cascade,
    nome_link  text not null,
    origem_id  uuid not null references aegis_objeto(id) on delete cascade,
    destino_id uuid not null references aegis_objeto(id) on delete cascade,
    criado_em  timestamptz not null default now(),
    constraint aegis_aresta_sem_auto_laco check (origem_id <> destino_id)
);

-- A ordem das colunas é deliberada: o predicado do store filtra por
-- `(tenant_id, nome_link, origem_id)` e o índice precisa ter o `tenant_id`
-- como prefixo. No núcleo anterior a desjunção `(tenant_id = :t OR
-- tenant_id IS NULL)` impedia o planner de usar o prefixo, e um `EXPLAIN`
-- mostrado isso.
create index if not exists ix_aegis_aresta_origem
    on aegis_aresta (tenant_id, nome_link, origem_id);
create index if not exists ix_aegis_aresta_destino
    on aegis_aresta (tenant_id, nome_link, destino_id);

-- A mesma aresta não nasce duas vezes.
create unique index if not exists ux_aegis_aresta
    on aegis_aresta (tenant_id, nome_link, origem_id, destino_id);

-- ---------------------------------------------------------------------------
-- RLS — o isolamento é do BANCO, não da aplicação
-- ---------------------------------------------------------------------------
--
-- 🔴 Isto não é decoração. A lição medida: o isolamento de tenant do núcleo
-- anterior era GUC de sessão lido por `current_setting()` em políticas RLS, com
-- o runtime num role `NOBYPASSRLS` e o boot no dono. A camada de aplicação
-- podia errar; a política, não.
--
-- `aegis.tenant_id` é posto pelo store no início de cada transação de
-- leitura/escrita. Sem ele, `current_setting(..., true)` devolve vazio, a
-- política nega, e a ilha devolve **zero** linhas em vez de vazar todas.

alter table aegis_objeto enable row level security;
alter table aegis_aresta enable row level security;

drop policy if exists aegis_objeto_tenant on aegis_objeto;
create policy aegis_objeto_tenant on aegis_objeto
    for all
    using      (tenant_id::text = current_setting('aegis.tenant_id', true))
    with check (tenant_id::text = current_setting('aegis.tenant_id', true));

drop policy if exists aegis_aresta_tenant on aegis_aresta;
create policy aegis_aresta_tenant on aegis_aresta
    for all
    using      (tenant_id::text = current_setting('aegis.tenant_id', true))
    with check (tenant_id::text = current_setting('aegis.tenant_id', true));
