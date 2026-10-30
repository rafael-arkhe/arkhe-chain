---
title: 'Arkhe: Evidence and Governance for AI Agents'
subtitle: 'Part III — Implementation'
lang: en-US
date: 'October 22, 2026'
rights: 'Working manuscript, edition 0.2. Not a publication-ready edition.'
---

# Part III — Implementation

Part II explained the mechanisms: canonical objects, admitted evidence, policy
bindings, inclusion checks, and independently checked output properties. This
part examines what happens when a host puts those mechanisms on a real request
path. The critical work is preserving their meaning across interfaces.

The running example remains a fictional document publisher. It helps us discuss
exact-content approval, a controlled destination, and uncertain external outcomes
without claiming that this complete publication service already exists. Where
the text describes actual interfaces or tests, it identifies their locations.
Where it proposes an integration, it labels the design and its acceptance criteria.

The main workspace is used throughout. Its optional standalone journal and its
portable verification adapter are separate components. Combining their tests
does not prove a single production deployment that connects them all.

## 8. Integrating the ContainmentGate

### Define the Host's Request Boundary

A gate is useful only if the path to the external effect requires it. Begin by
identifying the process that accepts the caller, resolves the accepted policy,
obtains admitted evidence, and holds the executor capability. The agent's
conversation should not be the authority for those inputs.

In the fictional publisher, the host receives a request to publish a particular
payload to a fixed class of destinations. It authenticates the caller and
constructs or validates the intent under that identity. It does not accept
`requested_by` as authenticated merely because the incoming JSON contains it.
Likewise, a producer-supplied policy digest is a proposed reference until the
host matches it to an accepted rule.

The boundary should reject malformed or oversized requests before expensive
work. Later checks cannot repair a parser that has already exhausted memory.
Transport limits and timeouts are application responsibilities even when the
core types describe a much smaller logical object.

### Select the Entry Point by Its Contract

The inspected `ContainmentGate` exposes a basic synchronous authorization method,
an admitted-evidence method, and a routed admitted-evidence method. They should
not be treated as interchangeable conveniences.

| Entry point | Appropriate interpretation | Important restriction |
|---|---|---|
| `authorize` | Basic path for supported unprotected intents under policy | Protected intents cannot pass by supplying an unadmitted worker record |
| `authorize_admitted` | Checks the worker against evidence obtained through a reader | Refuses a policy that requires review routing |
| `authorize_routed_admitted` | Adds route and applicable human-review checks before admitted authorization | Routing does not override evidence, policy, or emergency-stop requirements |

In the inspected classification, `DraftDocument`, `QueryKnowledgeBase`, and
`Simulate` are unprotected; other intent variants are protected. That term does
not mean that an unprotected request is exempt from policy. A requirement for a
supported proof also cannot be bypassed by choosing the basic path.

If an integration calls `policy_verdict`, it has obtained a governance signal,
not an authorization capability. The method's documentation explicitly describes
it as read-only and nonauthorizing. Do not route an `Allow` from that helper
directly to an executor.

### Supply an Explicit Policy Profile

`PolicyBinding` carries a policy identifier, version, and digest. A binding is
not the policy implementation itself. The resolver must check the intended
profile and supply requirements consistent with it.

For admitted worker evidence, the inspected resolver interface can restrict
module identifiers and cognitive operations through `required_worker_evidence`.
Other opt-in methods can require a budget certificate, a supported formal
predicate, typed classification, or review routing. Absence of a requirement
must be interpreted according to the actual gate path, not as a universal
permission to omit evidence.

The development resolver permits only its explicitly unprotected intent types.
It is not a production publication policy waiting for a different configuration
file. A protected workflow needs a host-owned resolver with defined scope,
versioning, and tests. The offline budget example supplies such a resolver for
its synthetic arithmetic demonstration; its rule is not an approval to pay
real expenses.

For the fictional publisher, a proposed resolver contract would identify who
can request publication, which target class is allowed, which review modules
are accepted, and which evidence is necessary. Its acceptance test should
include a denied caller and a denied target, not just a successful request.

### Check Relationships, Not Merely Object Presence

The admitted path retrieves the analysis reference from the intent and looks up
its envelope. It also requires one source-report context entry. Duplicate or
ambiguous references are not resolved by silently choosing the first candidate.

The implementation compares several identities before consulting the remainder
of the profile:

