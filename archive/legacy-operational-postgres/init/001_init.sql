CREATE TABLE IF NOT EXISTS worker_execution_log (
  id bigserial PRIMARY KEY,
  execution_id text NOT NULL UNIQUE,
  module_id text NOT NULL,
  input_digest bytea NOT NULL,
  output_digest bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private_data_index (
  owner text NOT NULL,
  record_id uuid NOT NULL,
  key_ref text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (owner, record_id)
);

-- This DB is operational state only. WormGraph evidence is a separate boundary.
