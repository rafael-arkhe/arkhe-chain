-- Custody chains are linear. The database, not a read-then-write check,
-- guarantees at most one CustodyTransfer per predecessor and at most one
-- first transfer per asset, so concurrent writers cannot fork a chain.
-- Re-recording the identical transfer still conflicts only on the primary
-- key and is skipped as before.
--
-- Pre-flight: existing forks would make the unique indexes fail with a bare
-- unique-violation. Refuse first and name every conflicting record, so the
-- operator can decide which branch is canonical before migrating. Choosing a
-- branch is a governance decision, not something this migration can make.
--
-- Assumes writers are stopped while migrating, as for every migration here.
-- A transfer committed between the pre-flight and CREATE INDEX could still
-- create a fork the pre-flight did not see; the index build then fails with a
-- plain unique violation and the migration rolls back. That is not a bug in
-- the pre-flight: rerun with writers stopped.
DO $$
DECLARE
  conflicts text;
  -- Digests are stored as JSON byte arrays; conflicts are reported in hex.
BEGIN
  SELECT string_agg(line, E'\n' ORDER BY line) INTO conflicts
  FROM (
    SELECT format('tenant %s: %s transfers extend predecessor %s: %s',
                  tenant_id, count(*), parent,
                  string_agg(encode(record_hash, 'hex'), ', ' ORDER BY record_hash)) AS line
    FROM (
      SELECT tenant_id, record_hash, (SELECT string_agg(lpad(to_hex(b::int), 2, '0'), '' ORDER BY i) FROM jsonb_array_elements_text(envelope -> 'causal_parents' -> 0) WITH ORDINALITY AS d(b, i)) AS parent
      FROM wormgraph_records
      WHERE envelope ->> 'kind' = 'CustodyTransfer'
        AND jsonb_array_length(envelope -> 'causal_parents') = 1
    ) successors
    GROUP BY tenant_id, parent
    HAVING count(*) > 1
    UNION ALL
    SELECT format('tenant %s: %s first transfers for asset subject %s: %s',
                  tenant_id, count(*), subject,
                  string_agg(encode(record_hash, 'hex'), ', ' ORDER BY record_hash))
    FROM (
      SELECT tenant_id, record_hash, (SELECT string_agg(lpad(to_hex(b::int), 2, '0'), '' ORDER BY i) FROM jsonb_array_elements_text(envelope -> 'subject') WITH ORDINALITY AS d(b, i)) AS subject
      FROM wormgraph_records
      WHERE envelope ->> 'kind' = 'CustodyTransfer'
        AND jsonb_array_length(envelope -> 'causal_parents') = 0
    ) geneses
    GROUP BY tenant_id, subject
    HAVING count(*) > 1
  ) found;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'custody chains already contain forks; resolve them before this migration'
      USING DETAIL = conflicts,
            HINT = 'Runtime roles cannot remove records. Resolving a fork needs a decided, recorded procedure run by the database owner; no such procedure ships with Arkhe yet.';
  END IF;
END $$;

CREATE UNIQUE INDEX wormgraph_custody_single_successor
  ON wormgraph_records (tenant_id, (envelope -> 'causal_parents' -> 0))
  WHERE envelope ->> 'kind' = 'CustodyTransfer'
    AND jsonb_array_length(envelope -> 'causal_parents') = 1;

CREATE UNIQUE INDEX wormgraph_custody_single_genesis
  ON wormgraph_records (tenant_id, (envelope -> 'subject'))
  WHERE envelope ->> 'kind' = 'CustodyTransfer'
    AND jsonb_array_length(envelope -> 'causal_parents') = 0;