```text
intent's analysis reference == worker digest
envelope record hash       == worker digest
envelope payload digest    == worker digest
envelope kind              == WorkerExecutionRecord
envelope subject           == source-report digest
worker input digest        == source-report digest
worker output digest       == intent parameters digest
```

This is a reading aid for the inspected path, not a complete wire schema or a
new substitute for the source code. The profile additionally checks the allowed
worker module and operation, plus optional predicate and review requirements.

These comparisons prevent a well-formed record from another proposal from
being substituted merely because it exists in the store. They also show why
envelope admission matters. A caller-controlled reader that invents every
expected envelope has not authenticated any source; the integration must
establish who can populate and expose admitted records.

### Integrate Review as Bound Evidence

The routed path verifies that the intent binds one route decision. When human
review is required, the implementation checks the review verdict, time bounds,
requester, operation, parameters, analysis, policy, and routing commitments. It
also checks a corresponding admitted worker attestation under allowed review
modules.

An “approved” flag in a user interface does not replace those relationships.
If the payload changes, the earlier approval must not follow the new payload
through a mutable pointer. The host must also supply a trusted time context;
a review timestamp inside an object does not establish its own freshness.

Automatic routing has an authority boundary too. A route that suggests automatic
acceptance cannot grant that option unless governance permits it. Conversely,
an automatic rejection does not need a producer's consent to stop the proposal.
Treat the routing output as evidence with a defined role, not as a replacement
policy engine.

The broker introduced in Chapter 9 currently uses the simple admitted path.
Consequently, its existing interface does not implement a complete routed-review
dispatch flow. A policy requiring routing is refused rather than silently
downgraded. Do not add a retry through an easier gate entry point when that happens.

### Keep Optional Proof Requirements Fail-Closed

When the resolver requires a budget certificate, the reader must return it for
the exact worker digest. The gate invokes the independent checker and requires
the corresponding admitted envelope with the expected subject, policy, and parents.
The certificate is not accepted because a storage method labels it verified.

The optional reader transport defaults to no proof. That is a compatibility
choice with a security consequence: a policy requiring the proof must deny
authorization on a reader that does not implement the capability. The existing
persistent graph has no budget-proof transport in the inspected implementation.
The offline example therefore does not demonstrate an enabled HTTP production
path for the certificate.

Policy changes during lookup require attention. The budget integration compares
the specification again before authorizing so an old checked certificate cannot
silently satisfy a changed specification. A new profile should state what is
snapshotted, which changes are detected, and which external decisions remain
outside that local guarantee.

### Handle Rejections Without Changing Their Meaning

The caller needs a stable distinction between malformed input, unavailable
supporting infrastructure, policy denial, missing evidence, and required review.
The current gate returns a rejection reason as a string. An application can map
those outcomes to an explicit external error contract, but should version that
mapping rather than treating every internal sentence as a permanent protocol.

Whatever the response format, a failure must not fall back to execution without
the check. An evidence outage can be retried or escalated through an authorized
procedure. It cannot become approval by absence of a response.

An emergency stop should likewise be tested on the real entry point. Setting a
flag in a library instance is not proof that all replicas, queues, and executors
stop. A deployment needs a propagation and dispatch protocol appropriate to its
concurrency model. The local tests establish local gate behavior, not global
revocation of already issued external requests.

### Reproduce the Gate and Certificate Cases

From the repository root:

```powershell
cargo test --locked -p arkhe-kernel --test rejection_gates --test budget_pco
```

Inspect the test names and fixtures. The rejection suite covers the basic
protected-evidence boundary, policy denial, missing worker evidence, and emergency
stop. The budget suite adds certificate provenance, binding, specification changes,
and review-related cases. They are targeted library tests, not a publication
integration against a real destination.

### Exercise: Write an Admission-to-Decision Contract

Define a proposed publish profile using one accepted worker operation and one
host-controlled policy binding. Write an acceptance table for a valid request,
missing evidence, duplicate analysis references, altered parameters, a disallowed
module, a stopped gate, and a policy requiring review routing on the simple path.

For each row, identify the gate check and the trusted input that makes it
meaningful. A valid row must satisfy all applicable conditions; selecting an
unprotected type for an effect that the application actually publishes is not
an acceptable shortcut. Mark any host admission or identity authentication that
your design has not implemented.

The deliverable is a contract and a negative-case table, with no executor call
on rejected paths. Use the repository tests to understand the mechanics, and
keep the fictional publication profile separate from those implemented fixtures.

