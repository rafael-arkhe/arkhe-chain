# Part VI — Appendices

## A. Glossary and Counterexamples

### Action, Admission, and Authority

**Action.** A requested transition in a system. An action can be proposed,
authorized, attempted, or observed; those states should not be collapsed.
Counterexample: the agent says “published” after constructing a request but
before the destination accepts it.

**Admission.** Acceptance of a statement into the evidence set a particular
profile may rely on. Admission requires an accepted authority and the profile's
checks; storage alone is not admission. Counterexample: an upload endpoint
inserts a well-formed worker record into a table and labels it authenticated.

**Authority.** Permission to make a decision or supply a trusted input within
a scope. Possession of a key may identify an issuer but does not grant every
role. Counterexample: a build-signing key is treated as permission to approve
an unrelated publication target.

**Authorization.** A decision that the applicable requirements permit a request
in the evaluated context. Counterexample: a valid authorization reference is
presented as evidence that the remote effect happened.

**Capability.** Access to a bounded operation or resource, held and enforced
by the relevant host or executor. Counterexample: a tool called “safe publish”
accepts an unrestricted URL and general network credential.

**Complete mediation.** The assumption or enforced property that every relevant
effect passes through the intended control boundary. It must be scoped to
interfaces and resources. Counterexample: the broker checks one tool path
while the agent can invoke another tool with the same publishing credential.

**Fail-closed.** Refusal to grant an operation when required checks cannot
establish acceptance. Counterexample: a missing evidence-store response is
interpreted as no objection. Failing closed does not by itself provide a
recovery or availability strategy.

### Objects, Bytes, and Cryptographic Evidence

**Canonical projection.** The exact fields and value rules that become the
object's identity input. It may differ from its transport representation.
Counterexample: an adapter silently sorts an order-sensitive evidence array.

**Commitment.** A cryptographic binding to specified data under a defined
construction and assumptions. Counterexample: treating a commitment to a
false invoice as proof that the invoice is genuine.

**Digest.** Hash output calculated over defined bytes, often with an application
domain. A digest is neither an issuer identity nor an access-control decision.
Counterexample: two components use identical hex strings but disagree whether
they identify raw content, canonical metadata, or an envelope.

**Domain separation.** Distinguishing the hash or signature inputs used for
different protocol roles. Counterexample: removing a terminating domain byte
because it does not render visibly in a text editor.

**HMAC.** A message-authentication construction requiring a shared secret.
The teaching lab uses it for local approval binding. Counterexample: calling
that approval publicly verifiable when a verifier must also hold a key that
can forge the same tag.

**Signature.** An algorithm-specific binding between a message and a key under
its assumptions. Counterexample: a valid signature is used as proof that the
signer was authorized, uncompromised, or factually correct without additional
evidence.

**Hybrid signature acceptance.** A versioned rule combining multiple signature
components. Counterexample: a profile requiring both components is implemented
as “accept either,” permitting a downgrade. This book specifies no production
hybrid implementation for Arkhe.

**Trusted computing base.** Components and authority inputs whose correctness
or integrity the claim relies on. Counterexample: a proof checker is called
independent while its accepted specification is chosen by the untrusted producer.

### Evidence Structures and Time

**Checkpoint.** An accepted commitment to a particular evidence snapshot under
a profile. Its root and size require an independent basis of acceptance.
Counterexample: copying the submitter's root into a parameter named trusted root.

**Inclusion.** Membership of committed leaf material in a checked snapshot.
Counterexample: interpreting membership as proof of the issuer's honesty or
global agreement on every log view.

**Indexed inclusion.** Membership with a claimed position checked under the
profile. Counterexample: using the membership-only WASM export to announce a
specific mandate index it never receives as an input.

**Consistency.** A relation between histories or checkpoints under a defined
protocol. Counterexample: assuming that two independently valid inclusion
proofs establish an append-only relation between their roots.

**Freshness.** Acceptability for a time or challenge context under a host rule.
Counterexample: an old retained signature is treated as evidence of current
nonrevocation without a current-status mechanism.

**Replay context.** Inputs and environmental observations needed to evaluate
a recorded computation or decision again. Counterexample: deterministic replay
of a policy decision is advertised as physically repeating a publication or
reproducing arbitrary model inference on another accelerator.

**Trajectory.** An execution history within an explicitly observed scope.
Counterexample: an intact chain of recorded calls is described as proof that
no uninstrumented effect or hidden reasoning occurred.

### Effects, Memory, and Economics

