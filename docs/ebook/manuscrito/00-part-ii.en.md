---
title: 'Arkhe: Evidence and Governance for AI Agents'
subtitle: 'Part II — The Arkhe Architecture'
lang: en-US
date: 'October 22, 2026'
rights: 'Working manuscript, edition 0.2. Not a publication-ready edition.'
---

# Part II — The Arkhe Architecture

Part I established the questions a consequential workflow must answer: what was
proposed, who had authority, which rule applied, what evidence supported the
decision, and what happened after authorization. This part maps those questions
to concrete contracts and components.

The goal is to help you read the repository critically. A directory name is not
a security guarantee. A digest is not an admission decision. An inclusion proof
is not evidence that a model executed particular weights. Each mechanism becomes
useful only when its inputs, authority, and conclusion are defined.

Chapters 4–6 introduce the architecture, canonical identities, and evidence
inclusion. Chapter 7 then connects a finite arithmetic certificate to an
authorization decision through an executable offline example. The chapters use
the main workspace unless a different workspace is explicitly identified.

## 4. Mapping the Arkhe Environment

### Start with Authority, Not the Folder Tree

Return to the fictional report publisher from Part I. The producer proposes a
report, a reviewer evaluates the exact content, and an executor attempts the
publication. Before choosing services, identify the decisions that none of
those roles should make alone.

The producer should not grant itself publication rights. An evidence store
should not turn an arbitrary uploaded statement into an admitted fact. A browser
that verifies a signature should not acquire an execution credential merely
because verification succeeded. An executor should not reinterpret an approval
to cover a different target.

The architecture is a way to preserve these boundaries while moving data among
components. The repository's layer names are useful navigation aids, but the
contract between layers carries the meaning. Read both the interface and the
caller that supplies its trusted inputs.

### Read the Environment as Six Responsibilities

The main workspace separates common object contracts, proposal generation,
policy resolution, authorization, evidence retention, and portable verification.
Operational orchestration connects selected pieces. Applications and integration
adapters provide additional surfaces, with their own qualification boundaries.

| Responsibility | Repository location | Question it addresses |
|---|---|---|
| Shared contracts and identity | `kernel/arkhe-core` | Which object and bytes are being discussed? |
| Proposal generation | `cognition/` | What output does a worker propose? |
| Policy resolution | `governance/arkhe-governance` | Which requirements and rules apply? |
| Authorization | `kernel/arkhe-kernel` | Do the required checks permit this request? |
| Evidence and persistence | `evidence/`, `storage/sql` | Which admitted records and objects are retained? |
| Independent verification | `verification/crates/arkhe-verify-core` | Does supplied material satisfy the supported check? |

These are responsibilities, not a claim that every folder exposes one independent
service. Some are libraries in the same process. Deploying them separately would
not automatically improve their authority model; combining them does not
automatically invalidate it. What matters is which capabilities each caller can use.

Workspace membership changes as the project evolves. Use the current root
`Cargo.toml` and `config/architecture.json` rather than treating a historical
package count as an invariant. Documentation describes intent and earlier
results; the manifest identifies the build's current membership.

### The Core Defines Objects; It Does Not Authenticate Their Origin

`arkhe-core` defines `WorkIntent`, `WorkerExecutionRecord`, digests, and evidence
interfaces. Keeping those contracts shared allows components to refer to the
same identity rules instead of inventing local JSON conventions.

That common definition is a compatibility boundary. It is not proof that the
person sending an object controls the identity written inside it. A string in
`requested_by` is a claim until the host authenticates the caller and binds that
identity to the request. A worker's `module_id` is similarly not a certificate
that the named module actually ran.

The distinction shapes integration work. Deserialize a record to learn what it
claims. Validate its structure to decide whether it is well formed. Authenticate
and admit it through the relevant host boundary before relying on its provenance.
These steps should not collapse into a helper called `load_trusted_record` that
merely parses JSON.

### Cognition Produces Proposals

The cognitive modules produce outputs and work records. Their usefulness can
vary independently of the authorization system. A model might generate excellent
content and still lack authority to publish it. A weak model might generate a
bad proposal that the host rejects correctly.

