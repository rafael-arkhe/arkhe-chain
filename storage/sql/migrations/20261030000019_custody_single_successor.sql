-- Custody chains are linear. The database, not a read-then-write check,
-- guarantees at most one CustodyTransfer per predecessor and at most one
-- first transfer per asset, so concurrent writers cannot fork a chain.
-- Re-recording the identical transfer still conflicts only on the primary
-- key and is skipped as before.
CREATE UNIQUE INDEX wormgraph_custody_single_successor
  ON wormgraph_records (tenant_id, (envelope -> 'causal_parents' -> 0))
  WHERE envelope ->> 'kind' = 'CustodyTransfer'
    AND jsonb_array_length(envelope -> 'causal_parents') = 1;

CREATE UNIQUE INDEX wormgraph_custody_single_genesis
  ON wormgraph_records (tenant_id, (envelope -> 'subject'))
  WHERE envelope ->> 'kind' = 'CustodyTransfer'
    AND jsonb_array_length(envelope -> 'causal_parents') = 0;