**Idempotency.** A defined relation in which repeating a logical request does
not produce an additional intended effect under the endpoint's contract.
Counterexample: a client retries a non-idempotent destination after losing a
response and assumes its local nonce prevents duplicates remotely.

**Uncertain outcome.** A state in which an effect may have occurred but a
safe completed result is not available. Counterexample: creating a new nonce
to avoid an uncertain journal entry and repeat the effect.

**Reconciliation.** An authorized procedure that uses additional observations
to resolve or manage an uncertain outcome. Counterexample: an operator marks
an entry completed with an invented receipt because the queue is growing.

**Equivocation.** Incompatible authenticated statements by the same relevant
authority about the same protocol slot. Counterexample: different revisions
or unrelated providers' outputs are punished as though they were same-slot
contradictions.

**Lineage.** Recorded derivation dependencies of a value. Counterexample: a
summary is released because its text has a public label even though it derives
from a source the requester cannot access.

**Lineage completeness.** The adequacy of the recorded dependencies for the
release rule. Counterexample: a producer omits a sensitive source and a subset
check is advertised as protection against all indirect disclosure.

**Measured cost.** A cost backed by an accepted observation and calculation
contract. Counterexample: a caller sets `measured: true` on an arbitrary entry
and presents the ledger as authenticated metering.

**Unit economics.** Cost attributed to an explicitly defined unit or outcome.
Counterexample: costs of rejected attempts disappear from a reported cost
per successful result without an allocation explanation.

## B. Types, Profiles, and Versioned Contracts

### B.1 Read the Native Main Contracts Together

The main `WorkIntent` identifies the claimed requester, action type, target,
parameters digest, typed and untyped context references, request identity,
and claimed creation time. Its full identity uses the profile's canonical
projection. Its operation identity uses a smaller projection and relies on
surrounding caller/tenant scope where required.

`WorkerExecutionRecord` carries module/version, input/output digests, evidence
references, an execution identifier, and optional operation, classification,
confidence, and uncertainty metadata. The inspected main type does not contain
an object-signature field. Authentication and admission are supplied by the
relevant host protocol.

`EvidenceEnvelope` provides record, kind, subject, payload, optional policy,
and causal-parent fields. Their required meanings depend on the consuming
profile. An analysis envelope and a work-authorization envelope should not be
constructed by copying fields from one another without checking their different
contracts.

`PolicyBinding` is a policy reference, not proof of governance approval.
`EvidenceKindRequirement` restricts allowed modules and operations for the
supported gate path. A resolver can require additional proof or routing.
The acceptance rule is the conjunction of required checks, not whichever
single condition is easiest for the integration to satisfy.

### B.2 Identity Comparison Worksheet

| Change | Teaching request operation | Teaching full identity | Native review concern |
|---|---|---|---|
| Reorder transport map keys | Unchanged after typed normalization | Unchanged if projected values match | Compare actual canonical projection |
| Change content commitment | Unchanged | Changed | Intent/worker/proof binding and journal conflict |
| Change target | Changed | Changed | Approval target and operation scope |
| Change tenant | Changed | Changed | Native host/journal scope must supply isolation |
| Change policy | Request identity unchanged | Request identity unchanged | Approval, certificate, dispatch binding, and current policy are separately affected |
| Reverse order-sensitive references | Not represented by teaching Request | Not represented | Native WER digest changes where order is committed |

The last two rows prevent the teaching model from becoming a misleading
substitute for native semantics. Not every identity binds every condition.
Trace where the policy and evidence commitments are actually checked.

### B.3 Gate Entry-Point Checklist

For the basic method, verify whether the intent is classified as unprotected
and whether its policy requires a proof the path cannot supply. Do not pass
a caller-supplied worker record to bypass protected admission. For the admitted
method, provide the profile's analysis/source relations and accepted reader.
For the routed method, additionally bind the route and applicable human review.

In every path, verify stop behavior, denial, unsupported requirement, missing
evidence, ambiguous references, and changed proposal. A host may map internal
errors to external reason codes, but the mapping must preserve denial and
uncertainty semantics.

### B.4 Budget Certificate Reference

The native budget predicate concerns finite unsigned integer arithmetic under
a host specification. It validates bounds, exact input/output commitments,
prefix derivation, and policy/intent/worker/checker bindings. The envelope
for the checked proof must also have the required admitted relationships.

The certificate establishes neither input truth nor currency units. It is
not a proof that a model ran given weights, a full execution-history proof,
a ZK system, or an effect receipt. A persistent transport must preserve
the full proof and its admitted linkage; retaining only a past boolean is
insufficient for independent rechecking.

