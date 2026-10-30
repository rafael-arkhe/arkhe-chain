<!-- chapter:1 -->
### Case Study: Interpret Every Row of an Audit Trace

Take a three-step fictional workflow: read an approved source, produce a report,
and request publication. An observer might retain three successful events. The
auditor must decide whether those records support the asserted sequence, not
merely whether the strings contain plausible timestamps.

Start with the source event. Identify the object actually read and the access
context. A path such as `latest/report.json` is a locator, not an immutable
identity. If the file changes before inspection, opening that path later
does not reconstruct the source. Retain bytes under the policy or an immutable
content reference with an actual retrieval arrangement.

Next examine the production event. Bind the result to the source, producer,
operation, and transformation context needed by the claim. A model description
may explain how the report was generated, but its prose cannot replace the
input/output commitments. If generation is nondeterministic, the record can
preserve an observed result without claiming that rerunning the model will
produce the same bytes.

Then examine the publication event. Identify whether it records an attempted
call, destination acceptance, or observation of the published object. Those
are separate event kinds. A local log emitted immediately before an HTTP call
is evidence of local preparation; it is not evidence that the destination
received anything. A response from the destination is another statement whose
issuer and semantics need acceptance.

For each row, use four annotations: observation point, committed object,
accepted authority, and conclusion. If any is missing, write the gap rather
than filling it with assumptions about the application's intended flow. The
result is an audit trace that says what it knows.

Now insert an authorization denial between production and publication. The
recording design should distinguish a denied request from an executed one.
If the producer can still call an unmediated destination interface, a correct
denial record does not establish null effect on the whole system. It establishes
that the instrumented gate denied its request. The enforcement boundary must
exclude the alternate path before the stronger claim is justified.

The teaching laboratory supplies one measurable local consequence. In
`test_denial_has_no_local_effect`, the stopped dispatch produces no row in
the destination. This verifies the tested dispatcher path and local sink.
It says nothing about arbitrary code in the same process, which can access
the classes directly. Treat the test as evidence for the narrower contract.

Finally, ask whether the trace is complete enough for the audit's purpose.
A hash chain protects relationships among recorded events under its accepted
head. It cannot reveal an event that the recorder never observed unless another
accepted source supplies evidence of the omission. Correlating destination
records, journal state, and recorder sequence can reveal discrepancies, but
that comparison needs an actual collection contract and protected observation.

The difference between a durable trace and a trustworthy account is therefore
not a single extra cryptographic field. It is the combination of immutable
object identity, accepted observation, controlled authority, and explicit
coverage. That combination makes investigation possible without requiring the
auditor to believe a model's account of its own behavior.

<!-- chapter:2 -->
### Case Study: A Valid Record from the Wrong Authority

Suppose a test runner signs a statement that its suite passed. The signature
is mathematically valid, and the key is recognized by the organization. The
publication service nevertheless rejects it as release approval. That behavior
is correct if the runner's authority is to report tests, not approve publication.

Represent the authority decision as a relation among issuer, role, object
kind, operation, scope, and accepted policy. A key can have different roles
at different times. An issuer's display name is not enough; neither is presence
in one undifferentiated key list. If every recognized key can issue every
evidence kind, the system has converted recognition into unrestricted authority.

The local HMAC demonstration lets you see the related mistake. Replace the
host's review key with a key supplied by the request and recompute the tag.
The tag can verify under that chosen key. Nothing about the computation makes
the key an authorized reviewer. The correct integration never lets that
untrusted argument choose its own acceptance root.

For a signature-based deployment, prepare an original authority registry with
identity, public key reference, allowed statement kinds, permitted operations,
tenant/domain scope, validity rules, and change authority. The registry is a
design artifact; the book does not claim the main three-field PolicyBinding
implements it automatically.

Consider a second attack: the right reviewer signs the wrong object. The
approval covers a draft's digest, but the host releases a regenerated report.
Issuer authorization is satisfied while object binding fails. A registry
cannot repair that mismatch. The verifier must compare the actual proposed
bytes with the object the approval commits to.

A third attack uses the right issuer and object but a different audience.
Approval for an internal workspace is reused for a public target. Target
scope must be bound and enforced by the executor; simply reviewing the
content is not equivalent to reviewing the audience. In some workflows,
the same content is harmless internally and sensitive publicly.

A fourth attack reuses a correct historical record after the issuer loses
authority. Here the distinction is temporal. Historical authenticity and
current acceptance can have different answers. The host must specify which
question its operation requires and where current status comes from.

These cases show why evidence cannot be given a universal scalar “trust
score.” Several independent predicates may succeed or fail in different
combinations. The implementation should return enough structured context
for operations to diagnose the failed relation without granting a partial
success permission to execute.