The repository security model states that cognition has no signing keys and no
direct writer for the evidence graph. It also states that orchestration schedules
without authorizing. Treat these as constraints to preserve when introducing
an adapter. An integration that gives an untrusted worker a general signing key
changes the model even if it continues to use the same type names.

The WER is a structured account of proposed work. It binds input and output
identities and records module metadata. Its presence does not establish general
reasoning quality, factual validity, or successful external execution. The main
contract's operation label `Execute` is a label in a record, not independent
observation of an effect.

### Policy and Gate Have Different Jobs

The policy resolver identifies applicable requirements and supplies a verdict
under a policy binding. Depending on the path and profile, those requirements
may include worker evidence, human review, or a supported certificate.

The `ContainmentGate` enforces the checks provided by its supported entry points.
A resolver returning permission is not a substitute for satisfying required
evidence checks. Conversely, a valid certificate does not override a denied
policy or a stopped gate. Chapter 7 demonstrates this separation for a finite
arithmetic property.

A helpful conceptual diagram is:

```text
Untrusted proposal and supporting records
                    |
                    v
Host supplies authenticated context and accepted policy
                    |
                    v
Gate checks required evidence, bindings, and policy
                    |
                    v
Authorization decision
                    |
        profile-specific handoff
                    v
Executor with durable state and restricted credentials
```

This diagram is a design guide. It does not assert that one existing HTTP route
implements every arrow. The library example, persistent work-record flow, and
optional action-executor profiles have different operational scopes.

### Evidence Storage Retains; Admission Decides

`EvidenceReader` exposes records to consumers. `EvidenceCommitter` and
`WorkEvidenceCommitter` describe retention interfaces. The latter's contract
calls for atomic commitment of work objects and their evidence after the trusted
authorization boundary.

Notice the difference between a contract and an enforcement mechanism. A method
named `append_verified` does not make its caller trustworthy. In the inspected
in-memory `WormGraph`, the method retains an envelope and rejects a conflicting
envelope under the same record hash. It does not run a universal cryptographic
or semantic verifier over arbitrary content.

The persistent implementation explicitly assigns admission to its callers. It
adds tenant-scoped storage and database-role checks; it does not convert an
untrusted upload into accepted evidence. An API that exposes that store must
enforce the intended caller boundary, not rely on the method name.

Similarly, an evidence dependency and a newly emitted decision record need not
be committed at the same point. The budget example supplies admitted supporting
envelopes before requesting authorization. The persistent work interface commits
the resulting work objects and authorization evidence atomically. Avoid writing
one universal sequence that reverses those distinct relationships.

### Portable Verification Grants No Execution Capability

The verification core evaluates supported inputs without ambient network,
filesystem, or clock access in its core contract. Adapters supply bytes and
context, expose command-line or client interfaces, and handle transport.

This division makes a check easier to reproduce. The same supported inputs can
be evaluated without a live call to the producer. It also makes host obligations
visible: if a check needs an accepted root, expected identity, or time, some
component must supply that information under a defined trust relationship.

An adapter is not a new source of semantic authority. A result returned through
a tool protocol or a browser binding retains the original check's meaning.
“Signature accepted” should not become “approve publication” merely because the
result is now available to an agent.

### Keep the Workspaces Separate

The `agi-coder` subtree has a separate workspace and contracts. Some names recur,
but that does not establish encoding or proof compatibility. The MMR profile is
one concrete example: its domains and empty-tree behavior differ from the main
profile described in Chapter 6.

Archived snapshots are another potential source of confusion. A historical
implementation may share a crate or type name while no longer participating in
the active root build. A search result is a location, not a statement of authority.
Confirm which manifest includes the file before using it as the current contract.

### Exercise: Trace One Boundary Across the Repository

Starting from `kernel/arkhe-core/src/evidence.rs`, identify the reader, the
committer, and the work committer. Then inspect `evidence/arkhe-wormgraph/src/lib.rs`
and `postgres.rs`. For each method you examine, list which condition it checks
and which condition it expects the caller to establish.

