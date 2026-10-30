<!-- chapter:1 -->
### Worked Implementation: Reconstruct a Lost Acknowledgment

The companion laboratory gives the report scenario an executable state. Its
request identifies tenant `tenant-a`, actor `publisher`, nonce `request-1`,
target `internal-reports`, content `Reviewed report`, and three costs totaling
100 units. These are fixture values. They do not represent a bill, an actual
customer, or authenticated organizational identities.

The normal path first checks policy, review authentication, and arithmetic.
It then reserves the operation in one local database, writes a simulated
publication into a second database, and records completion in the journal.
The two databases deliberately do not share one transaction. This reproduces
the structural problem of an effect and its local acknowledgment committing
at different places, without sending anything over a network.

Run the demonstration and inspect the persisted JSON:

```powershell
python docs/ebook/lab/publisher.py --output docs/ebook/evidence/publisher-demo.json
```

The output reports `total: 100`, `local_destination_calls: 1`,
`local_publications: 1`, and `replay_receipt_equal: true`. The program requests
dispatch twice. The second request returns the retained receipt rather than
calling the simulated destination again. The count measures calls in this
demo, not global requests to an external service.

Now inspect `test_lost_acknowledgment_is_uncertain`. It sets
`fail_after_effect=True`. The destination commits one publication; the dispatcher
raises an exception before recording completion. The journal is still uncertain.
The next attempt refuses redispatch, and the destination-call counter stays at
one. This is a concrete counterexample to interpreting every client exception
as evidence that the action did not occur.

The event chain in the JSON records the successful demonstration's authorization
and local-effect observations. Each event includes its sequence, previous hash,
kind, body, and own hash. `validate_chain` reconstructs those hashes and compares
the final value to a separately supplied retained head. Altering an earlier
event or removing the final event fails the check against that head.

Notice the remaining limitation. The chain validator checks integrity and
sequence, not whether an authorization event genuinely came from a complete
reference monitor. A dishonest recorder could omit an action before creating
a new self-consistent chain. If an auditor learns the expected head only from
that recorder after the fact, the recorder can also choose a different history.
The local test proves the checked relationship to the retained head, not global
completeness of all effects.

For an incident worksheet, write three columns: local journal state, destination
state, and admissible next action. Before reservation, the destination has no
effect on this tested path. After the simulated lost acknowledgment, the journal
is uncertain and the destination contains a publication. The admissible action
is investigation, not another dispatch. This is more informative than a log
line whose only field is `status: failed`.

The exercise at the end of the chapter can now be evaluated against actual
state. A correct answer identifies what can be read from each database and
what cannot be inferred merely from the exception. It also distinguishes the
demonstrated local effect from real remote delivery, which the lab does not test.

<!-- chapter:2 -->
### Worked Threat Model: Follow the Trusted Inputs

The laboratory separates untrusted proposed content from several host inputs:
the accepted `Policy`, review key, current time, and emergency-stop flag. Its
`authorize` function compares tenant, actor, and target with the host policy
before accepting the request. Those comparisons demonstrate scope checking;
they do not authenticate a real user. In a deployment, the values must come
from an authenticated request boundary rather than a producer's claimed strings.

The approval body commits to the full teaching-request identity, policy identity,
and expiration. The reviewer tag authenticates that body under a fixture HMAC
key. An altered report changes the request identity, so a valid tag over the
old approval is insufficient. A changed policy changes its identity, so the
old approval also fails under the new rule. The tests exercise both cases.

HMAC deliberately exposes a trust distinction. Anyone holding the shared key
can generate the same kind of tag. It does not provide public attribution to
an independent signer. Giving the key to an agent would let that agent create
its own approvals. Giving it to an auditor would let the auditor forge tags
of the same type. The mechanism is suitable here for a local role-boundary
lesson, not for a public audit-signature claim.

Create an attack table before changing the implementation:

| Attacker action | Tested response | Assumption still required |
|---|---|---|
| Modify reviewed content | Full-request binding rejects it | Host constructs the request it actually executes |
| Supply a different review key | HMAC verification fails | Accepted key is selected independently |
| Change policy epoch | Approval-policy binding fails | Host distributes the new policy correctly |
| Change target to public | Scope comparison fails | Executor cannot reach an unrestricted alternative target |
| Reuse a completed request | Stored receipt is returned | Journal is durable and not bypassed |

The last column is essential. A successful local check does not supply its
environmental assumptions. If a second API lets the agent publish directly,
the checked path can remain perfectly correct while the system is unsafe.

An authority review should therefore examine credential reachability. Inventory
filesystem mounts, environment variables, tool credentials, network endpoints,
and subprocess capabilities. Determine whether the producer can call the sink
without the dispatcher or modify the journal. The teaching code does not create
an operating-system sandbox; the classes are deliberately available to the
local test process. The architecture lesson concerns the capability separation
a real host must enforce, not a security boundary among Python objects.

There is also a temporal trust input. `now=10` is a fixture supplied by the host;
it is not obtained from an independent clock. The expiry test establishes that
the comparison rejects an expired review under the supplied time. It does not
show that an attacker cannot alter a production machine's clock or that every
replica observes a policy transition simultaneously.

When documenting the trusted computing base, include both code and authority
decisions: the parser, canonicalizer, verifier, host configuration, key custody,
credential confinement, and journal access. Then name an owner for each. This
creates a meaningful review artifact rather than an undifferentiated statement
that the system uses cryptography.

<!-- chapter:3 -->
### Turning One Policy into an Operational Control