For the threat-model worksheet, assign a test or inspection to each relation.
Signature validity gets cryptographic tests. Role scope gets policy tests.
Object and target binding get mutation tests. Current acceptance gets lifecycle
and distribution tests. Credential confinement gets deployment evidence.
This allocation also identifies who must respond when a guarantee fails.
No single team can infer all five from a cryptographic library's successful
verification call.

<!-- chapter:3 -->
### Case Study: Roll Out One Control Without Losing Availability

The report publisher adds exact-content review to an existing workflow.
Operators are concerned that an evidence-service outage will block releases.
The unsafe response would be to let the caller opt out with `skip_review=true`.
That makes the outage path a permanent bypass under producer control.

A controlled rollout separates observation, enforcement, and recovery. First,
define the policy and collect the evidence needed to evaluate it on a fixed
test workload. Measure why existing requests would fail. An observation-only
phase must be labeled nonenforcing; it cannot be advertised as protection.
If private material is involved, the observation phase still needs its own
data-access and retention rules.

Second, enable enforcement for a clearly identified scope. The host, not the
request payload, chooses whether a particular workflow instance belongs to
that scope. Retain the accepted policy revision and deployment identity so
later results can be attributed to the rule actually in use.

Third, prepare an outage response before the first outage. Decide whether
drafting remains available, whether pending publication is queued, which
operations time out, and who may authorize a separate manual process. The
manual process should retain its own scoped approvals and outcomes. It is
not a blanket instruction to disable evidence checks.

Use explicit service objectives for both refusal and recovery. A control
that reliably denies missing evidence but leaves legitimate work blocked
indefinitely creates pressure for undocumented bypasses. Availability should
be improved through redundancy, retention, bounded retries, and accountable
escalation rather than by treating unknown evidence as approval.

The rollout's acceptance review should exercise at least these sequences:
normal request, altered content, unavailable evidence, stale approval, stop
activation, and recovery with a changed policy. Record executor-call counts
on the negative paths. Check queued work again where the protocol requires
current acceptance; a queue is not a time capsule that makes old permission
permanent.

Consider a subtle measurement failure. The team counts only requests reaching
the executor and reports a perfect review rate. Requests rejected earlier
because evidence was missing vanish from the denominator. The resulting
metric describes the subset that passed, not the control's behavior across
all eligible attempts. Preserve both population counts and reason classes.

Governance documents can then refer to inspectable evidence. The statement
“exact-content review is enforced for internal report publication under
profile P” has a deployment scope, acceptance tests, and failure procedure.
It is stronger and narrower than “our agents are governed,” and easier for
another team to validate.

The final rollout decision still belongs to the responsible organization.
The method does not provide a certification or replace analysis of applicable
obligations. It provides a repeatable engineering path from a policy sentence
to an observed control with a defined recovery boundary.

<!-- chapter:4 -->
### Case Study: Join Libraries Without Joining Their Authority

A host application wants to call an analysis module, pass its result through
the gate, retain evidence, and expose a client verifier. It is tempting to
construct one service object with all credentials and give that object to
every module for convenience. That destroys the separation the architecture
was intended to preserve.

Instead, define narrow interfaces for the material each role needs. The
producer receives input and returns a proposal plus supporting data. The
admission component receives host context and verification capabilities.
The gate sees accepted requirements and evidence handles. The executor holds
the effectful credential. A read-only client receives exported material
and an independently accepted verification context.

This is a capability review, not merely a dependency-injection style preference.
If a producer can obtain the executor through a shared object graph, the
intended call sequence can be bypassed even if every normal invocation
uses the gate. The same concern applies across process boundaries when a
network endpoint is reachable with a shared credential.

Write the application's call graph and credential graph separately. The call
graph says which component normally invokes which interface. The credential
graph says which component can actually exercise authority. A discrepancy
between them identifies an architectural assumption that needs enforcement.

For example, the normal call graph may put an HTTP adapter before admitted
evidence lookup. If that adapter holds a write credential to the accepted
evidence store and exposes arbitrary record insertion, the credential graph
reveals a path from caller input to claimed admission. The adapter must
either enforce the admission protocol or lose that general capability.

Do the same for errors. A helper that catches a failed reader call and
returns a synthetic empty envelope has created a new authority behavior.
A fallback resolver that permits an action after the configured resolver
fails has changed the policy. Error handling is part of the architecture,
not a layer that can be added without affecting its guarantees.

The source registry helps verify which implementation is actually used.
A similarly named historical crate may be outside the active workspace.
A client module may load generated bindings from a different path than
the developer expects. An integration test should identify the built module
or artifact it exercises, not simply import whichever matching filename
is available on the machine.

Finally, separate the logical architecture from deployment qualification.
The core can have a pure verification interface while the deployment still
has broad filesystem mounts or unrestricted network tools. A diagram of
libraries does not prove isolation. The completed integration review includes
both the code-level ownership boundaries and evidence that the deployed
environment preserves them for the stated scope.

