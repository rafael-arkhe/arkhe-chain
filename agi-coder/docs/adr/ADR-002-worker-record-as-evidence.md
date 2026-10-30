# ADR-002: Signed worker records are bounded claims

Status: accepted. Date: October 21, 2026.

The host signs a deterministic WER containing exact operation/intent bindings, plan/output/test-artifact digests, results, signer, and completion time. The gate recomputes the digest, verifies Ed25519, checks trust policy, derives self-check again, and checks freshness. The signature covers the signer identity as well as the work fields.

Consequences: record mutation is detectable. Trust still depends on host key custody and independent test capture. A signed false statement is not made true by hashing or MMR inclusion. Direct hardware execution proof is outside the current contract.