Take the requirement “reviewed reports may be published internally within a
budget of 100 units.” A control specification must translate every meaningful
word. “Reviewed” identifies the accepted reviewer mechanism. “Reports” identifies
the object bytes. “Published” identifies the effectful interface. “Internally”
identifies the target scope. “Budget” identifies the units and permitted input
source. The integer comparison alone covers only the final part.

The companion lab implements a narrow version with a host-supplied policy,
request-bound approval, arithmetic certificate, journal, and local destination.
Write its acceptance predicate as a conjunction:

```text
scope_matches
AND review_authenticates
AND review_matches_request
AND review_matches_policy
AND review_is_current_under_host_time
AND arithmetic_certificate_checks
AND emergency_stop_is_clear
```

This is a description of the local demonstrator, not a new native Arkhe policy
language. A single false term rejects the authorization. Reservation and
execution follow separately. That ordering allows the test
`test_denial_has_no_local_effect` to check a meaningful consequence: the sink
contains zero publications after a stopped request.

Define the evidence of control operation with equal precision. A passing
regression suite shows selected behavior under fixtures. A deployment record
shows which code and policy were installed. A runtime decision record shows
which checks and bindings applied to one request. A destination observation
supports what happened after dispatch. None substitutes for all the others.

For a control owner, a usable daily report separates causes. Five denials due
to expired reviews call for a different response than five denials due to an
unavailable evidence store. A rising uncertain-operation backlog may mean the
destination needs reconciliation support rather than a more permissive policy.
Metrics should therefore carry reason classes and denominators, with private
payloads retained only where the evidence policy permits.

A proposed deployment acceptance review can use a concrete sequence. Freeze
the intended host profile. Run positive and negative tests against that profile.
Inspect the actual credential paths. Exercise a storage outage and recovery.
Confirm that the operator can identify and preserve an uncertain operation.
Approve the resulting deployment scope, retaining any untested conditions as
explicit restrictions. This sequence is an engineering method, not a legal
conformity assessment or an assertion that the native repository has completed it.

The same discipline applies to memory. An internally published report may
contain a result derived from a salary column that the requester could not
read directly. A label saying “internal” is not a complete release decision.
The host must decide whether derived content inherits restrictions and how
those restrictions are verified. Chapter 10 develops an executable strict
lineage example; it does not infer permission from the fact that a summary is
shorter than its source.

The answer to the chapter exercise should include one unresolved issue, such
as authenticated cost provenance, rather than hiding it. A complete control
record can legitimately conclude “drafting enabled; publication restricted
until the missing authority is established.” Precision about a limitation is
part of implementation, not an excuse to avoid it.

<!-- chapter:4 -->
### An Integration Slice with Explicit Owners

Map the teaching application's objects to responsibilities rather than forcing
them into native wire types. `Request` represents proposed action content.
`Policy` represents a host-owned rule. `review` constructs fixture approval
evidence. `authorize` checks the scope, approval, and arithmetic relation.
`Journal` retains operation state. `Sink` models the effectful destination.
The event-chain helpers illustrate a separate integrity record.

The correspondence is educational. The native WER includes module and evidence
fields not present in the teaching request. The native identity uses canonical
CBOR and BLAKE3 domains, while the teaching code uses deterministic JSON and
SHA-256. Native admitted-evidence lookup is not replaced by the demonstrator's
local approval function. No component in the lab should be exported as a
native Arkhe credential or receipt.

Before integrating a worker, prepare an interface ownership sheet:

| Interface | Trusted owner input | Producer-supplied material |
|---|---|---|
| Request admission | Authenticated caller and accepted tenant | Proposed content and requested action |
| Policy selection | Installed accepted profile | Optional policy reference to compare |
| Evidence admission | Issuer trust and operation-specific checks | Record, certificate, or observation |
| Authorization | Current stop state and required rule | Proposal and its admitted dependencies |
| Dispatch | Fixed executor capability and journal | Parameters already bound by authorization |
| Audit export | Retained checkpoint and disclosure policy | Requested evidence identifiers |

This sheet catches an important class of mistakes: an adapter accepting an
argument named `trusted_key` directly from the same untrusted payload as the
signature it is checking. Parameter naming does not confer authority. The
input must be supplied through the owner-controlled path in the second column.

An architectural dependency also does not imply one mandatory call order for
all records. Supporting analysis is admitted before a protected decision;
authorization evidence may be retained after that decision. An external-effect
receipt comes later still. Describe each object by its role and production
point, rather than saying that every envelope is created before every gate call.

The assembly boundary matters when adding interoperability. A portable export
can retain native canonical objects and carry an additional statement about
their identities. That does not require replacing the native object digest
with the hash of the foreign envelope. The native object, exported assertion,
signature, and transparency receipt have separate identities and trust paths.
Chapter 6 supplies a concrete mapping worksheet.

For implementation review, draw forbidden paths as well as allowed ones. Can
the producer write accepted evidence directly? Can the browser bypass server
authorization? Can a failed reviewer fall back to a resolver that approves
everything? Can an executor choose an arbitrary URL from a model response?
Each forbidden arrow needs an actual enforcement mechanism in the intended
deployment. A repository folder boundary is not one.

The worked architecture is complete when another engineer can identify the
entry point, source of each trusted input, evidence production point, dispatch
capability, and retained state after failure. A list of crates without those
relationships is an inventory, not an implementation explanation.

<!-- chapter:5 -->
### Work the Bytes Before Choosing a Signature