Next, draw a proposed publication integration with the producer, host, gate,
store, and executor. Mark every component that can access an execution credential.
Introduce an attempted direct call from the producer to the store or executor.
Your expected outcome is that a concrete capability boundary blocks unauthorized
admission or execution. A crossed-out arrow in a diagram is not implementation
evidence; name the enforcement that the deployment would require.

The deliverable is a component map and an authority table. Mark unimplemented
connections as proposed rather than copying the architecture into an operational
status report.

### What This Chapter Does Not Establish

An inspected architecture does not prove that a deployment has correct
credentials, complete mediation, or qualified isolation. It identifies the
boundaries that such a deployment must preserve. The next chapter explains how
objects keep a stable identity as they cross those boundaries.

## 5. Identities That Survive Transport

### Decide Which Identity the Question Requires

Suppose a client submits a proposal, loses its connection, and retries. The
system needs to recognize the same logical operation. Suppose instead that the
payload changes while the client reuses its request identity. The system needs
to detect a conflict, not quietly treat the new payload as an approved retry.

These questions require distinct commitments. The full object digest identifies
the content of the intent's canonical projection. The operation identity helps
the journal group attempts at the same logical operation. Neither can safely
replace the other throughout the system.

The current main contract makes the distinction explicit:

| Identity | Construction in the inspected contract | Intended use |
|---|---|---|
| Request identity | Domain-separated digest of caller-supplied request-key bytes | Stable identity reused for one logical request |
| Operation identity | Domain-separated digest of intent type, target, and request identity | Correlating operation attempts under the surrounding host/journal scope |
| Full intent digest | Domain-separated digest of the canonical WorkIntent projection | Committing to the intent's complete projected content |
| Worker digest | Domain-separated digest of the canonical WER projection | Identifying the projected worker record |

In particular, the operation-identity function does not include `parameters_digest`
or `requested_by` in its encoded projection. Caller and tenant isolation must
be enforced by the host and journal where required. Do not describe that digest
as a globally authenticated actor identity.

### Read the WorkIntent as a Commitment Contract

`WorkIntent` includes the claimed requester, intent type, target, parameters
digest, typed context, context references, request identity, and a claimed
creation time. The full digest is computed from a defined projection of those
fields, rather than from the incidental formatting of incoming JSON.

The operation identity uses a smaller projection. That is deliberate: a journal
can associate one logical operation with its original parameters and reject
conflicting parameters on a later attempt. A gate reference or certificate that
binds the full intent serves a different purpose. It prevents a previously
checked statement from being transferred to altered intent content.

The creation-time field illustrates why commitment is not trust. Changing the
field changes the full object's identity, but retaining the original value does
not establish that it was observed by a trusted clock. A system with expiry
requirements needs a separate time contract.

### Read the WER Without Adding an Unstated Guarantee

The worker record includes module identity and version, input and output digests,
evidence references, an execution identifier, optional operation/classification
information, and uncertainty metadata. These fields help the host relate a
proposal to its declared context.

Neither the inspected WorkIntent nor WER type contains an object signature
field. An unsigned projection is therefore not a promise that a built-in
signature has been checked. Authentication and admission belong to the
surrounding protocol. Even an authenticated module record remains evidence of
the specific assertion that the accepted issuer is authorized to make.

A confidence field does not acquire statistical calibration because it is
committed into the digest. Changing a confidence value changes the record;
leaving it unchanged establishes no quality guarantee. Commitments preserve
statements, including statements whose real-world accuracy is uncertain.

### Canonicalization Starts After You Define the Data Model

Two JSON documents can display fields in different orders and still decode to
the same typed object. If one component hashes raw JSON and another hashes a
normalized object, their digests may disagree. The application needs one
identity rule that both can reproduce.

The main profile uses deterministic CBOR for the projected objects. Its encoder
uses definite lengths, shortest integer encodings, encoded-key ordering for maps,
and specific treatment of digest fields as byte strings. Strings retain their
UTF-8 bytes without Unicode normalization. These are compatibility decisions,
not incidental implementation details.

Preserving UTF-8 means that visually similar strings can remain distinct if
their byte sequences differ. If an application needs a normalization rule for
user identifiers, that rule must be established at the appropriate boundary.
Silently normalizing only in one verifier would create a different protocol.

