---
title: 'Arkhe: Evidence and Governance for AI Agents'
subtitle: 'Opening Material and Part I — The Verification Problem'
lang: en-US
date: 'October 22, 2026'
rights: 'Working manuscript, edition 0.2. Not a publication-ready edition.'
---

# Complete Contents and Selected Sources

This book follows a proposal from its first statement of intent to the evidence
required for authorization and the separate work of controlling an external
effect. The sequence matters: deciding what must be established comes before
choosing a signature format, a storage engine, or a verification library.

The complete contents below describe the intended book. This installment contains
the opening material and Chapters 1–3. Chapter 7 is available as a separate sample.
The remaining chapters have an editorial plan and have not yet been written.

**Opening Material**

- How the Sources Were Selected
- Preface: Who This Book Is For
- How to Use This Book
- Versions, Evidence, and Reproduction
- Independent Publication and Attribution

**Part I — The Verification Problem**

1. When Logs Are Not Enough
2. Evidence, Trust, and Accountability
3. Governance Without Certification Claims

**Part II — The Arkhe Architecture**

4. Mapping the Arkhe Environment
5. Identities That Survive Transport
6. WormGraph and Verifiable Inclusion
7. From Output to Authorization

**Part III — Implementation**

8. Integrating the ContainmentGate
9. Operation Identity and External Effects
10. Building an Evidence Adapter
11. Verification on the Client

**Part IV — Governance and Economics**

12. Admission Policies and Trust Lifecycles
13. Conflicts, Equivocation, and Adjudication
14. Auditable Costs and Unit Economics

**Part V — Use Cases**

15. Code Agents: From Proposal to Release
16. DePIN Without Leaps of Trust
17. Content Provenance and Authenticity

**Part VI — Appendices**

A. Glossary and Counterexamples  
B. Types, Profiles, and Versioned Contracts  
C. Implementation and Operations Checklist  
D. References, Reproduction, and Evidence Ledger

## How the Sources Were Selected

Sources were selected for the question each can answer. A protocol specification
can define the bytes a verifier should accept. A research paper can explain the
argument behind a method. Maintainer documentation can describe an interface and
its supported behavior. An operator's engineering account can expose failure
modes that a short API reference leaves unstated. These forms of evidence have
different strengths; one should not silently substitute for another.

The preferred source is the organization or research team responsible for the
work. Where a versioned specification exists, the book identifies a version
rather than relying on an unqualified claim about the latest release. Where a
source is guidance, the text does not treat it as a binding protocol or a legal
requirement. Where a source discusses another implementation, the book does not
borrow its results as evidence about Arkhe.

The research cutoff for this installment is October 22, 2026. Some cited material
is much older because its role is foundational. An older signature specification
may be the right reference for an implemented algorithm; a newer report about
agents does not replace it. Conversely, operational interfaces and legal
requirements need a version and a date because they can change independently
of the mathematics.

The sources fall into five groups:

- **Risk and governance guidance:** references [1]–[3] help organize questions,
  responsibilities, and adversarial scenarios.
- **Operational practice:** references [4], [13], [14], and [17] inform monitoring,
  retries, storage isolation, and cost attribution.
- **Encoding, cryptography, and transparency:** references [5]–[10] establish
  specific technical concepts and their assumptions.
- **Proof and provenance:** references [11], [12], [18], and [19] explain distinct
  approaches to certificates, build evidence, remote computation, and media history.
- **Execution boundaries and regulatory context:** references [15] and [16]
  identify questions that require host or jurisdiction-specific treatment.

These references do not certify Arkhe. Claims about the repository require local
source inspection, a defined input, an expected result, and a reproduction record.
The evidence for “this checker rejects an altered certificate” comes from that
checker and its tests. A paper describing independent verification can explain
why the architecture is useful, but cannot establish that this implementation
has no bypass.

Selection also requires exclusion. Unsupported market totals, guaranteed savings,
and repeated claims without an identifiable origin are not foundations for an
engineering argument. This book does not need a speculative market size to
explain why binding an approval to the action being approved is useful.

## Selected Sources

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

# Preliminary Material

## Preface: Who This Book Is For