Use a small object to examine the teaching canonicalizer:

```python
canonical({'b': 1, 'a': 2}) == b'{"a":2,"b":1}'
```

Key sorting and compact separators produce the same bytes when transport key
order changes. UTF-8 remains unnormalized. Floats, unsupported values, and
nonstring mapping keys are rejected. This is a teaching profile; it is not a
claim of implementing a general external JSON-canonicalization standard.

The request's operation identity commits to tenant, actor, nonce, and target.
Its parameter commitment covers content and costs. Its full identity commits
to both. Changing content leaves the operation identity unchanged and changes
the full identity. The native main operation projection is different: caller
and tenant scope belong to its surrounding host/journal contract. Comparing
these two designs helps identify scope rather than accidentally equating them.

Here is the native input-review procedure. Locate the type. Locate its canonical
projection. List fields included unconditionally, included conditionally, and
excluded. Check array ordering, null handling, domain bytes, and integer bounds.
Then locate the test that compares expected bytes. Only after those steps
should a reviewer examine the signature or certificate binding.

Changing an identity rule is a protocol migration. Consider adding a required
`destination_class` field. If the old verifier ignores it and the new producer
relies on it, an apparently compatible serialization may carry incompatible
authority semantics. A new schema or profile version should identify what old
consumers must reject, how historical objects remain interpretable, and whether
a conversion preserves or changes the claim.

#### Algorithm Agility Without a Silent Downgrade

Final post-quantum signature standards are identified in references N07 and
N08; their final publication dates are August 13, 2024. Algorithm standardization
does not itself validate a module or require this deployment to use it. The
native profiles inspected in this book remain classical where stated.

For a hypothetical hybrid profile, specify a versioned envelope with an exact
transcript, algorithm identifiers, key identities, and a verifier rule. If
the rule requires both a classical and a post-quantum signature, accepting
either one is a downgrade. The two signatures must cover the same unambiguous
statement, including the profile and relevant algorithm commitments. A parser
must reject missing, duplicate, or unsupported mandatory components.

The proposed migration should include five tests: a valid complete envelope,
one missing signature, an unsupported algorithm, a changed transcript under
one signature, and an old profile incorrectly presented as the new one. It
must also identify who authorizes new roots and how historical signatures are
evaluated after migration. Adding a string naming a post-quantum algorithm to
an unsigned record supplies none of those checks.

Size and operational cost belong in that decision. Larger keys and signatures
affect transport limits, decoding budgets, storage, and verification throughput.
Measure them using the selected implementation and environment; do not copy
a project's advertised overhead into an Arkhe performance table.

This book implements no hybrid signature. The HMAC laboratory remains explicitly
nonpublic and non-post-quantum. The worked migration is a protocol-design
exercise that prevents a discussion of future cryptography from being mistaken
for an existing compatibility claim.

<!-- chapter:6 -->
### Build an Interoperability Mapping Without Relabeling Evidence

Suppose another organization needs a portable statement about a native work
record. Start by exporting the native canonical object unchanged, together
with its profile and digest. Separately construct the foreign statement whose
subject commits to those bytes or their explicitly typed digest. Document
which identity each commitment names. Never recompute the native digest using
the foreign format and call the result the same record.

Reference N01 is a published transparency architecture. Reference N02 is an
individual agent-evidence draft, revision `-00`, that remains work in progress.
It discusses execution records and linked evidence under explicit identity
and policy context. Its status does not make the native Arkhe record a
standard-compliant agent receipt. The useful result here is a mapping and
gap analysis, not a declaration of interoperability.

| Required export concept | Native material that may contribute | Gap that must be resolved |
|---|---|---|
| Subject identity | Canonical work object and its digest | Foreign subject naming and digest algorithm |
| Issuer | Host admission authority | Accepted issuer identity and key distribution |
| Policy commitment | PolicyBinding and retrievable rule | Foreign policy profile and semantic mapping |
| Execution observation | Profile-specific worker/result evidence | Observer coverage and actual effect semantics |
| Ordered history | Stream-specific observations | Sequence, linkage, completeness, and sealing protocol |
| Transparency proof | Profile-specific checkpoint/proof | Accepted service, proof format, and trust policy |

The right column is implementation work. The existence of matching-looking
fields does not discharge it. For example, a WER's execution identifier cannot
automatically stand in for a globally registered logical agent identity.

Reference N03 is also an individual draft. Its useful distinction is between
validating a workload credential and accepting evidence associated with its
identity and policy. A location carried in a credential is not automatically
a trusted evidence source. The containing credential still needs validation
under its own profile. This book uses that separation as a design check; it
implements no claimed compatible HTTP binding or credential extension.

For a hypothetical signed-object export, follow the actual structures and
signature transcript of the selected envelope protocol, such as reference
N04, rather than placing an arbitrary signature field next to JSON. Identify
protected headers, algorithm/key selection, detached or attached payload,
and permitted representations. Signing an export says who authenticated that
export; a service receipt separately concerns registration under its policy.

A complete acceptance procedure would authenticate the accepted transparency
service, validate its receipt, bind the registered statement to the exported
native object, and apply the relying party's issuer and policy rules. A
self-consistent bundle constructed solely by the submitter cannot appoint
its own service as authoritative.

The local event-chain lab lets you test one narrower lesson immediately.
Generate two events, retain their head, and remove the second event before
validation. The retained-head comparison rejects truncation. It does not
show that every tool door was mediated or that the chain was publicly
registered. Converting its SHA-256 event chain into a real transparency
protocol would require a new implementation and evidence.

