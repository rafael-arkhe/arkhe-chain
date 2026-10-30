---
title: 'Arkhe: Evidence and Governance for AI Agents'
subtitle: 'Sample Chapter — From Output to Authorization'
lang: en-US
date: 'October 22, 2026'
rights: 'Working edition 0.1. Editorial authorship and license to be finalized before publication.'
---

# From Output to Authorization

A team wants to let an agent propose expenses of up to one hundred units.
The agent receives three costs, adds them, and responds: “The total is one
hundred; you can approve it.” That answer may seem sufficient to someone
following the conversation. For the service that will act on it, essential
questions remain. Which values were added? Which limit was in effect? Does the
answer belong to this request, or was it reused from another one? Who has the
authority to decide?

This is a fictional teaching scenario. We will work through it using an existing
example in the Arkhe repository. Our goal is narrower than proving that an agent
is correct: we will verify an arithmetic property and bind it to a request, a
work record, and a policy. The gate must then still decide whether to authorize
the request. The lab ends with that decision; it does not pay an expense.

By the end, you will be able to run the example, interpret its output, and
explain why a correct calculation may still lack authorization. You will also
have a way to assess claims about “verifiable outputs”: identify exactly which
statement the verifier accepts, which inputs it receives from an authority, and
which facts remain beyond its reach.

## The Difference Between an Explanation and a Certificate

A statement such as “I added all the costs” is a claim by the producer. Logging
that response preserves the claim, but adds no independent procedure for
checking the sum. We can improve this contract: the producer supplies the result
and a sequence of partial sums. The consumer receives a short rule for checking
each step.

For the values `20`, `30`, and `50`, the certificate contains this sequence:

```text
costs:          20, 30, 50
partial sums:    0, 20, 50, 100
limit:         100
```

The verifier requires the sequence to start at zero, each step to add exactly
the next cost, and the final value to match the output without exceeding the
limit. It also checks the certificate's cryptographic bindings. It does not ask
the same agent for a second opinion on its own answer.

This is a limited application of the Proof-Carrying Output pattern, or PCO:
carrying an output together with material that allows a stated property to be
verified. Here, the property is finite and arithmetic. We are not verifying
natural-language reasoning, execution of a model's weights, or the authenticity
of the invoices from which the numbers came.

## The Rule Belongs to the Host

The example uses this specification:

```rust
let spec = BudgetSpec {
    version: 1,
    limit: 100,
    max_items: 16,
};
```

The host is the application responsible for establishing policy and controlling
access to the external effect. It supplies this rule to the flow. The producer
cannot change the limit to get an output approved. If a proposal could carry its
own acceptance rule, a sum of one hundred and one could arrive with a new limit
of two hundred and appear valid.

Units are also part of the host's contract. The integer `100` does not, by
itself, tell us whether it represents cents, credits, or another unit. This
demonstration uses abstract units. A financial application would need to fix the
currency, scale, and provenance of the values before authorizing any payment.

The accepted domain contains between one and `max_items` unsigned integer
costs, with a supported maximum of 256 items. The sum must fit in `u64`.
Floating-point numbers are not used to represent these values. An empty list is
rejected; zero costs can be valid. These choices make the property precise and
the processing limits explicit.

## Four Objects to Keep Distinct

The flow works with an intent, a worker record, a policy, and a certificate.
Each object answers a different question.

The `WorkIntent` describes the requested action. In this example, its type is
`ApproveExpense`, its requester is `local-demo`, and its parameters commit to the
output digest. The request identity helps distinguish one logical request from
another. The certificate will use the full intent digest.

The `WorkerExecutionRecord`, or WER, records which module claimed to have
produced that output for a particular input. The example identifies module
`budget-demo`, version `1`, and operation `Analyze`. The input and output digests
bind the transported objects. The uncertainty note explicitly states that the
flow guarantees neither truthful costs nor payment.

The `PolicyBinding` identifies the policy, version, and digest. In this lab, the
resolver accepts only the `offline-budget-demo` profile and the expected
bindings. That name alone provides no security: the code also compares the
other fields.

The `BudgetProof` brings together the input, output, derivation, and commitments
to the intent, worker, policy, specification, and checker identifier. Changing
one part requires all relationships to remain consistent, as well as passing
the arithmetic rule again.

A digest is a commitment to bytes under an encoding scheme and cryptographic
assumptions. It does not automatically identify a trustworthy person. A comment
in the WER contract captures the distinction: hashes identify content;
admission establishes provenance. A real application needs a procedure to
authenticate and admit the record before assigning it authority.

## The Architecture of This Lab

The teaching flow can be read as follows:

