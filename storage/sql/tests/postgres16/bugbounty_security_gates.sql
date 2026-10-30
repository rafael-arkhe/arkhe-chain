\set ON_ERROR_STOP on
-- Independent from the frozen Phase-1 gates; exercise the new operational role.
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_class WHERE relname IN ('operation_journal','bugbounty_operational_log') AND relrowsecurity AND relforcerowsecurity)!=2 THEN RAISE EXCEPTION 'operational RLS missing'; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='arkhe_operations' AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'operations role bypass'; END IF;
 IF has_table_privilege('arkhe_operations','wormgraph_records','INSERT') OR has_table_privilege('arkhe_operations','work_objects','INSERT') THEN RAISE EXCEPTION 'operational role can forge evidence'; END IF;
 IF has_table_privilege('arkhe_append','operation_journal','UPDATE') OR has_table_privilege('arkhe_operations','operation_journal','DELETE') OR has_table_privilege('arkhe_operations','operation_journal','TRUNCATE') THEN RAISE EXCEPTION 'journal privilege drift'; END IF;
END $$;
BEGIN;
SET LOCAL ROLE arkhe_operations;
SELECT set_config('app.tenant_id','bugbounty-security-a',true);
INSERT INTO operation_journal(tenant_id,requested_by,operation_id,request_identity,intent_type,target_digest,parameters_digest,owner_token,status)
VALUES('bugbounty-security-a','caller',decode(repeat('11',32),'hex'),decode(repeat('22',32),'hex'),'TriageReport',decode(repeat('33',32),'hex'),decode(repeat('44',32),'hex'),'11111111-1111-1111-1111-111111111111','PREPARED');
DO $$ BEGIN
 BEGIN
  UPDATE operation_journal SET status='COMPLETED',response='{}',completed_at=now();
  RAISE EXCEPTION 'dispatch was bypassed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM!='invalid operation journal transition' THEN RAISE; END IF; END;
END $$;
UPDATE operation_journal SET status='DISPATCHED';
COMMIT;
BEGIN;
SET LOCAL ROLE arkhe_operations;
SELECT set_config('app.tenant_id','bugbounty-security-b',true);
DO $$ BEGIN
 IF EXISTS(SELECT FROM operation_journal) THEN RAISE EXCEPTION 'cross-tenant journal leak'; END IF;
END $$;
ROLLBACK;
\echo 'PASS bugbounty operational RLS, privileges and journal transitions'

DO $$ BEGIN
 IF (SELECT count(*) FROM pg_class WHERE relname IN ('worker_receipts','manual_reconciliation_requests') AND relrowsecurity AND relforcerowsecurity)!=2 THEN RAISE EXCEPTION 'receipt/reconciliation RLS missing'; END IF;
 IF has_table_privilege('arkhe_operations','worker_receipts','UPDATE') OR has_table_privilege('arkhe_operations','worker_receipts','DELETE') OR has_table_privilege('arkhe_operations','manual_reconciliation_requests','UPDATE') OR has_table_privilege('arkhe_operations','manual_reconciliation_requests','DELETE') THEN RAISE EXCEPTION 'receipt/reconciliation mutation privilege drift'; END IF;
END $$;
\echo 'PASS detached receipt and reconciliation storage isolation'