<!-- chapter:5 -->
### Case Study: Debug a Digest Mismatch Byte by Byte

When two components disagree on a digest, begin below the hash. A hash mismatch
does not tell you whether the error is projection, encoding, domain separation,
or algorithm selection. Comparing intermediate values is more diagnostic.

For a basic CBOR exercise, integer 23 uses one byte, `17` in hexadecimal.
Integer 24 uses the additional one-byte argument encoding, `18 18`.
Integer 256 uses `19 01 00`. The negative integer -1 encodes as `20`.
These are encoding examples, not native WorkIntent vectors. They illustrate
why shortest-integer rules matter at boundary values.

A one-entry map with text key `a` and integer value 1 has bytes
`a1 61 61 01` under the ordinary encoding of those values. The first byte
introduces one map pair; the next two encode the one-byte text key; the
last encodes the integer. A native object contains a much larger projection,
specific byte-string digest fields, and an application domain. Do not compare
its digest to the hash of this illustrative map.

Use a four-stage debugging record. Stage one prints the typed projected
fields without secrets. Stage two compares canonical bytes with a committed
fixture. Stage three compares exact domain bytes. Stage four compares the
algorithm output. The golden-vector suite already checks the relevant native
bytes, domains, and digests, which is why it is more useful than a fixture
containing only a final hash.

Consider a Unicode mismatch. One component preserves the input's UTF-8
sequence while another normalizes visually similar text. The strings may
look identical in a screenshot while their canonical projections differ.
The native profile preserves UTF-8 unchanged; a normalizing adapter must
not silently claim compatibility. If normalized identity is required, define
it at the admitted input boundary and version the effect on existing objects.

Consider an absent optional field versus explicit null. Depending on the
projection, they can be equivalent or different. The WER projection has
its own conditional fields and retained optional metadata. Deriving identity
directly from a serializer's default output can produce a different contract
from the implementation's explicit projection.

Consider a digest represented as a 64-character hex string rather than 32
bytes. Both can describe the same human-readable value, but the encodings
are different. The verifier must know whether it hashes the bytes, decodes
hex first, or commits to the text. Guessing based on length is not a safe
interoperability rule.

The final correction depends on the cause. A bug should be fixed without
regenerating frozen expected values to match the bug. A deliberate protocol
change needs a new version and compatibility decision. A mismatched source
snapshot needs the correct artifact. The debugging procedure is complete
when the two sides agree on the object and bytes they mean, not merely
when someone edits the expected hash until a test passes.

<!-- chapter:6 -->
### Case Study: Compute Three Leaves and Challenge the Root

For three leaf byte strings A, B, and C, compute their leaf hashes using
the main profile's `0x00` prefix. The first two leaves form a two-leaf peak
using the `0x01` internal-node rule. C forms the rightmost one-leaf peak.
There are two peaks, so the root requires peak combination rather than an
extra ordinary internal node.

The materialized node count is `2*3 - popcount(3) = 4`. Peak combination
therefore commits to the `0x02` prefix, the unsigned big-endian representation
of 4, the left peak, and the right accumulator. Replacing 4 with the leaf
count 3 yields a different root. The count is a protocol input, not a
display convenience.

For leaf A at index zero, the path first supplies B as the right node
sibling, then C as the right peak accumulator. For C at index two, there
is no within-peak node path; the proof supplies the left peak for the
combination. The shape differences reflect the target peak and do not
mean one proof is missing a binary-tree level.

Now test the statement you want to make. If you need only membership,
the supported membership operation reconstructs the root under a valid
shape. If you need the exact position, the indexed operation must check
the target index and implied directions. The absence of an index argument
in a client API is evidence that the API is not asserting that field.

Next change the accepted checkpoint. A mathematically correct proof under
the old root does not match an unrelated new root. A proof produced before
append still refers to its original snapshot, even if the underlying log
has grown legitimately. The consumer needs a matching historical acceptance
rule or a refreshed proof; it cannot simply replace the expected root
and keep the old path.

Finally, let the producer choose both the root and path. Verification may
succeed perfectly. The authority decision still has no independent basis.
This is why tests for a false root and tests for an untrusted but self-consistent
root exercise different failure classes. One fails reconstruction; the
other may pass reconstruction and fail checkpoint acceptance.

The accepted snapshot should identify enough scope to prevent a root from
one tenant, stream, or profile being used as another's evidence. A root
alone is not a universal object identity for every application context.
Specify where log identity and policy are authenticated in the particular
checkpoint protocol rather than assuming the MMR mathematics includes them.

The exercise can be performed with the native helper and inspected fixtures,
but the book does not introduce a new frozen vector from this prose
walkthrough. Use the committed profile and test artifacts for exact expected
hashes, and retain the source snapshot used by any independent implementation.

