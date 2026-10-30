# Claims, Corrections, and Decisions

Date: October 21, 2026. Language: English (US).

This register reconciles the two attachments. It is not a line-by-line translation or endorsement of their prior research. Repeated code drafts are historical inputs; the current source and reviewed profiles take precedence for statements about implementation.

## 1. Claim disposition

| Source claim or implication | Disposition | Consolidated wording / consequence |
| --- | --- | --- |
| CDK Besu supplies a private institutional chain connected to Agglayer | Supported at the documented deployment level | Pin the actual deployment path and components before implementation. [R1, R2] |
| Pessimistic proofs verify all internal chain execution | Rejected | Bridge-accounting protection and execution validity are different properties. [R2] |
| Pessimistic proofs eliminate all committees or signer trust | Rejected as a blanket claim | The reviewed runbook uses `AggchainECDSAMultisig`; enumerate the selected signer/consensus assumptions. [R2] |
| Permissioned validators have no cryptographic identity | Rejected | QBFT uses validator signatures; organizational identity and measured workload identity require additional bindings. [R3] |
| A TEE proves that a validator is honest and all computation is correct | Rejected | State the verified measurements, freshness, workload/key binding, enforcement assumptions, and residual trust. |
| A decoded NRAS JWT is enough | Rejected | Verification needs an authenticated claims chain, approved policy, freshness, and relevant platform checks. [R4, R5] |
| Set `ppcie_mode=true` for every GPU | Rejected | Select a supported platform/profile; do not invent a universal claims schema. [R4] |
| Periodic attestation is continuous proof | Rejected | Define sampling/lease gaps and enforceable responses; do not claim uninterrupted execution proof. |
| `arkhe-compute-attestation` is already a production capability | Not established | The inspected parent workspace has a partial wrapper; native hardware qualification remains pending. [L4] |
| WER signature plus MMR proves execution truth | Rejected | A signature authenticates the signer and bytes; inclusion proves membership under a checkpoint. Truth requires additional trusted observations or computation proofs. |
| A checkpoint digest is an Ethereum state proof | Rejected | The existing registry anchors a commitment; it does not turn an MMR into an Ethereum MPT proof. [L3] |
| An off-chain gate can prevent every Besu transaction | Rejected | Scope the protected action and make the effect boundary unavoidable. Gateway-only checks can be bypassed. |
| An idempotency conflict proves punishable provider equivocation | Rejected | Require incompatible authenticated statements under a defined slot/epoch rule and adjudication. |
| The current AGI journal survives crashes | Rejected | Runtime state is in memory; the supplied migration is not a running durable adapter. [L1, L2] |
| Parent Arkhe and AGI profiles are interchangeable | Rejected | Separate profile identifiers, encodings, roots, policy, and migration semantics. [L1, L5] |
| The current MMR implementation achieves logarithmic root/proof generation | Rejected for the inspected AGI implementation | Its documented root/proof reconstruction is O(n). Benchmark an optimized store separately. [L5] |
| Jules activity output establishes independently verified tests | Rejected | Capture artifacts and run independent host-controlled checks; do not infer a test report from session completion. [R6, L1] |
| SOC/ISO certification supplies a per-execution VM attestation | Rejected | Process certification is not workload-bound hardware evidence. No such capability is assumed. |
| Documentation or dependency changes are inherently safe to auto-accept | Rejected | Use verified, scoped policy; do not expand the narrow existing documentation rule by analogy. |
| `THEOREM` means production-ready | Rejected | Test status is scoped bookkeeping; local/CI/hardware/operational evidence must remain distinct. [L2] |
| Producing a signed release means SLSA L3 | Rejected | Evaluate the applicable track's requirements and builder properties explicitly. [R7] |
| GPU verification, autonomous editing, and a native DeepInfer engine are completed | Not established | Existing contracts and mock results do not qualify native or unattended operation. [L2] |
| Market percentages, benchmark scores, fines, and revenue forecasts establish product demand or compliance | Unverified and excluded | Do not use them as requirements, sales facts, or qualification evidence without primary-source verification and contextual review. |
| A 10% revenue share with an 8%/2% split is Arkhe's adopted license | Not adopted | Treat it as a commercial proposal. Existing licensing is unchanged; no token or royalty requirement is introduced. |
| Arkhe is uniquely capable of guaranteeing compliant autonomous agents | Unsupported | Describe specific verifiable bindings and tested controls without exclusivity or absolute guarantees. |

## 2. Terminology

Use **evidence and authorization layer**, **verification kernel**, or **cryptographic accountability** in English technical and product materials. Avoid translating the supplied fiduciary language into a claim that Arkhe creates a legal trust, custodial arrangement, regulatory certification, or fiduciary duty.

Separate five questions in every result: Which bytes were checked? Which key signed them? Why is that key trusted? Which policy authorized which action? What, if anything, was independently observed about execution?

Suggested bounded product description: “Arkhe links protected actions to signed evidence and explicit policy decisions, with portable verification against independently configured trust roots.” This remains a scoped capability statement, not a promise that infrastructure can never misbehave.

## 3. Technical decisions proposed for review

