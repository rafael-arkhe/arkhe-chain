---
title: 'Arkhe: Evidence and Governance for AI Agents'
subtitle: 'An Implementation Handbook'
author: 'Rafael Oliveira'
lang: en-US
date: 'October 22, 2026'
rights: 'Independent technical manuscript. Author: Rafael Oliveira. Rights and licensing details remain to be confirmed.'
---


# Preface

An agent proposes an action. A person or policy permits it. A service attempts
it. Later, another team asks what happened and why. This book is about the
contracts needed to connect those statements without making the producer's
explanation the final authority.

The subject is practical engineering of evidence and authorization. Arkhe
provides native types and checkers that we inspect directly. A separate offline
teaching application provides a complete small workflow that can be executed,
broken, and inspected without a production account. The application is not a
replacement for the native kernel. Its deliberately simpler profile makes
failure boundaries visible before a reader implements a real integration.

The intended reader is an engineer responsible for systems that can change
external state. Security reviewers, operators, and governance owners will find
the same decisions expressed as evidence requirements, state transitions, and
acceptance procedures. Basic programming and familiarity with API requests,
hashes, signatures, and database transactions are helpful. Formal proof expertise
is not required to run the arithmetic example.

## The Question Each Part Answers

Part I defines the verification problem and establishes who owns each claim.
Part II explains the architecture, canonical identities, inclusion, and checked
output certificates. Part III develops host integration, journaling, evidence
adapters, and client interfaces. Part IV addresses policy changes, disputes,
and costs. Part V applies those principles to code, distributed computation,
and content provenance. Part VI provides a glossary, contract reference,
operational checklist, and reproduction ledger.

Each numbered chapter contains a concrete problem, implementation analysis,
a worked engineering case, and an exercise with acceptance criteria. The
worked cases expand the component descriptions into decisions a reader can
make: which bytes are compared, when a state is durable, what a caller may
retry, how a policy change affects queued work, and which observation supports
a result. This is the complete assembled reading edition, not an outline of
chapters to be written later.

## How the Sources Were Selected

Sources have different roles. Specifications define protocols; original
research proposes methods; maintainers describe their interfaces; operational
accounts expose practical failure modes. An engineering conclusion should
identify which kind of source supports it. When a claim concerns Arkhe's
behavior, local code and reproducible tests take precedence over a description
of another system.

The research cutoff is October 22, 2026. The bibliography retains exact source
names and versions. The two newly discussed agent-evidence profiles are
individual Internet-Drafts, not adopted standards. The cited execution-proof
and contract-proof publications are research, not proof that the local kernel
implements their models. Final post-quantum signature specifications define
algorithms; they do not by themselves validate an application or require a
particular deployment to use a hybrid envelope.

The engineering material is written independently. References explain the
origin and limits of a concept; they are not pasted implementation instructions.
No market-growth claim, claimed performance result of another project, or
vendor assurance level is presented as measured Arkhe capability.

## Two Laboratories, Two Sets of Claims

The native arithmetic laboratory belongs to the main workspace. It uses the
repository's canonical identity rules and independently checked finite
certificate. Run it from the repository root:

```powershell
cargo run --locked -p arkhe-kernel --example budget_pco
```

The companion publisher laboratory is separate:

```powershell
python docs/ebook/lab/publisher.py --output docs/ebook/evidence/publisher-demo.json
python -m unittest discover -s docs/ebook/lab -v
```

It uses only the Python standard library, deterministic JSON, SHA-256, and a
fixture HMAC. HMAC provides a shared-secret teaching mechanism; it is not a
publicly verifiable signature. Its profile is `book-publisher-lab/v1`, not an
Arkhe wire protocol, a COSE envelope, or a post-quantum implementation.
Its simulated destination is a local database, and its databases are isolated
temporary files. It performs no network publication or payment.

The lab demonstrates accepted and rejected authorization, a durable reservation,
receipt replay, loss of acknowledgment after a local effect, lineage gating,
and checking an event chain against a retained head. Its limitations are part
of the lesson: it has no production identity service, owner-token recovery API,
qualified sandbox, or public transparency service. A reader can study these
boundaries without pretending the demonstrator supplies them.

## Read Evidence Labels Literally

An **inspected implementation** is a statement about identified source code.
A **reproduced result** records a command and observed outcome. A **synthetic
scenario** is invented to explain a contract. A **proposed integration** is
additional work, even when its design is detailed. A **qualified deployment**
would require evidence for the actual environment and operational scope; a
passing unit test does not supply it.

These labels are not confidence percentages. They prevent an observation from
being silently promoted into a stronger conclusion. A statement can be
authenticated yet false, included yet stale, authorized yet not executed, or
arithmetically correct yet based on invented costs.

## Independence, Rights, and Publication Details

This is an independent publication. Third-party names appear in references and
literal technical identifiers where necessary for accuracy. They do not imply
sponsorship, endorsement, certification, or permission to use a third party's
marks as a product identity. The cover contains the project title and subtitle.

This manuscript includes AI-generated text and requires the publisher's own
rights and platform-disclosure decisions. The author is Rafael Oliveira, as
supplied by the publisher. No ISBN, copyright ownership, or license is
invented in this edition. The technical
manuscript can be complete while those publication details remain unresolved.
The final publication checklist distinguishes those tasks from writing content.

All examples assume explicit authority to operate the environment used. The
companion lab is designed to run locally without external effects. Commands
that would need real providers, credentials, or qualified infrastructure are
described as integration requirements rather than executed demonstrations.


# Part I — The Verification Problem


## 1. When Logs Are Not Enough

### A Success Message with an Unanswered Question

Consider a fictional document-release workflow. An agent prepares a report and
asks to publish it. A reviewer reads the report and approves the release. Before
the publishing call, the agent regenerates one section. The destination accepts
the resulting document. Every service records a successful step.

The generation log says a report was produced. The review log says approval was
granted. The publishing log says a document was accepted. Yet the team cannot
answer the question that matters: was the published document the one that was
approved?

Nothing in this scenario requires a malicious model. A late edit, stale reference,
incorrect object lookup, or retry can create the mismatch. The defect lies in
the relationship among the steps. Each event can be accurately logged while
the relationship required for authorization remains unestablished.

This distinction is the starting point for the book. Evidence must preserve
enough meaning to connect a decision to the action it was supposed to control.

### Observe the Service and Check the Claim

Monitoring helps operators detect unhealthy behavior and investigate failures.
Metrics, structured events, and traces provide different views of a running
service; reference [4] describes that operational role. They remain essential
when a workflow also uses certificates and signatures.

A claim check asks a narrower question. It might compare the digest in an
approval with the digest of the actual publication payload. A healthy service
can fail that comparison. An unhealthy service can also produce a valid
comparison before failing to complete the external action. Service health and
claim validity must therefore have separate meanings in the interface.

The word “verified” is too vague to carry this distinction. Prefer a sentence
such as: “The publication payload matches the content digest in an approval
issued by an authorized reviewer for this request.” That sentence identifies
an object, an issuer, a relation, and a scope. It also exposes what has not been
claimed: delivery, factual accuracy, or suitability for the audience.

### Replace Status Words with Questions

In the fictional workflow, the status `approved` conceals several conditions.
The approval must identify the content, the request, the reviewer, and the policy
under which the reviewer had authority. If validity is time-limited, the verifier
also needs a trusted basis for evaluating that limit.

The status `published` is equally ambiguous. It could mean the client constructed
a request, the network sent it, the destination accepted it, or a later observer
retrieved the expected content. Those observations are not interchangeable.

An evidence map makes the distinctions visible:

| Question | Evidence to retain | Boundary that remains |
|---|---|---|
| What was proposed? | Exact content or a retrievable object plus its digest | A digest alone does not preserve the content |
| What was approved? | Approval binding the request and content digest | The issuer must be authorized for that scope |
| What rule applied? | Policy identity, version, and digest | A digest does not explain whether the policy was appropriate |
| What was sent? | Executor record binding the actual payload and destination | A local record may not establish remote acceptance |
| What happened remotely? | Destination response or independent reconciliation evidence | The destination's statement has its own trust assumptions |

This table is a proposed design artifact, not an assertion that the entire flow
already exists in Arkhe. It tells an implementer what must be decided before
adding more infrastructure.

### A Hash Is Useful Only When Its Meaning Is Fixed

A content digest can detect that the approved bytes and submitted bytes differ,
assuming the chosen hash and integration behave as expected. But the team must
define which bytes are covered. Is the approval for source text, a rendered
document, an archive, or a reference that may later resolve to different content?

Encoding also matters. If two components hash different representations of the
same apparent object, comparisons can fail even without a meaningful change.
If an important field is excluded from the commitment, changing that field may
leave the comparison unchanged. Chapter 5 addresses the encoding contract.

The target belongs in the contract too. Approval to publish a report to an
internal workspace should not automatically authorize publication to a public
endpoint. A correct content digest cannot repair an approval that omitted the
destination.

### Construct a Small Decision Record

For the fictional scenario, write the acceptance rule before defining a schema:

> Permit publication only when an authorized reviewer has approved the exact
> payload and target for this logical request under the accepted policy, and the
> executor has reserved the operation before attempting the external effect.

The rule contains multiple checks. Content matching is one. Reviewer authority
is another. Policy acceptance, target binding, and operation reservation have
their own failure modes. A single boolean called `safe` would hide these
differences and make a rejection difficult to diagnose.

A useful decision record identifies the checked conditions, the evidence objects,
the policy, the decision, and the component making it. It should not include
private document contents merely for convenience. Where content is retained
separately, the record needs a retrieval and access-control arrangement that
works for the intended auditor.

### Retention Is Part of the Verification Design

Suppose the team retains the approval digest but deletes the approved document
and the policy. Months later, an auditor can confirm that a particular digest
was recorded, but cannot inspect the approved object or understand its rule.
Cryptographic integrity does not solve unavailable evidence.

Retention therefore needs a purpose and an owner. Decide which objects must
remain retrievable, who may read them, how long they are needed, and how deletion
requirements interact with the evidence contract. A digest can still expose
information through guessing or correlation; it is not a general privacy measure.

Historical and current questions also differ. A retained checkpoint may support
an inclusion check against a past snapshot. It does not automatically establish
that an issuer remains authorized today. Evidence packages should state which
time-related question they are designed to answer.

### Rejection Must Be an Expected Outcome

The fictional workflow should reject an approval for a different payload, request,
or destination. It should also define what happens if evidence cannot be read.
Treating a lookup failure as “no objection found” turns an outage into a bypass.