### B.5 MMR Profile Reference

The main profile uses byte domains 00 for leaves, 01 for internal nodes,
and 02 for peak combination. Peaks are ordered left to right by descending
height and combined right to left. The size used in peak combination is
`2*n - popcount(n)`, represented as unsigned 64-bit big-endian. Empty trees
are invalid, and a single peak is its own root.

Leaf bytes are opaque. The profile adds neither implicit hex decoding nor
text normalization. Membership and position have distinct interfaces. A
root does not identify its own trusted operator, chronology, or consistency
with another checkpoint. The separate AGI profile must not be substituted
because both structures are called MMR.

### B.6 Dispatch State Reference

The generic native broker journal reserves caller/operation under a dispatch
binding. A completed matching operation returns a retained receipt. An uncertain
operation is not automatically repeated. The optional standalone implementation
adds durable state and handle ownership; payment-specific paths add their
own atomic single-use requirements.

The teaching journal is intentionally simpler. It demonstrates reservation,
completion, replay, conflict, and persisted uncertainty in a local process.
It does not implement native owner-token recovery or a production tenant
access boundary. Its destination's local idempotency is a demonstrator-specific
property, not a guarantee about external endpoints.

### B.7 Foreign Statement Mapping

For an external evidence format, preserve native objects and their identities.
Create a separate versioned mapping document identifying issuer, subject,
policy, observation, sequence, profile, and proof. Define which foreign fields
are direct commitments, semantic translations, or unsupported gaps.

No external draft is implemented by the book's mapping table. A production
adapter would require an exact revision, schema, protected signature transcript,
accepted keys, service proof, and tests against real interoperability fixtures.
Changing a digest algorithm or field spelling changes the statement unless
the protocol explicitly defines an equivalent representation.

### B.8 Cryptographic Agility Decision Record

Use this original template before adding a signature suite:

| Field | Decision to record |
|---|---|
| Scope | New objects, historical evidence, or both |
| Version | Exact envelope/profile and migration boundary |
| Transcript | Bytes and all role/algorithm/key bindings |
| Required algorithms | One algorithm, both hybrid components, or another explicit rule |
| Trust roots | Custody, accepted identities, rotation, and revocation |
| Limits | Key/signature sizes, parser limits, verification budgets |
| Downgrade behavior | Rejection of absent or unsupported mandatory components |
| Compatibility | Which old consumers must reject or remain historical-only |
| Evidence | Known-answer, negative, interop, and deployment tests |

No row should be inferred from the phrase quantum-safe. The standardization
of an algorithm, validation of a cryptographic module, and qualification of
the entire application are distinct decisions.

## C. Implementation, Operations, and Worked Answers

### C.1 Release-Readiness Checklist

1. Define the external effect and fixed capability. Inventory alternate paths.
2. Authenticate caller and tenant outside model-controlled content.
3. Freeze the accepted request, policy, and evidence profiles.
4. Identify exact canonical projections and algorithm/domain inputs.
5. Authenticate and admit evidence before relying on its provenance.
6. Bind review to the exact content, target, operation, and applicable policy.
7. Reject missing, ambiguous, stale, unsupported, and mismatched evidence.
8. Reserve the logical operation atomically before effect dispatch.
9. Preserve uncertainty after dispatch failures or completion-persistence errors.
10. Document destination idempotency and reconciliation semantics.
11. Retain the required objects and policy material with appropriate access.
12. Verify caller/tenant isolation under the actual storage role.
13. Keep portable verification results separate from execution authority.
14. Treat derived memory as a release decision with explicit lineage assumptions.
15. Document policy distribution, rotation, compromise, and recovery authority.
16. Distinguish candidate conflict evidence from an adjudicated finding.
17. Require provenance, units, correction rules, and denominators for costs.
18. Qualify the actual execution environment; do not inherit fixture assurance.
19. Record positive and negative tests, unsupported conditions, and operators.
20. Bind final release artifacts to source, commands, and retained results.

This checklist is an original engineering aid. It is not a certificate, an
exhaustive standard, or proof that a deployed system satisfies all applicable
obligations. Each item needs concrete evidence in the deployment being reviewed.

### C.2 An Incident Runbook for an Uncertain Effect

First contain the affected dispatch path using the approved stop mechanism.
Preserve operation identity, binding, policy, authorization dependencies,
journal state, and destination observations. Do not clear or rename the
operation merely to restore queue throughput.

