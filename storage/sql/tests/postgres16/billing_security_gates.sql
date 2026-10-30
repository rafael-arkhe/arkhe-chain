\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_class WHERE relname='tenant_billing' AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'billing RLS missing'; END IF;
 IF has_table_privilege('arkhe_append','tenant_billing','INSERT') OR has_table_privilege('arkhe_read','tenant_billing','SELECT') THEN RAISE EXCEPTION 'unintended billing access'; END IF;
END $$;
CREATE ROLE billing_gate NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO billing_gate;
GRANT SELECT, INSERT ON tenant_billing TO billing_gate;
SET LOCAL ROLE billing_gate;
SELECT set_config('app.tenant_id','billing-a',true);
INSERT INTO tenant_billing(tenant_id,stripe_customer_id) VALUES('billing-a','synthetic-ci-customer');
SELECT set_config('app.tenant_id','billing-b',true);
DO $$ BEGIN
 IF EXISTS(SELECT FROM tenant_billing) THEN RAISE EXCEPTION 'billing cross-tenant read'; END IF;
 BEGIN
  INSERT INTO tenant_billing(tenant_id,stripe_customer_id) VALUES('billing-a','synthetic-forbidden');
  RAISE EXCEPTION 'billing cross-tenant write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
ROLLBACK;
\echo 'PASS billing RLS and least privilege'