| ID | Decision | Reason / unresolved issue |
| --- | --- | --- |
| ADR-C01 | Keep parent Arkhe and AGI profiles separate | Prevent silent trust and encoding incompatibilities. |
| ADR-C02 | Prioritize durable coding workflow | Existing in-memory coordination is a more immediate release constraint than adding another frontend. |
| ADR-C03 | Separate dispatch and effect authorization | Provider creation must be controlled before post-execution evidence exists. |
| ADR-C04 | Reuse B0 as an anchoring starting point | Avoid declaring the existing prototype absent or duplicating it. |
| ADR-C05 | Treat validator attestation as separate qualification | Onboarding policy, hardware evidence, consensus participation, and organization identity need distinct bindings. |
| ADR-C06 | Choose one attestation platform first | Cross-platform claims and measurements are not interchangeable. |
| ADR-C07 | Detect conflicts before designing financial penalties | Correct attribution and benign-failure handling precede economic enforcement. |
| ADR-C08 | Keep private policy proofs as research | Circuit statement, soundness, privacy, and action binding remain unresolved. |
| ADR-C09 | Preserve licenses and commercial terms | A specification does not authorize new rights, fees, tokens, or royalties. |
| ADR-C10 | Keep operational patterns proportional to measured needs | A service mesh, multiple queues, or microservices are not mandatory merely because they appear in a pattern catalog. |

These ADRs are proposed decisions, not retroactive changes to existing policies. Approval status remains pending.

## 4. Primary references checked

All web references below were consulted on October 21, 2026. They are external documentation, not immutable snapshots or evidence of a local deployment. Pin exact releases/commits during implementation.

- **R1:** [Polygon CDK Besu announcement](https://polygon.technology/blog/introducing-cdk-besu), published October 19, 2026. Used for product context; the technical runbook narrows its interpretation.
- **R2:** [Official CDK Besu runbook](https://github.com/0xPolygon/cdk-besu). Used for deployment/security-model corrections. Signer assumptions must be reviewed in the selected contract version.
- **R3:** [Besu QBFT configuration](https://docs.besu-eth.org/private-networks/how-to/configure/consensus/qbft). Used for validator signatures, membership, and quorum assumptions.
- **R4:** [NVIDIA Attestation documentation](https://docs.nvidia.com/attestation/index.html). Used to identify native GPU-verification components and supported-profile work.
- **R5:** [NVIDIA Attestation Rust SDK user guide](https://docs.nvidia.com/attestation/nv-attestation-sdk-cpp/2.0.0/sdk-rust/user_guide.html). Used for native verification and verifier-issued nonce requirements.
- **R6:** [Jules REST reference](https://developers.google.com/jules/api/reference/rest). Used for session/activity contracts; provider account capabilities and current alpha behavior require live qualification.
- **R7:** [SLSA v1.2 specification](https://slsa.dev/spec/v1.2/). Used for scoped supply-chain requirements, not a claim of achieved compliance.

## 5. Local baseline references

- **L1:** [AGI Coder architecture](../../../agi-coder/docs/ARCHITECTURE.md) and [implementation scope](../../../agi-coder/docs/IMPLEMENTATION.md).
- **L2:** [AGI Coder maturity](../../../agi-coder/docs/MATURITY.md) and [historical validation](../../../agi-coder/docs/VALIDATION.md). Results are reported by those documents and were not rerun in this task.
- **L3:** [Existing Besu B0 anchoring prototype](../../../ops/besu/README.md).
- **L4:** [Partial workload-attestation implementation](../../security/WORKLOAD-ATTESTATION-2026-10-18.md), including the existing parent durable journal.
- **L5:** [AGI/MMR/v1 profile](../../../agi-coder/specs/agi-coder/mmr-profile.md), current [intent contract](../../../agi-coder/crates/agi-coder-core/src/work_intent.rs), [WER](../../../agi-coder/crates/agi-coder-core/src/wer.rs), [gate](../../../agi-coder/crates/agi-coder-kernel/src/containment.rs), and [journal](../../../agi-coder/crates/agi-coder-journal/src/lib.rs).
- **L6:** [Parent implementation roadmap](../../IMPLEMENTATION-ROADMAP.md), which records additional native-admission, custody, containment, and operational limitations.

Attachment A supplies the Besu integration thesis; Attachment B supplies the monorepo, historical Jules audits, DePIN, architecture-pattern, and commercial material. Their local paths and SHA-256 digests are recorded in [the source manifest](source-manifest.json). The manifest fingerprints selected inspected sources, not the entire workspace or remote websites.

## 6. Attachment coverage map

Line ranges refer to Attachment B as supplied, not to executable source files.

| Input section | Treatment in this package |
| --- | --- |
| Attachment A: Besu thesis and four pillars | Specification Sections 9–11; WP-08 through WP-12; corrected proof and authority boundaries |
| B, lines 1–275: AGI Coder tree and component proposal | Existing-baseline inventory; specification Sections 2–7; WP-00 through WP-07 |
| B, lines 276–431: coding-agent gaps and integration order | Bounded capability goals, persistent planning, independent verification, phased pilot |
| B, lines 432–6382: Jules drafts and repeated audits | Consolidated binding, admission-before-dispatch, replay, canonicalization, gate, and evidence requirements; obsolete code is not copied |
| B, lines 6383–6944: illustrative Jules proof of concept | Provider-to-runner workflow; explicit distinction between placeholders, observations, and qualified execution |
| B, lines 6945–7754: DePIN architecture and economics | Specification Section 10; WP-09/11; conflict evidence separated from financial enforcement; commercial figures excluded |
| B, lines 7755–8180: engineering learning roadmaps | Supporting skills for runner isolation, serving, CI, observability, and platform operations; not a requirement to create a separate curriculum |
| B, lines 8181–8413: distributed-system pattern catalog | Specification Section 13 and WP-02/13; adopt patterns for measured needs rather than importing the entire catalog |
| B, lines 8414–8490: product positioning and commercial claims | Bounded capability wording; unverified statistics, pricing, legal forecasts, and exclusivity claims excluded |
| B, lines 8491–8616: Jules synergy recap | Replaceable provider, host-owned verification, scoped review, independent receipts, and explicit live qualification |

The attachments are treated as design inputs. Implementation code and external execution are outside the scope of this documentation package.