<!-- chapter:7 -->
### Case Study: Derive the Arithmetic Predicate and Its Limits

Let the input contain n costs, with n between one and the trusted maximum.
Let s be a sequence with n+1 entries. The checker accepts only if s begins
at zero, every next value is the previous value plus the corresponding
cost, every sum stays inside the unsigned domain, and the last value equals
the declared output and is at most the trusted limit.

The correctness argument is finite induction. The base value represents the
empty sum. If the value at position i equals the sum of the first i costs,
the checked next step equals that sum plus cost i. Therefore the final
value is the exact sum of the full accepted list. This explains the
predicate; it does not mechanically prove the checker implementation.

An adversary can attack more than addition. It can supply a valid derivation
for a different cost list, a different specification, or a different request.
The certificate's identity bindings prevent those transfers when the host
supplies the accepted intent, worker, and rule. A checker that validates
only internal arithmetic would accept many irrelevant correct statements.

In the teaching model, the cost list is compared with the request's expected
costs, the approval covers the full request and policy, and the authorization
commits to the independently checked proof identity. The native model uses
its own richer bindings and admitted envelope. Both demonstrate that proof
validity is relational: the proof must concern the statement the consumer
actually needs.

Now consider a missing cost. The remaining list can have a valid arithmetic
certificate and remain within budget. The checker cannot detect an invoice
that never appeared in its accepted inputs. The source's completeness and
truth are separate authority claims. A production spending control needs
an accepted cost source as well as arithmetic.

Consider a false unit. A value labeled dollars by one component and cents
by another can satisfy the same integer inequality and imply a hundredfold
difference. The native budget specification does not authenticate a currency
merely by containing an integer limit. Define units and conversions at the
integration boundary and include the necessary binding under the relevant
profile.

Consider a changed policy after checking. A certificate valid under a limit
of 100 cannot justify execution under a new limit of 80. Snapshot or recheck
the accepted specification as the implementation requires. Do not store a
generic `verified=true` flag divorced from the rule and request it concerned.

Finally, consider a valid proof with a denied operation. The system can
correctly accept the arithmetic relation and reject authorization. That is
not a contradiction. The result states that one necessary property holds
while another required condition fails. A precise interface preserves both
facts instead of forcing all evidence into one universal success bit.

<!-- chapter:8 -->
### Case Study: Construct and Reject an Analysis Envelope

Begin with a source report identified by S and a worker record identified
by W. The worker declares input S and output O. The intent proposes parameters
O and contains exactly one analysis reference W and one source reference S.
The admitted analysis envelope's record and payload identifiers are W, its
kind identifies a worker record, and its subject is S.

Those values form a set of equalities, not a collection of arbitrary labels.
The gate checks them so that the worker, admitted statement, source, and
proposed parameters all describe the same relation. The policy separately
checks whether the worker module and operation are allowed.

Now change only the envelope subject to T. The record can still be well
formed, present in storage, and keyed under W. It no longer establishes
the source relation required by this request. The correct outcome is
binding rejection before the effect, not a best-effort assumption that
the source probably matches because the worker identifier looks familiar.

Change only the worker output to Q. That changes the worker's identity and
breaks the old reference; even if an adapter rebuilds the reference and
envelope, the output must still match the intent's parameters. Local
consistency of the replacement objects is insufficient if they no longer
describe the approved proposal.

Add a second analysis reference. Selecting the first is unsafe because
transport ordering or an adapter's sort could change which record controls
the decision. The inspected analysis-reference helper rejects missing and
ambiguous entries. The host should preserve that behavior instead of
normalizing away the ambiguity without a defined protocol rule.

Supply a certificate from another worker. Its arithmetic may be correct,
but the gate's exact worker/request/policy bindings must still fail. This
is a distinct test from corrupting the arithmetic. Include both in an
integration suite so a producer cannot exploit a verifier that checks a
certificate correctly but for the wrong subject.

After these comparisons, consult policy and route requirements on the
supported path. A recognized module still needs the required operation
label; a review-required policy still needs routed human evidence; a
stopped gate still rejects. The native tests show that one accepted object
does not waive the remaining conditions.

For production admission, also verify the caller of the evidence reader
and writer. An untrusted in-memory implementation that synthesizes every
matching envelope can satisfy equalities without authenticating provenance.
The gate checks a contract whose admission source is an explicit host
assumption. Secure integration must preserve that assumption through
credentials and controlled interfaces.

<!-- chapter:9 -->
### Case Study: Race Two Executors and Review Recovery Ownership

Suppose two worker processes receive the same queued operation. Both have
the same correct authorization evidence. If each checks whether a journal
row exists before either inserts it, both can observe absence and dispatch.
Authorization correctness has not prevented a reservation race.