Second determine which stage was durably observed. Was reservation committed?
Was dispatch attempted? Did the destination acknowledge? Was completion
retained? Distinguish an absent observation from an observation of absence.
A lost response is compatible with an already completed effect.

Third apply the documented reconciliation method. Query only accepted endpoints
under the authorized operator context. Compare destination observations with
the original payload and target. If a corrected or compensating action is
required, give it separate authority and identity.

Fourth retain the reconciliation decision, evidence, responsible person, and
remaining uncertainty. Resume only under the accepted condition for that path.
If the implementation has no safe reconciliation transition, keep that gap
visible rather than using a general database write as an undocumented override.

Finally add a regression case for the relevant failure. A postmortem should
identify whether the gap concerned protocol design, code, credential scope,
storage, destination semantics, or policy. A vague conclusion that the model
was unreliable does not resolve a journal or authority defect.

### C.3 Worked Answer to Chapter 1

The evidence map should identify proposed bytes, approved bytes, accepted
policy, actual executor payload, and destination outcome independently.
Changing the destination after approval fails the target-binding requirement.
If the approval never covered the destination, the worksheet identifies a
contract gap rather than a successful check.

An evidence outage stops requests that require that evidence. Unprotected
drafting may remain available under its own policy, but that does not authorize
publication. The operator investigates the outage through an approved path.
The lab's lost-acknowledgment case supplies the concrete example in which a
local exception cannot be interpreted as no effect.

### C.4 Worked Answer to Chapter 2

The trusted root comes from the host's accepted configuration, not the
evidence package. The full approval must identify the exact request and
accepted policy. A producer's waiver statement has no authority unless
the host's rule explicitly admits a waiver by an authorized actor.

The trusted computing base includes the verifier, encoding rules, host identity
binding, root custody, time context, and executor confinement. The exercise
is incomplete if it says only that signatures are verified. In the teaching
HMAC model, the host and reviewer share a secret; public issuer attribution
is deliberately outside its assurance.

### C.5 Worked Answer to Chapter 3

A suitable control plan includes scope binding, review integrity, and durable
reservation. Each names an owner, test, retained evidence, and response.
The policy-change case requires an explicit decision on existing approvals
and queued work. Old validity does not imply current permission.

The recovery record should preserve both the blocked action and the condition
that permits resumption. If evidence lookup fails, no optional fallback
resolver can replace a required check. The plan may document a restricted
manual process, but it must not claim the current library supplies that
whole organizational workflow.

### C.6 Worked Answer to Chapter 4

`EvidenceReader` retrieves; it does not automatically authenticate every record.
The in-memory committer rejects conflicting envelopes under a record hash;
the persistent committer adds its own consistency and transaction checks.
Admission remains a caller/host obligation under the profile.

The component map must therefore identify who is permitted to populate the
accepted evidence set and who holds the executor credential. A direct
producer-to-executor path is a deployment bypass even when the intended
gate path passes all unit tests. A separate process without capability
restrictions is not proof of isolation.

### C.7 Worked Answer to Chapter 5

Reordering map keys does not change an otherwise identical projected identity.
Changing intent parameters changes the full intent but not the main operation
projection. Reversing committed evidence references changes the relevant
worker digest. Changing target affects the operation and intent where included.

Caller and tenant treatment must be read from the actual native and journal
scope; do not import the teaching model's inclusion of those fields into
the main operation hash. A reused operation with changed parameters should
reach a conflict, not silently receive the stored success receipt.

### C.8 Worked Answer to Chapter 6

The portable package specifies leaf bytes, profile, count, path, and expected
checkpoint. The accepted checkpoint must be independently obtained or
authenticated. A false position requires an indexed contract; membership
alone does not assert it.

Changed leaf bytes or path structure can fail the mathematical check. An
attacker-controlled root may produce a mathematically valid package but
fail the authority decision. A historical proof can remain valid for its
snapshot while providing no present-tense authorization. Those outcomes
should have different explanations.

### C.9 Worked Answer to Chapter 7

A correct certificate satisfies one condition of an allowing decision.
Denied policy, missing required review, absent admitted provenance, or a
stopped gate still prevent authorization. An altered certificate must fail
the independent predicate or its bindings even if a resolver would otherwise allow.

The laboratory executes no external payment. Repeating the same proposal
can produce the same authorization reference without establishing effect
uniqueness. The journal and executor remain separate control boundaries.
The worked comparison with execution research does not change that native scope.

### C.10 Worked Answer to Chapter 8

