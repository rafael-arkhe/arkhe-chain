---
title: 'Arkhe: Evidence and Governance for AI Agents'
subtitle: 'Part IV — Governance and Economics'
lang: en-US
date: 'October 22, 2026'
rights: 'Working manuscript, edition 0.2. Not a publication-ready edition.'
---

# Part IV — Governance and Economics

A verifier can reject an altered certificate without deciding who should own
the policy, how a compromised key should be handled, or what a useful outcome
costs. Those decisions remain with the organization operating the workflow.
Making them explicit is part of the engineering work.

Parts II and III established the boundaries between a proposal, admitted
evidence, authorization, retention, and an external effect. This part addresses
how those boundaries change over time, how conflicting records should be
investigated, and how costs can be attributed without treating estimates as
measurements.

The fictional report publisher continues as a design example. Its control plans,
adjudication procedures, and economic scenarios are proposed teaching artifacts,
not claims that a complete production service exists. Implemented behavior is
identified by source and test. Chapter 14 explicitly uses the separate
`agi-coder` workspace for its cost ledger; that component is not silently merged
into the main workspace's authorization contract.

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

# References and Local Contracts for Part IV

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

Local implementation and scope references:

- `governance/arkhe-governance/src/lib.rs` and
  `kernel/arkhe-kernel/src/lib.rs`: policy bindings, resolver requirements,
  and verdict handling.
- `kernel/arkhe-kernel/tests/budget_pco.rs` and `rejection_gates.rs`:
  certificate, policy, review, and stop cases.
- `docs/security/TRUST-LIFECYCLE-2026-10-18.md` and
  `docs/security/PRODUCTION-BOUNDARY-2026-10-18.md`: dated qualification
  boundaries, not newly executed hardware or production evidence.
- `integration/arkhe-bugbounty/src/bounty_evidence/durable.rs` and
  `integration/arkhe-bugbounty/tests/durable_gates.rs`: checkpoint witness
  and full-prefix consistency scope.
- `docs/backlog/BACKLOG.md`, items 6.1–6.4 and 15.1–15.4: pending general
  equivocation and pricing contracts, partial cost bookkeeping, and economic
  mechanisms that were not adopted.
- `agi-coder/crates/agi-coder-cost/src/lib.rs` and
  `agi-coder/crates/agi-coder-tests/tests/cognition_verification.rs`:
  separate-workspace ledger and its existing overflow case.

## Reproduction and Qualification Note

The companion validation record distinguishes the main-workspace gate tests,
the selected pure consistency test, and the separate-workspace test target
containing the overflow case. None of those runs qualifies distributed key
rotation, a live checkpoint database, an adjudication service, a penalty
transaction, or an authenticated cost feed.

The gate and certificate suites passed 14 tests, the selected consistency unit
passed one test, and the separate-workspace target passed six tests, including
its existing overflow case. The total is 21 passing targeted tests, with no
failures or ignored tests in those runs. Only one of the six cases in that
last target contains the ledger-overflow check.

The invented cost batch has also been checked arithmetically. That confirms
the worked example's sums and divisions; it does not convert its assumptions
into measurements. HTML and EPUB checks concern document packaging, not the
economic or organizational validity of the proposed controls.

Part V will examine specific use cases. Each must preserve the same boundaries:
accepted policy does not establish factual truth, conflict does not establish
guilt, and a correct cost total does not establish its inputs' provenance.