The reservation must atomically compare the scoped key and binding and
establish the state that permits one attempt. In the native standalone
implementation, an immediate transaction performs the relevant lookup and
insert. Its concurrency fixture uses independent connections and verifies
that only one acquires the slot. The test's scope is the local journal,
not an arbitrary remote service.

Completion ownership prevents another subtle failure. Process A acquires
a reservation and begins work. Process B later opens the same database.
If B can mark the operation completed with invented bytes, the receipt
ceases to be evidence of A's observed result. The native optional journal
tracks ownership in the handle and checks the corresponding owner token
when completing the uncertain row.

The teaching journal intentionally omits this stronger ownership rule. Its
purpose is to expose persistence and uncertainty with a small readable
implementation. This is why the book repeatedly separates it from a
production broker and why copying it without the stated limitations would
change the claim.

Now introduce a lease. A lease can coordinate work before dispatch, but
expiry alone cannot establish that an external effect did not occur.
The preview profile explicitly distinguishes pre-start recovery from a
running operation whose outcome becomes unknown. A fencing value is useful
only where downstream state changes check it; a number included in a log
does not stop an old process from using a still-valid external credential.

If the destination supports idempotent submission, the executor should use
the same destination key under its actual contract. If the destination
does not, the local protocol should preserve uncertainty and limit retries
accordingly. Local reservation and destination idempotency are complementary
mechanisms with different failure domains.

For an operational drill, kill only the simulated flow at controlled points:
after reservation, after local sink commit, and after journal completion.
Observe which state survives each handle restart. Do not use real destructive
process or host experiments merely to illustrate the concept. The automated
lab injects exceptions at a known safe boundary and isolates all database
files in its temporary workspace.

The completed recovery design should say who can inspect outcomes, who can
authorize a correction, and which interface performs it. It should not
include a generic “force success” switch exposed to the agent. A queue
that cannot recover safely is a design gap to resolve, not a reason to
weaken the evidence for completed results.

<!-- chapter:10 -->
### Case Study: Keep Atomic Retention Separate from Source Truth

A persistent authorization receipt promises that specified objects were
retained together. To implement that promise, validate the relationship
before opening or committing the transaction, require parents under the
profile, insert canonical objects, insert the envelope, and return success
only after commit. The inspected native `commit_work` path follows a
specific version of that pattern.

It expects a worker whose input is the intent digest and an envelope of
kind `work-authorization` whose subject and payload match the intent and
worker identities. This is not the same as the analysis-envelope pattern,
where worker input is a source-report identity. A generic adapter that
uses the same assignment helper for both can produce consistent-looking
objects with the wrong semantics.

Write an insertion trace with object identities rather than only table
names. Which object is stored first? Which parents must already exist?
Which failures roll back all new objects? Which existing matching objects
can be reused? Which conflicting object must cause rejection? The answers
define the receipt's idempotency behavior and what a caller can infer
after a retry.

The database also needs an access model. Application filters are useful,
but tenant isolation should be tested under the intended restricted role,
including a query that omits the filter. The native connection path refuses
administrative and row-security-bypass privileges; that check supports
the deployment model but does not make the database immune to every
administrator, backup operator, or schema change.

Memory integration introduces a separate source-truth problem. A derived
value can be retained atomically with a lineage envelope and still have
incomplete lineage. Transaction integrity preserves the supplied relation;
it cannot discover a source that an untrusted producer omitted. For
stronger claims, capture dependencies at an accepted source-read boundary
or use transformations whose derivations are inspectable under the policy.

The strict teaching `memory_read` rejects unknown lineage rather than
guessing. An empty lineage set and `None` have different meanings: the
former asserts no dependencies; the latter says dependencies are unknown.
If a producer can falsely assert the empty set, the trusted-recorder
assumption fails. The host should not infer completeness merely because
the serialized field exists.

A production adapter's acceptance report should therefore contain both
retention integrity and provenance status. It may legitimately say that
an object was durably stored while declining to admit it as evidence
for a protected action. Storage APIs and user interfaces should preserve
that distinction instead of treating every stored row as approved truth.

<!-- chapter:11 -->
### Case Study: Upgrade a Verifier Without Rewriting History

A reviewer used portable verifier version A to inspect a retained package.
Later, version B adds a stricter schema check. The new verifier rejects
the old package. That does not automatically prove the original record
was fabricated; it establishes a difference in accepted profiles or
implementation behavior that needs investigation.

Retain the original verification record with the verifier artifact identity,
profile, input commitments, supplied trust context, and outcome. Record
the reevaluation under B as a new observation. If the stricter behavior
fixes a bug, the incident process decides which historical decisions are
affected. Replacing the old result destroys evidence of what the system
actually accepted at the time.

Version selection is also a security boundary. A package should not request
an obsolete permissive verifier and thereby control the reviewer's acceptance
rule. The reviewer chooses supported profiles and versions under host
policy. A profile identifier in untrusted input is something to compare,
not an instruction to load arbitrary code.