The inspected Arkhe rejection tests provide a concrete, narrower illustration.
`kernel/arkhe-kernel/tests/rejection_gates.rs` checks that protected intents cannot
use the basic path to skip admitted-evidence lookup, and that an emergency stop
rejects before policy resolution. Those are local tests of a gate boundary, not
a demonstration of the fictional publication service.

Failing closed also creates an availability obligation. If evidence is unavailable,
the organization needs a recovery or escalation procedure. Otherwise, operators
may invent an undocumented bypass under pressure. The security model in
`docs/SECURITY-MODEL.md` explicitly distinguishes fail-closed behavior from liveness.

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

### Exercise: Map One Consequential Action

Choose one action, such as publishing a report or changing a record. Write five
sentences: what was proposed, what was approved, what rule applied, what was sent,
and how the remote result would be established. For each sentence, name the
evidence and the component responsible for retaining it.

Then change only the destination after approval. Your expected result should be
rejection before the external effect. If the approval does not identify the
destination, record a contract gap rather than marking the exercise as passed.
Finally, simulate an evidence lookup failure on paper and describe the recovery
path without granting the agent additional authority.

The deliverable is a one-page evidence map with an explicit negative case. It
should allow another engineer to explain which relation failed without reading
the agent's conversation.

### What This Chapter Does Not Establish

An evidence map does not prove that the content is correct, that the reviewer
made a good decision, or that the external destination honored the request. It
provides a structure for asking those questions separately. The next chapter
examines the authorities and assumptions behind each answer.

## 2. Evidence, Trust, and Accountability

### Evidence Is Always Evidence of Something

Imagine receiving a signed statement that a report was reviewed. The signature
verifies. Before relying on it, you still need to know who controls the key,
whether that identity may review this report, which bytes were covered, and
whether the statement applies to the current request.

The signature does not answer all those questions by itself. It supports a
relationship between a message and a key under an algorithm's assumptions.
Organizational authority and application meaning must be supplied by a separate
contract. Reference [6] specifies signature behavior; it does not appoint your
reviewers or decide their scope.

This is why evidence design begins with a claim. “The signature verifies” is
useful evidence for a signature claim. It is insufficient evidence for “this
expense is legitimate” unless many additional facts and authorities are defined.

### Write Claims with a Subject and a Scope

A practical claim has an identifiable subject, a property, and a scope. It may
also require an issuer and a temporal context. For example: “Reviewer identity
R approved payload digest D for target T and request Q under policy P.”

This formulation permits specific challenges. Is R an accepted reviewer? Does D
match the payload? Is T the actual target? Is Q the logical request being
executed? Is P the policy selected by the host? A statement such as “reviewed
and trusted” permits none of those checks until its terms are unpacked.

The application must also state who is allowed to supply each input. A producer
may provide the certificate being evaluated. It should not be able to appoint
its own trusted root or replace the host's acceptance rule. Otherwise, a
self-consistent package can pass while proving nothing about an accepted authority.

### Distinguish the Properties

Several properties often collapse into the word “trust.” Keep them separate:

| Property | Operational question | Common overstatement |
|---|---|---|
| Integrity | Are these the committed bytes? | The content must be true |
| Authenticity | Is this message attributable to an accepted key or identity? | The issuer is authorized for every action |
| Authorization | Does the accepted policy permit this action in this context? | The action was executed |
| Freshness | Is the evidence acceptable for the relevant time or challenge? | A timestamp field is a trusted clock |
| Inclusion | Is this committed item included in the accepted snapshot? | Every observer sees one consistent history |
| Semantic validity | Does the content satisfy the intended domain requirement? | A valid signature or arithmetic check establishes it |

The table is an analytical tool used in this book. It does not define a universal
schema. A system can satisfy one property and fail another. A signed, unchanged
approval can be authentic and still be stale. A valid inclusion proof can refer
to an unacceptable root. A correctly authorized request can fail at the destination.

### Separate the Roles Before Drawing the Services

For the document-release scenario, begin with five roles. The producer proposes
content. The host establishes the trusted inputs and acceptance rules. The
reviewer makes a scoped decision. The gate checks the required conditions. The
executor controls credentials and attempts the external effect.

These roles need not correspond to five deployed services. They represent
authority boundaries. Several may share a process, provided the implementation
does not let untrusted producer behavior acquire the host's privileges. Splitting
the same permissive code into multiple services does not create separation of
authority.

The inspected Arkhe security model states that cognition has neither signing keys
nor a direct evidence-graph writer, and that orchestration schedules without
authorizing. These are architectural constraints to preserve in integrations.
Their presence in a document does not establish that every deployment enforces
them. A deployment review must examine credentials, interfaces, and alternate paths.

An authority table makes the intended boundaries inspectable:

| Role | May provide | Must not decide solely from its own assertion |
|---|---|---|
| Producer | Proposed output and supporting material | Whether its output has been admitted |
| Host | Trusted policy, roots, and execution context | Whether unsupported factual inputs are true |
| Reviewer | Approval or rejection for a defined scope | Whether a changed payload is covered by an earlier approval |
| Gate | A decision under checked conditions | Whether an unobserved external effect occurred |
| Executor | Dispatch and outcome records | Whether an uncertain response permits a blind retry |

### Threats Include Honest Mistakes

A threat model should consider a malicious producer, a compromised reviewer key,
an untrusted evidence transport, and an external destination that returns ambiguous
results. It should also consider ordinary faults: cached policy, delayed messages,
incorrect tenant context, parser disagreement, and lost storage connectivity.

Agentic security guidance in reference [3] is useful as a prompt for adversarial
thinking. This chapter's scenarios are proposed engineering cases, not a claim
to reproduce that publication's taxonomy or to cover every threat it identifies.

One important case is authority hidden in content. A document being analyzed may
contain instructions telling the agent to skip review or call another tool. That
content should remain data at the authorization boundary. Even if the agent
follows it, the host must still require its own policy and evidence before an
effect can occur.

Another case is evidence substitution. A transport may return a well-formed
record from a different request. Shape validation alone will not catch it. The
consumer must check relationships among the record, subject, policy, and action.
The budget-certificate sample provides a concrete instance of such bindings in
Chapter 7; it does not generalize them automatically to every operation.

### The Trusted Computing Base Has an Owner

Independent checking reduces reliance on a producer for the checked property.
It does not remove trust from the system. The checker implementation, encoding
rules, cryptographic libraries, policy distribution, and host integration still
matter. If the executor can bypass the gate, a sound checker does not prevent
an unauthorized effect.

List those dependencies explicitly. Assign an owner to reviewing changes in
each one. A policy digest can identify a rule precisely, but someone must decide
which digest is accepted and how it is replaced. A verifier can reject an invalid
signature, but someone must manage which keys are authorized and for what scope.

This ownership should include recovery. A lost key, compromised issuer, or
unavailable evidence store requires a documented response. Recovery authority
should not silently become general permission to disable checks. An emergency
procedure needs its own scope, records, and review.

### Accountability Connects Decisions to Duties

An audit record can help reconstruct a decision, but accountability also requires
an assigned duty. Someone must own the policy, operate the checker, reconcile
uncertain effects, and respond when evidence is missing. A record with no owner
can remain technically intact while producing no corrective action.

Useful questions include: who receives a persistent rejection alert; who can
stop the workflow; who determines whether a defect invalidates prior decisions;
and who can authorize resumption? These questions are organizational, but their
answers constrain the software. If only one role may resume operation, the
resume interface should enforce that role.

Avoid converting uncertainty into accusation. A conflicting record may indicate
a bug, an incorrectly scoped identity, an attempted replay, or incompatible
signed statements. Sanctions require a defined standard of evidence and a
decision process. A local conflict detector is not, by itself, an adjudicator.

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

### Exercise: Challenge the Authority Table

Use the evidence map from Chapter 1. For every object, identify its producer,
the authority that admits it, and the verifier that consumes it. Then test three
substitutions: an attacker supplies a new trust root with the evidence package;
an old approval is attached to a new request; and the producer claims that the
reviewer requirement has been waived.

For each case, name the input that the host must fix independently. State the
expected rejection and who investigates it. If the same untrusted actor can
both supply evidence and redefine its acceptance rule, record an authority gap.

The deliverable is an authority table plus a short threat model. A useful answer
includes a trusted computing base and a limitation. It should not end with the
assertion that signing everything solves the problem.

### What This Chapter Does Not Establish

These contracts do not prove that accepted authorities are honest or that the
selected policy is appropriate. They make reliance on those authorities explicit.
The next chapter turns those dependencies into controls with owners, evidence,
and a process for responding when the assumptions fail.

## 3. Governance Without Certification Claims

### Begin with the Decision an Organization Must Own

Suppose the fictional report publisher passes every digest comparison. Its
reviewer is authorized, its policy is current under the host's rules, and its
executor records the correct payload. The report can still disclose information
that should never have been released.

The missing element may be a poor review policy, an unsuitable data source, or
an incorrect decision about acceptable exposure. Cryptographic checks make a
defined process more inspectable. They do not decide whether that process meets
the organization's responsibilities.

Governance supplies decisions about acceptable uses, authority, oversight, and
response. To be useful to engineers, those decisions need an operational form:
an owner, a control, evidence that the control was applied, and an action when it
fails. “Human oversight exists” is not enough if nobody can state what the human
reviews or what changes invalidate the review.

### Use a Framework as a Structure for Questions

Reference [1] organizes risk management through GOVERN, MAP, MEASURE, and MANAGE.
It is intended for voluntary use. Reference [2] adds a profile for generative
systems. These resources help structure work; adopting their vocabulary does
not certify a product or establish compliance with every applicable obligation.

For this book, use the functions as prompts. Who sets authority and risk
tolerance? What context and affected parties must be understood? Which controls
can be evaluated? What happens after a failure or a change? The workflow below
is an original engineering example organized with those prompts, not an official
assessment method or an exhaustive mapping of the frameworks.

### Turn the Report Scenario into a Control Plan

Start by defining the workflow boundary. The system proposes a document and may
request publication to a specified audience. Drafting permission does not include
publication permission. A credential capable of publishing belongs to the
executor boundary, not to the proposed text or the model's conversation.

Next, identify affected parties. A report may concern customers, employees, or
partners who never interact with the agent. Their interests will not necessarily
appear in a local success metric. The owner must decide what information may be
processed and released, which reviewers are qualified, and when the workflow
must stop.

Translate each decision into a control that can be examined. “Review required”
becomes an approval for the exact payload, target, request, and accepted policy.
“Prevent duplication” becomes an operation-identity and reconciliation protocol.
“Keep an audit trail” becomes a list of retained objects with access and recovery
rules. Some controls remain procedural and need an assigned human owner.