### What This Chapter Does Not Establish

Gate integration does not prove that every effectful path is mediated, that
the reviewer exercised good judgment, or that a deployment has qualified process
isolation. It defines an authorization boundary whose inputs and bypasses can
be examined. The next chapter handles the separate problem of dispatching an
authorized operation without repeating an uncertain effect.

## 9. Operation Identity and External Effects

### The Most Dangerous Retry May Follow a Successful Action

In the fictional publisher, the destination receives a report and publishes it.
The connection drops before the host receives the response. Locally, the request
appears to have failed. Remotely, it succeeded. Repeating it may publish a duplicate.

The gate cannot resolve that uncertainty by checking the approval again. It can
establish that the proposal still meets authorization conditions. It cannot
observe an external result that the destination never reported reliably.

Reference [I1] explains why request identity and retry semantics matter in
distributed operations. Here, we focus on the inspected broker interface and
the additional obligations of its executor and destination.

### Fix the Dispatch Capability in the Host

The broker keeps the gate, journal, and executor on the host side. The executor
interface accepts an intent, but its documentation requires a single configured
capability. An untrusted agent must not select executable paths, unrestricted
URLs, or credentials through a generic broker parameter.

This requirement needs an actual implementation. If the executor reads a free-form
destination from model output and sends it with a powerful credential, the broker's
name does not make the result constrained. The executor must reconstruct the
effect from the approved parameters and independently enforce its capability scope.

Keep credentials outside the producer process. Also qualify the surrounding
process and operating-system boundary. Absence of a key in a model prompt is
not evidence that the agent cannot read that key through a filesystem, socket,
subprocess, or overly broad tool interface.

### Bind Retries to the Same Dispatch Intent

The main operation identity groups a request type, target, and request identity.
The journal additionally scopes the slot by caller. The broker computes a
dispatch binding that fixes the parameters and the relevant mandate/policy
commitments for its path.

This allows some context to be refreshed on a retry without authorizing a
different external effect. A new evidence object can support the same operation,
while changed dispatch parameters must conflict with the reserved binding.
The rule is specific: it is not permission to replay an old certificate across
arbitrary full-intent changes.

Reusing a nonce with different parameters is a conflict. Inventing a new nonce
does not establish that an uncertain old operation never happened. Recovery
must reconcile the old outcome before a new logical operation is used as a
workaround. An agent should not be given authority to clear uncertainty by
renaming the request.

### Reserve Before Calling the Destination

The generic broker verifies its local mandate, checks admitted authorization,
and then asks the journal to reserve the caller/operation slot under the dispatch
binding. The reservation produces one of three interface outcomes:

| Outcome | Meaning for the broker | Next step |
|---|---|---|
| `Acquired` | This caller acquired the right to attempt this dispatch | Invoke the configured executor once on this path |
| `Replay(receipt)` | A matching completed operation has a retained result | Return the stored receipt without redispatch |
| `Uncertain` | A reservation exists without a safely replayable result | Require reconciliation; do not repeat the effect |

The optional durable implementation persists a newly acquired slot as
`UNCERTAIN` before dispatch. This may sound conservative: the effect may not
even have started yet. It is intentional. After a crash, a new process cannot
infer from missing completion whether execution had begun or reached the destination.

The journal contract requires atomic reservation. Two callers that read “absent”
and then insert without an atomic boundary can both execute. A preflight query
followed by a separate write is not a reservation protocol.

### Walk Through the Failure Points

The sequence is small enough to examine explicitly:

```text
check authority and evidence
reserve operation durably
attempt external effect
persist completion and receipt
return result
```

If reservation fails before acquisition, the broker must not dispatch. If the
process stops after acquisition but before the effect, the record remains
uncertain. If the destination accepts the effect and the response is lost, it
also remains uncertain. If the response arrives but completion persistence fails,
the destination may already have acted; this is still an uncertain operation.

A caller receiving an exception cannot safely assume “nothing happened.” The
meaning depends on the point reached in the protocol. The inspected broker
intentionally leaves an acquired reservation uncertain on executor failure,
cancellation, or inability to persist completion.

Successful replay is also subject to current checks. The broker invokes the
gate before returning a matching stored receipt, so a current stop or denial
can prevent that response. It does not undo a historical effect. Returning
evidence of an old result and authorizing a new dispatch remain distinct questions.

### Durable Storage Is an Explicit Option