For the current portable adapter, compare result semantics as carefully
as bytes. Digest computation reports `DIGEST_COMPUTED`; claim encoding
reports `CANONICALIZED`; membership reports its scoped proof result.
An old consumer that expects a universal `valid` field may misunderstand
the newer result contract. Version the consumer and ensure it rejects
unsupported interpretations instead of treating missing fields as success.

The browser bundle requires similar artifact control. If an application
serves new verifier code while displaying an old cached trust list, the
user may receive an inconsistent review context. A fixed deployment
should identify both resources and their update policy. Offline operation
is useful, but offline freshness is bounded by what the client actually
retained and accepted.

No UI color can resolve those semantics. A clear display should state
which operation ran and which authoritative inputs it received. It may
show a mathematically accepted path under a historical root while warning
that current status was not evaluated. This is an accurate technical
result, not a failed attempt to make every package universally valid.

An integration regression test can load a retained supported fixture,
run the actual generated portable module, compare the supported output,
and exercise malformed and unsupported inputs. Separately test the user
interface that consumes the result. The local adapter suite does the
former within its runtime; it does not establish behavior in every browser
or prove that a particular release screen has interpreted the result correctly.

<!-- chapter:12 -->
### Case Study: Revoke a Reviewer While Preserving Auditability

A reviewer key is removed from current release authority at time T. There
are three categories of records: approvals created before T and already
used, approvals created before T but not yet used, and approvals whose
claimed issuance time is after T. A lifecycle policy must state how
each is evaluated and which timestamps are trusted.

For historical completed releases, retain the original approval and accepted
policy context. They support reconstruction of what the host accepted.
Current revocation does not erase that observation. If compromise may
have preceded T, the investigation records the uncertainty and reexamines
affected decisions under a separate process.

For unused approvals, the present dispatch rule decides whether historical
authority is sufficient or current acceptance is required. Neither answer
should be improvised from a key-status flag alone. If current authority
is required, the host must obtain accepted status and reject stale or
unavailable evidence according to its policy.

For purportedly new approvals, authentication still needs to be evaluated
under the accepted role and time rules. A valid cryptographic signature
can remain mathematically valid after revocation. The authorization question
is whether the issuer's statement is acceptable for this use, not whether
the algorithm has stopped verifying.

Now rotate to a new key. The new key's introduction must come from the
accepted change authority, not from a statement signed only by an already
compromised key unless the recovery policy explicitly and safely allows
that relation. Distribution, overlap, and rollback need separate decisions.
Keeping an old key for historical interpretation is not permission to
use it for new actions indefinitely.

The teaching lab shows a smaller local analogue. Changing the policy epoch
breaks the old approval's policy binding. It does not implement a distributed
registry or key-revocation feed. The native trust-lifecycle notes likewise
distinguish qualification preparations from actual approved external evidence.
Retain that boundary when translating a lifecycle diagram into deployment claims.

An implementation-ready change record contains old/new accepted identities,
scope, effective condition, affected queued operations, approving authority,
distribution result, rollback conditions, and retained evidence. A recovery
record additionally identifies the incident, uncertain period, containment,
and resumption decision. These records should be retrievable under the
same audit-access rules as the evidence they explain.

The final lifecycle check is behavioral. Attempt one new dispatch with
an old approval, one with an unaccepted replacement root, and one with
current complete evidence. Verify both outcomes and executor-call counts.
The first two must not reach the effectful path when the accepted rule
requires current authority. The test result remains scoped to the deployed
profile and status source it actually exercised.

<!-- chapter:13 -->
### Case Study: Avoid a False Finding from a Revision

An analysis service issues result A, then corrects it to B after receiving
new evidence. A monitoring process sees two signed outputs and reports
equivocation. Whether that finding is correct depends on the protocol's
revision semantics, not on the mere difference between A and B.

If the service's contract permits a versioned sequence with explicit
supersession, A at revision 1 and B at revision 2 may be compatible.
If it prohibits two different decisions for one fixed immutable slot,
two authenticated statements for that slot may be incompatible. The
case needs the accepted rule, not a guess based on output text.

Define the comparison key before grouping messages. It may include issuer,
role, tenant or namespace, object, slot, and epoch. A bare `OperationId`
from another workspace may have different scope or construction. Grouping
unrelated messages can produce false accusations; failing to group truly
same-slot messages can hide contradictions.

Authentication is also a separate stage. An attacker can submit forged
statements with a victim's display name. The detector should retain the
candidate while refusing to attribute it until the required signature,
key, role, and context checks succeed. A malformed or untrusted statement
can be an attack on the evidence service rather than evidence against
the purported issuer.

For checkpoint cases, compare root, count, log identity, and accepted
temporal scope under the subsystem's protocol. A smaller count can be
rollback, while the same count and different roots can be incompatible
statements. Growth needs its defined consistency evidence. A valid leaf
proof under each root does not resolve the fork question.

