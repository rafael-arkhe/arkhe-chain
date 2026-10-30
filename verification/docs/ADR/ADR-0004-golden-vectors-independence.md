# ADR-0004 — Golden-vector independence

Status: Accepted.

CI consumes static expected bytes/digests.
The independent vector generator is never invoked by the conformance gate.
Native/WASM parity is only meaningful against this external static contract.
