# Proposed Saifuro evidence integration

Restricted discussion draft. This RFC describes a prospective adapter, not a shipped or validated Saifuro integration. Existing Arkhe primitives are local implementation evidence, not qualification of this proposed flow.

## Problem and scope

The pilot asks whether a reviewer can verify a disclosed authorization statement, its ingestion record and a separately attributed execution outcome with a stable trust bundle. It does not attempt to replace authorization, escrow contracts or a payment rail. It does not infer settlement from allow.

## Evidence model

Preserve the original signed token bytes. Decoding and re-encoding a JWT does not preserve its signed representation. A parser must reject malformed encodings, unexpected algorithms and ambiguous structures under the agreed profile. The adapter records the issuer, key identity and the verification policy version used locally. Trust roots come from an approved out-of-band configuration, not an arbitrary key supplied inside the bundle.

The adapter must bind each record to tenant, environment, source identifier and correlation identifier. A namespaced digest of the original source bytes supports idempotency. The same identity with different content is a conflict, never an overwrite. Raw signed bytes remain access controlled and encrypted when retained.

## Proposed pipeline

1. An approved source exports a signed verdict and permitted decision metadata.
2. The adapter validates syntax, signature and agreed claims against a pinned verification profile.
3. A separate source provides outcome evidence such as a provider receipt or a chain transaction reference with chain identity and finality status.
4. Arkhe records the ingestion operation as a WorkerExecutionRecord and links evidence digests in WormGraph.
5. A checkpoint signer with an agreed trust policy signs the export boundary.
6. A reviewer verifies the disclosed objects and inclusion proof against that retained checkpoint.

No payment path depends on this pilot. Evidence failure prevents issuance of a successful evidence receipt, but does not introduce a payment hold or override Saifuro policy. A future mandatory evidence gate would require a separate failure and reconciliation design.

## Mapping to current Arkhe types

The local WorkerExecutionRecord contains module_id, module_version, input_digest, output_digest, evidence_refs, confidence_bps, uncertainty_note and execution_id, with optional typed bindings. Use module_id for the adapter and module_version for its release. input_digest identifies the agreed input envelope; output_digest identifies the validation report. evidence_refs lists content digests of retained source objects. execution_id uses the agreed tenant and event namespace. A WER records this adapter operation, not a claim that the underlying purchase executed.

Do not add payment fields to a core WER by implication. A versioned sidecar envelope carries tenant, source event identity, record kind, environment, source digest, related authorization digest, outcome reference, observation time and local validation report. Its complete wire schema and digest domain must be frozen before implementing the adapter. This document does not claim an existing Saifuro API accepts that envelope.

## Verification profile

Separate current authorization checks from historical evidence checks. Live acceptance requires freshness at the actual time, permitted mandate binding and replay controls. A historical report can evaluate whether a retained token met a stated policy at a documented past time, but must report that evaluation as historical. It cannot revive an expired approval or infer current revocation status. Retain trusted key history and the evidence supporting the chosen verification time.

The public Saifuro verification profile uses ES256 JWTs [S10]. EIP-712 and secp256k1 are not interchangeable with ES256. The escrow job description and public token documentation leave an audience question to resolve [S05, S11]. Ask for the exact escrow payload, curve, domain binding and chain assumptions before proposing an onchain verifier. A separate signed wrapper cannot silently strengthen the original issuer's statement.

## Trust and privacy boundaries

A trusted checkpoint proves inclusion within its stated scope. Detecting omission requires source reconciliation, counts, cursor boundaries and expected sequence checks. Detecting split views needs independently retained checkpoints or an agreed external consistency mechanism. A hash of personal data can remain identifying and a hash of low entropy fields can leak information. Do not publish raw tokens, mandates, amounts, customer identifiers or small-domain digests to public logs without a reviewed design.

Keep the event graph's relationships distinct from demonstrated causation. Preserve source attribution and uncertainty. A settlement reference without an authenticated receipt and finality policy is an observation. Reorganizations, reversals and refunds become new linked events. Never rewrite a previous record as if it had not existed.

## State handling

Use received, validated, recorded, exported and reconciled as adapter lifecycle states. Use rejected or quarantined for failed validation and conflicting inputs. Outcome status is independent: unknown, pending, observed, finalized under the agreed rail policy, failed, reversed or refunded. A missing outcome remains unknown. Duplicate ingestion returns the prior evidence identity without consuming another billing unit.

## Open questions for Saifuro

Which export or webhook is stable and authorized for the pilot? What is the signed boundary for decision metadata and enforcement mode? Can a signed or otherwise attributable mandate snapshot be supplied? What does policy_version mean for the chosen environment? Which source proves settlement? How are event gaps and backfills detected? What key history is available? Does the escrow use a distinct envelope with audience binding? What data may leave the service, and who is authorized to review it?

## Local evidence and limitations

L02 defines WER, L05 implements signed checkpoint verification, and L10 exposes WASM verification entry points for existing Arkhe profiles. None establishes a Saifuro ES256 adapter. L06 reports earlier local test runs; those runs were not repeated for this documentation task. No Saifuro credentials, sandbox calls, deployed contracts or production funds were used.