```text
Host: specification + policy
                  |
Input -> producer -> output + derivation
                  |
        WorkIntent + WER + BudgetProof
                  |
          serialized transport
                  |
        independent checker -> local evidence
                  |
         ContainmentGate -> Allow or Reject
```

This diagram describes the offline example. Local evidence stays in memory and
has neither signatures nor production persistence. The aim is to make the
contract observable without hiding operational requirements behind a demo.

The producer lives in `arkhe_agent::budget_pco`. Verification lives in
`arkhe_verify_core::output_proof::verify_budget_proof`. The checker neither
depends on nor calls the producer. This separation lets the consumer check a
transported certificate without trusting the code that generated it.

The flow passes through JSON serialization and deserialization before
independent verification. This exercises a transport boundary. It does not
mean that arbitrary JSON becomes canonical or that the parser stops being part
of the trusted computing base. A public interface would also need size limits
before decoding.

## Run the Repository Example

Use an Arkhe checkout containing the `budget_pco` example, `Cargo.lock`, and the
toolchain specified in `rust-toolchain.toml`. In the edition inspected here,
that toolchain is Rust `1.96.0`. The command may download dependencies on its
first build; it requires no database, real keys, or payment account.

From the repository root:

```powershell
cargo run --locked -p arkhe-kernel --example budget_pco
```

The implementation file is
`kernel/arkhe-kernel/examples/budget_pco.rs`. This excerpt shows how the input
is prepared and where generation is separated from proof assembly:

```rust
let input = BudgetInput {
    costs: vec![20, 30, 50],
};
let (output, _) = budget_pco::infer(&input, &spec)?;
```

The program constructs the WER and intent, generates the certificate with
`prove`, crosses the serialization boundary, and invokes the checker. It then
retains the certificate and its envelopes in an `OfflineEvidence`, which
implements `EvidenceReader`, and requests authorization from
`ContainmentGate::authorize_admitted`.

In the reproduction recorded for this edition, the program returned:

```json
{
  "authorization_ref": "cc77556f3cf18ad7a21d77522565f281d9e3ed27600201b099fd7968f747553b",
  "external_action_executed": false,
  "mode": "offline-budget-pco-demo",
  "proof": "e59a0e8dce0afd848ef6165e6818a2eaee0c4987cc07aa2b512edeac2adb2258",
  "total": 100
}
```

The total shows the arithmetic result. The `proof` field identifies the verified
certificate. `authorization_ref` is the decision reference under the example's
bindings. The final field is as relevant as the hashes: no external action was
executed. Interpreting this output as a payment receipt would add a claim that
the program does not make.

The recorded digests correspond to this edition's files. If the contract or
inputs change, do not treat these values as a universal rule; investigate the
change and reproduce the tests appropriate to the new snapshot.

## Why Verify Again at the Gate

An application could verify the certificate and then forward only a boolean,
`valid: true`. That creates another question: who produced that boolean, and
which request does it refer to? In the current flow, the gate retrieves the
certificate through `EvidenceReader::budget_proof`, runs the checker, and
requires the corresponding admitted envelope.

The evidence transport is not given authority to decide that its own response
is valid. The expected envelope commits to the certificate and policy, uses
the WER as its subject, and binds the expected parents. The mere existence of
an envelope named `BudgetProof` is insufficient.

The integration is opt-in. A `PolicyResolver` requires the certificate through
`required_budget_proof`. If the policy requires proof and the available path
does not transport or verify it, the operation is rejected. The basic synchronous
entry point also refuses policies requiring this proof, including for intents
that would normally be unprotected. This prevents a different gate entry point
from bypassing the requirement.

Even so, a correct calculation does not override a policy denial, an emergency
stop, or required human review. Satisfying one property meets one authorization
condition; the other conditions remain in force.

## Test the Rejection Boundary

An example that only accepts the correct input shows little about what it can
prevent. Run the related test suites:

```powershell
cargo test --locked -p arkhe-kernel --test budget_pco --test rejection_gates
```

In the reproduction recorded for this edition, nine PCO tests and five rejection
tests passed. The behaviors exercised include a missing certificate, mismatched
provenance, a specification change during evidence lookup, transfer between
requests, and an attempt to bypass the proof through another gate entry point.

Two cases make the arithmetic property particularly clear. In the first, the
certificate attempts to add `u64::MAX` and `1` and present zero as the result
through overflow. The checker uses intermediate `u128` arithmetic to reject
the out-of-domain conclusion. In the second, a sum of `101` is arithmetically
correct but exceeds the trusted cap of `100`, so it is rejected.

These cases are checked in
`checker_rejects_false_arithmetic_and_over_budget_conclusion_without_producer`.
The test constructs malicious statements without relying on the producer to
cooperate. This is a useful property of a verifier test: the normal generator
does not have to be capable of creating the adversarial input for that input
to be tested.