| Decision area | Proposed control | Evidence | Owner |
|---|---|---|---|
| Authority | Separate drafting and publication privileges | Credential inventory and permitted interfaces | Platform owner |
| Release review | Require approval for exact content and target | Scoped approval and policy binding | Release-policy owner |
| Data handling | Check the release against defined disclosure criteria | Review result and approved criteria version | Data owner |
| Repeated requests | Reserve an operation and reconcile uncertain outcomes | Journal transitions and destination observations | Executor operator |
| Change management | Reevaluate rules after material changes | Change record, tests, and acceptance decision | Control owner |
| Incident response | Stop, investigate, and resume under a defined procedure | Incident record and resumption decision | Incident lead |

The table is a starting design. It does not claim that all these controls are
implemented in the current repository or sufficient for a regulated use case.

### Measure the Control You Actually Operate

A control is difficult to manage if the only metric is “number of successful
agent tasks.” That number hides the difference between useful completion,
rejection, duplicated effects, and unresolved outcomes.

Choose metrics tied to a defined question. To assess exact-content review, count
eligible publication attempts with the required binding checks and record the
denominator. Separately record attempts rejected for a changed payload. To assess
recovery, measure unresolved external outcomes and how long they remain unresolved.
To assess usability, examine unnecessary blocks and the time required to resolve
them through the authorized path.

A denial count alone is ambiguous. It could mean the control is catching attacks,
the producer is making routine errors, or evidence storage is unavailable.
Preserve the reason classes and investigate changes before interpreting a trend.
Avoid embedding sensitive payloads in metrics simply to make debugging easier.

Tests and metrics answer different questions. A negative test establishes behavior
for a selected condition. Production telemetry describes observed operation under
its collection limits. Neither, alone, proves an incident rate of zero.

### Keep a Record of Remaining Uncertainty

Every deployment has questions that its current evidence cannot settle. The
external destination may offer no reliable query for a timed-out request. A
reviewer may lack domain expertise for some reports. A policy may require a
trusted time source that has not been configured. A laboratory adapter may use
synthetic signatures instead of authenticated upstream records.

Those gaps should be visible at the decision point. Record the unresolved issue,
its consequence, the interim restriction, the owner, and the condition for
reconsideration. Calling the issue “accepted risk” without identifying who
accepted it obscures authority rather than resolving it.

One appropriate interim restriction may be to allow drafting while disabling
external publication. Another may be to route a class of requests to a qualified
reviewer. The restriction should match the gap. A strong arithmetic certificate
does not compensate for unverified input provenance, and a trusted reviewer does
not make an unknown external outcome safe to repeat.

### Make Human Review a Defined Operation

A person clicking “approve” is not a complete control. The interface must show
the object and target being approved, the applicable policy, and material limits
of the evidence. If the content changes, the earlier approval should not silently
follow the new payload.

The organization must also define reviewer competence, workload, delegation,
and escalation. A workflow that routinely pressures reviewers into accepting
unread content has a different risk profile from its written policy. Technical
binding can establish which payload received a decision; it cannot establish
that the reviewer exercised sound judgment.

Review is also subject to recovery and revocation. If a reviewer key is
compromised, the team needs a way to limit future use and evaluate the affected
period. Historical verification and current authorization should be treated as
different questions, with explicit rules for each.

### Respond to Incidents Without Erasing Their Meaning

Consider an alert that publication may have used an unapproved payload. First,
stop the relevant path according to the incident procedure. Preserve the
proposal, approval, policy, decision record, executor record, and destination
observations under appropriate access controls. Establish what is known and
what remains uncertain before attempting a corrective effect.

If the destination accepted the content, deleting a local record does not undo
the publication. Retraction, correction, or notification may require separate
authority. The incident procedure must distinguish evidence preservation from
remediation and define who may authorize each step.

Before resuming, determine whether the failure came from a rule gap, an
implementation defect, a credential problem, or an operational assumption.
Introduce a regression case for the relevant condition. Record the decision to
resume and the conditions under which the workflow remains restricted.

This proposed procedure is deliberately concrete. Its usefulness depends on
whether the organization assigns people and access to carry it out, not on
whether an architecture diagram includes a box labeled governance.

### Keep Regulatory Claims Narrow

Legal applicability depends on facts such as the deployment context, jurisdiction,
system classification, and the organization's role. Reference [16] supplies an
official starting point for one regulatory framework. A deployment-specific
conclusion requires the applicable legal text and amendments, not a technical
analogy to a control in this book.

This installment makes no deadline-specific legal claim. It also does not claim
that regulators require Arkhe, that signing outputs satisfies all recordkeeping
duties, or that independent checking constitutes a conformity assessment.

An engineering team can still make a precise statement: “For the tested profile,
the gate rejects publication requests that lack the required admitted evidence.”
It can then supply the test, input, implementation version, and result. Whether
that control contributes to a particular obligation is a separate evaluation.
Keeping those statements separate makes both easier to assess.

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

### Exercise: Write an Acceptance and Recovery Record

Take the evidence map and authority table from the previous chapters. Select
three controls. For each, record the requirement, owner, implementation location,
acceptance test, retained evidence, operational metric, and failure response.
Mark every unimplemented control explicitly.

Now remove the evidence store from the scenario. State which operations stop,
which remain available, who investigates, and what permits resumption. Then
change the publication policy. Explain how the system prevents an old approval
from being accepted merely because it was valid under an earlier rule.

The expected deliverable is a control plan and a recovery record. A reader should
be able to identify an accountable owner and a rejection condition for every
control. An unqualified statement that the system is compliant is not a substitute.

### What This Chapter Does Not Establish

A control plan is not a certification, an audit opinion, or proof that every
relevant hazard has been identified. It connects technical claims to decisions
and responsibilities so they can be tested and revised. With that foundation,
Part II can introduce the Arkhe components without asking the reader to mistake
an implementation mechanism for a complete governance program.

# Part II — The Arkhe Architecture


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

This laboratory uses only the main workspace:

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

# Part III — Implementation


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

# Part IV — Governance and Economics


## 12. Admission Policies and Trust Lifecycles

### An Accepted Record Is Accepted Under a Rule

Suppose the report publisher accepts review records from a qualified reviewer.
One month later, that reviewer leaves the team. An old approval still has a
valid signature, and its payload digest still matches the report. Should the
host accept it for publication today?

There is no universal answer in the signature. The organization must define
whether approval authority is evaluated at issuance, at dispatch, or at both
points, and how revocation affects retained records. The verifier can implement
that rule only after the rule exists.

Admission policy establishes which statements the host may rely on for a
particular purpose. It includes accepted issuers, scopes, versions, evidence
requirements, and any temporal conditions. An admitted statement does not
become an unrestricted fact for every future workflow.

For the fictional publisher, permission to review an internal draft is not
permission to approve its public release. An analysis module authorized to
classify content does not necessarily have authority to attest that publication
occurred. Scope belongs in the policy and the evidence relationships, not in an
assumption that all records from a familiar key are interchangeable.

### Assign Owners Before Automating the Rule

Reference [G1] offers a voluntary risk-management structure. In this chapter,
policy ownership, change review, and operational escalation are original
engineering applications of that general concern, not a certification method
or a complete mapping to the framework.

A practical ownership table distinguishes the authority to propose a policy,
approve it, distribute it, operate it, and investigate its failure. One person
may hold several roles, but the overlap should be deliberate and visible.

| Decision | Proposed responsible role | Evidence of the decision |
|---|---|---|
| Define release scope and acceptable evidence | Release-policy owner | Versioned policy specification |
| Approve a policy revision | Designated governance authority | Approval bound to the policy digest |
| Install the accepted rule | Platform operator | Deployment record and accepted configuration |
| Manage issuer keys and scopes | Trust administrator | Scoped trust-registry change |
| Resolve an admission outage | Incident lead | Incident and recovery decision |
| Review control effectiveness | Independent reviewer where assigned | Reproduction results and unresolved findings |

This is a proposed operating model. The library does not appoint those people
or implement every approval in the table. The value of the table is that a
configuration change can be traced to someone authorized to make it.

### Use PolicyBinding Precisely

The main `PolicyBinding` contains `policy_id`, `version`, and `policy_digest`.
The identifier helps readers recognize a policy family; the version distinguishes
revisions; the digest commits to the policy material defined by the profile.
None of those fields independently proves that governance approved the rule.

The host must select an accepted binding and resolver. If a producer can submit
any policy digest and have it accepted as authoritative, the binding protects
the producer's choice rather than the organization's rule. Retaining a policy
digest is also insufficient for later inspection if the rule it identifies
cannot be retrieved and interpreted.

The resolver interface can require specific worker modules and operations,
review routing, classification evidence, a budget certificate, or supported
formal predicates. These are distinct requirements. An allowing verdict cannot
replace missing admitted evidence, and a mathematically correct certificate
cannot override a denying policy.

The inspected gate maps both `Deny` and `Inconclusive` verdicts to rejection.
An application may expose different diagnostics or escalation paths, but it
must not translate uncertainty into permission. A timeout or an unavailable
policy service should have an explicit availability response under the host's
contract rather than an implicit allow rule.

### Treat a Policy Revision as a Compatibility Event

Imagine changing the publication policy so that a second review is required
for external destinations. Old approvals were created under the previous rule.
Simply updating a configuration pointer does not define whether pending jobs
remain eligible to dispatch.

A proposed revision process should identify the old and new bindings, the
effective boundary, affected queues and journals, required reevaluation, and
the operator authorized to resume restricted work. It should distinguish a
policy rollback from a permission to bypass checks. An older rule may be
operationally available without being acceptable for new dispatches.

The budget-certificate integration provides a narrower implemented example.
It checks the required specification, reads the certificate, verifies it, and
compares the specification again before authorization. The corresponding test
changes the specification during evidence lookup and expects rejection of the
old certificate. That local check does not establish globally atomic policy
distribution across multiple hosts.

For a distributed deployment, decide how replicas learn the accepted policy,
how stale nodes are detected, and where dispatch is serialized against changes.
These are integration obligations. Do not infer them from a digest field or
from a test that modifies one resolver inside one process.

### Separate Key Rotation from Authority Changes

Replacing a signing key and changing what an issuer is allowed to do are
different events. Rotation may preserve the same role under a new key. An
authority change may remove a module, narrow an operation, or require additional
review even if its key remains unchanged.

A proposed trust entry should identify the accepted key, issuer role, permitted
module and version where relevant, operation scope, and temporal conditions.
The deployment must define how it authenticates additions and removals. A new
key inside an evidence package cannot appoint itself as an accepted root.

