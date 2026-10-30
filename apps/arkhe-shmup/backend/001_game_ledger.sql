-- Apply separately with arkhe-sql migrations already installed; PostgreSQL 16.
BEGIN;
CREATE SCHEMA IF NOT EXISTS shmup;
CREATE TABLE shmup.reward_receipts (
 tenant_id text NOT NULL,
 player_id text NOT NULL,
 match_id uuid NOT NULL,
 payload_hash bytea NOT NULL CHECK (octet_length(payload_hash)=32),
 points bigint NOT NULL CHECK(points >= 0),
 evidence_hash bytea NOT NULL CHECK(octet_length(evidence_hash)=32),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id, match_id)
);
CREATE TABLE shmup.purchase_events (
 tenant_id text NOT NULL,
 player_id text NOT NULL,
 store text NOT NULL CHECK(store IN ('apple','google')),
 transaction_id text NOT NULL,
 event_kind text NOT NULL CHECK(event_kind IN ('purchase','renewal','refund','revocation')),
 store_event_id text NOT NULL,
 vip_delta bigint NOT NULL,
 evidence_hash bytea NOT NULL CHECK(octet_length(evidence_hash)=32),
 PRIMARY KEY(store, store_event_id)
);
ALTER TABLE shmup.reward_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shmup.reward_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE shmup.purchase_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE shmup.purchase_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_receipts ON shmup.reward_receipts
 USING(tenant_id=public.arkhe_assert_tenant()) WITH CHECK(tenant_id=public.arkhe_assert_tenant());
CREATE POLICY tenant_purchases ON shmup.purchase_events
 USING(tenant_id=public.arkhe_assert_tenant()) WITH CHECK(tenant_id=public.arkhe_assert_tenant());
CREATE FUNCTION shmup.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append-only ledger'; END $$;
CREATE TRIGGER immutable_receipts BEFORE UPDATE OR DELETE ON shmup.reward_receipts
 FOR EACH ROW EXECUTE FUNCTION shmup.reject_mutation();
CREATE TRIGGER immutable_purchases BEFORE UPDATE OR DELETE ON shmup.purchase_events
 FOR EACH ROW EXECUTE FUNCTION shmup.reject_mutation();
REVOKE ALL ON SCHEMA shmup FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA shmup FROM PUBLIC;
-- Grant SELECT/INSERT only to a trusted non-owner backend role; never mobile clients.
-- No TRUNCATE grants. RLS is tenant isolation: backend must also enforce player ownership.
COMMIT;
