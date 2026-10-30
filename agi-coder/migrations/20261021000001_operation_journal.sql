-- Contract for a future PostgreSQL journal adapter. The current runtime is in memory.
BEGIN;
CREATE TABLE operation_journal (
    operation_id BYTEA PRIMARY KEY CHECK (octet_length(operation_id) = 32),
    intent_digest BYTEA NOT NULL CHECK (octet_length(intent_digest) = 32),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','completed','failed','manual_reconciliation_required')),
    response BYTEA,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    CHECK ((status = 'completed') = (response IS NOT NULL)),
    CHECK ((status = 'pending') = (completed_at IS NULL))
);
CREATE FUNCTION protect_journal() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'journal deletion is forbidden'; END IF;
    IF OLD.operation_id <> NEW.operation_id OR OLD.intent_digest <> NEW.intent_digest
        OR OLD.created_at <> NEW.created_at OR OLD.status <> 'pending' OR NEW.status = 'pending'
    THEN RAISE EXCEPTION 'illegal journal transition'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER journal_protection BEFORE UPDATE OR DELETE ON operation_journal
FOR EACH ROW EXECUTE FUNCTION protect_journal();
COMMIT;