When a stakeholder asks for “standards alignment,” deliver this mapping,
the exact source revisions, rejected cases, and unresolved gaps. That is a
reviewable engineering artifact. A conformance statement should wait until
the target profile, implementation, and qualification procedure justify it.

<!-- chapter:7 -->
### Follow the Certificate Through an Adversarial Request

The simplest way to misunderstand proof-carrying output is to treat the proof
as an explanation attached to a response. Instead, treat the certificate as
untrusted data and the predicate as a host decision. The teaching producer
`prove` emits a cost list, prefix totals, and final total. The checker
`check_proof` does not invoke the producer. It independently validates the
shape, input relation, base, steps, bounds, and conclusion.

For costs `[20,30,50]`, the prefixes are `[0,20,50,100]`. Replacing 50 with 49
in the prefix sequence is rejected even if the final total remains 100.
The checker does not accept a correct-looking conclusion that is unsupported
by its steps. It also rejects a correct total of 101 under the limit of 100.
These are separate arithmetic-integrity and policy-bound conditions.

Python's type model supplies another useful boundary: booleans are integer
subclasses. The lab deliberately checks `type(cost) is int` so `True` does
not silently become cost 1. It bounds both costs and sums to an unsigned
64-bit domain despite Python's unbounded integers. This mirrors the need
to define an application's domain rather than inherit whatever its host
language happens to accept.

The native example uses its own typed certificate and independent Rust checker.
Its domains, projections, and provenance envelopes differ from the teaching
representation. The common idea is independent checking of a small declared
property. Passing the Python tests is not a native-certificate compatibility test.

#### Compare Output Proofs with Execution Models

Research N05 proposes proof-carrying contracts whose operation gate checks
machine-checkable preservation obligations under an explicit model. Research
N06 treats execution verification in terms of a contract, event stream, and
replay context with stated assumptions. Neither is a proof of every hidden
natural-language reasoning step, nor evidence that the native budget slice
implements those models. Their useful comparison is the different statement
being checked: a bounded output relation, modeled transition preservation,
or properties of an observed execution history.

For this book's own design analysis, write three predicates. The first concerns
the sum. The second concerns the authorization of an operation under current
host inputs. The third concerns whether observed effects correspond to
recorded allowed dispatches. A checker for the first does not establish the
other two. A history checker for the third also needs complete mediation
and reliable observation; an internally consistent trace can omit an unobserved
effect.

This separation provides a practical research-evaluation checklist. Ask which
state transition is modeled, whether tools preserve that model, who controls
credentials, what happens on deny, what counts as the world state, and which
inputs replay requires. If any answer is assumed rather than implemented,
retain it as an assumption in the local claim.

The native authorization reference binds the checked certificate and relevant
objects under its profile. It is not an execution receipt. The teaching
dispatcher likewise performs authorization before reservation and execution.
Its lost-acknowledgment test demonstrates why even a correct predicate and
correct gate cannot manufacture a known external outcome.

<!-- chapter:8 -->
### Implement a Request Path as a Sequence of Commitments

For a concrete host integration, prepare a request context outside model control.
It contains authenticated caller/tenant, accepted policy binding, time source,
stop state, and handles for admitted evidence. The producer contributes a
proposal and candidate supporting objects. Keep those input channels distinct
at the function boundary rather than merging both into one JSON map.

Next, construct the native intent using the accepted identity rules. Resolve
its source report and analysis references exactly once under the profile's
ambiguity policy. Retrieve admitted envelopes and compare record, payload,
subject, worker input, worker output, and parameters as the inspected path
requires. Require allowed module and operation values. If routing is required,
use the routed contract and its bound review evidence rather than downgrading
to the simple admitted method.

For an illustrative admission worksheet, consider four requests:

| Request | Evidence difference | Result before dispatch |
|---|---|---|
| A | All required bindings and policy conditions hold | May authorize under that profile |
| B | WER output differs from intent parameters | Reject analysis/proposal mismatch |
| C | Two analysis context entries | Reject ambiguity |
| D | Correct certificate, but reader cannot supply its admitted envelope | Reject missing provenance |

The distinctions affect operations. B indicates substitution or integration
error. C indicates an ill-defined request context. D can indicate a retention
or transport gap. None should be retried through an entry point that ignores
the failed condition. Keep reason classes for diagnosis while avoiding
sensitive payload leakage in ordinary logs.

The teaching lab compresses this path into `authorize`. Its review authenticates
the request/policy relation and expiry, while its checker evaluates the
arithmetic relation. The tests `test_review_cannot_transfer`,
`test_changed_policy_requires_new_review`, and `test_scope_denial` demonstrate
three separate rejection causes. The native path adds admitted-envelope and
operation-specific requirements not implemented by that local HMAC demonstration.

After authorization, choose exactly what to retain before allowing dispatch.
If the host promises an auditable decision, retain the identity of checked
objects, policy, checker version where applicable, and outcome under an
atomicity contract. If retention fails, do not emit a successful evidence
receipt. This does not create a universal transaction with the destination;
that separate problem is handled by the journal.

An integration test should instrument the executor with a call counter and
assert zero calls on every denied path. This is stronger than checking the
returned error string alone. It still covers only that instrumented path;
the deployment must prevent alternate credentials or interfaces from bypassing
it. The laboratory's counter is a teaching instrument, not a monitor of every
system call on the machine.

