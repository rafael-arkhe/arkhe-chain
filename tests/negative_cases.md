# Negative cases required before freeze

- protected WorkIntent with no WorkerExecutionRecord -> reject
- emergency stop -> reject
- policy deny -> reject
- policy inconclusive -> reject
- cognition direct WormGraph dependency -> CI fail
- cognition signing capability -> CI fail
- duplicate emergency signers -> quorum fail
- replayed emergency operation -> reject
- PrivateData converted to EvidenceEnvelope without admission -> compile/API impossible
- evidence-store unavailable -> no protected effect
- stale/revoked delegation -> reject