Optional fields also need exact treatment. The inspected WorkIntent projection
omits empty typed context. The WER projection conditionally includes operation
and classification, while retaining its other projected fields, including null
optional metadata. A generic serializer configured differently may produce
different bytes even when a human considers the records equivalent.

Reference [P1] supplies CBOR foundations. The application profile remains the
authority for which values and projections Arkhe actually uses.

### Domain Separation Gives a Digest Its Namespace

The core prefixes the canonical bytes with a domain identifying the object kind
and protocol version. For example, the inspected contracts use these literal
domains:

```text
WorkIntent:    AKG:WORKINTENT:v1\0
Worker record: AKG:WER:v1\0
Operation:     AKG:OPERATION:v2\0
Request:       AKG:REQUEST:v1\0
```

Here `\0` denotes the terminating zero byte in the domain string, not the two
printed characters backslash and zero. The exact byte sequence belongs to the
protocol. Removing that byte or changing capitalization changes the commitment.

Domain separation helps prevent the same encoded payload from being interpreted
as the same commitment across different object roles. It does not authenticate
the caller and does not repair an incomplete projection. If an important target
field is absent, adding a type-specific prefix cannot bind that missing field.

Reference [P2] describes the hash used by the implementation. The choice of
application domains and object fields must still be reviewed locally.

### Parsing Is Not a Universal Canonicalization Service

The core's encoder operates on values expected to satisfy its projection
contract. Integer-only expectations and typed digest representations are visible
in the code. It should not be advertised as a hardened canonicalizer for any
arbitrary JSON a remote client can invent.

A public adapter must enforce decoding limits, accepted types, value ranges,
and error behavior before invoking lower-level helpers. It must also decide
how unknown fields and ambiguous encodings are handled. The fact that a type
can be deserialized does not prove that every extra field participates in its
identity; review the schema and the actual projection together.

This is a recurring boundary in the book. A deterministic function can still
be called with inputs outside the domain its caller was expected to establish.
Safe integration requires a supported input contract and an explicit rejection
path, not only a known expected digest.

### Use Vectors to Compare Implementations

The golden-vector tests compare canonical bytes, domain bytes, and object digests
with committed fixtures generated independently of the Rust encoder. Comparing
all three is more diagnostic than checking only a final hash. A byte mismatch
can expose a projection, integer, ordering, or digest-encoding error before it
is obscured by the hash output.

The same test file also mutates worker fields and reverses the order of evidence
references. The expected outcome is a changed worker digest. List order is part
of this contract; an adapter that silently sorts references has changed the
record being committed.

Run the dedicated suite from the repository root:

```powershell
cargo test --locked -p arkhe-core --test golden_vectors
```

This command is provided for reproduction. Its execution result for this
installment is recorded separately in the validation note. Do not regenerate
expected fixtures simply because a local implementation disagrees with them.
First identify whether the change is a defect, an intentional protocol revision,
or an incompatible source snapshot.

### Exercise: Build an Identity Change Matrix

Create rows for these edits: reorder JSON object keys, change a cost commitment,
reverse evidence references, change the claimed requester, change the target,
and reuse the request key. Create columns for request identity, operation identity,
full intent digest, and worker digest. Only mark a column when that edit affects
the corresponding object's projected inputs.

Some edits affect one object but not another. Reordering transport keys should
not change the identity of an otherwise identical decoded projection. Changing
intent parameters changes the full intent digest while leaving the inspected
operation projection unchanged. That unchanged operation identity is precisely
why the journal must compare the bound parameters instead of treating the attempt
as an unrestricted new action.

For the negative case, keep the request key, intent type, and target while
changing the parameters. Describe the journal conflict the host must reject.
Do not claim that the hash function itself refuses the new values; it can
legitimately compute both digests. Rejection is a protocol decision.

### What This Chapter Does Not Establish

Canonical identity does not establish truthful inputs, authorized issuance,
freshness, secrecy, or execution of a model. Deterministic verification of
committed inputs is also not deterministic replay of arbitrary inference on
different hardware. The next chapter uses identities to ask a different
question: whether committed bytes belong to an accepted evidence snapshot.