The valid request supplies one unambiguous analysis reference and matching
source, worker, envelope, and parameter relationships, under an accepted
module/operation requirement. A wrong module is a scope failure; changed
parameters are a proposal-binding failure; missing provenance is an admission
failure. Their reasons should remain diagnosable.

The simple admitted path refuses a routing-required policy. Retrying through
the basic path is not a valid integration strategy. For every negative case,
an instrumented executor should have zero calls on the tested path. That
does not substitute for deployment review of all other effectful interfaces.

### C.11 Worked Answer to Chapter 9

After reservation, a crash before dispatch and response loss after dispatch
can both leave the local record uncertain. The host cannot automatically
distinguish them after restart from the incomplete record alone. A matching
completed operation can return its stored receipt; an uncertain one requires
reconciliation.

Two reservations for the same scoped operation must not both acquire it.
Changed binding is a conflict even if current authorization passes. The
teaching lab demonstrates persisted uncertainty but lacks the native journal's
owner-token protections; do not expose its completion method as a production
reconciliation API.

### C.12 Worked Answer to Chapter 10

Choose the evidence role before assigning envelope fields. For an analysis
record, source and proposed-output bindings differ from those of a
work-authorization record. Atomic retention must include all objects promised
by the receipt. A rollback must not emit a completed receipt.

For memory, an unknown lineage fails the strict teaching rule. A known set
containing a forbidden source also fails. A producer's incomplete but
self-declared set cannot justify a completeness claim. A changed value under
an old lineage record is a binding defect. Database isolation and derivation
completeness require separate acceptance evidence.

### C.13 Worked Answer to Chapter 11

The digest card reports computed bytes, the canonicalization card reports
supported representation, and the membership card reports a relation to
the supplied root. Each lists the checks not performed. None becomes an
authorization card by rendering it in a browser.

Malformed hex is an input error, not a silently truncated payload. A root
chosen by the submitter needs an independent acceptance decision even when
the proof is mathematically valid. A client lacking current revocation
state must not label its result current nonrevocation.

### C.14 Worked Answer to Chapter 12

The dossier identifies old/new policy, authorized revision, effective boundary,
pending requests, and historical interpretation. A replacement key carried
in an untrusted package is rejected unless admitted by the accepted trust
process. An inconclusive verdict does not authorize dispatch.

Already uncertain operations need reconciliation rather than deletion and
resubmission. Historical valid evidence can remain interpretable after
current authority is revoked. No local policy-digest comparison proves that
every replica has installed the same new rule at the same instant.

### C.15 Worked Answer to Chapter 13

Identical retry is not equivocation. Changed parameters under the same
operation are a dispatch conflict. Two authenticated incompatible roots
for one accepted log/slot can form candidate equivocation evidence under
the relevant protocol. Different permitted epochs can make superficially
similar statements compatible.

The immediate containment rule can block a risky action without deciding
intent, human responsibility, or economic loss. No row automatically submits
a sanction. A correct answer names the authority and evidence standard
needed to move from observation to finding.

### C.16 Worked Answer to Chapter 14

The invented batch's total is 600,000 micro-USD. Dividing by ten attempts
and eight accepted outcomes yields US$0.06 and US$0.075 respectively. Costs
of failed attempts stay visible. Zero accepted outcomes produce an undefined
unit ratio, not zero cost.

The minimal ledger can reject arithmetic overflow, but it cannot authenticate
meters, deduplicate billing events, represent negative credits directly, or
decide allocation. A complete evidence sheet marks assumed and allocated
values explicitly and retains quantity, unit, rate, source, and correction
context outside the current ledger.

### C.17 Worked Answer to Chapter 15

Missing accepted completion evidence prevents conversion. Changed candidate
content invalidates an approval bound to the previous identity. Response
loss after release dispatch creates uncertainty rather than automatic retry.
Each failure occurs at a different stage of the chain.

Independent tests come from the host's accepted assessment, not the provider's
completion message. The packet retains baseline, candidate, tests, review,
artifact, and target relationships. Real-environment qualification remains
separate from fixture tests and from documented configuration limits.

### C.18 Worked Answer to Chapter 16

The local composite checks normalized receipt integrity and membership under
the independently accepted checkpoint. It does not authenticate the referee,
arbitration outcome, or physical device. A changed hardware blob invalidates
the commitment without proving the original blob was genuine.

A real integration requires the actual upstream signed transcript, accepted
roles and keys, job/output binding, and qualified fixtures. The package's
own root is not independent trust. Unsupported capabilities remain unsupported;
a permissive mock cannot supply equivalent assurance.