Finally, version the host's external result contract. A caller may need to
distinguish malformed input, missing admission, required review, rejected
policy, and temporary infrastructure failure. The distinction supports correct
retries and escalation. It must not turn an inconclusive or unavailable
decision into approval.

<!-- chapter:9 -->
### Execute the Crash Matrix, Not Just the Happy Path

The teaching `Journal.reserve` uses an immediate database transaction. It
checks for an existing operation, compares the retained dispatch binding,
and otherwise commits an uncertain row before returning `ACQUIRED`. The
simulated `Sink` uses a second connection and database. This deliberately
prevents one local transaction from hiding the gap between effect and receipt.

Run the lost-acknowledgment test and follow the state transitions:

```text
authorization succeeds
journal commits UNCERTAIN
destination commits publication
simulated response loss raises an exception
journal remains UNCERTAIN
retry is denied before a second destination call
```

Restarting the journal handle does not change the persisted state. The
`test_reopen_preserves_uncertainty` case closes and reopens it, then verifies
that the retry remains blocked. This demonstrates persistence across a local
connection lifetime. It is not a power-loss or storage-device durability test.

The teaching journal deliberately has no owner-token enforcement on completion.
The native optional journal has a stronger handle-ownership rule discussed
earlier. A production recovery procedure therefore cannot be copied from the
teaching class by exposing its `complete` method to arbitrary callers. That
would let a process invent receipts for reservations it never executed.

The sink itself also rejects changed parameters under the same operation and
can return its previously retained receipt. This is a destination-specific
idempotency property in the demonstrator. It does not justify assuming that
an arbitrary remote endpoint behaves the same way. If a real destination
accepts an idempotency key, determine its scope, retention duration, conflict
behavior, and reconciliation API from that destination's actual contract.

A proposed operator reconciliation record should contain the operation,
retained binding, observed destination result, observation method, decision
authority, and proposed state transition. If the observation is “no response,”
it is not evidence that no effect occurred. If an operator chooses a compensating
action, give that action its own authorization and identity.

Review every retry layer. An HTTP library, queue consumer, reverse proxy,
provider SDK, and agent loop can each retry. Reserving at the broker is useful
only if those layers cannot repeat the effect outside its contract. Avoid
giving the producer a generic tool that calls the destination directly after
a broker error.

The test `test_parameter_conflict` first completes the original request,
then submits changed content with a fresh correct approval but the same
logical operation. Authorization can succeed for the new content, but the
journal rejects the changed dispatch binding. This is a particularly useful
case: the current request may be authorized and still be inadmissible as a
retry of a different reserved operation. Authorization and operation-history
constraints are both necessary.

Do not resolve that conflict automatically by changing the nonce. The old
operation's outcome remains part of the workflow, and the authority to start
a distinct new publication must be evaluated on its own terms.

<!-- chapter:10 -->
### Implement Lineage-Aware Memory Admission

Consider a cached summary: “The division's average compensation increased.”
The summary is plain text, but its derivation used a salary column the current
requester cannot access. Checking only the summary's storage label can allow
indirect disclosure. A memory adapter needs a release rule for derived data,
not only a location-based read permission.

Research N09 studies lineage-gated cached analytical results and explicitly
conditions its guarantee on recorded derivation information. The book does
not copy its implementation or performance claims. The companion example
implements a smaller original rule: an allowed-column set must cover every
recorded source column, and unknown lineage is rejected.

```python
def memory_read(value, lineage, allowed_columns):
    if lineage is None or not set(lineage).issubset(set(allowed_columns)):
        raise ValueError('memory lineage denied')
    return value
```

For a value derived from `orders.total`, a requester allowed that column can
receive the value. Add `staff.salary` to the lineage while leaving the requester's
permissions unchanged, and the same retrieval is rejected. Set lineage to
`None`, and it is also rejected. Those are the tested behaviors, not a claim
that arbitrary prose lineage is reliably discoverable.

The critical input is the lineage recorder. If an untrusted producer can omit
`staff.salary` and assert the set is complete, the subset comparison can
pass while sensitive information still leaks. A deployment must capture
derivation at a boundary that actually observes source reads or require
accepted transformations with known provenance. The code cannot infer missing
sources from a human-readable summary.

A useful proposed memory envelope adds the derived-value commitment, source
identities, transformation/version, tenant, disclosure policy, completeness
status, and observation authority. These fields do not exist in the minimal
memory helper; they define the integration work. Retain unknown and incomplete
lineage as distinct states and reject them where the policy requires complete
source authorization.

Reevaluation is necessary after permission changes. A cached object's existence
does not grant a future requester the source permissions that its creator had.
Likewise, replacing the value's text while retaining an old lineage envelope
must fail the value binding. Cross-tenant reuse requires its own authorization
and must not follow from a matching query string.

This strict rule is intentionally conservative. An approved declassification
or privacy-preserving aggregate may have a different release policy. Such an
exception needs an accepted transformation, disclosure criteria, and authority;
it cannot be inferred from the fact that a result is an aggregate. Repeated
queries, side channels, and correlations can create risks outside a simple
column-set check.

The exercise's adapter specification should therefore add two negative cases:
an omitted source under an untrusted lineage claim and a value changed after
lineage capture. The first identifies an unsupported completeness assumption;
the second is a binding error. Naming the distinction prevents a small
predicate from being advertised as a general solution to multi-agent memory
privacy.

<!-- chapter:11 -->
### Design the Offline Audit Procedure Step by Step