Keep the adjudication output precise. It can state that the evidence
supports incompatible authenticated statements without claiming to know
who operated a compromised key or how much damage resulted. Intent,
causation, and economic liability require additional standards and evidence.
The book's pending sanction contract should not be filled in by an
automatic assumption that every protocol conflict is punishable fraud.

A case-management review should preserve original bytes, decoded views,
trusted roots, policy revision, verifier identity, observations, decision,
and appeal or reconsideration context where the organization defines it.
If a later parser fix changes the interpretation, retain both findings
with their basis. This lets another reviewer reconstruct the conclusion
without accepting an unexplained boolean from the first detector.

The worked answer is complete when it identifies which relation failed,
what containment is justified, which authority may decide next, and
what remains unknown. That is more operationally useful than a penalty
trigger whose evidence contract cannot distinguish a legitimate correction
from a contradictory immutable statement.

<!-- chapter:14 -->
### Case Study: Audit the Cost of an Uncertain Operation

An operation is authorized, verification runs twice, the destination accepts
the request, and its response is lost. The journal remains uncertain.
An accountant looking only at completed journal entries would omit all
of those costs. That can make the service appear cheaper precisely when
it is accumulating difficult unresolved work.

Define an accounting interval and include every accepted cost observation
within it, regardless of whether the business outcome is already known.
Group by logical operation and attempt, but preserve unique accounting-event
identity for deduplication. A single operation can incur several legitimate
checks without performing several effects.

For a hypothetical event, record quantity, unit, rate reference, amount,
source observation, and allocation rule. If the source supplies billed
currency different from the ledger's micro-USD, retain the conversion
basis instead of silently rounding a decimal string. The native minimal
ledger stores the resulting integer; it does not perform that reconciliation.

The `measured` flag should be treated as a claim requiring external support.
A reviewer should be able to follow it to a meter, bill, supervisor observation,
or other accepted record. A category called `verified_compute` cannot
establish either measurement or computation correctness merely by its name.

Now introduce a provider credit. Because the inspected amount type is
unsigned, a negative correction cannot be directly represented as another
ordinary entry. A wrapper can maintain separate charge and credit records
under an approved correction model. It should link the credit to the
original event and preserve both rather than deleting history. This is
additional accounting design, not a method already implemented in CostTracker.

The worked batch in the chapter is intentionally invented, so every
figure remains assumed or allocated. The arithmetic check confirms its
sum and ratios. It does not establish a service's actual overhead or
the price a buyer will accept. For a real comparison, measure the same
workflow, acceptance criteria, workload, environment, and outcome definition
on both sides.

Reporting should include at least total observed cost, unknown categories,
allocation basis, attempts, accepted outcomes, unresolved operations, and
the period covered. A falling cost per accepted outcome is meaningful
only when its numerator and denominator remain comparable. Omitting expensive
failures or shifting work to unmeasured human review changes the comparison.

Use the result to make a bounded decision. It may justify reducing
repeated immutable parsing, improving a retry policy, or funding better
reconciliation. It cannot justify ignoring required review because the
spreadsheet becomes more attractive. An optimization should preserve the
same control contract or explicitly declare the changed risk decision.

<!-- chapter:15 -->
### Case Study: The Patch That Changes Its Own Evidence

A coding agent proposes a fix and also modifies the test that would have
caught a regression. Its provider reports success. If the host simply
runs whatever tests the candidate supplies, a passing result may establish
only that the candidate made its own acceptance easier.

The assessment contract should distinguish trusted requirements and tests
from candidate-controlled source. Not every project can maintain a completely
independent test suite, but the accepted evaluation must say which material
the candidate may change and which observations remain outside its control.
Retain the baseline, patch, selected tests, runner, command, and candidate
identity together.

The session converter does not solve this problem by itself. It accepts
independently supplied test context and emits an unsigned work record.
It is the host's responsibility to ensure that context actually came
from the accepted assessment. Passing a provider's “tests passed” string
into a typed result field changes its representation, not its authority.

The fixed preview command restricts one execution interface, while the
qualification and staged-source requirements address separate deployment
assumptions. A fixed command still invokes build scripts and tests from
the candidate environment under its toolchain behavior. The host must
qualify that execution scope; it cannot infer safety solely from the
absence of an arbitrary shell-command parameter.

For the fictional subtotal patch, retain below-limit, exact-limit,
above-limit, and overflow assertions under the accepted test source.
Compare the candidate's changes with the allowed scope. If it alters
unrelated authentication or release configuration, the review should reject
or escalate under its explicit policy even when the arithmetic tests pass.