The broker installs no journal or executor by default. Contract tests use a
test journal; a separate feature exposes a standalone durable journal. Its literal
feature name is `sqlite-broker`.

The inspected implementation opens a filesystem database, configures a write-ahead
journal and full synchronization, and uses an immediate transaction for reservation.
It stores caller, operation, binding, ownership, state, and a receipt for completed
work. A completion call must come from the handle that owns the acquired reservation.

Reopening an uncertain record does not transfer ownership to the new process.
Another handle cannot invent a receipt and mark that old record complete through
the ordinary interface. That supports the conservative recovery policy, but it
also means reconciliation needs a separately designed, authorized procedure.
The journal interface shown here is not a complete operator reconciliation tool.

Database durability settings are necessary implementation details, not proof
against every storage or host failure. The deployment must qualify its filesystem,
access controls, backups, and recovery process. This standalone journal also does
not replace the application's persistent evidence database.

### A Mandate and a Journal Solve Different Problems

The local action-mandate profile binds a principal, operation, target, policy,
allowed parameters, and validity. Its accepted checkpoint and time context have
their own authority assumptions. Passing those checks establishes a constrained
authorization statement under that profile.

It does not consume the action by itself. The journal prevents a completed or
uncertain operation from being blindly redispatched. Neither mechanism replaces
the executor's duty to send the exact approved parameters.

The broker also contains a distinct payment-predicate path with atomic single-use
consumption requirements. The ordinary path refuses payment predicates that
require that protocol. A journal lacking the required consumption capability
fails closed. Do not generalize a generic reservation demonstration into a
qualified external payment integration.

The local mandate path and the payment-specific path are separate contracts.
Their existence is not evidence that external provider credentials, protocol
roles, or live payment rails have been qualified.

### Reconcile with Evidence, Not Guesswork

A proposed publication reconciliation procedure would ask the destination for
an outcome tied to the same operation identity or equivalent correlation data.
It would compare the observed payload and target with the retained binding.
An authorized operator would then decide the next transition under a documented
procedure, preserving the observations and the reason for the decision.

If the destination cannot establish the outcome, the record may need to remain
unresolved. A business decision to perform a compensating or new action requires
its own authority. It is not a mathematical deduction from a timeout.

Exactly-once claims need careful boundaries. A local journal can enforce its
reservation protocol and preserve uncertainty. It cannot force an arbitrary
remote destination to expose idempotent behavior or trustworthy reconciliation.
State the local guarantee and the destination assumption separately.

### Reproduce Reservation and Recovery Tests

The optional durable suite must be explicitly enabled:

```powershell
cargo test --locked -p arkhe-kernel --features sqlite-broker --test action_broker --test broker_durable
```

Without the feature, the durable test file is conditionally excluded. A run with
zero cases from that file is not evidence of durable behavior. With the feature,
the tests exercise reopening, uncertainty, binding conflicts, ownership,
single-use consumption, and competing connections, alongside the broker's
mandate and dispatch cases.

These are local fixtures with controlled executors. They do not publish a real
report or move funds.

### Exercise: Design a Crash Matrix

Create a row for every failure point in the five-step sequence. For each,
record the local state, the possible remote state, whether replay may return a
receipt, whether dispatch may repeat, and who may reconcile the operation.

Use two negative cases: competing callers reserve the same slot, and a retry
changes the parameters. The expected outcomes are a single acquisition and a
binding conflict, respectively. Then add a process restart after acquisition.
The reopened operation must remain uncertain rather than being automatically
taken over.

The deliverable is the state matrix and a proposed reconciliation contract.
Mark any destination lookup or operator transition not implemented by the
repository interface. Do not invent an unlock command to make the exercise pass.

### What This Chapter Does Not Establish

The broker does not establish universal exactly-once effects, qualified host
isolation, or live external-provider support. Its local contract makes dispatch
authority and uncertainty explicit. Chapter 10 turns to the evidence adapter
that must preserve the same precision at the storage boundary.

## 10. Building an Evidence Adapter

### Begin with the Statement the Consumer Will Check

An evidence adapter receives material from one context and presents it under
another interface. Its risk is semantic inflation: a parsed record becomes a
“verified result,” or a normalized receipt becomes “proof of execution.”

Start by stating the exact output. For an analysis adapter, a useful statement
may be that a host-authenticated worker record is admitted for a particular
source digest under an accepted profile. For an authorization-retention path,
the statement may instead be that the intent, resulting worker record, and
authorization envelope were committed atomically. Those are different records.

