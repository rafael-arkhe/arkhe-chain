\set ON_ERROR_STOP on
\echo '=== Arkhe SQL Phase-1 PostgreSQL 16 security gates ==='

-- This script is expected to run as a PostgreSQL superuser after migrations.
-- It intentionally uses SET ROLE to exercise the exact runtime/read roles.

CREATE TEMP TABLE arkhe_gate_results (
    gate text PRIMARY KEY,
    status text NOT NULL,
    detail text NOT NULL
);

-- SET ROLE must be able to write test results without elevated privileges.
-- Only this session-local results table is granted; evidence permissions stay unchanged.
GRANT SELECT, INSERT ON arkhe_gate_results TO arkhe_append, arkhe_read;

-- Helper for catching expected failures while continuing the test suite.
CREATE OR REPLACE FUNCTION pg_temp.expect_failure(gate_name text, stmt text, needle text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    BEGIN
        EXECUTE stmt;
        INSERT INTO arkhe_gate_results VALUES (gate_name, 'FAIL', 'statement unexpectedly succeeded');
    EXCEPTION WHEN OTHERS THEN
        IF needle = '' OR position(lower(needle) in lower(SQLERRM)) > 0 THEN
            INSERT INTO arkhe_gate_results VALUES (gate_name, 'PASS', SQLSTATE || ': ' || SQLERRM);
        ELSE
            INSERT INTO arkhe_gate_results VALUES (gate_name, 'FAIL', SQLSTATE || ': ' || SQLERRM);
        END IF;
    END;
END
$$;

-- Role invariants.
INSERT INTO arkhe_gate_results
SELECT 'ROLE-APPEND-NO-BYPASS',
       CASE WHEN NOT rolsuper AND NOT rolbypassrls THEN 'PASS' ELSE 'FAIL' END,
       format('rolsuper=%s rolbypassrls=%s', rolsuper, rolbypassrls)
FROM pg_roles WHERE rolname='arkhe_append';

INSERT INTO arkhe_gate_results
SELECT 'ROLE-READ-NO-BYPASS',
       CASE WHEN NOT rolsuper AND NOT rolbypassrls THEN 'PASS' ELSE 'FAIL' END,
       format('rolsuper=%s rolbypassrls=%s', rolsuper, rolbypassrls)
FROM pg_roles WHERE rolname='arkhe_read';

-- RLS metadata invariants on all tenant-scoped evidence tables.
INSERT INTO arkhe_gate_results
SELECT 'RLS-ALL-TABLES-FORCED',
       CASE WHEN count(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity) = 9 THEN 'PASS' ELSE 'FAIL' END,
       format('forced=%s/9', count(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity))
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('idempotency_keys','usage_events','intents','verification_records','branch_states','finding_dispositions','mmr_checkpoints','work_objects','wormgraph_records');

-- Seed tenant A under the real append role.
BEGIN;
SET LOCAL ROLE arkhe_append;
SELECT set_config('app.tenant_id','tenant-a',true);
INSERT INTO intents(intent_digest, tenant_id, canonical_bytes)
VALUES (decode(repeat('aa',32),'hex'), 'tenant-a', decode('01','hex'));
COMMIT;

-- Seed tenant B under the real append role.
BEGIN;
SET LOCAL ROLE arkhe_append;
SELECT set_config('app.tenant_id','tenant-b',true);
INSERT INTO intents(intent_digest, tenant_id, canonical_bytes)
VALUES (decode(repeat('bb',32),'hex'), 'tenant-b', decode('02','hex'));
COMMIT;

-- Tenant A sees only A.
BEGIN;
SET LOCAL ROLE arkhe_append;
SELECT set_config('app.tenant_id','tenant-a',true);
DO $$
DECLARE a_count int; b_count int;
BEGIN
  SELECT count(*) INTO a_count FROM intents WHERE tenant_id='tenant-a';
  SELECT count(*) INTO b_count FROM intents WHERE tenant_id='tenant-b';
  INSERT INTO arkhe_gate_results VALUES (
    'RLS-TENANT-A-ISOLATION',
    CASE WHEN a_count=1 AND b_count=0 THEN 'PASS' ELSE 'FAIL' END,
    format('tenant_a=%s tenant_b_visible=%s',a_count,b_count)
  );
END $$;
COMMIT;

-- Tenant B sees only B.
BEGIN;
SET LOCAL ROLE arkhe_append;
SELECT set_config('app.tenant_id','tenant-b',true);
DO $$
DECLARE a_count int; b_count int;
BEGIN
  SELECT count(*) INTO a_count FROM intents WHERE tenant_id='tenant-a';
  SELECT count(*) INTO b_count FROM intents WHERE tenant_id='tenant-b';
  INSERT INTO arkhe_gate_results VALUES (
    'RLS-TENANT-B-ISOLATION',
    CASE WHEN a_count=0 AND b_count=1 THEN 'PASS' ELSE 'FAIL' END,
    format('tenant_a_visible=%s tenant_b=%s',a_count,b_count)
  );
END $$;
COMMIT;

-- Missing tenant context must fail loudly, not silently return zero rows.
BEGIN;
SET LOCAL ROLE arkhe_append;
SELECT pg_temp.expect_failure(
  'RLS-MISSING-TENANT-ERROR',
  'SELECT count(*) FROM intents',
  'app.tenant_id is not set'
);
COMMIT;

-- WITH CHECK must reject cross-tenant writes.
BEGIN;
SET LOCAL ROLE arkhe_append;
SELECT set_config('app.tenant_id','tenant-a',true);
SELECT pg_temp.expect_failure(
  'RLS-CROSS-TENANT-INSERT-REJECTED',
  $$INSERT INTO intents(intent_digest,tenant_id,canonical_bytes)
    VALUES (decode(repeat('cc',32),'hex'),'tenant-b',decode('03','hex'))$$,
  'row-level security'
);
COMMIT;

-- Runtime role must lack UPDATE / DELETE / TRUNCATE even before the trigger backstop.
BEGIN;
SET LOCAL ROLE arkhe_append;
SELECT set_config('app.tenant_id','tenant-a',true);
SELECT pg_temp.expect_failure(
  'APPEND-UPDATE-PRIVILEGE-REJECTED',
  $$UPDATE intents SET canonical_bytes=decode('ff','hex') WHERE tenant_id='tenant-a'$$,
  'permission denied'
);
SELECT pg_temp.expect_failure(
  'APPEND-DELETE-PRIVILEGE-REJECTED',
  $$DELETE FROM intents WHERE tenant_id='tenant-a'$$,
  'permission denied'
);
SELECT pg_temp.expect_failure(
  'APPEND-TRUNCATE-PRIVILEGE-REJECTED',
  'TRUNCATE intents',
  'permission denied'
);
COMMIT;

-- Trigger backstop: superuser has table privileges, but UPDATE/DELETE still hit the trigger.
SELECT pg_temp.expect_failure(
  'BACKSTOP-SUPERUSER-UPDATE-REJECTED',
  $$UPDATE intents SET canonical_bytes=decode('ee','hex') WHERE tenant_id='tenant-a'$$,
  'append-only'
);
SELECT pg_temp.expect_failure(
  'BACKSTOP-SUPERUSER-DELETE-REJECTED',
  $$DELETE FROM intents WHERE tenant_id='tenant-a'$$,
  'append-only'
);

-- TRUNCATE does not fire row-level UPDATE/DELETE triggers; security is privilege-based for runtime roles.
-- Record explicitly that the runtime role has no TRUNCATE grant.
INSERT INTO arkhe_gate_results
SELECT 'APPEND-NO-TRUNCATE-GRANT',
       CASE WHEN has_table_privilege('arkhe_append','public.intents','TRUNCATE') THEN 'FAIL' ELSE 'PASS' END,
       'has_table_privilege(TRUNCATE)=' || has_table_privilege('arkhe_append','public.intents','TRUNCATE');

\echo '=== RESULTS ==='
TABLE arkhe_gate_results ORDER BY gate;

\echo '=== FAIL COUNT ==='
SELECT count(*) AS failed_gates FROM arkhe_gate_results WHERE status <> 'PASS';

-- Make psql fail if any gate failed.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM arkhe_gate_results WHERE status <> 'PASS';
  IF n <> 0 THEN
    RAISE EXCEPTION '% PostgreSQL security gates failed', n;
  END IF;
END $$;