As a reading exercise, find the specification change during evidence lookup
in the test file. Identify which digest would be stale and why checking only
at the start of the request would be insufficient. Then locate the cases where
human review remains mandatory even with a correct certificate. The expected
answer describes the bindings and conditions, rather than simply saying “safe.”

## Authorization and Execution Have Different States

The gate verifies a proposal. It is not a journal of external effects. Repeating
the same request may produce the same authorization reference. This does not
prove that a payment, publishing, or deployment API will receive only one call.

A real executor must reserve the operation identity before the effect, record
the associated parameters, persist transitions, and handle uncertain outcomes.
If the connection drops after the destination accepts an action, a blind retry
may duplicate the effect. The solution also depends on the destination's
guarantees and the reconciliation procedure.

In the main contract, `WorkIntent::operation_id()` separates the logical
operation identity from its parameters; the journal must bind those parameters
and reject conflicts. The certificate in this sample, in turn, commits to the
full intent digest. These checks serve different purposes. Do not confuse a
stable identity for retries with permission to reuse a certificate after
changing the proposal.

A requester-supplied timestamp does not become a trusted clock merely because
it was included in a hashed object. If the application needs temporal validity,
it must establish a time source and expiration policy. The arithmetic
certificate does not infer an expiration date.

## Where WormGraph and Offline Verification Fit

The example retains envelopes in memory. A deployment could persist certificates
and admitted evidence, and offer inclusion proofs against a checkpoint. For
that to be useful to another verifier, the checkpoint must arrive through a
trust relationship independent of the package being evaluated.

If someone sends a leaf, an invented tree, and the root of that same tree, a
consistent inclusion proof only shows that their own data fits together. It
does not establish who operates the log. Nor does an isolated inclusion proof
show that two checkpoints belong to the same history without forks, or that
a mandate existed before execution.

The main `arkhe-mmr@1` profile fixes the domains and order of operations. The
AGI workspace has a different contract. Mixing these profiles because both are
called MMR can produce incompatibilities and incorrect conclusions. In the
legacy API, membership must not be advertised as a specific position either;
indexed verification has its own contract.

This edition has an explicit operational gap: optional `BudgetProof` transport
is not yet implemented in `PgWormGraph`. Its default return provides no proof.
Enabling a policy that requires it on that reader results in denial; this lab
does not support claiming a complete production HTTP flow for persistent PCO.

## What the Certificate Establishes

Under the accepted specification and verified commitments, the integer sum is
exact, fits within the domain, and does not exceed the limit. The derivation
can be checked by finite induction: the first value represents the empty sum;
each step adds one cost; the last value matches the output. The verifier costs
O(n), with input bounded to 256 items.

This argument is not a mechanized proof of the Rust implementation. The checker,
encoding, cryptographic libraries, and their integration remain part of the
trusted computing base. A defect in that base may invalidate the operational
conclusion.

The certificate also does not prove that costs are truthful or complete, that
the expense is legal, that a particular model was executed, or that the host
blocks every alternative path to the effect. It does not authenticate a GPU,
provide data confidentiality, or replace policy review.

The next implementation step is to choose a small property that matters to
your system, write an independent checker, and establish how the host obtains
trusted inputs and rules. Only then connect authorization to an executor with
persistent state and reconciliation. A precise boundary is what allows evidence
to remain useful to another team, months later, outside the conversation that
produced the proposal.

## Implementation References

Third-party names in technical references identify the tools, specifications,
and sources used. This publication is independent and does not claim sponsorship,
endorsement, or certification by those organizations.

This sample uses only the main workspace:

- `kernel/arkhe-kernel/examples/budget_pco.rs`: complete program.
- `cognition/arkhe-agent/src/budget_pco.rs`: certificate producer.
- `kernel/arkhe-core/src/output_proof.rs`: proof contracts.
- `verification/crates/arkhe-verify-core/src/output_proof.rs`: independent checker.
- `kernel/arkhe-kernel/src/lib.rs`: gate integration.
- `kernel/arkhe-kernel/tests/budget_pco.rs`: nine contract and rejection tests.
- `kernel/arkhe-kernel/tests/rejection_gates.rs`: five rejection tests.
- `kernel/arkhe-core/src/work.rs` and `worker.rs`: intent, identity, and WER.
- `docs/PROOF-CARRYING-BUDGET.md` and `docs/MMR-PROFILE.md`: limits and profiles.

Paths are relative to the root of the checkout distributed to the reader. The
editorial edition preserves the hash manifest and reproduction record alongside
the sample.