Do not infer expiry from an omitted field. A policy that requires a validity
window needs a supported encoding and a trusted time source. A signed timestamp
establishes what its accepted issuer stated, under the issuer's scope; it does
not remove the need to assess that source of time.

Rotation also needs an overlap and recovery policy. During an authorized
overlap, both keys may be accepted for specified purposes. Outside it, a
historically valid signature may remain useful for an audit while being
unacceptable for a new action. Store enough context to distinguish those
questions without rewriting the historical record.

### Plan for Compromise Without Inventing Past Certainty

If a reviewer key is compromised, the organization may not know the precise
first instant of unauthorized use. Record the uncertainty rather than treating
every earlier statement as either conclusively valid or conclusively fraudulent.

A proposed response can disable new use of the key, preserve relevant records,
identify affected operations, and require reevaluation under an accepted
replacement process. Which historical decisions remain acceptable depends on
the evidence and policy. Re-signing an old statement under a new key does not
prove that the original observation occurred.

Already completed external effects need their own remediation. A revocation
decision can stop future authority; it does not retract a document that was
published or reverse a transfer that has settled. The incident record should
separate prevention, investigation, and any authorized corrective action.

The repository's trust-lifecycle notes distinguish preparation for real hardware
qualification from an executed hardware result. Preserve that discipline: a
configured verifier digest, a manifest template, or a successful build is not
evidence that a real platform was attested under an approved deployment policy.

### Define Exception and Recovery Authority

An evidence outage can block legitimate work. Failing closed prevents a
particular unsafe default, but does not supply an availability strategy. The
security model explicitly separates those concerns.

A proposed exception process should state what condition it addresses, which
role may approve it, which actions remain prohibited, how long it lasts, and
what evidence it must retain. An exception to one review requirement should
not silently disable caller authentication, parameter binding, or journal
reservation. If the current implementation cannot express the constrained
exception, the operator should not emulate it by granting a broad executor key.

Recovery also needs a return path. Record what confirms restoration, which
queued requests must be reevaluated, and who authorizes resumption. A temporary
manual workflow should have its own evidence contract instead of relying on
the agent to explain later why normal checks were skipped.

### Reproduce the Local Policy Boundary

From the main repository root:

```powershell
cargo test --locked -p arkhe-kernel --test budget_pco --test rejection_gates
```

The suites include specification changes during evidence lookup, policy denial,
review requirements, and the emergency-stop boundary. They use controlled local
fixtures. They do not execute the proposed organizational rotation or incident
procedures, and they do not qualify a production trust registry.

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

### Exercise: Prepare a Policy-Change Dossier

Using the fictional publisher, propose a revision that narrows one reviewer's
scope to internal destinations. Identify the old and new binding, accepted
authority for the change, affected pending requests, distribution boundary,
and rules for historical verification.

Create negative cases for an old approval used on a new public request, an
unrecognized replacement key, and an inconclusive policy result. The expected
outcome is rejection or an explicitly restricted review path before dispatch,
not an automatic fallback to the previous policy.

Your deliverable is a policy-change dossier with a recovery plan. Mark
distributed synchronization, revocation delivery, and human approvals as proposed
unless you have separately implemented and qualified them.

### What This Chapter Does Not Establish

A trust-lifecycle design does not prove uncompromised authorities, universally
correct policies, global policy atomicity, or regulatory conformity. It makes
authority changes inspectable and gives failures an owner. Chapter 13 addresses
what to do when retained statements appear to contradict one another.

## 13. Conflicts, Equivocation, and Adjudication

### A Conflict Is a Reason to Investigate

The publisher receives two attempts with the same logical operation identity.
The first targets payload A; the second targets payload B. The journal rejects
the second as a binding conflict. Has it discovered fraud?

It has discovered an incompatible attempt under its reservation contract. The
cause could be a client bug, a reused request key, a stale cache, a compromised
caller, or intentional misuse. The rejection protects dispatch without needing
to decide which explanation is true.

This separation is useful. An enforcement component can prevent a conflicting
effect while an investigation establishes responsibility. Treating every
conflict as proof of misconduct creates false accusations and gives adversaries
a way to trigger penalties through malformed or misattributed submissions.

### Define the Claim That Can Equivocate

Equivocation, as used in this chapter, means incompatible authenticated
statements by the same relevant authority about the same slot under a defined
protocol. That definition requires more than two different hashes.

The protocol must identify the authority, namespace, slot, epoch or revision
boundary where needed, and the fields whose meanings cannot both be true.
It must also establish how signatures or other authentication connect the
statements to that authority. Two unrelated workers can legitimately produce
different outputs. One worker can legitimately revise an analysis if the
protocol permits revisions and distinguishes them.

| Observation | Immediate conclusion | Additional question |
|---|---|---|
| Same operation and same bound parameters | Potential retry | Does current policy permit replay of the retained result? |
| Same operation with changed parameters | Dispatch conflict | Which caller supplied the change and why? |
| Different outputs in different revision slots | Possibly valid revision | What transition rule relates the revisions? |
| Two authenticated incompatible statements for one fixed slot | Candidate equivocation evidence | Are authority, scope, encoding, and policy independently established? |
| Two roots supplied without authenticated log identity | Inconsistent untrusted data | Can either root be attributed to an accepted log authority? |

This table is a proposed classification aid. It is not a new implemented
`EquivocationDetector` or an economic penalty policy.

### Bind the Namespace Before Comparing Digests

Operation identifiers are meaningful inside their construction and surrounding
scope. The main journal uses caller/operation context and a separate dispatch
binding. Other workspaces and providers may define different identifiers.
Comparing them as bare byte strings can collapse unrelated statements into one
apparent dispute.

An evidence contract should identify which tenant, stream, authority role,
protocol version, and object kind the identifiers belong to. It should define
whether a revision is a new slot or an allowed replacement. If those choices
are unresolved, collecting messages in a hash map does not resolve them.

Canonicalization matters here too. Differences in transport JSON may disappear
after valid typed decoding, while differences in reference order may remain
meaningful under the canonical projection. Compare the commitments and fields
the protocol actually defines; do not infer incompatibility from a screenshot
or a string comparison of an arbitrary serialization.

### Checkpoint Conflicts Have a Narrower Local Implementation

Transparency protocols distinguish inclusion from consistency; reference [G2]
provides background on that distinction. It does not define the main Arkhe MMR
profile or establish a universal slashing rule.

The repository does contain a narrower checkpoint witness in
`integration/arkhe-bugbounty/src/bounty_evidence/durable.rs`. It verifies an
incoming signed checkpoint under pinned trust, reads the retained checkpoint
for the tenant and log, and rejects rollback in count or issuance time. At the
same count, a different root is rejected as checkpoint equivocation. Growth
requires a consistency witness in that subsystem's format.

That is a concrete boundary, not a general public adjudicator. The consistency
helper uses a full-prefix witness to recompute the relevant roots. Its existence
does not freeze a universal succinct consistency format in the main MMR profile.
The witness also has storage, key, time, and log-identity assumptions that must
be satisfied in its deployment.

The distinction avoids two opposite mistakes: claiming no conflict-related
code exists anywhere, and claiming that one checkpoint check implements every
form of authenticated equivocation, appeal, and economic sanction.

### Preserve Both Statements and Their Context

A proposed candidate-evidence package should retain both exact statements,
their authentication material, the independently accepted trust context,
the asserted slot, the relevant policy version, and the observation context.
It should identify the incompatibility in terms of specific fields.

Retain originals even if a normalized view is used for analysis. A diagnostic
summary cannot replace bytes needed to reproduce signature or encoding checks.
If material is private, restrict access and define a retention policy rather
than publishing the package merely because it might be useful in a dispute.

An observed arrival time should be labeled as such. It is not automatically
the time at which a statement was issued or the external event occurred.
Likewise, an inclusion proof can support membership in a checkpoint but does
not independently establish every chronological assertion in the case.

Do not let the submitting party choose the trusted root, authority scope, and
incompatibility rule inside the same package. Those are adjudication inputs
that must come from the accepted protocol or a separately authorized process.

### Separate Detection, Containment, and Adjudication

Detection identifies a possible contradiction. Containment stops a dangerous
path or prevents conflicting dispatch. Adjudication evaluates what the evidence
means under an established rule and decides the response.

The same software may assist several stages, but their outputs should remain
distinct. A detection event can be a candidate requiring review. A containment
decision can reject a second request without declaring the first request
legitimate. An adjudicated finding needs an authority, evidence standard, and
recorded decision.

For the fictional publisher, a proposed process would freeze the affected
operation, preserve both submissions, authenticate their origin, compare their
scope, and ask whether a permitted revision or caller mistake explains the
difference. The operator would then decide whether to correct a bug, request a
new approval, revoke an authority, or refer a stronger allegation for review.

This process is a teaching design. It is not provided as a complete dispute
workflow in the current gate or journal interfaces.

### Economic Penalties Require a Separate Contract

The backlog explicitly marks a general sanctionable-equivocation contract as
pending and an automatic slashing engine as not adopted. Do not write a
tutorial that calls a nonexistent method or moves funds after a local conflict.

An economic sanction would require an accepted definition of misconduct,
identity and authority rules, a penalty schedule, decision authority, treatment
of mistakes, and a dispute or appeal process appropriate to the deployment.
It would also require an actual authorized integration with any financial
system. A pair of signed messages does not supply those decisions by itself.

Containment can remain conservative while adjudication is unresolved. Blocking
an uncertain dispatch protects the workflow without claiming guilt. The
organization should define availability and escalation obligations so a
malicious reporter cannot permanently disable a system with unverified claims.

### Do Not Confuse a Fork with Every Form of Dishonesty

Even valid evidence of incompatible checkpoint statements has a defined scope.
It does not prove that every record in either branch is false, identify the
human who controlled a compromised key, or establish the amount of an economic
loss. Those are additional questions with additional evidence requirements.

Conversely, a consistent log can contain false statements from an accepted
issuer. No fork is needed for incorrect content to be retained faithfully.
Consistency and truth are different properties, just as signature validity
and authorization are different properties.

Use precise findings: “two incompatible authenticated roots for the same
accepted log and count” is more inspectable than “the system proved fraud.”
The former states the evidence relation. The latter adds intent, attribution,
and a standard of judgment that a proof verifier may not address.

### Reproduce the Local Consistency Unit

The following command selects one pure local test and does not enable the
database-backed live cases:

```powershell
cargo test --locked -p arkhe-bugbounty --test durable_gates full_prefix_consistency_rejects_rewritten_history_and_bad_lengths -- --exact
```

