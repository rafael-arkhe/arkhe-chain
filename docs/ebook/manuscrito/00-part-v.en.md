---
title: 'Arkhe: Evidence and Governance for AI Agents'
subtitle: 'Part V — Use Cases'
lang: en-US
date: 'October 22, 2026'
rights: 'Working manuscript, edition 0.2. Not a publication-ready edition.'
---

# Part V — Use Cases

The same evidence mechanisms can appear in very different workflows. A coding
agent produces a patch. A distributed-compute provider returns a receipt. A
publisher attaches a signed claim to content. In each case, the useful question
is what the evidence establishes, for whom, and under which accepted authority.

This part applies the earlier chapters to three repository examples. It does
not assume that every example participates in one integrated production service.
The coding-session adapter belongs to the separate `agi-coder` workspace. The
distributed-receipt adapter and content-claim verifier belong to the main
workspace. Their shared architectural ideas do not make their types, profiles,
or qualification results interchangeable.

Each chapter begins with a fictional application, identifies the implemented
slice, and states the work still required for a real deployment. Literal source
identifiers remain unchanged so readers can reproduce the examples. Third-party
names are otherwise confined to accurate references rather than used as
promotional associations.

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

# References and Local Contracts for Part V

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

The coding-session chapter is grounded in
`agi-coder/crates/agi-coder-jules/src/worker_record.rs`, `client.rs`,
`docs/JULES-COMPLETION.md`, and the corresponding completion/mock tests.
The preview comparison uses `docs/PREVIEW-EXECUTION.md` as a documented separate
profile, without claiming new execution of its real-environment qualification.

The distributed-compute chapter uses `integration/arkhe-depin/README.md`,
`src/adapters/gensyn.rs`, `src/proof/mod.rs`, and
`tests/portable_proof_composite.rs` within that crate.

The content chapter uses
`verification/crates/arkhe-verify-core/src/c2pa/claim.rs`, `signature.rs`, and
`verification/crates/arkhe-verify-core/tests/c2pa_signature.rs`.
The algorithm-label mismatch is reported from the inspected code, not corrected
by altering signed data or silently updating a protocol.

## Reproduction and Qualification Note

The companion validation record reports the actual runs for the synthetic
distributed-receipt suite, the claim-signature suite, and the separate-workspace
completion/mock targets. Passing local fixtures does not establish a live
coding-provider session, a real remote-compute receipt, qualified hardware,
an actual deployment, or full-standard media validation.

During preparation, four synthetic distributed-receipt tests, nine local
claim-signature tests, two completion-conversion tests, and three local mock
workflow tests passed: 18 targeted tests, with no failures or ignored cases
in those runs. The mock workflow uses a local fixture service rather than
the provider's production API.

The exercises define additional acceptance criteria. They are not records of
executed production workflows. Likewise, document-packaging checks do not
qualify any of the application integrations described here.

The main chapters end at this boundary. The appendices will collect the
glossary, versioned contract references, implementation checklist, and evidence
ledger so readers can carry the same distinctions into their own systems.