An offline reviewer should begin with an independently retained trust snapshot,
not the package's own claim that it is valid. Record the snapshot identity,
purpose, and time interpretation. A historical inclusion question and a current
authorization question may require different accepted state.

Then inspect the package's declared profile and resource limits. Refuse
unsupported versions and oversized inputs before expensive parsing. Identify
the exact operation being requested: digest calculation, canonicalization,
signature check, or membership verification. Run the supported checker and
retain its precise result, including the expected root or issuer supplied by
the reviewer and the checks it did not perform.

The following result design is original and illustrative, not a new native
adapter export:

```json
{
  "operation": "membership",
  "mathematical_result": "accepted",
  "trust_snapshot": "retained-review-context",
  "checkpoint_authentication": "separate host decision",
  "current_authorization": "not evaluated",
  "external_effect": "not observed"
}
```

This vocabulary prevents an accepted hash path from becoming a permission
badge. A result consumer must process every relevant status instead of testing
whether the JSON object exists or has a truthy field.

The teaching event chain demonstrates why a retained pin matters. A changed
event invalidates its computed hash; rebuilding an entirely different chain
does not help an attacker who must match the reviewer's old head. Without
that retained head or another accepted anchor, the reviewer cannot distinguish
the attacker's new history from the original solely by hashing it.

The native WASM wrapper has narrower interfaces than the entire Rust crate.
Membership exports do not imply index-bound membership or budget-proof
verification. If the application needs those claims, inspect or add the
appropriate wrapper and tests. Do not call a native method name in browser
documentation unless the generated bindings actually expose it.

A browser also adds operational state: cached verifier code, root updates,
local time, content rendering, and user interaction. A local JavaScript-runtime
test validates neither all browser environments nor the safety of a particular
rendering component. Include version and origin controls for the verifier
bundle, and keep execution authority at the host even when the client signs
a scoped review.

For a release test, inspect the same input on both native and exposed portable
surfaces and compare only claims both support. Add malformed data, a changed
root, unsupported profile, and a missing trust snapshot. Mark a candidate vector
as candidate rather than silently freezing it because both implementations
agree. Two implementations can agree on the same mistaken assumption.

The complete offline-audit worksheet ends with a scoped conclusion and unknowns.
For example, it can establish that a committed record belongs to a retained
snapshot while explicitly declining to infer current nonrevocation, payload
truth, or successful remote execution. That is a useful result because the
next reviewer can reproduce exactly what was checked.

<!-- chapter:12 -->
### Apply a Policy Revision to Work Already in Flight

Consider a new rule that reduces the allowed total from 100 to 80. The old
request's costs still sum correctly to 100. The arithmetic has not become
false, but its conclusion no longer satisfies the new policy. A request-bound
approval under the old policy is also not an approval under the new identity.

In the teaching lab, replacing the policy epoch changes its commitment even
when the limit stays the same. `test_changed_policy_requires_new_review`
therefore rejects the old approval. Reducing the limit and obtaining a new
approval still leaves the arithmetic check to reject the total. This separates
policy-version binding from the policy's substantive limit.

A deployment should classify work by production stage when installing that
revision. Unadmitted proposals can be evaluated under the new rule. Authorized
but unreserved work needs an explicit freshness/reevaluation rule. Reserved
uncertain work cannot be erased and resent simply because policy changed.
Completed work remains historical, even if current policy would refuse it.

| Stage at policy change | Required decision | Forbidden inference |
|---|---|---|
| Proposed only | Which accepted policy now evaluates it? | Prior text instructions are permanent authority |
| Reviewed, not dispatched | Must review be renewed? | Old review automatically covers a new policy |
| Reserved, outcome uncertain | How is the existing operation reconciled? | Revocation proves the effect never occurred |
| Completed | Which historical evidence must be retained? | Current denial undoes the past effect |

This is a proposed change-management table, not a distributed consistency
protocol already installed by the library. To implement it, identify the
serialization boundary between policy acceptance and dispatch. Otherwise,
one replica can admit under an old rule while another believes the revision
has become effective everywhere.

For long-lived evidence, include algorithm migration in the same lifecycle.
A historic signature may remain interpretable under a preserved profile,
while new operations require a stronger accepted algorithm set. Re-signing
an old claim today establishes a new statement about retained evidence; it
does not create a trusted timestamp in the past. State the observation and
key-custody assumptions of any archival reattestation.

The strict memory example adds another lifecycle issue. If a requester loses
access to `staff.salary`, previously cached results derived from that source
must be reevaluated under the retrieval rule. The cache's object identity
can stay unchanged while the requester's current permission changes. Integrity
and authorization are independent axes of state.

An implementation review should therefore retain policy history and current
acceptance separately. The source of truth for “what was checked then” is
the historical evidence. The source of truth for “what may execute now” is
the accepted current decision under its freshness rules. This prevents the
convenient but unsafe practice of treating any retained valid signature as
a reusable present-tense permission.

<!-- chapter:13 -->
### Adjudicate Three Concrete Records

Take an operation reserved for content A under policy P. Case one repeats
the same parameters and returns the stored receipt. There is no contradiction
under the reservation contract. Case two supplies content B with the same
logical request key. The journal rejects a parameter conflict. Case three
contains two authenticated checkpoints from the same accepted log authority
and count with different roots. That is a different class of evidence.

For each case, build a decision record with observation, namespace, authority,
comparison rule, containment, and unresolved questions. In case two, the
observation is an attempted binding change. The rule prevents redispatch;
intent and damage are unresolved. In case three, authenticate both statements
and verify the relevant log/epoch scope before concluding they are incompatible.
Do not use the mere appearance of two hex strings as attribution.