Its fixtures check a valid prefix extension and reject rewritten history,
incorrect lengths, and an excessive count. The helper fixture has no real
checkpoint signature; this particular test exercises consistency computation,
not authentication, a live database witness, or sanction submission.

That scope should appear in the validation report. One passing unit test is
not evidence that a public equivocation monitoring service has been deployed.

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

### Exercise: Classify a Dispute Before Acting

Prepare three hypothetical pairs of statements. In the first, the same caller
retries identical parameters. In the second, a caller reuses a request key with
changed parameters. In the third, an accepted log authority authenticates two
different roots for one fixed log and count under the same relevant protocol.

For each pair, identify the namespace, slot, authority, incompatibility rule,
and immediate containment action. State what must be authenticated independently
before escalating the third pair as candidate equivocation evidence. Then add
a permitted revision in a different epoch and explain why it must not be
classified as the same-slot contradiction.

The deliverable is an evidence classification table and a proposed decision
record. No row should automatically submit a penalty transaction. Where the
evidence does not establish intent or loss, say so explicitly.

### What This Chapter Does Not Establish

This chapter does not deliver a universal equivocation detector, legal finding,
economic penalty engine, or public monitoring network. It distinguishes local
conflict prevention, a specific checkpoint witness, and the additional work
needed for accountable adjudication. Chapter 14 applies the same discipline to
cost claims.

## 14. Auditable Costs and Unit Economics

### Define the Unit Before Reporting Efficiency

A system reports that verification costs one cent per call. That figure may
exclude proposal generation, rejected attempts, retries, storage, human review,
and unresolved external outcomes. It may be a useful resource metric, but it
does not describe the cost of a useful completed workflow.

Start by choosing the decision the number should support. An operator assessing
checker capacity may care about CPU time per certificate. A product owner may
care about cost per accepted result. An incident lead may need to understand
the cost of reconciling uncertain effects. Those denominators are different.

Reference [G3] recommends relating technology spending to defined units of value.
The cost model below is an original worked example. It uses invented numbers
and does not report provider pricing, customer demand, or measured Arkhe performance.

### Separate Estimates, Observations, and Allocations

An estimate predicts a cost under assumptions. An observation comes from a
defined measurement or billing source. An allocation assigns a shared cost to
an activity using an explicit rule. They can all be useful, but should not be
reported with the same confidence label.

For example, a measured byte count can be combined with a price schedule to
estimate storage cost. That is not yet a reconciled invoice. A monthly service
charge allocated by retained bytes is a cost allocation, not direct metering
of each verification call. A model-supplied claim about token consumption is
not an authenticated provider observation simply because it is structured JSON.

A proposed accounting envelope should identify the source, measurement interval,
unit, quantity, rate version where applicable, associated operation or batch,
allocation rule, and reconciliation status. If money changes currency, record
the conversion rule and date. These are proposed requirements outside the
minimal ledger inspected next.

### What the Existing CostTracker Implements

The cost component belongs to `agi-coder/crates/agi-coder-cost`, a separate
workspace. It contains a ledger of entries with three fields:

```rust
pub struct CostEntry {
    pub category: String,
    pub micro_usd: u64,
    pub measured: bool,
}
```

The excerpt reproduces the public fields; derive attributes and imports are
omitted for readability. The amount uses integer micro-US dollars:
one million units represent one US dollar.

`CostTracker::record` checks whether adding the new entry would overflow the
unsigned total, and pushes the entry only after that check. `total_micro_usd`
uses checked addition when summing entries. `entries` exposes the retained
entries for reading. The component does not implement a live metering service.

The `measured` flag is supplied by the caller. Setting it to `true` does not
authenticate a meter, attach an invoice, or prove that the number was observed.
The category is a string, not an enforced taxonomy of billable resources.
The ledger has no per-entry operation identity, issuer signature, time interval,
exchange-rate record, or duplicate-ingestion rule in this inspected type.

Those limits matter when the ledger is presented to another team. It supports
integer bookkeeping over supplied entries. It does not turn supplied costs
into economically verified facts or connect every entry to a gate decision.

### Build a Worked Batch with Explicit Assumptions

Consider an invented batch of ten proposed reports. Eight satisfy the workflow's
acceptance criteria. Two are rejected after consuming some resources. The batch
also includes an allocated share of review and retention costs.

| Category | Illustrative batch cost in micro-USD | Evidence status in this example |
|---|---:|---|
| Proposal generation | 200,000 | Assumed value |
| Certificate checking | 20,000 | Assumed value |
| Retention and evidence transport | 30,000 | Assumed allocation |
| Human review | 300,000 | Assumed allocation |
| Retries and reconciliation | 50,000 | Assumed allocation |
| Total | 600,000 | Synthetic arithmetic, not measured spending |

The total is US$0.60. Dividing by ten proposals gives US$0.06 per proposal.
Dividing the same total by eight accepted outcomes gives US$0.075 per accepted
outcome. Both calculations are correct; they answer different questions.

Do not discard rejected work from the numerator while retaining only successes
in the denominator unless that is an explicitly justified allocation. Otherwise,
the apparent cost of success can improve simply because failed attempts have
been hidden. Equally, do not call the eight accepted reports “useful outcomes”
without defining and evaluating usefulness. Acceptance by the workflow may
still be a narrower operational measure.

For zero accepted outcomes, cost per accepted outcome is undefined for that
batch. Report the cost and zero count separately rather than showing a zero
unit cost. A missing denominator is not evidence of free operation.

### Correlate Costs Without Counting Retries Twice

The operation journal prevents some repeated effects, but accounting ingestion
has its own duplication problem. A retried export can deliver the same billing
line twice. Repeated verification may also be legitimate new resource usage,
even when it concerns the same logical operation.

A proposed ingestion contract should distinguish a unique accounting event,
the logical operation, and the attempt that incurred the cost. Reusing an
event identifier for an identical observation should not add the cost again.
A changed amount under the same event identifier should trigger investigation
or a versioned correction protocol.

This behavior is not implemented by the minimal `CostTracker` interface.
Calling `record` twice with two identical entries adds both. A production
adapter must supply correlation and deduplication before relying on the ledger
for financial reporting. Do not infer that the dispatch journal automatically
deduplicates a separate accounting feed.

### Keep Precision and Corrections Explicit

Integer amounts avoid binary floating-point ambiguity in the ledger's addition.
They do not decide the right rounding rule when quantity and rate yield
fractions of a micro-dollar. Apply an approved conversion rule at ingestion
and retain its basis so totals can be reconciled.

The unsigned amount type cannot directly represent a negative refund or credit.
If the accounting model needs adjustments, define a separate correction or
credit record with clear linkage rather than forcing a negative value into
the field. A zero-cost placeholder should not stand in for an unknown cost.

Overflow rejection is a useful integrity check. It is not a plausibility check
on a very large but representable amount. A supplied value of `u64::MAX` may
fit as the first entry even though it would be economically implausible for
the intended operation. The host needs its own range and provenance requirements.

Deserialized ledgers also need validation. An external data source can supply
entries without having used the `record` method. Recompute the checked total
and enforce the ingestion contract rather than assuming every serialized
ledger was produced through the local append path.

### Separate Budget Proof from Cost Provenance

The arithmetic certificate in Chapter 7 can establish that supplied integers
sum to a permitted total. It does not establish that the integers are actual
costs, that the ledger includes every relevant activity, or that money was paid.

This distinction becomes important when enforcing a spending policy. A trusted
budget specification controls the arithmetic limit. A trusted cost source
supports the authenticity of the inputs. A journal and executor control the
effectful path. An accounting reconciliation process relates observations to
invoices or other accepted financial records. Those roles cannot be collapsed
into one claim that an output is proof-carrying.

The budget types in the main workspace do not acquire a currency unit simply
because the separate cost ledger uses micro-USD. An adapter joining the two
would need a documented unit conversion, operation correlation, and admission
rule. This chapter does not claim that such an adapter already exists.

### Use Cost Data to Compare Controls, Not to Bypass Them

Cost data can reveal expensive retries, unnecessary repeated checks, or review
bottlenecks. It can support changes such as bounded batching, cached immutable
artifacts, or clearer rejection messages. Each change still needs to preserve
the original acceptance conditions.

Caching an arithmetic result may be safe under a fixed input and checker
contract, while caching a current authorization decision can be unsafe after
a policy or trust change. A lower unit cost obtained by omitting required
revocation or human review is a changed control, not a free optimization.

Report the workload, acceptance criteria, measurement boundary, and remaining
uncertainty alongside any comparison. If one configuration produces fewer
accepted outcomes or shifts cost to an operator, that difference belongs in
the decision. Do not present a synthetic example as a benchmark against
another product or a guaranteed customer saving.

### Pricing Is a Separate Business Decision

A measured implementation cost can inform a price floor under a defined
business model. It does not establish willingness to pay, support obligations,
tax treatment, margin policy, or demand. The repository backlog marks a
measured-cost-based minimum-price mechanism as pending.

It also marks proposed automatic revenue splits and an economic slashing
engine as not adopted. Their appearance in an earlier proposal does not
create an accepted commercial policy. The ledger itself neither distributes
revenue nor charges a customer.

For this book's operational purposes, the useful deliverable is a defensible
cost model with transparent inputs. Pricing experiments and financial decisions
should use that model as one input, not treat its arithmetic as market evidence.

### Reproduce the Existing Overflow Case

From the repository root, select the cost-related test in the separate workspace:

```powershell
cargo test --locked --manifest-path agi-coder/Cargo.toml -p agi-coder-tests --test cognition_verification research_resolution_requires_evidence_and_costs_check_overflow -- --exact
```

The test appends the maximum unsigned amount and then attempts to append one
more unit. The second append must return an error. It also exercises research
evidence behavior in the same test function; its name is not a claim that it
measures external service costs.

During preparation of this installment, the entire containing test target was
run. The validation note identifies its actual result. No live meter, invoice
feed, or production cost benchmark was exercised.

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

### Exercise: Prepare a Cost Evidence Sheet

Choose a batch and define its denominator: proposals, accepted outcomes, or
another explicitly measured unit. List generation, verification, retention,
review, retries, and reconciliation. For each category, identify whether the
value is measured, estimated, allocated, or unknown and name the source.

Compute the unit cost using the same numerator for two different denominators.
Explain what each number means. Then test a duplicate billing event, a refund,
an overflow attempt, and a batch with no accepted outcomes. Identify which
conditions the existing ledger can detect and which require the proposed
ingestion and correction protocol.