After building the artifact, bind its identity to the candidate and build
context. A subsequent packaging step can change bytes; sign or approve
the actual release object at the correct boundary. Releasing a locally
renamed file from a mutable directory without comparison reintroduces
the same mismatch the source-evidence chain was meant to prevent.

Finally, observe the destination. A release receipt may confirm upload
but not activation, rollout completion, or user-visible behavior. Define
the deployment claim the application needs and retain the matching observation.
Do not extrapolate a local mock service's successful response to a real
deployment's entire lifecycle.

The complete use case is a chain of scoped evidence: provider observation,
host assessment, review, build correspondence, authorization, dispatch,
and destination result. The book's local tests cover selected links;
the deployment must implement and qualify the remaining links rather than
call the whole chain complete because one familiar API returned success.

<!-- chapter:16 -->
### Case Study: A Real Signature Would Still Not Settle Everything

Imagine replacing the synthetic referee signature with a genuine one under
an accepted provider key. That would improve one claim: authenticity of
the signed statement, provided the exact transcript and role are verified.
It would not automatically establish that the claimed physical device
executed the workload or that the arbitration's assumptions hold.

The integration must identify what the referee actually signs. Is it a
task identity, output commitment, disputed operation, accepted decision,
or all of them? A signature over a task label without output binding
cannot authenticate an arbitrary output later attached by an adapter.
A valid receipt from another job cannot be transferred because its format
looks identical.

Likewise, a hardware report can authenticate a measurement while leaving
the job correspondence unresolved. A challenge or report-data binding
must connect the accepted hardware evidence to the particular workload
and key where the platform/profile requires it. An unrelated valid report
does not prove that this computation happened there.

The native synthetic adapter makes neither authentication claim. Its
normalization and commitment are still useful because they provide a
stable object to retain and test. The error would be to move from that
useful integrity slice to a hardware or correctness statement it never
checks.

For a qualification campaign, freeze the upstream schema and transcript,
accepted roles, verifier, roots, workload identity, output identity, time
and replay rules, and expected negative cases. Retain at least one genuine
fixture whose origin can be explained. A copy-pasted JSON example from
documentation is not necessarily a signed production receipt.

Test each layer separately and then the integration. Structural invalidity
should fail parsing or normalization. Signature failure should fail
authentication. A changed job should fail binding. An unaccepted root
should fail trust selection. A valid authenticated receipt absent from
the accepted log should fail any policy requiring inclusion. These results
need distinct interpretations even if the final action is denial in every case.

Measure operational bounds under that chosen format. A small local DTO
can become a large real evidence package with chains, reports, or proofs.
Transport limits, parsing budgets, and storage policy must be set for
the actual accepted format. The demonstrator's in-memory builder is not
a capacity measurement for a production receipt stream.

The claim matrix remains the central artifact. Mark every relation that
is verified, every trust input supplied by the host, and every unsupported
property. The result can support incremental engineering without pretending
that an absent real-provider or hardware capability has already been supplied.

<!-- chapter:17 -->
### Case Study: Preserve Three Different Kinds of History

A publisher has three histories: the asset's asserted editing history,
the application's verification history, and the operational history of
publication. They can all be useful, and none should be mistaken for
the other two.

An editing-history claim describes transformations under its issuer and
format. Verification history records which checker, trust snapshot, and
profile evaluated that claim. Operational history records authorization,
dispatch, and destination observations. A valid signature in the first
history does not establish that the second used current roots or that
the third published the corresponding asset.

Consider a corrected caption. The asset package is regenerated and receives
new claim bytes. An old verification receipt should not be carried forward
as though it evaluated the new claim. Bind every result to the objects
it actually checked, and record reevaluation as a new event.

Now consider metadata removal. A distribution channel strips the package
from an image while leaving visible pixels unchanged. The absence of
provenance can prevent a particular verification claim, but does not by
itself establish malicious editing. The application needs to report absence
without inventing a finding about intent.

Consider a signed false description. The signature can establish that
the accepted key authenticated the description under the profile. It
cannot establish that the depicted event occurred. Factual evaluation
may need other sources and review, especially where consequences are
significant. The publisher's content policy remains an independent decision.

The local signature profile explicitly leaves provenance and standard
validation unperformed. Its successful result is useful when that is
the supported question. If the application needs complete asset validation,
the correct next step is a supported validator with profile/version and
interop tests, not a broader label on the existing result.

For an archived publication, retain the asset, claim package, accepted
verification context, approval, target, and outcome under the organization's
access and retention rules. A digest alone cannot recover a deleted
asset. A full package can contain sensitive metadata, so retention should
not mean unrestricted public disclosure.

The end-to-end case concludes with a precise record: which asset and
claim were reviewed, which signatures and bindings were checked, which
trust state was accepted, which release rule permitted the action, and
what destination observation supports the reported outcome. That is the
kind of evidence another team can inspect later without trusting the
producer's narrative or an unexplained “authentic” badge.
