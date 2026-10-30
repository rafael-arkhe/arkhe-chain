# Proof-carrying budget output v1

This first slice integrates a finite arithmetic certificate with the existing
ContainmentGate. It is an opt-in library flow and an offline executable example,
not a payment executor, an LLM proof system, a Rocq/STL checker, or a ZK system.

## Predicate and certificate

Trusted governance supplies `BudgetSpec { version: 1, limit, max_items }`.
For 1 through `max_items` unsigned 64-bit integer costs (at most 256), the
predicate is: the mathematical sum is representable as u64, equals the output
total, and does not exceed the trusted limit. Units and input authenticity are
host responsibilities. Zero costs and a zero limit are valid; an empty input is not.

`arkhe_agent::budget_pco::infer` returns the total and prefix derivation together.
`prove` assembles the transportable `BudgetProof`, binding the generated pair to
the full WorkIntent digest, WER digest, policy digest, specification digest and
checker identifier `arkhe/budget-sum-checker/v1`. All identities use distinct BLAKE3
domains and the existing integer-only deterministic encoder. No WER or WorkIntent
canonical projection was changed.

The independent checker is
`arkhe_verify_core::output_proof::verify_budget_proof`. It does not depend on or
invoke `arkhe-agent`. It validates:

- Supported specification/checker, bounded input and exact certificate length.
- Exact request, policy, worker, input and output commitments.
- Base case `s[0] = 0`.
- Each inference step `s[i+1] = s[i] + cost[i]`, using u128 to reject u64 wraparound.
- Conclusion `s[n] = output.total <= spec.limit`.

The mathematical justification is finite induction: the base is the empty sum;
each checked step extends the same sum by exactly the next cost; the last checked
value is therefore the exact sum. This argument is not a mechanically checked
proof of the Rust checker. Its implementation and the hash/encoding libraries
remain part of the trusted computing base. Certificate checking is O(n), n<=256.

## Gate integration

1. A trusted `PolicyResolver` opts in through `required_budget_proof` and supplies
   the specification, in addition to its ordinary authorization rules.
2. The host authenticates/adopts the input and WER through the existing admission
   boundary. The model or producer receives no admission or signing capability.
3. The host checks and stores the complete proof and its `BudgetProof` envelope
   before action. The envelope's subject is the WER digest; payload and record
   hashes are the certificate digest; policy is the current policy digest; parents
   are exactly `[worker_digest, input_digest]`.
4. `EvidenceReader::budget_proof(worker_digest)` transports the certificate. It is
   untrusted transport: the gate always invokes the independent checker again and
   requires the corresponding admitted envelope from `EvidenceReader::get`.
5. Existing admitted and human-routed admitted paths perform this check. The basic
   synchronous path refuses a proof-requiring policy, including unprotected
   intents. Missing/unsupported transport, malformed proof, mismatched provenance
   or changed specification denies authorization.
6. Authorization is granted only after ordinary governance and any human review
   also pass. Its reference commits the certificate under `AKG:AUTHZ:PCO:v1\0`:
   `BLAKE3(domain || intent_digest || policy_digest || worker_digest || proof_digest)`.
   Legacy policies continue using the existing reference protocol.

The private checked-certificate state cannot be supplied by public callers.
The specification digest checked before evidence reads is compared again before
authorization. Spec changes during lookup cannot silently authorize the old proof.

## Reproduction

From the repository root:

```powershell
cargo run --locked -p arkhe-kernel --example budget_pco
cargo test --locked -p arkhe-kernel --test budget_pco --test rejection_gates
```

The example generates and serializes a certificate for `[20, 30, 50]` under a
limit of 100, independently checks it, retains the evidence in a local reader,
and requests gate authorization. It prints `external_action_executed: false`.
The example's local evidence and host-owned policy are synthetic; no signature,
database, timestamp authority or external action is fabricated.

## Remaining boundaries

Production PgWormGraph does not implement the new optional proof transport yet;
its default returns no proof, so enabling a proof-requiring profile on that reader
denies the operation. There is no new permissive API route or production policy.
The example reader demonstrates the interface, not durable append-only storage.
A production adapter must retain certificate bytes atomically with their admitted
envelope, authenticate cost provenance, and restrict wire size before decoding.

The gate is a verifier, not a replay journal: repeating the same request can return
the same authorization reference. A different nonce, actor, target, WER or policy
invalidates the old certificate; exactly-once external effects still require the
existing executor/journal protections. No expiry is inferred from a certificate.

Proof validity establishes only the stated arithmetic property. It does not prove
that costs are truthful, legal, complete, that a model executed specified weights,
that the policy is correct, or that another effectful path cannot bypass the host.
There is no hiding commitment, trusted temporal seal, general SpecCompiler,
autonomous VerificationAgent, full PCO accountability protocol or AGI claim here.