The deliverable is a cost evidence sheet with units, correlation rules, a
reconciliation status, and explicit unknowns. The expected result is not the
lowest number; it is a number that another person can reproduce and interpret.

### What This Chapter Does Not Establish

The cost ledger does not establish authenticated metering, complete cost
coverage, profitable pricing, revenue distribution, or actual payment. Checked
arithmetic preserves a narrow bookkeeping property. Auditable economics needs
the additional provenance, allocation, and reconciliation contracts described
in this chapter.

# Part V — Use Cases


## 15. Code Agents: From Proposal to Release

### A Completed Session Is the Beginning of an Assessment

A fictional maintenance team asks a remote coding agent to fix a defect in a
small library. The service returns a completed session, a patch, and a statement
that its tests passed. The team wants to release the change automatically.

Several questions remain. Does the patch belong to this request? Was it generated
against the approved baseline? Which tests actually ran, on which source, under
whose observation? Has a reviewer approved this candidate? Will the release
executor publish the artifact that was checked?

The provider's completion event can support one scoped claim: its session
reached a reported state under the provider's API. It is not independent proof
that the patch is correct, that the tests meet the team's requirements, or that
the candidate is authorized for release.

The workflow should therefore preserve completion as an observation and add
the evidence required for the team's own decision. It should not relabel
completion as a successful independent assessment.

### Establish the Operation Before Creating Remote Work

Before a session is created, the host should reserve the logical operation and
bind its intent. Otherwise, a timeout during session creation can leave the
host unable to distinguish a missing request from a remote job that already
exists.

The separate workspace's session client provides `create_recorded`, which
invokes a recorder after receiving the session name and before returning to
the polling flow. The caller must already own the relevant operation reservation.
Persisting that session name creates a recovery reference when later work fails.

The callback is not a distributed transaction with the remote service. If
creation succeeds but recording fails, the caller must preserve the known name
for reconciliation rather than issue another create. A network error may also
mean the remote session exists even when no usable response arrived.

The inspected operation journal's session-recording mechanism remains a volatile
reference in that path. A live host must supply durable recording. Do not
infer that using the callback alone solves crash recovery for every deployment.

### Convert Only the Observations the Adapter Understands

The literal adapter entry point is `JulesWorkerRecord::from_session`, located in
`agi-coder/crates/agi-coder-jules/src/worker_record.rs`. Its name identifies the
existing source integration; it is not a generic contract for every coding service.

The conversion requires a pre-dispatch operation identity that matches the
intent, a completed session, a bounded activity list, a supported session name,
and unambiguous completion evidence from that session. A failure event prevents
conversion. Completion time comes from the completion activity's `createTime`,
parsed as a valid nonnegative timestamp.

This choice avoids inventing completion from a local clock or an unrelated
session update. It does not authenticate an arbitrary copied JSON response.
The host still needs to establish the observation's origin and the API context
under which it was obtained.

The adapter extracts patches only from the supported structured patch-artifact
path. It does not turn an arbitrary output message, URL, or provider summary
into a source diff. Missing, empty, or excessively large patch material is
rejected. Those are concrete parsing and binding constraints, not a proof of
the patch's safety.

### Keep Independent Tests Under Host Control

The conversion receives a `CompletionContext` containing the operation identity,
plan digest, test-artifact commitment, and independent test results. Those inputs
belong to the host's assessment process. The provider's prose cannot populate
them as trusted test results merely by using familiar field names.

The returned worker record is deliberately unsigned: its signer is empty, its
record hash is initially zero, and its signature is empty. A trusted host must
authenticate the observations and verify its assessment before signing or
admitting the record through the relevant protocol.

An independent test process also needs its own definition. Identify the candidate
source, test suite, runner, environment, command, result, and retained output.
Independence does not follow from running the same producer's explanation through
another model. Nor does it mean a passing test suite covers every requirement.

For the fictional maintenance team, the proposed assessment package could retain
the approved baseline, extracted patch, exact candidate source, host-run tests,
review decision, and release artifact identity. Each relationship should be
checkable without reconstructing it from the agent's conversation.

### Bind the Candidate, Not a Mutable Workspace

A patch is meaningful relative to a baseline. Applying the same text to a
different checkout can change its effect or fail in a different way. The host
should identify the baseline and candidate explicitly before assessment and
approval.

The main workspace's preview documentation describes a separate source-bundle
profile: baseline hashes, proposed replacement text, and a candidate manifest
are bound to the preview specification. It restricts paths and candidate size
and stages verified source outside the development checkout.

That preview profile is not automatically the same protocol as the separate
workspace's session conversion. Joining the two would require an explicit
translation of identities, candidate representation, admission, and review.
Do not pass a worker record between them on the assumption that a shared
conceptual name establishes compatibility.

In a proposed release design, a reviewer should approve the exact candidate
and target. If another agent edits the workspace after review, the old approval
must not follow the mutable directory. The executor must use the committed
candidate or reject the mismatch.

### Treat Execution Qualification as a Separate Gate

The documented preview executor accepts a fixed, restricted test command rather
than arbitrary commands supplied by the model. It also requires an externally
approved qualification tied to its execution profile, artifact, and environment.
The documentation distinguishes enforcement tests using fixture keys from real
qualification of that environment.

No real valid qualification was demonstrated in the inspected preview delivery.
That boundary matters more than a list of configured isolation options. A test
that rejects a missing qualification shows that the requirement is enforced;
it does not show that untrusted code ran safely under a qualified production profile.

The profile's journal also distinguishes work not yet dispatched from work with
an uncertain execution result. A lease expiring before start can have different
recovery semantics from expiry after dispatch. Those states should not be
collapsed into a general retry rule. Reusing the conservative uncertainty
principles from Part III prevents an apparent timeout from creating duplicate
or unaccounted execution.

### Add Build and Release Provenance Without Overstating It

Once a candidate passes the required checks, the team still needs to identify
the artifact it will release. Build provenance can connect an artifact to source,
builder context, and the process that produced it. Reference [U1] supplies a
versioned framework for that topic; adopting its terminology does not assign
a qualification level to the local project.

A proposed release record should bind the artifact digest, accepted source and
build evidence, approval, and release target. The executor should compare the
artifact it actually submits with the approved identity. A signed build statement
for artifact A cannot justify releasing artifact B because both came from the
same repository.

Passing tests and provenance also do not establish absence of vulnerabilities.
They support particular claims under particular conditions. Domain review,
deployment policy, dependency evaluation, and incident response remain necessary
where the workflow requires them.

### Distinguish Release Approval from Deployment Observation

Approval to release is not evidence that a deployment succeeded. A destination
may accept a request while failing to activate the expected version. An executor
may lose the response after a successful change. The release workflow needs
its own observation and reconciliation contract.

The fictional team could retain a destination receipt or independently inspect
the deployed artifact identity under an accepted observation method. That
would be a proposed additional check, not a property inherited from session
completion or source tests. If the outcome is unknown, the journal should preserve
uncertainty rather than rerun release blindly.

Retain the distinction in status labels. “Session completed,” “candidate assessed,”
“release authorized,” and “deployment observed” describe different events. A
single green success indicator cannot carry all those meanings without losing
the evidence needed to investigate a failure.

### Reproduce the Local Session Tests

From the main repository root:

```powershell
cargo test --manifest-path agi-coder/Cargo.toml --locked -p agi-coder-tests --test jules_completion --test e2e_mock_jules
```

The completion cases exercise accepted provider-event time, unsigned output,
and rejection of missing, ambiguous, foreign, or invalid completion material.
The end-to-end mock target uses a local fixture service. It does not create a
real provider session, merge a pull request, publish a release, or deploy code.

The test names and literal paths are preserved for reproduction. Their scope
must remain visible when reporting a passing result.

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

### Exercise: Assemble a Release Evidence Packet

For the fictional maintenance change, define a packet containing the intent,
reserved operation, remote session reference, baseline, candidate, independent
test result, review decision, artifact identity, and intended target. Identify
the authority that supplies each item.

Introduce three failures: the session completes without an accepted completion
event; the candidate changes after review; and the destination times out after
the release request is sent. The expected outcomes are conversion rejection,
approval-binding rejection, and an uncertain external outcome requiring
reconciliation, respectively.

The deliverable is a claim chain and a transition table. Mark the proposed
release executor and real-environment qualification separately from the tested
session adapter. A provider's completed status must not stand in for independent
test evidence.

### What This Chapter Does Not Establish

The local code-agent example does not establish live-provider interoperability
for every API revision, correctness of a generated patch, qualified execution
isolation, an actual merge, or a successful deployment. It demonstrates scoped
conversion and workflow checks and identifies the contracts needed to extend them.

## 16. DePIN Without Leaps of Trust

### Ask Which Part of Remote Execution Is Being Claimed

A fictional research team sends a computation to a distributed pool. A returned
receipt names providers, describes a disagreement, and includes an arbitration
decision. The team wants to say that a particular physical accelerator executed
the job correctly.

That conclusion contains several separate claims: a provider issued the receipt;
the receipt concerns this job and output; an authorized referee made the stated
decision; the computation satisfied an accepted verification protocol; and the
physical device identity is established by supported evidence.

A local hash commitment can preserve the receipt's bytes. An inclusion proof
can establish membership against an accepted checkpoint. Neither verifies all
those claims. Begin by listing them individually so the adapter's limited result
does not become a stronger hardware or computation guarantee.

### Identify the Implemented Slice

`integration/arkhe-depin` contains a proposed receipt DTO, a normalizer, and a
composite inclusion proof built on the main workspace's MMR profile. The literal
types include `VerdeReceipt`, `GensynAdapter`, and `CompositeProof`. Those identifiers
locate the code; their presence is not evidence of authenticated upstream interoperability.

The repository README explicitly labels the DTO as a proposed integration schema.
The committed fixture is synthetic and contains a deliberately fake referee
signature. The adapter does not verify that signature or the arbitration outcome.
These are defining limitations of the demonstration, not missing footnotes to
an otherwise completed production integration.

Reference [U2] identifies provider research about verification of machine-learning
work. It supplies external context for a class of methods. It does not authenticate
the local fixture, approve its schema, or prove that Arkhe exchanged real receipts
with that system.

### Normalize a Typed Receipt Without Authenticating It

The DTO includes a task identifier, provider list, divergent provider, operation
description, referee decision, signature bytes, and completion time. Structural
checks require nonempty identifiers and decision material, a nonnegative time,
at least two distinct providers, and a divergent provider included in the list.

These checks can reject an internally inconsistent record. They cannot establish
that any listed provider exists, that its key is trusted, or that the decision
was issued by an accepted referee. In particular, nonempty signature bytes are
not a cryptographic verification result.