The interfaces in `kernel/arkhe-core/src/evidence.rs` intentionally expose a
reader, an envelope committer, and a work-evidence committer. Their names should
not conceal which boundary supplies authentication or which relationships are
checked by a particular implementation.

### Keep Transport, Admission, and Retention Separate

Transport obtains bytes. Parsing turns supported bytes into typed objects.
Validation checks shape and required relations. Authentication connects a
statement to an accepted identity or channel. Admission determines whether the
statement can enter the evidence set used by a policy. Retention preserves
the resulting objects for later use.

Some implementations combine these stages inside one trusted service. That is
an engineering choice, not permission to omit their contracts. A component that
only parses a remote response cannot claim to have authenticated the issuer.
An append-only store cannot evaluate the factual meaning of every payload it
retains.

A proposed adapter pipeline is:

```text
bounded transport input
  -> supported schema and typed decoding
  -> exact identity and relationship checks
  -> issuer/channel authentication under host trust
  -> profile-specific admission decision
  -> atomic retention of required objects
  -> scoped receipt or lookup result
```

This pipeline is a design pattern, not a claim that a single generic Arkhe API
implements all of it for every evidence kind.

### Construct Envelopes for a Specific Profile

The basic envelope fields identify a record, kind, subject, payload commitment,
optional policy commitment, and causal parents. Each field's expected meaning
must be defined by the consuming profile.

For the admitted analysis path used by the gate, the record and payload hashes
refer to the WER, while its subject matches the source-report commitment. The
worker input and output must match that source and the intent's parameters.
For the budget certificate, the envelope uses the worker as subject and commits
the certificate with exact expected parents.

The persistent `commit_work` interface has a different contract. Its inspected
implementation expects a `work-authorization` envelope whose subject is the full
intent digest, whose payload digest is the worker digest, whose policy digest
is present, and whose causal parents match the worker's evidence references.
It also expects that worker's input digest to be the intent digest.

That final condition differs from the analysis-worker relation just described.
Do not send the analysis WER from the budget example directly to `commit_work`
and assume the shared type makes the profiles compatible. The same data type
can participate in distinct roles with different bindings.

| Profile role | Subject/input relationship | What not to infer |
|---|---|---|
| Admitted analysis record | Source report binds worker input; worker output binds proposed parameters | That the source is factually true |
| Budget certificate envelope | Worker is subject; payload commits the checked certificate | That storage ran the checker or paid an expense |
| Persistent work authorization | Intent is subject and worker input; envelope retains policy and worker result | That the record represents an external effect |

The table summarizes inspected local relationships. A new operation needs its
own profile and negative tests rather than an informal choice of familiar field
names.

### Admit the Origin Before Trusting the Metadata

A WER may identify a module and version. Those strings are not evidence that
the module ran. The host needs a defined way to authenticate the observation:
a controlled local execution boundary, an accepted signed statement, or another
profile-specific mechanism with explicit assumptions.

The adapter should retain enough information to explain that mechanism later.
If a trusted supervisor signs an observation, identify the signed transcript,
accepted key, role, and relevant binding. If a fixture contains a deliberately
fake signature, label the result synthetic and do not let normalization upgrade
it to production evidence.

This book does not define a universal worker-signing format. Use the implemented
profile for the actual source. Adding a signature field to arbitrary JSON does
not make it interoperable with a service or establish an accepted authority.

### Commit the Required Objects Together

An envelope referencing absent objects can make a later audit impossible. A
successful response emitted before a transaction commits can make a caller
believe evidence exists when it does not. Atomic retention is therefore part
of the receipt's meaning.

The inspected persistent work path checks its relationships, opens a transaction,
requires referenced parents, inserts canonical intent and worker objects, inserts
the envelope, and commits before returning its record hash. A failure in that
sequence must not be represented to the caller as completed admission.

The store also checks for incompatible existing records rather than treating
all reuse of a hash as an idempotent success. Identical replay and conflicting
content need different outcomes. Retention interfaces should document which
identity defines that distinction and what the caller can safely retry.

Keep this evidence transaction separate from the external-effect protocol in
Chapter 9. A local database transaction does not atomically commit a remote
publication. An outbox or other integration pattern still needs a defined
dispatcher, identity binding, and uncertainty treatment. The book does not
claim a universal transaction spanning both systems.