The teaching test `test_parameter_conflict` is especially useful because the
new content has a fresh valid local approval. The attempted operation can
meet present authorization conditions and still violate its historical
dispatch binding. A conflict is not necessarily an invalid signature or a
denied policy. Distinct failure classes need distinct investigation records.

Preserve originals, not only normalized comparison rows. If a parser version
was faulty, the investigation may need to reconstruct exactly how the bytes
were interpreted. Retain the accepted policy and roots used in the original
check and identify any subsequent reevaluation separately. Rewriting the
old finding destroys evidence of what the system actually decided.

A proposed adjudication lifecycle can use `CANDIDATE`, `AUTHENTICATED`,
`SCOPED`, `DECIDED`, and `CLOSED` as case-management labels. These are not native
states supplied by the repository. They help separate receiving an allegation
from establishing its authority and deciding a response. Each transition
needs an owner and evidence, especially when the response affects another party.

Reject three tempting shortcuts. Do not let an untrusted reporter select
the trust root that authenticates the alleged contradiction. Do not infer
malicious intent from an implementation mismatch. Do not attach an automatic
financial penalty to a local journal conflict without an accepted adjudication
and economic contract. The repository's pending general slashing work is not
silently implemented by any of those steps.

Containment can still be prompt. Keep the affected dispatch uncertain or
blocked, restrict the implicated authority where the incident policy permits,
and preserve enough availability for investigation. The absence of an automatic
sanction does not imply that conflicting effects should be allowed to continue.
It means the enforcement decision and the finding of responsibility have
different evidence thresholds and owners.

<!-- chapter:14 -->
### Reconcile a Cost Sheet with a Request History

Use the invented ten-proposal batch from this chapter as an accounting exercise.
It totals 600,000 micro-USD, or US$0.60. All attempted work stays in the numerator.
Ten proposals yield US$0.06 per proposal; eight accepted outcomes yield US$0.075
per accepted outcome. The figures are synthetic and are not provider quotes.

Now add three observations. A billing export is delivered twice, an accepted
request is verified twice because the client retried, and a provider later
credits a charge. These events have different semantics. The duplicate export
should not double the same accounting event. Repeated verification may consume
new real resources. The credit needs an explicit correction rule because the
native inspected ledger uses unsigned amounts.

Design an original ingestion record with `accounting_event_id`,
`operation_id`, `attempt_id`, `category`, `quantity`, `unit`, `rate_ref`,
`amount_micro_usd`, `source_ref`, and `status`. It is a proposed envelope,
not additional fields already present in `CostEntry`. The host can deduplicate
by accounting event while grouping separate attempts under one operation.

The minimum reconciliation procedure is to authenticate or otherwise accept
the source, validate units and ranges, compare reused event identifiers,
apply the approved conversion/rounding rule, append the entry, and link any
later adjustment rather than erasing the original observation. Shared service
costs require a disclosed allocation rule instead of a fictitious direct meter.

The ledger's `measured` boolean cannot implement that procedure. It is
caller-supplied metadata. A malicious or mistaken caller can label an estimate
as measured without changing any arithmetic check. The host must retain
the underlying observation and admission decision outside the minimal ledger.

Connect the accounting worksheet to the dispatch history. A completed operation
can have one effect and several verification attempts. An uncertain operation
may have real costs even before its business outcome is known. A rejected
request can consume model, storage, and review resources. Hiding these rows
from cost-per-success reporting can make a failing system appear artificially
efficient.

Finally, separate resource optimization from policy weakening. If a proposed
cache saves repeated parsing of immutable bytes, identify the cache key and
invalidation conditions. If it caches a current authorization, show how trust
and policy changes invalidate that decision. A lower number caused by omitting
required checks is not an equivalent implementation improvement.

The worked answer to the chapter exercise should contain at least one unknown
or allocated category if its source is not actually measured. The best result
is not the smallest total but a total whose source, units, completeness, and
denominator another reviewer can reconstruct.

<!-- chapter:15 -->
### Work a Source Change Through the Evidence Chain

Consider a fictional patch that changes a subtotal check from `< limit` to
`<= limit`. The functional requirement permits an exact-limit amount. Before
accepting the provider's completed session, the host needs a baseline where
the old behavior is identifiable, a patch that makes the intended change,
and tests for below-limit, exact-limit, and above-limit cases.

The completion converter binds the observed provider event to its session
and pre-dispatch operation. It extracts supported patch artifacts and builds
an unsigned record with independently supplied test context. It does not
prove that the provider's patch implements the requirement. That question
belongs to host assessment and review.

An original candidate-assessment table might read:

| Input case | Requirement | Observation to retain |
|---|---|---|
| 99 under limit 100 | Accept | Test and candidate identity |
| 100 under limit 100 | Accept | Regression for the reported defect |
| 101 under limit 100 | Reject | Protection against an overbroad fix |
| Sum overflow | Reject | Arithmetic-domain protection |

These cases describe what the fictional patch review should test; they are
not a report that this patch was applied to the repository. The native budget
tests provide concrete examples of arithmetic-boundary assessment without
requiring a real remote coding session.

After assessment, commit the candidate manifest and test artifacts. The
reviewer approves those identities and the release target. Build provenance
must then connect the released artifact to the accepted source and build
context. If source changes between testing and building, rerun or reject
under the workflow's explicit correspondence rule rather than assume the
artifact is equivalent.