## 6. WormGraph and Verifiable Inclusion

### An Evidence Graph and an Inclusion Structure Are Different Layers

An evidence envelope says how a record relates to a subject, payload, policy,
and causal parents. A store retains those relationships. An inclusion structure
commits to a collection of leaves and lets a verifier check membership against
a root. These mechanisms can be combined, but they do not supply each other's
guarantees automatically.

The main `EvidenceEnvelope` contains `record_hash`, `kind`, `subject`,
`payload_digest`, optional `policy_digest`, and `causal_parents`. It is not a
universal statement that every field is independently authenticated merely
because the envelope was placed in a map. An operation-specific consumer must
check the expected relationships and admitted provenance.

Likewise, retaining causal-parent identifiers does not prove a physical cause
or a trusted time order. It records a relation asserted or admitted under a
protocol. Whether that relation is sufficient for a downstream decision is
part of the host's acceptance rule.

### Understand What the Store Enforces

The inspected in-memory graph keeps envelopes under their record hashes. An
identical repeated append returns the same identifier. A different envelope
under the same identifier is rejected. This provides a useful local consistency
condition, but it is not durable storage and does not reconstruct a global
history after process loss.

The database-backed implementation adds explicit tenant and stream context,
transactional interfaces, and restricted database access. Its connection path
rejects administrative and row-security-bypass privileges. Those are meaningful
implementation checks with their own assumptions about the database, roles,
migrations, and deployment.

Do not promote those facts into a claim that every administrator is unable to
alter evidence or that every emitted record already carries a portable inclusion
proof. Retention policy, checkpoint construction, anchoring, proof export, and
proof consumption are distinct steps. Verify the path used by a particular
profile before claiming an end-to-end evidence transport.

### Fix the Profile Before Calculating a Root

The main profile is `arkhe-mmr@1`, frozen for its golden vectors. Its definition
specifies how leaves become hashes, how internal nodes combine, how peaks are
ordered, and how multiple peaks become a root. “It uses a Merkle structure” is
not a complete interoperability contract.

For this profile, leaves are opaque bytes. The leaf function adds domain byte
`0x00`; internal nodes use `0x01`; combining peaks uses `0x02` plus a defined size
value. There is no implicit hex decoding or string normalization at the leaf
boundary. If a caller means decoded bytes, it must decode before supplying them.

| Profile choice | Main-workspace rule |
|---|---|
| Leaf order | Zero-based, left to right |
| Peak order | Left to right, descending height |
| Peak combination | Right to left |
| Empty structure | Invalid |
| Single peak | Its hash is the root, without an additional root hash |
| Size used in peak combination | Total materialized node count, encoded as unsigned 64-bit big-endian |

These choices must travel with the meaning of a checkpoint. Another workspace
can use a valid but incompatible profile. A verifier must identify which one
the accepted root represents instead of guessing from the length of the hash.

### Walk Through Seven Leaves

For seven leaves, the peak widths are four, two, and one. The first four leaves
form one perfect tree, the next two form another, and the last leaf forms the
rightmost peak. This follows the descending-power-of-two decomposition of the
leaf count.

```text
Leaf positions:  0  1  2  3    4  5    6
Peak widths:    [    4     ]  [ 2  ]  [1]
Peak names:          A          B      C

Right accumulator starts at C.
Combine B with C, then A with that accumulator.
```

The profile's size term is not seven. It is the total materialized node count:

```text
mmr_size(n) = 2*n - popcount(n)
mmr_size(7) = 14 - 3 = 11
```

The population count is the number of set bits in the binary representation.
Using the leaf count in place of the required size changes the root. So does
combining peaks left to right, inserting an extra empty-value marker, or adding
an additional root hash for a single peak.

This arithmetic walkthrough explains the profile; it is not a new frozen vector.
Use the committed specification and fixtures for interoperability assertions.

### Read a Proof as a Constrained Reconstruction

The main implementation represents proof steps with a kind, direction, and
32-byte hash. Verification starts from the target leaf, processes the path within
its peak, and then applies the required peak-combination steps.