### Preserve Tenant and Role Boundaries

The persistent reader uses tenant-scoped queries and transaction-local role
context. Its connection code rejects administrative or row-security-bypass
privileges. The storage schema and migrations support additional isolation and
append-only controls within their defined deployment assumptions.

Those controls should be tested from a restricted role, including attempts
that omit application-level tenant filters. Reference [I2] explains the database's
row-policy semantics and exceptions. An administrator's authority, backups,
schema changes, and host access remain separate concerns.

The adapter must authenticate which tenant the caller belongs to. An evidence
request cannot acquire another tenant's context by presenting its identifier
in the payload. Correct database policy and correct request identity binding
are complementary controls.

### Make Missing, Invalid, and Unavailable Distinct

`EvidenceReader::get` returns a result containing an optional envelope. A missing
object and a failed lookup are distinguishable at the interface even where a
gate maps both to rejection. Preserve the distinction for operations and
diagnostics without turning either into an allowing default.

When returning an envelope, validate that its record hash matches the lookup.
The inspected persistent reader performs that comparison. A new adapter should
also enforce whatever subject, kind, policy, and payload relationships its
consumer requires. The reader's successful return alone does not satisfy every
downstream profile.

Bound decoded sizes and recursion before expensive processing. A 32-byte digest
does not bound the object it identifies, and a proof with a small logical
description may arrive inside an oversized transport envelope. Document byte
limits, supported schema versions, and failure behavior at the public boundary.

### Add Proof Transport Only with Its Full Contract

The optional `budget_proof` reader method returns no proof unless an implementation
supplies it. The gate independently verifies any returned certificate. A
persistent adapter adding this method would need to retain the full certificate,
not merely a boolean that says it once passed.

It would also need atomic linkage to its admitted envelope, a supported decoding
format, bounded input, and a policy-controlled specification. As inspected here,
the persistent graph does not implement that transport. This chapter describes
the required design work; it does not silently supply the implementation.

The safe behavior of an incomplete adapter is specific: a proof-requiring
policy rejects the operation. A fallback that supplies an empty certificate,
skips the checker, or reuses proof for another worker would change the security
contract.

### Exercise: Specify and Break an Adapter

Choose one profile role from the table. Define its accepted transport, identity
calculation, trusted origin, envelope relationships, retention unit, and lookup
result. Describe the receipt you may issue only after successful retention.

Then introduce an unavailable parent, a cross-tenant lookup, a record hash
mismatch, a worker bound to another source, and a transaction failure after
object insertion but before commit. The expected results are profile rejection,
access denial or no visibility, consistency rejection, binding rejection, and
rollback without a successful receipt, respectively.

These are acceptance criteria for the proposed adapter. They are not claims
that every case was executed during preparation of this installment. A database
integration run needs a real configured test database and its own retained
evidence. Record any unexecuted case instead of inferring it from compilation.

### What This Chapter Does Not Establish

An adapter does not prove truthful worker claims, universal evidence semantics,
unconditional administrator resistance, or atomic external effects. It preserves
the meaning of a particular admitted statement under a supported profile. The
next chapter examines how clients can check such material without becoming an
authority for the effects it describes.

## 11. Verification on the Client

### Decide What a Client Result Means

A reviewer opens an evidence package and sees a green indicator. What does it
mean? The file was decoded? Its digest was computed? A signature matched an
accepted key? A leaf belongs to a supplied root? The proposed action satisfies
the current host policy?

Those are different results. A client should display the most precise supported
claim and identify what was not checked. Otherwise, moving a verifier into a
browser can make a narrow check appear to approve an entire workflow.

The portable verifier supports this separation: its core evaluates inputs, while
adapters provide bytes and expose operations. The client still needs trusted
context for any authority-sensitive decision, and the host remains responsible
for enforcing execution policy.

### Know Which Interface You Are Calling

There are at least three relevant surfaces: the native verification core, the
WASM export layer, and the protocol adapter that calls those exports. Availability
at one surface does not establish availability at every other surface.

The native core exposes both membership and indexed MMR checking. The inspected
WASM export `verify_mmr` calls the membership verifier. Its arguments do not
include a leaf index. The protocol adapter likewise reports membership relative
to a supplied root and does not assert a position.

If an application needs an index-bound mandate proof, it cannot describe this
membership operation as sufficient. It must use or implement an appropriate
supported indexed path and qualify that integration. A function name that
contains “verify” does not expand its argument contract.

