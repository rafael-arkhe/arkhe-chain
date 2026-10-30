-- Test-mode provider journal. Never store credentials, client_secret or card data.
CREATE TABLE ritual_stripe_requests (
 effect BYTEA PRIMARY KEY REFERENCES ritual_effects(id),
 payload_digest BYTEA NOT NULL CHECK(octet_length(payload_digest)=32),
 idempotency_key TEXT NOT NULL UNIQUE,
 first_post BIGINT NOT NULL,
 post_until BIGINT NOT NULL CHECK(post_until>first_post),
 remote_id TEXT,
 remote_request_id TEXT,
 provider_status TEXT,
 evidence JSONB
);