The normalizer serializes the typed DTO into deterministic JSON bytes for this
representation and derives a domain-separated receipt commitment. The validator
decodes and normalizes again, then compares payload, digest, time, provider,
and kind. This checks consistency with the local normalized representation.

Do not advertise the result as a general-purpose canonical JSON standard. An
arbitrary JSON document with a different representation must first be decoded
under the supported DTO. The exact typed serialization is part of this local
contract. It does not define a foreign service's signed transcript.

### Read the Composite Commitment Literally

The composite structure includes the normalized receipt and optional hardware
evidence. Its commitment covers the typed representation, including the presence
or absence of that hardware field. This allows verification to detect an added,
removed, or changed blob under the original commitment.

The builder then uses the commitment's 32 digest bytes as the MMR leaf payload.
The MMR leaf function applies its own profile rule to those bytes. Hashing the
hexadecimal text instead would change the committed leaf. The composition
therefore needs an exact byte-level contract at both layers.

The method named `CompositeProof::anchor` appends the leaf to a small in-memory
builder and returns a proof for that snapshot. It does not submit a public
transaction, contact a transparency service, or establish a trusted timestamp.
Here, the method name describes the local construction; it should not inflate
the reported operational result.

### Obtain the Checkpoint Independently

`CompositeProof::verify` receives a separate trusted checkpoint containing the
root and leaf count. It compares that checkpoint with the one carried in the
package, recomputes the composite commitment, and invokes the membership check.

This interface makes the trust dependency explicit. A caller that copies the
checkpoint from an untrusted package into the “trusted” argument has not
established independent trust. It has only checked that the package agrees
with itself.

The caller's accepted source might be a retained snapshot or another authenticated
distribution channel under a documented policy. This chapter does not provide
that channel. It also does not claim a leaf position: the implementation uses
the membership API rather than an indexed verification contract.

An old proof continues to describe its original snapshot after additional leaves
are appended. The caller must retain or authenticate the matching checkpoint;
later growth does not automatically refresh the old proof.

### Keep Hardware Evidence Opaque Unless a Verifier Opens It

The optional hardware object can carry a token, report, nonce, or measurement
field in the local representation. The composite commitment makes those bytes
tamper-evident relative to the accepted root. It does not validate the platform
report, authenticate its issuing chain, or show that a trusted execution environment
bound the device to this receipt.

For a real hardware claim, the integration would need a supported evidence
format, native validation, accepted roots, platform and debug-state policy,
freshness, and a binding to the exact job or worker record. A reusable hardware
token from an unrelated task would not establish the required relationship.

Even a valid platform report would leave a question about the measured program
and its inputs. Physical device identity, code identity, input provenance, and
computation correctness are distinct properties. A single field called
`attested` must not conceal which ones were actually checked.

The existing slice leaves hardware verification unimplemented. It also does
not implement the additional storage/connectivity networks discussed in the
earlier proposal, an economic slashing engine, or a kernel admission policy
for a real remote-compute workflow.

### Define What Real Interoperability Would Require

A proposed qualification packet for an upstream integration should begin with
a provenance-backed real receipt and the exact schema version. Identify the
signed bytes, signer role, accepted referee keys, job identity, output commitment,
and temporal conditions. Only then can a parser and signature verifier be
evaluated against meaningful fixtures.

Add cases for an altered decision, changed job identifier, unaccepted referee,
expired evidence where applicable, malformed signature, and valid receipt from
another job. The negative cases need to exercise the actual authentication
boundary, not only normalization of synthetic JSON.

Separate upstream authentication from log inclusion. An authenticated receipt
may not have been retained in the accepted evidence snapshot. An included
receipt may not be authentic. Admission to a consequential workflow must state
which combination is required and how the host verifies it.

No such real-provider qualification is claimed by this local slice. The
correct outcome of an unavailable capability is an explicit unsupported or
denied path, not a permissive stub that returns success.

### Evaluate the Builder's Operational Scope

The reference builder retains all leaves in memory and reconstructs proofs
from the batch. This is useful for teaching, small batches, and negative tests.
It is not persistent production storage or an optimized append service.

For a deployment, define retention, checkpoint ownership, proof export, resource
limits, and recovery from a partial write. Decide how the stream is scoped and
how accepted checkpoints are distributed. The local construction does not
provide those controls by itself.

Invalid receipt data should not mutate the builder's accepted state. The existing
tests check that property for a failed composite append. That is a narrower
local guarantee than durability across a process crash or concurrent distributed
writers. Report it at its actual boundary.

### Reproduce the Synthetic Composite Tests

From the main repository root:

```powershell
cargo test --locked -p arkhe-depin --test portable_proof_composite
```

The suite checks deterministic normalization, invalid fields, round trips across
MMR peak boundaries, content and hardware-field tampering, checkpoint/path
changes, and preservation of builder state after an invalid receipt. The
fixture signature remains fake throughout; a successful run must not be
described as successful referee-signature validation.

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

### Exercise: Build a Claim-to-Evidence Matrix

List five claims: receipt integrity, receipt origin, arbitration correctness,
membership in an accepted snapshot, and physical-device execution of this job.
For each, identify whether the local slice checks it, assumes it, or leaves it
unsupported. Name the evidence and independent trust input a real implementation
would require.

Then modify the optional hardware blob after generating the composite proof.
The expected local result is commitment rejection under the original checkpoint.
Explain why that rejection does not establish that the original hardware blob
was genuine. Finally, supply the package's own checkpoint as though it were
trusted and identify the missing authority relationship.

The deliverable is a matrix and a proposed upstream qualification plan. Do not
label a successfully normalized synthetic receipt as authenticated remote execution.

### What This Chapter Does Not Establish

The example does not prove correct remote computation, authenticated arbitration,
physical GPU identity, native hardware attestation, real-provider interoperability,
or an authorized economic sanction. It demonstrates integrity and inclusion of
a precisely defined synthetic package against an independently accepted checkpoint.

## 17. Content Provenance and Authenticity

### Provenance Answers a Historical Question

A fictional publisher receives an image with a signed editing-history claim.
The image appears to depict an event that never happened. Does a valid signature
make the image true?

It can establish a narrower relationship: an accepted key signed specified
claim material under a supported protocol. Whether the asset is correctly bound
to that claim, whether the history is complete, and whether the depicted event
occurred are additional questions.

Provenance describes asserted origin and processing history. Authenticity can
refer to accepted identity and integrity within a defined contract. Factual
accuracy concerns the world described by the content. A workflow should avoid
using one word to imply all three.

Reference [U3] supplies a versioned media-provenance specification. The local
Arkhe code implements selected claim handling and a separate application-specific
signature profile. It is not a complete implementation of that external standard.

### Separate the Asset, Claim, and Manifest

The asset is the content being evaluated: an image, document, audio recording,
or another supported object. A claim can describe assertions about that content.
A broader manifest structure organizes the claim, assertions, signatures, and
bindings under the relevant format.

The full specification addresses relationships such as content bindings,
assertions, credentials, and validation. Those concepts are useful for asking
what must be checked before showing a provenance result. Merely having a JSON
object named `claim` does not establish that the asset, assertions, and manifest
have all been validated.

For the fictional publisher, define the decision first. Is the reviewer trying
to identify who signed a claim, detect a changed asset, inspect an editing
history, or decide whether publication is allowed? Different evidence and
authorities are required for each question.

### Understand the Local Canonicalization Operation

The inspected `canonicalize_claim_v2` function requires an object containing
`instanceID`, `claim_generator_info`, `signature`, and `created_assertions`.
It rejects a particular misuse of the claim's algorithm field and encodes
supported JSON into canonical bytes under the local encoder.

Those checks are structural and representational. The presence of a `signature`
field does not prove that the signature is valid. A structurally accepted claim
can carry bogus signature-like data and still be canonicalized. Nor do the
listed required fields establish full semantic validation of a standard manifest.

The client adapter therefore reports canonicalization as `CANONICALIZED` and
explicitly distinguishes it from signature, provenance, and policy verification.
That result wording is an important part of the contract, not a cosmetic
choice in a user interface.

If the publisher wants a signature check, it must invoke a supported signature
operation with an independently accepted trust configuration. If it wants
asset binding or full manifest validation, it needs implementations that
actually check those properties.

### Read the Application-Specific Signature Profile

The literal profile identifier in the inspected code is
`arkhe-c2pa-claim-signature-v1`. Its envelope contains schema version, profile,
claim, signer metadata, and signature bytes encoded as hex. The signer metadata
includes key identifier, issuer, and algorithm.

The signing-payload function canonicalizes the claim, commits to it, and constructs
a message that also binds the profile and signer metadata. It prefixes the
encoded message with a domain specific to this protocol. Changing issuer or
key identifier therefore changes what must be signed, not merely an unprotected
display label.

The verifier checks the supported schema and profile, accepted algorithm,
matching key identifier and issuer in supplied trust roots, root status, key and
signature encodings, and the signature over the expected payload. Duplicate
root identities and unknown envelope fields are rejected under its schema.

The supported signature algorithm is Ed25519. That is a local profile choice.
It does not establish that arbitrary standard credentials or signature
containers can be parsed or trusted by this verifier.

### Do Not Infer an Algorithm from a Historical Field Name

The inspected implementation contains fields named `claim_sha256`,
`claim_canonical_sha256`, and `signed_payload_sha256`, but the corresponding
values in this profile are computed with `blake3_256`. A reader must not report
them as SHA-256 measurements simply because their serialized names suggest it.

This naming mismatch is an interoperability and documentation concern. In the
existing profile, signed-payload field names participate in the bytes being
signed. Silently renaming them in a client would change the protocol and break
signature compatibility. Any correction needs an explicit compatibility or
versioning decision, not an editorial search-and-replace inside executable data.

The book preserves the literal identifiers to make the inspected behavior
reproducible and describes the actual algorithm separately. This chapter does
not modify the implementation or claim that its labels meet an external
format's conventions.

This is a practical example of the larger lesson from Part II: field names,
human expectations, and committed bytes can diverge. Verify the implementation
and profile rather than reconstructing a cryptographic contract from labels.

### Supply Root Authority Outside the Envelope

The verifier accepts a separate trust-root document with matching profile and
schema. Each root identifies a key, issuer, and status. A matching root must
be active for successful signature verification.

That status is supplied by the caller's trust configuration. It is not a
network query proving that revocation information is current. The host must
establish where the roots came from, who may update them, and which time or
freshness policy applies to the intended decision.