The budget-certificate checker also should not be assumed to be exposed in the
browser merely because it is present in the native verification crate. Inspect
the actual exports. The existing WASM wrapper does not provide a public
budget-certificate entry point in the inspected source.

### Compute, Canonicalize, and Verify Are Different Operations

The inspected artifact adapter's result schema deliberately avoids one generic
`valid` field. Its operations distinguish digest computation from canonicalization.
For these artifact operations, the result explicitly states that signature,
provenance, and policy authorization were not performed.

| Observed status | Claim supported by that operation | Claim not supported |
|---|---|---|
| `DIGEST_COMPUTED` | A digest was calculated for the supplied bytes | The bytes came from a trusted source |
| `CANONICALIZED` | Supported structured input was encoded into canonical bytes | Its embedded signature or historical claims were authenticated |
| `PROOF_VALID` | Supported membership proof matches the supplied root | The checkpoint is independently trusted or the action is authorized |
| `PROOF_INVALID` | A well-formed proof did not satisfy the membership operation | A complete explanation of the producer's intent or the remote event |

Malformed input can produce an error rather than a negative proof result. A
consumer must handle both. It must not catch all errors and then render the
package as acceptable because no explicit `false` value was returned.

For example, a structured content claim can contain a field that resembles a
signature and still be canonicalized as data. That result says nothing about
whether the signature is genuine. Signature checking is a different operation
with its own accepted key and profile. Full standards interoperability is
another question again.

### Supply Trust Independently of the Package

A portable package may carry a checkpoint, a certificate chain, or a public key.
The client needs an independent rule for accepting those values. Using the
package's own key as the trusted root merely verifies that the package is
self-consistent.

For the MMR adapter, `expectedRootHex` comes from the caller. The result repeats
that root and reports that checkpoint authentication was not performed. A host
application should distinguish “proof matched this root” from “this root is
accepted for this stream, policy, and purpose.”

A proposed reviewer interface could show the expected root obtained from
retained host state next to the package's claimed root, together with the
profile and count. That is a UI design, not an implemented guarantee of the
current adapter. Its purpose is to make the trust source inspectable rather
than hide it behind a generic badge.

### Treat Time, Revocation, and Replay as Host State

Offline checks can evaluate supplied temporal claims against a supplied time.
They cannot establish that the supplied time is trustworthy. They also cannot
generally fetch or infer all current revocation and registration state without
an explicit mechanism.

The inspected authentication-assertion wrapper takes expected key and identity
context plus a time value. Its documentation assigns live registration,
revocation, and replay enforcement to the caller. The wrapper constructs fresh
local token state for its invocation, so calling it repeatedly is not a persistent
replay-prevention service.

Historical evidence can remain useful under a retained trust snapshot. Current
authorization may require fresh state that the offline package does not contain.
The application must state which question it answers, what snapshot it uses,
and what uncertainty remains when connectivity is unavailable.

### Bound Inputs Before Entering the Verifier

The protocol adapter validates hex strings, counts, proof-step shape, and input
sizes before calling the WASM wrapper. In the inspected MMR operation, a leaf
input is bounded to 64 KiB of decoded bytes, the root is exactly 32 bytes, and
the proof array is limited to 64 steps. The leaf count is a positive 32-bit
integer.

Those bounds belong to that adapter. The low-level WASM wrapper has its own
contract; the MMR wrapper itself parses the supplied proof JSON. A browser
application calling exports directly must enforce its public transport and
resource limits instead of assuming the protocol adapter's checks ran elsewhere.

The native verifier additionally validates supported proof shape and count
arithmetic. Layered checks are useful: transport limits reduce resource exposure,
while the core enforces the proof's structural contract. Neither replaces the
other's responsibility.

### Reproduce the Packaged Adapter

From the repository root:

```powershell
pnpm verify:wasm
pnpm --filter @arkhe/mcp-server build
pnpm --filter @arkhe/mcp-server test
```

The first command builds the portable module and generated bindings. The second
builds the adapter. The third exercises its existing test suite, including
actual WASM calls and protocol interactions where covered by those tests.
Rebuilding avoids relying on an unrelated old generated module.

This sequence does not constitute a test inside a browser. Native compilation,
WASM execution under a local JavaScript runtime, protocol interaction, and
browser integration are different validation environments. Record the one you
actually exercised.