This book is for the engineer who is asked a deceptively short question: “Can we
let the agent do it?” The requested action might publish a document, approve an
expense, release a software artifact, or change the state of an internal system.
The difficulty is not merely producing a useful answer. It is deciding when an
answer is sufficient grounds for an action that affects someone else.

You may already have a model, a tool interface, application logs, and a review
screen. You may also have good reasons to distrust the gaps between them. An
approval can refer to yesterday's artifact. A retry can repeat an external effect.
A signed record can come from the wrong authority. A dashboard can show success
while the destination's outcome remains unknown.

The book develops an engineering method for examining those gaps. Arkhe supplies
concrete contracts and examples, but understanding the method does not require
accepting every design choice in the repository. The central skill is learning
to state a claim precisely enough that another component can check it.

Platform engineers and software architects are the primary readers. Security
reviewers, operators, and governance practitioners can use the same contracts
to ask who controls the rules, what the records establish, and how an exception
is handled. Familiarity with basic programming, APIs, hashes, signatures, and
transactions will help. The opening chapters emphasize decisions before code.

## How to Use This Book

Begin with one workflow you understand. Identify its external effect, the identity
under which it acts, and the person accountable for authorizing it. Use that
workflow as a running comparison while reading. A narrow, well-defined action
is more useful than an abstract promise to make all agents trustworthy.

The book progresses from claims and authority to architecture, implementation,
governance, and use cases. Exercises ask for inspectable artifacts: a claim table,
a threat model, an evidence contract, a rejection case, or a recovery procedure.
Later laboratories add executable examples. A successful demonstration matters,
but so does showing that a nearby invalid request is rejected.

Do not begin a laboratory by connecting production credentials. First understand
the property being checked and the effect, if any, that the program can produce.
The separate arithmetic sample is deliberately offline and reports that it
executes no external action. That scope is part of the example's contract.

## Versions, Evidence, and Reproduction

Throughout the book, a statement should fit one of these evidence categories:

| Category | Meaning |
|---|---|
| External specification or guidance | An identified source defines a rule or offers a recommendation |
| Inspected implementation | A named file or interface contains the behavior described |
| Reproduced behavior | A recorded command and inputs produced an observed result |
| Synthetic scenario | An invented example illustrates a design problem |
| Proposed design | A suggested contract or control is not claimed as implemented |
| Pending qualification | Implementation exists, but a required environment or operational condition remains unverified |

These categories are editorial tools, not confidence scores. A reproduced test
establishes what happened for its tested conditions. It does not automatically
upgrade a reference implementation into a production-qualified service.

The repository contains multiple workspaces and profiles. Names that look similar
may have different encodings or trust assumptions. Later chapters identify the
workspace used by each example. A final release must pin a source snapshot,
toolchain, dependencies, and commands. This working installment does not invent
a release tag or present old test results as newly executed evidence.

## Independent Publication and Attribution

This publication is independent. Third-party names are retained where necessary
to identify sources, standards, tools, or literal code. Their appearance does
not imply sponsorship, endorsement, or certification. Descriptive language is
used for hypothetical services and promotional copy.

This working manuscript includes AI-generated text and remains subject to author
review. It is not a final copyright or licensing declaration. Publication details,
rights, and required platform disclosures must be completed for the final edition.

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

# Implementation and Evidence Notes

These chapters introduce original fictional scenarios and proposed controls.
They do not report a real document-release incident or claim an executed
end-to-end publication service. Named repository observations are based on
inspection of these local sources:

- `docs/SECURITY-MODEL.md`: architectural constraints and the distinction between
  fail-closed behavior and liveness.
- `kernel/arkhe-kernel/tests/rejection_gates.rs`: basic gate entry-point,
  policy-denial, missing-worker-evidence, and emergency-stop cases.
- `docs/PROOF-CARRYING-BUDGET.md`: the separate finite arithmetic laboratory
  and its operational boundaries.

The earlier chapter-7 reproduction recorded 14 passing targeted tests. Those
results belong to that reproduction; this prose installment does not claim a
new execution of those tests. HTML and EPUB checks concern document packaging,
not qualification of the application controls described here.