A package that includes its own root document does not authenticate that
document by being self-consistent. The verifier can successfully check a
signature under a caller-selected key while the application's trust acceptance
rule still fails. Keep the root-selection decision and signature result separate.

The source's successful result retains this limitation: provenance verification
and standard validation remain `NOT_PERFORMED`, and `authority` remains `false`.
The client should display the same scope rather than translate success into
“content verified” without qualification.

### Bind Content Before Making Asset Claims

A signature over a claim says something about the claim bytes. To detect that
the image or document has changed, a supported asset-binding rule must connect
the claim to the actual asset being shown. The local signature profile does
not, by itself, perform full asset-content validation.

For a proposed integration, identify the exact asset bytes or supported binding
representation, the method that checks them, the assertion set, and the
applicable manifest version. Define what happens when metadata is stripped,
the content is transformed, or the referenced ingredient cannot be retrieved.
Do not assume a file extension determines the binding algorithm.

Even a valid content binding cannot establish that an asserted event occurred
or that the issuer recorded every edit. A signed fictional image remains
fictional. An authentic issuer can make a false statement. A truthful record
can be incomplete under a workflow's needs.

The publication decision must therefore retain its domain review. Provenance
may inform the reviewer; it does not replace evidence about factual claims,
rights, consent, or the organization's release policy.

### Design a Result That Preserves Unchecked Questions

A useful proposed result card might state: “Application-profile signature
accepted under host-supplied active key,” followed by the key identity, claim
commitment, and checks not performed. It should not imply full manifest
validation, authenticated current revocation, asset binding, or publication
permission unless the workflow separately implements and checks them.

Errors and negative results should remain distinguishable. A malformed envelope
may be an input error. A well-formed envelope with an invalid signature can
produce a scoped negative result. Unsupported algorithms must not be relabeled
as accepted because the data was successfully decoded.

Avoid inferring that a missing provenance package proves malicious manipulation.
The package may have been absent, removed, or lost during a legitimate workflow.
The absence may prevent a specific verification claim, but intent requires
additional evidence.

### Reproduce the Signature-Profile Tests

From the main repository root:

```powershell
cargo test --locked -p arkhe-verify-core --test c2pa_signature
```

The suite checks a valid signature under a pinned root, claim tampering,
signer-identity binding, missing or revoked roots, a rogue key under matching
identity text, unsupported algorithms, malformed profiles, duplicate roots,
domain-separated signing payloads, and unknown fields.

These fixtures establish local profile behavior. They do not validate a real
media asset under the complete external standard or authenticate an organization's
production trust-root distribution.

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

### Exercise: Separate Four Publication Questions

For the fictional image, prepare four rows: claim signature, asset binding,
history interpretation, and permission to publish. Assign the required input,
verifier or reviewer, trust source, and supported conclusion to each row.

Use a structurally valid claim with bogus signature bytes as one negative case.
Canonicalization may succeed, but signature acceptance must not follow from
that result. Next, supply an authentic claim for a different image and identify
the missing or failed asset-binding check. Finally, use an active-root snapshot
whose current status is unknown and state the freshness limitation.

The deliverable is a verification display contract and a release-decision table.
Preserve the literal local profile when discussing executable tests, and mark
full-standard interoperability and real-asset validation as separate requirements.

### What This Chapter Does Not Establish

The local content profile does not establish complete external-standard
validation, factual truth, exhaustive editing history, current revocation,
legal permission, or release authority. It implements a precisely scoped
signature check over supported claim material under roots selected by the host.

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


### D.5 Consolidated Bibliography

#### Foundational and implementation references


The numbered references are retained throughout this installment. Organization
and project names appear here to identify sources accurately, without implying
affiliation or endorsement.

1. [NIST, Artificial Intelligence Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework). Risk-management vocabulary and structure; voluntary guidance.
2. [NIST, Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile, AI 600-1](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence). The final 2024 publication provides context specific to generative systems.
3. [OWASP, Top 10 for Agentic Applications for 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/). A starting point for considering threats to agentic applications; not a measured incident distribution for Arkhe.
4. [Google, The Site Reliability Workbook, “Monitoring”](https://sre.google/workbook/monitoring/). Operational context for metrics, structured logs, and service diagnosis.
5. [RFC 8949, Concise Binary Object Representation](https://www.rfc-editor.org/rfc/rfc8949.html). Encoding rules, including deterministic encoding considerations; the Arkhe profile adds its own restrictions.
6. [RFC 8032, Edwards-Curve Digital Signature Algorithm](https://www.rfc-editor.org/rfc/rfc8032.html). Signature algorithms; not a policy for assigning trust to signers.
7. [BLAKE3 authors, Specifications, Analysis, and Design Rationale](https://github.com/BLAKE3-team/BLAKE3-specs). The hash design; application-specific commitments require separate definitions.
8. [RFC 9162, Certificate Transparency Version 2.0](https://www.rfc-editor.org/rfc/rfc9162.html). Transparency-log concepts and proofs; not the Arkhe MMR specification.
9. [RFC 6962, Certificate Transparency](https://www.rfc-editor.org/rfc/rfc6962.html). The earlier protocol, retained where an implementation explicitly uses that version; obsoleted by RFC 9162.
10. [Sigstore, Security Model](https://docs.sigstore.dev/about/security/). Assumptions and responsibilities in artifact-signing infrastructure.
11. [SLSA 1.2, Provenance](https://slsa.dev/spec/v1.2/provenance). Versioned software-supply-chain provenance concepts; no qualification level is inferred for Arkhe.
12. [George Necula, research on proof-carrying code](https://www.cs.cmu.edu/~rwh/students/necula.pdf), and [Andrew Appel, Foundational Proof-Carrying Code](https://www.cs.princeton.edu/~appel/fpcc.html). Conceptual foundations for separating a producer from a checker.
13. [Amazon Builders' Library, “Making retries safe with idempotent APIs”](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/). Engineering practice for identifying requests and handling retries.
14. [PostgreSQL 18, Row Security Policies](https://www.postgresql.org/docs/18/ddl-rowsecurity.html). Database-policy behavior and exceptions; match documentation to the actual database version.
15. [WebAssembly, Security](https://webassembly.org/docs/security/). Execution isolation and its relationship to host capabilities.
16. [European Commission, AI Act](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai), and [official implementation guidance](https://digital-strategy.ec.europa.eu/en/faqs/navigating-ai-act). Regulatory context; a concrete legal claim requires the applicable legislation and amendments.
17. [FinOps Foundation, Unit Economics](https://www.finops.org/framework/capabilities/unit-economics/). Relating operational cost to a defined unit of value.
18. [Gensyn, “Verde: verifying ML training on untrusted nodes”](https://www.gensyn.ai/research/verde-a-verification-system-for-machine-learning-over-untrusted-nodes). The provider's research; not evidence that the local synthetic adapter interoperates with its system.
19. [C2PA Technical Specification 2.4](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html). A versioned content-provenance specification; not a statement of complete support in the local profile.

#### Context labels used in Part II

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

#### Context labels used in Part III

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

#### Context labels used in Part IV

Names of source organizations and literal technical identifiers are retained
for accurate attribution and reproduction. This independent publication does
not claim sponsorship, endorsement, or certification by those organizations.

- **[G1]** [NIST, Artificial Intelligence Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework).
  Voluntary guidance for organizing risk-management responsibilities. The
  dossiers and tables in this part are original engineering examples, not
  an official assessment method.
- **[G2]** [RFC 9162, Certificate Transparency Version 2.0](https://www.rfc-editor.org/rfc/rfc9162.html).
  Background on transparency and the separation of inclusion and consistency.
  It specifies a different protocol and does not supply Arkhe's adjudication
  or penalty policy.
- **[G3]** [FinOps Foundation, Unit Economics](https://www.finops.org/framework/capabilities/unit-economics/).
  Guidance on relating technology cost to defined units and organizational
  value. The synthetic batch figures in Chapter 14 are not supplied by this
  source or presented as measured rates.

#### Context labels used in Part V

This publication is independent. Names retained in this section and literal
source identifiers identify the work accurately; they do not imply endorsement,
sponsorship, or certification.

- **[U1]** [SLSA 1.2, Provenance](https://slsa.dev/spec/v1.2/provenance).
  Versioned background for source/build provenance. No qualification level is
  inferred for Arkhe, and provenance is not proof that an artifact is defect-free.
- **[U2]** [Gensyn, “Verde: a verification system for machine learning over untrusted nodes”](https://www.gensyn.ai/research/verde-a-verification-system-for-machine-learning-over-untrusted-nodes).
  Provider research used for context. It is not authentication of the local DTO,
  its synthetic receipt, or a successful upstream exchange.
- **[U3]** [C2PA Technical Specification 2.4](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html).
  A versioned reference for claims, assertions, bindings, manifests, and
  validation. The local signature profile is a distinct limited implementation.

#### New research and standards references

- **N01:** [RFC 9943 — SCITT Architecture](https://www.rfc-editor.org/rfc/rfc9943.html).
- **N02:** [Agent Execution Evidence, individual draft -00](https://datatracker.ietf.org/doc/draft-thaha-scitt-agent-execution-evidence/00/).
- **N03:** [Evidence Binding for AI Agent Credentials, individual draft -00](https://datatracker.ietf.org/doc/draft-thaha-wimse-agent-evidence-binding/00/).
- **N04:** [RFC 9052 — COSE Structures and Process](https://www.rfc-editor.org/rfc/rfc9052.html).
- **N05:** [Proof-Carrying Contracts, arXiv:2610.28484v1](https://arxiv.org/html/2610.28484v1).
- **N06:** [Proof of Execution, arXiv:2607.05397v1](https://arxiv.org/html/2607.05397v1).
- **N07:** [FIPS 204 — Module-Lattice-Based Digital Signature Standard](https://csrc.nist.gov/pubs/fips/204/final).
- **N08:** [FIPS 205 — Stateless Hash-Based Digital Signature Standard](https://csrc.nist.gov/pubs/fips/205/final).
- **N09:** [Lineage-Aware Memory Governance, arXiv:2610.07258v1](https://arxiv.org/html/2610.07258v1).
- **N10:** [OVERT publication site](https://overt.is/).
- **N11:** [Etch maintainer security description](https://etch.systems/security).
- **N12:** [amu-governance package publication](https://pypi.org/project/amu-governance/).

### D.6 Companion Source Index

The source package contains `lab/publisher.py`, `lab/test_publisher.py`, and `lab/README.md`. The code listings in the chapters are scoped excerpts; the companion files are the complete runnable teaching application. Native repository files remain at the literal paths identified in the text. The distribution does not relicense or bundle the native repository or third-party specifications.