A verifier should check both the supported shape and the reconstructed root.
Accepting any sequence of operations that happens to yield a root can discard
the structure the profile intended to assert. The inspected implementation
checks shape and bounds untrusted counts before size arithmetic.

Two APIs expose different claims. `verify_proof` checks membership under the
supported shape. `verify_proof_at` also checks the claimed leaf index and the
directions implied by that position. If an application needs to prove that a
mandate occupies a specific index, using the membership-only interface is an
insufficient integration choice even when it returns success.

The reference builder reconstructs the supplied batch in O(n) work. Checking a
valid path has O(log n) structural cost. Do not attribute the verification cost
to the builder, or treat the in-memory batch helper as evidence of an optimized
persistent append implementation.

### The Checkpoint Must Have an Independent Basis of Trust

A producer can invent a leaf, build a tree containing it, and send the leaf,
proof, and root together. The package may be mathematically consistent. Without
an independently accepted checkpoint, it establishes only agreement among values
chosen by the same untrusted party.

A useful checkpoint contract identifies the profile, root, and count, together
with the relevant log or stream context. It also defines how the verifier
accepts the checkpoint: a retained value, an authenticated channel, or a signed
statement under a pinned authority, for example. The exact fields and transport
remain profile-specific; this description does not invent a universal checkpoint
type for every subsystem.

Signing a checkpoint moves the question to the signer's authority. It does not
remove that question. A key carried inside the same package is not a trusted
root merely because it verifies the included signature.

### Inclusion Does Not Establish Global Consistency or Time

Suppose one observer accepts a root for one history while another accepts a
different root for a fork. Each observer can receive a valid inclusion proof
against its own root. Membership alone does not establish agreement between
those histories.

The main MMR profile does not freeze a general consistency-proof format between
checkpoints. References [P3] and [P4] explain transparency protocols that distinguish
these questions, but they are different protocols. Their existence does not
silently add a consistency claim to the Arkhe profile.

Similarly, a leaf index is not a trusted wall-clock timestamp. To establish that
an approval existed before an execution, a workflow needs an explicit chronological
contract involving accepted observations, checkpoints, and time assumptions.
Even a signed time statement requires trust in its issuer and scope.

An old proof also continues to refer to its original snapshot after new leaves
are appended. That can be appropriate for historical evidence. It does not
demonstrate that the old policy or issuer remains acceptable for a new action.

### Verify the Leaf's Meaning Separately

If an envelope is included, the verifier still needs to know what the leaf bytes
commit to. Does the leaf contain canonical envelope bytes, an object digest,
or a profile-specific composition of values? Supplying a hex string where decoded
digest bytes were expected changes the statement.

Once the commitment is understood, the underlying claim remains scoped. Inclusion
of a hardware-evidence blob does not validate that blob. Inclusion of a worker
record does not prove the worker ran the stated model. Inclusion of an approval
does not establish that the approver held current authority.

The practical evidence chain therefore contains at least two checks: membership
against an accepted checkpoint, and validity of the committed statement under
the relevant policy. Neither is an optional detail of the other.

### Exercise: Design a Portable Inclusion Package

Write a package contract containing the exact leaf representation, profile
identifier, count, proof, and the checkpoint it is intended to match. State which
checkpoint fields the verifier obtains independently. If position matters, state
the index and require the indexed verification contract.

Now construct five negative cases on paper: altered leaf bytes, an unsupported
profile, a false position, a count inconsistent with the path, and an attacker-supplied
checkpoint. Explain which cases a mathematical proof check can reject and which
require the host to reject an untrusted authority input.

The expected deliverable is a package contract and an acceptance table. A valid
membership result against an attacker-chosen root must not be reported as
authenticated admission. A historical proof must not be presented as evidence
of current authorization without a separate rule.

### What This Chapter Does Not Establish

Inclusion does not establish factual truth, external execution, hardware identity,
availability of all retained objects, global consistency, or trusted chronology.
It establishes a specific relationship between committed leaf bytes and an
accepted snapshot under a defined profile. Chapter 7 now uses a different kind
of evidence: a certificate whose arithmetic property can be checked independently.

## 7. From Output to Authorization

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

### The Difference Between an Explanation and a Certificate

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

### The Rule Belongs to the Host

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

