CREATE TABLE ritual_control (
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton), emergency_stop BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO ritual_control DEFAULT VALUES;
CREATE TABLE ritual_policies (digest BYTEA PRIMARY KEY CHECK(octet_length(digest)=32), active BOOLEAN NOT NULL);
CREATE TABLE ritual_destination_keys(destination TEXT PRIMARY KEY, public_key BYTEA NOT NULL CHECK(octet_length(public_key)=32));
-- Local simulation units only: this is not a RITUAL token transfer or EVM contract.
CREATE TABLE ritual_fee_accounts(tenant UUID PRIMARY KEY,balance BIGINT NOT NULL CHECK(balance>=0));
CREATE TABLE ritual_challenges (
 id UUID PRIMARY KEY, tenant UUID NOT NULL, nonce BYTEA NOT NULL CHECK(octet_length(nonce)=32),
 request BYTEA NOT NULL CHECK(octet_length(request)=32), profile TEXT NOT NULL,
 expires BIGINT NOT NULL, consumed_by BYTEA CHECK(octet_length(consumed_by)=32),
 UNIQUE(tenant,nonce)
);
CREATE TABLE ritual_effects (
 id BYTEA PRIMARY KEY CHECK(octet_length(id)=32), tenant UUID NOT NULL,
 request_json JSONB NOT NULL, request BYTEA NOT NULL CHECK(octet_length(request)=32),
 payload BYTEA NOT NULL, payload_digest BYTEA NOT NULL CHECK(octet_length(payload_digest)=32),
 state TEXT NOT NULL CHECK(state IN ('enqueued','dispatched','confirmed','unknown','failed','cancelled')),
 epoch BIGINT NOT NULL DEFAULT 0 CHECK(epoch>=0), auth_id UUID NOT NULL,
 receipt JSONB, receipt_digest BYTEA, UNIQUE(tenant,request)
);
CREATE TABLE ritual_authorizations (
 id UUID PRIMARY KEY, effect BYTEA NOT NULL REFERENCES ritual_effects(id),
 challenge UUID NOT NULL UNIQUE REFERENCES ritual_challenges(id), analysis BYTEA NOT NULL,
 commitment BYTEA NOT NULL UNIQUE CHECK(octet_length(commitment)=32), envelope JSONB NOT NULL,
 analysis_envelope JSONB NOT NULL, platform_envelope JSONB NOT NULL,
 issued BIGINT NOT NULL, expires BIGINT NOT NULL CHECK(expires>issued)
);
ALTER TABLE ritual_effects ADD CONSTRAINT ritual_effect_authorization
 FOREIGN KEY(auth_id) REFERENCES ritual_authorizations(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE ritual_outbox (
 effect BYTEA PRIMARY KEY REFERENCES ritual_effects(id), auth_id UUID NOT NULL REFERENCES ritual_authorizations(id)
);
CREATE TABLE ritual_fee_ledger(effect BYTEA PRIMARY KEY REFERENCES ritual_effects(id),tenant UUID NOT NULL REFERENCES ritual_fee_accounts(tenant),amount BIGINT NOT NULL CHECK(amount>0));
CREATE TABLE ritual_attempts (
 id UUID PRIMARY KEY, effect BYTEA NOT NULL REFERENCES ritual_effects(id),
 auth_id UUID NOT NULL REFERENCES ritual_authorizations(id), worker TEXT NOT NULL,
 epoch BIGINT NOT NULL CHECK(epoch>0), acquired_at BIGINT NOT NULL, lease_until BIGINT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('in_flight','confirmed','unknown','failed')),
 UNIQUE(effect,epoch)
);
CREATE UNIQUE INDEX ritual_one_inflight ON ritual_attempts(effect) WHERE state='in_flight';
CREATE INDEX ritual_expired_leases ON ritual_attempts(lease_until) WHERE state='in_flight';
-- The mock's simulated effect and deduplication receipt commit together here.
CREATE TABLE ritual_destination_receipts (
 destination TEXT NOT NULL, effect BYTEA NOT NULL CHECK(octet_length(effect)=32),
 payload_digest BYTEA NOT NULL, evidence JSONB NOT NULL, executions INTEGER NOT NULL CHECK(executions=1),
 deliveries INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(destination,effect)
);
CREATE TABLE ritual_log_leaves (
 tenant UUID NOT NULL, position BIGINT NOT NULL CHECK(position>=0),
 effect BYTEA NOT NULL REFERENCES ritual_effects(id), record_hash BYTEA NOT NULL CHECK(octet_length(record_hash)=32),
 PRIMARY KEY(tenant,position), UNIQUE(tenant,effect)
);