### C.19 Worked Answer to Chapter 17

Keep separate rows for structural decoding, local signature, asset binding,
history interpretation, and publication permission. A bogus signature can
be data inside a canonicalized claim; it must not be reported as verified.
An authentic claim for another image does not authenticate the displayed asset.

Current root status must come from an accepted freshness mechanism. Literal
field-name mismatches require profile-aware handling and an explicit migration
decision, not silent repair of signed bytes. The scoped result should state
what is supported and leave factual truth and release authority to their
separate processes.

## D. References, Reproduction, and Evidence Ledger

### D.1 How to Reproduce the Companion Laboratory

Requirements are a Python interpreter with the standard library and the
companion source files. No API key, external account, database service,
network connection, or production credential is required. From the repository root:

```powershell
python docs/ebook/lab/publisher.py --output docs/ebook/evidence/publisher-demo.json
python -m unittest discover -s docs/ebook/lab -v
```

The demo uses temporary isolated databases and writes the explicitly requested
JSON result. Its destination is local. It reports the arithmetic total,
destination call count, publication count, replay equality, and event-chain
head. The key and identities are fixtures, not production trust material.

The 27 regression cases cover canonical ordering; unsupported floats; operation
and parameter scope; valid, forged, excessive, overflowing, empty, and boolean
cost inputs; review authentication, binding, policy changes, expiry, and target
scope; successful replay; no local effect on denial; stop on replay; lost
acknowledgment; reopen uncertainty; dispatch conflict; permitted, forbidden,
and unknown lineage; and valid, altered, or truncated chains.

Those cases deliberately test both success and refusal. They do not establish
process isolation, complete mediation, production key custody, public signatures,
native protocol compatibility, current revocation, or absence of every possible
input defect. The lab's code is available for inspection precisely so those
boundaries can be examined rather than hidden in a demonstration video.

### D.2 Native Reproduction Commands

Use the repository's pinned lockfiles and declared toolchains. These commands
have distinct scopes; none should be summarized as “all production checks.”

```powershell
cargo run --locked -p arkhe-kernel --example budget_pco
cargo test --locked -p arkhe-core --test golden_vectors
cargo test --locked -p arkhe-kernel --features sqlite-broker --test rejection_gates --test budget_pco --test action_broker --test broker_durable
cargo test --locked -p arkhe-verify-core --test mmr --test c2pa_signature
cargo test --locked -p arkhe-depin --test portable_proof_composite
cargo test --locked --manifest-path agi-coder/Cargo.toml -p agi-coder-tests --test jules_completion --test e2e_mock_jules
```

Portable adapter builds additionally require the supported JavaScript and
WASM build environment:

```powershell
pnpm verify:wasm
pnpm --filter @arkhe/mcp-server build
pnpm --filter @arkhe/mcp-server test
```

Earlier part-specific ledgers preserve their own execution dates and scopes.
The complete edition's report identifies which commands were newly run for
assembly and which results remain historical. The book does not claim new
execution of every command each time a document is rebuilt.

### D.3 New Research: Status and Scope

The supplied review was treated as a set of claims to check. The named
individual agent-evidence drafts and research papers were located. The
important correction is status: a draft with intended Standards Track status
is still work in progress; an arXiv paper is research; a company-maintained
public specification has its own stewardship; a final governmental algorithm
standard defines cryptography but does not certify an application.

The book adds original mapping, migration, and memory-control exercises rather
than declaring that those sources are implemented in the kernel. References
N01–N12 are listed below with primary links. The full research audit accompanies
the editable source package. No external performance numbers are adopted
as Arkhe benchmarks.

### D.4 Release Evidence and Remaining Publication Tasks

The assembled edition includes all 17 numbered chapters, these four appendices,
the existing cover, a navigable table of contents, and the companion source
laboratory. Its build emits HTML, EPUB, editable Markdown, an input manifest,
and a validation record. These artifacts make the text concrete and reviewable.

The author is Rafael Oliveira. The publisher must still confirm rights decisions,
confirm platform disclosures, inspect the edition in the target reading
environment, and choose distribution and price. Structural EPUB conformance
and a readable browser preview do not guarantee acceptance by a publishing
platform. The build report records actual validation rather than claiming
an unexecuted previewer test.

The title's trademark availability is not established by removing third-party
names. Accurate source attribution and literal code identifiers remain in
the reference material. The independent publication makes no sponsorship,
certification, or general legal-compliance claim.