The hardest boundary is often test trust. A malicious candidate can alter
its own tests or print a success marker. The host must define which tests
and result collector are trusted, how candidate-controlled output is bounded,
and which process observes exit status. The inspection of a test suite's
name does not prove that it independently covers the original requirement.

The preview profile's external qualification requirement should remain intact.
A fixture-signed qualification object can test whether the enforcement rejects
tampering; it cannot certify the real execution environment. If the environment
is not qualified, the correct implementation behavior is to stop before
running untrusted code. The book does not manufacture a valid production
qualification for the sake of completing the example.

For release recovery, use the journal principles already developed. If the
destination response is lost, preserve the reserved operation and inspect
the deployed artifact through an accepted method. A completed coding session,
successful local tests, and an approved release do not by themselves establish
that the destination activated the expected version.

<!-- chapter:16 -->
### Trace the Receipt Commitment Through Export and Import

Follow the actual local composite proof rather than infer its guarantee from
the word attested. First, decode the synthetic receipt under the proposed DTO.
Normalization validates its structural relationships and creates deterministic
typed JSON. The receipt commitment covers that payload under a receipt-specific
domain. Next, the composite commitment covers the normalized receipt metadata
and optional hardware evidence under another domain. Finally, its digest
bytes become the leaf payload of the main MMR profile.

Those layers have different inputs. Changing the receipt's claimed completion
time causes the normalized metadata relation to change. Adding an opaque
hardware object changes the composite commitment. Altering a path hash prevents
reconstruction of the original accepted root. The tests exercise those
changes, not merely a successful export/import round trip.

Write the verified statement in full: “This supported normalized composite
matches the committed leaf and membership proof under the independently
accepted checkpoint.” Then write the unsupported statements next to it:
“The referee signed the decision,” “the computation was correct,” and “the
declared physical accelerator executed this job.” No amount of careful
commitment checking turns the first sentence into all the others.

Suppose the included hardware token is a string saying `opaque-unverified-token`.
The local test can preserve that string faithfully and reject later tampering.
It cannot authenticate the token's original issuer. Treating it as verified
hardware because its bytes appear in an inclusion proof would launder an
unverified claim through a sound integrity mechanism.

For a real qualification packet, provide a genuine upstream receipt, schema
revision, signed transcript, accepted referee role, job/output binding, and
rejection cases under actual keys. Hardware evidence needs its own parser,
chain and status policy, freshness, and job-bound challenge where required.
Do not reuse the local DTO as the foreign signed transcript without confirming
that the provider uses those exact bytes.

The case also demonstrates why an unsupported result is valuable. An adapter
can legitimately report normalized receipt plus checked membership while
declaring provider authentication and hardware verification unavailable.
That result helps a host apply a policy requiring stronger evidence by
rejecting the operation. A permissive stub would make the same data appear
complete and undermine the host's ability to distinguish an implementation
gap from successful verification.

No production provider was contacted in the laboratory. The complete worked
case is a truthful account of the implemented synthetic slice and a detailed
qualification procedure for extending it, not a claim that unavailable
infrastructure has been replaced by a mock with equivalent assurance.

<!-- chapter:17 -->
### Read a Provenance Result as a Set of Independent Findings

Use a fictional edited image as the final worked case. Its package contains
a claim, signer identity text, signature bytes, and a trust-root document.
Begin by identifying which verifier is available. Canonicalization can produce
stable bytes for supported claim data. The local application signature profile
can check its own transcript against a supplied accepted key. Full media
binding and complete external-standard validation require separate checks.

The following table is an original reporting design:

| Finding | Possible accepted result | Remaining responsibility |
|---|---|---|
| Input shape | Supported claim/envelope decoded | Resource limits and exact profile |
| Canonical representation | Reproducible bytes | Does not authenticate signature fields |
| Local signature | Transcript accepted under selected key | Root provenance and current status |
| Asset binding | Must be checked by a supported implementation | Native claim signature alone does not supply it |
| History interpretation | Reviewer examines accepted assertions | Completeness and factual accuracy |
| Publication | Host policy authorizes exact content/target | Executor and outcome observation |

Now alter the claim's asserted action without changing its signature. The
signature tests reject that change under the original transcript. Replace
the root with a rogue key under the same human-readable identity, and the
original signature fails. Mark the accepted root as inactive, and the local
profile rejects it under the supplied trust configuration. Those are concrete
checks, not a proof that the trust document is current or legitimately issued.

Next, keep the signed claim unchanged but display a different image. The
application-specific claim signature may remain valid because that operation
is not a complete media-asset validator. The host must not show an unconditional
“image authentic” badge from that result. It must either run a supported
binding check or state that the asset relationship was not established.

The historical digest-field naming mismatch described in this chapter gives
an additional compatibility test. A consumer that interprets a field name
as an algorithm instruction can compute a different value from the existing
profile. Correct handling requires following the versioned transcript or
explicitly rejecting an unsupported profile. Do not silently repair signed
field names in the exported package.

For the final publication decision, retain the exact content, review, policy,
and target commitments. If a claim attests that content was AI-generated,
that is a provenance assertion, not permission to publish it or proof that
its assertions are true. Rights, consent, disclosure requirements, and domain
accuracy belong to their own review process.

The worked result should therefore say which signature and object relationship
was checked, under what trust snapshot, and which release rule was applied.
It should also identify unknowns. That disciplined conclusion is more useful
than a broad claim of authenticity that conceals everything the implementation
did not evaluate.