### Four Objects to Keep Distinct

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

### The Architecture of This Lab

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

### Run the Repository Example

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

### Why Verify Again at the Gate

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

### Test the Rejection Boundary

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

### Authorization and Execution Have Different States

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

### Where WormGraph and Offline Verification Fit

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

### What the Certificate Establishes

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

### Exercise: Separate Proof Validity from Permission

Create a table with four cases: a correct certificate under an allowing policy,
a correct certificate under a denying policy, a correct certificate without
required human review, and an altered certificate under an allowing policy.
For each row, identify the check that decides the outcome and whether any
external action occurs in this laboratory.

The expected result is that certificate correctness supplies only one condition.
The allowing case still requires admitted evidence and all applicable checks;
the remaining cases must not gain authorization by presenting a correct sum or
an allowing policy alone. None of the cases establishes an external payment.
Use the named tests to locate the relevant rejection, rather than replacing the
expected outcome with a model's explanation.

Your deliverable is the decision table, the command used to exercise the cases,
and a short statement of the trusted inputs. If you propose a persistent version,
mark its proof transport, admission, and executor integration as separate work.

### Implementation References

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

# Selected References for Part II

Third-party names are retained in attribution and literal technical identifiers.
This independent publication does not claim sponsorship, endorsement, or
certification by the organizations responsible for those sources.

- **[P1]** [RFC 8949, Concise Binary Object Representation](https://www.rfc-editor.org/rfc/rfc8949.html).
  Encoding foundations, including deterministic encoding. The application
  projection and supported input domain are specified locally.
- **[P2]** [BLAKE3 authors, Specifications, Analysis, and Design Rationale](https://github.com/BLAKE3-team/BLAKE3-specs).
  Hash design and rationale; not an authentication or authorization protocol.
- **[P3]** [RFC 9162, Certificate Transparency Version 2.0](https://www.rfc-editor.org/rfc/rfc9162.html).
  A reference for distinguishing inclusion and consistency in transparency
  protocols; it does not specify the Arkhe MMR profile.
- **[P4]** [RFC 6962, Certificate Transparency](https://www.rfc-editor.org/rfc/rfc6962.html).
  Historical protocol reference for integrations that explicitly use that
  revision. It is obsoleted by RFC 9162; the versions are not silently interchangeable.
- **[P5]** [George Necula, research on proof-carrying code](https://www.cs.cmu.edu/~rwh/students/necula.pdf),
  and [Andrew Appel, Foundational Proof-Carrying Code](https://www.cs.princeton.edu/~appel/fpcc.html).
  Research lineage for independent checking. It is not a mechanized proof of
  the local arithmetic checker or a general proof of model correctness.

## Local Sources and Qualification Boundaries

Architecture observations use `docs/ARCHITECTURE.md`, `docs/SECURITY-MODEL.md`,
the current root manifest, and `config/architecture.json`. Current membership
must be read from the manifest; historical documentation can retain older counts.

Identity observations use `kernel/arkhe-core/src/work.rs`, `worker.rs`,
`canonical.rs`, `evidence.rs`, and `kernel/arkhe-core/tests/golden_vectors.rs`.
Evidence-store observations use `evidence/arkhe-wormgraph/src/lib.rs` and
`postgres.rs`. MMR rules use `specs/mmr/spec/mmr-profile-v1.md`,
`docs/MMR-PROFILE.md`, and the `mmr` module in `arkhe-verify-core`.

During preparation of this installment, four canonical-identity tests, two MMR
tests, nine budget-certificate tests, and five gate-rejection tests passed:
**20 targeted tests, with no failures or ignored tests in those suites**.
The offline budget example was also rerun and returned the same recorded total,
certificate digest, and authorization reference, with no external action.

These results establish tested local behavior. They do not constitute a full
workspace requalification, remote CI result, database integration run, browser
WASM parity run, production deployment, or external-effect test. The timestamped
editorial version and source hashes identify this reading context; a release
still needs a fixed distributable snapshot and final editorial review.

Part III will address integration in greater detail, particularly how a host
supplies admission, how a journal controls retries, and how a client consumes
evidence without acquiring execution authority.