Static vectors help compare surfaces, but keep their declared status. A vector
marked as a candidate does not become a frozen interoperability contract
because a test happens to parse it. Similarly, package build success does not
establish that every function in the native crate is exposed to the adapter.

### Keep the Verification Display Outside the Execution Authority

A client may assemble useful evidence for a human reviewer. It may also be
compromised, stale, or disconnected. The host executor must independently
enforce its admission and authorization contract rather than trust a browser's
`approved` flag.

If the client creates a review decision, that decision must bind the exact
objects and context required by the host's profile. Sending an unbound boolean
back to the server loses the relationships that the verifier was intended to
make explicit.

When designing a result display, include the operation performed, inputs or
their commitments, accepted trust source, result, and checks not performed.
Avoid green indicators whose labels imply payment, publication, or complete
provenance when the underlying operation only computed bytes.

### Exercise: Design a Result Contract Without a Generic Valid Flag

Create three client result cards: digest computation, canonicalization, and
membership verification. For each, state the supported claim, input identities,
trust source if any, failure behavior, and checks not performed. Use the status
names from the inspected adapter where appropriate.

For the negative case, provide a valid membership package under a root chosen
by the package's author. The mathematical check may succeed, but the client
must not label the checkpoint authenticated unless the application's independent
acceptance rule succeeds. Then simulate malformed hex: the expected outcome is
an input error, not a truncated digest calculation.

The deliverable is the result schema and a table of display text. Include a
separate statement that the client grants no execution authority. Mark any
browser behavior you have not tested.

### What This Chapter Does Not Establish

Client verification does not establish current revocation state, trusted wall-clock
time, an index absent from the interface, complete standards compliance, or
execution permission. Its value is a reproducible, scoped check that another
component can interpret without relying on the producer's explanation.

# References and Local Contracts for Part III

Names of third-party sources and literal technical interfaces are retained for
accurate attribution and reproduction. This publication is independent and
does not claim endorsement, sponsorship, or certification by those parties.

- **[I1]** [Amazon Builders' Library, “Making retries safe with idempotent APIs”](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/).
  Engineering background for request identity and retry semantics. Local journal
  and destination guarantees still require their own assessment.
- **[I2]** [PostgreSQL 18, Row Security Policies](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).
  Database-policy behavior and exceptions. Match the deployed database version
  when evaluating a concrete storage configuration.
- **[I3]** [WebAssembly, Security](https://webassembly.org/docs/security/).
  Background on module isolation and host capabilities. A verifier's resource
  limits and the correctness of the host remain separate responsibilities.
- **[I4]** [RFC 8949, Concise Binary Object Representation](https://www.rfc-editor.org/rfc/rfc8949.html).
  Encoding foundations; the local profiles define their precise projections.

Architecture and interface descriptions in this part are based on inspection
of the main workspace, especially:

- `kernel/arkhe-kernel/src/lib.rs` and
  `governance/arkhe-governance/src/lib.rs` for gate paths and resolver requirements.
- `kernel/arkhe-kernel/src/broker.rs` and `broker_sqlite.rs` for reservation,
  dispatch, completion, and feature-gated persistence.
- `kernel/arkhe-core/src/evidence.rs` and
  `evidence/arkhe-wormgraph/src/postgres.rs` for reader and retention contracts.
- `verification/crates/arkhe-verify-wasm/src/lib.rs` for actual exported operations.
- `integrations/verify-mcp/src/tools/verify-artifact.ts`, `verify-mmr.ts`, and
  the adapter tests for status meanings, input bounds, and transport behavior.

## Reproduction and Qualification Note

The gate, certificate, broker, and durable-journal suites were run with the
standalone journal feature enabled during preparation. Their observed counts,
adapter-build results, and packaging checks are recorded in the companion
validation document and source manifest.

The four native suites passed 19 tests. The portable module and adapter builds
completed, and the adapter suite passed 12 tests with no skipped cases. Those
31 tests cover their selected local fixtures and interfaces; the adapter run
used real WASM in a local JavaScript runtime, not a browser session.

The fictional publication integration, database-backed adapter exercises,
production isolation, real external effects, and browser UI were not exercised
by those local library tests. This installment does not convert proposed
acceptance criteria into executed results.

Part IV will build on these boundaries to discuss policy ownership, changing
trust, adjudication, and costs. Those decisions become easier to inspect when
the implementation reports exactly which check it performed and where its
authority ends.
