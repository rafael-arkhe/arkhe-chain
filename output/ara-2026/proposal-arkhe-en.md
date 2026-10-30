# Arkhe: Compositional Security for Evidence-Gated AI Actions

**Amazon Research Awards — AWS Cryptography, Fall 2026**  
**Status:** Research application draft based on the existing Arkhe workspace. Resolve administrative fields, novelty review and final PDF pagination before submission.  
**PI:** [Eligible PI, title, department, institution]  
**Co-PI:** [Optional; independently eligible]  
**Proposed collaborator:** Rafael Henrique do Nascimento Oliveira, Arkhe founder/architect; institutional arrangement pending  
**Cash:** USD 72,000  
**AWS Promotional Credits:** USD 20,000  
**Duration:** 12 months from award start  
**Amazon contact:** Optional; none identified

## Abstract

A valid artifact signature, an authentic execution record and a policy-compliant output are useful facts, but their composition need not authorize the intended action. We propose to study this gap using Arkhe, an existing evidence-gated environment with canonical request identities, a Rust authorization kernel, portable verification, authenticated artifact provenance and a bounded arithmetic certificate checker. We will define context-bound authorization across organizational trust boundaries, formalize a small admission model and evaluate adversarial composition failures. Two case studies extend existing code: software/model artifact admission and budget-constrained action authorization. Outputs include precise security statements, a mechanically checked model, a durable experimental evidence path and reproducible comparisons against correctly configured signing/attestation baselines. The objective is a defensible composition result or documented counterexamples, explicitly separating authenticity, predicate validity, authorized admission and external execution.

**Keywords:** AI security definitions; authorization; proof-carrying outputs; provenance; formal methods; cloud collaboration.

## Introduction

This is applied security research with a formal component. Producers, evaluators, policy owners and execution operators may belong to different organizations. Authentic evidence may still be replayed for another tenant, bound to obsolete policy, checked against different artifact bytes or retained inconsistently with dispatch. We ask: under explicit trust, freshness and persistence assumptions, when does evidence acceptance imply authorization of exactly the approved request and output?

Arkhe supplies a concrete experimental foundation. Cognition is separated from signing/write authority. WorkIntent and WorkerExecutionRecord use deterministic encodings and domain-separated digests. The ContainmentGate checks admitted evidence and governance. A pure verification core supplies CLI/WASM surfaces and MMR proofs. The restricted GGUF profile checks structure, digests, builder signatures and inclusion; a separate Sigstore adapter verifies standard message-signature bundles offline under explicit identity/root policy. Preview admission binds artifacts, runtime profile and supervisor/human approvals. A proof-carrying budget flow independently checks a bounded arithmetic certificate before authorization [1].

An October 22, 2026 local review reproduced 46 Rust tests across core/kernel/verification and 12 offline Sigstore tests, with no failures or skipped cases. Architecture validation recognized 26 Rust crates, 7 Node packages and 16 immutable migrations. These are engineering results, not formal security proofs. The Sigstore positive fixture is public signed text, not a genuinely signed GGUF model. The arithmetic checker lacks a mechanical proof; its new proof transport is not implemented by the principal PostgreSQL reader. The separate agi-coder workspace is not assumed integrated into the main runtime.

Sigstore provides signing identity and transparency checks [2]; SLSA defines provenance [3]; transparency protocols distinguish inclusion and consistency [4]. Our candidate contribution is composition with checked output predicates, current authorization and durable admission, rather than reimplementation of these guarantees. Month 1 will compare the closest authorization and proof-carrying systems: combining components alone is not claimed as novelty. For Amazon, potential applications include research on AI-assisted change approval, customer model admission and cross-organization audit. No private data, production adoption or Amazon integration is presumed.

## Methods

**Threat model.** Separate producer, evaluator, governance authority, admission host, dispatcher and auditor. Model adversarial artifacts/evidence, replay, stale policy, substituted contexts and crashes between admission and dispatch. State corruption assumptions per property. Initial results assume required authorities and the minimal admission boundary are uncompromised. Signatures authenticate statements, not their truth; input authenticity and specification correctness remain explicit premises.

Define an authorization context binding tenant, actor, operation/nonce, artifact/input/output commitments, evaluator identity, policy/specification version, required approvals and execution profile. Preserve current canonical identities unless a versioned extension is justified. Require every predicate and approval for the same context. Distinguish repeatable verification, replay-resistant dispatch and exactly-once external effects.

**Formal core.** Specify a bounded admission state machine in one mechanized environment selected with the PI. Target context non-transferability, rejection when required evidence is absent, policy/specification binding and absence of dispatch without matching committed admission. Model crashes, retries and uncertain outcomes. Abstract signature/hash operations under stated assumptions. Separate mechanically checked functional invariants from computational cryptography and service trust. Publish an implementation trace/refinement mapping and its unverified gaps; do not describe the model as full proof of Rust, SQL, dependencies or OS containment.

**Case A: artifact admission.** Extend existing GGUF/Sigstore verification into an admitted decision bound to the exact artifact snapshot and runtime context. Test substitution between inspection, signature verification, authorization and consumption. Treat larger/quantized GGUF support as a separately reviewed profile; retain the restricted parser baseline. Obtain or generate a genuinely signed, redistributable model fixture only after identity/licensing arrangements. A signed text fixture will not count as positive model validation.

**Case B: checked output.** Use the existing predicate: 1–256 unsigned costs, exact non-overflowing u64 sum equal to the output total and within a trusted limit. Formalize the checker relation and persist certificate bytes plus admitted envelope atomically in an experimental PostgreSQL path. Authenticate cost provenance separately. Preserve governance and human-review requirements. The current reader rejects proof-required actions without proof transport; implementation must preserve this fail-closed baseline. Add durable dispatch journaling and explicit uncertain-outcome reconciliation. External exactly-once effects require endpoint cooperation and are not inferred from the gate.

**Freshness/audit.** State how current policies and trusted time/state are distributed. Demonstrate why old signed evidence alone cannot establish latest-policy authorization offline. Evaluate retained trusted state or session challenges. Log inclusion is relative to a checkpoint; consistency and non-equivocation require additional assumptions/evidence. Do not conflate the existing MMR profile with RFC transparency-log conformance or claim blockchain publication proves computation truth.

**Evaluation.** Compare (A) correctly configured Sigstore with equivalent identity/root/time policy, (B) signed provenance plus explicit deployment authorization, (C) current Arkhe without the proposed composed/durable path, and (D) the research implementation. Mark threats outside each baseline's intended scope. Cover wrong tenant/actor, missing evidence, nonce replay, stale approval, policy/spec changes, artifact substitution, false arithmetic, malformed certificates, commit/dispatch crashes and uncertain outcomes. Include honest inputs to measure false rejection.

Freeze baselines and corpus before measurement. Report per-class outcomes, property coverage, surviving mutants, median/p95 admission latency, throughput, evidence size, memory, recovery and cloud cost. Use at least 30 independent repetitions for selected timing configurations with warm-up and uncertainty. Publish seeds, versions, sizes and failures. Counterexamples and null results against fair baselines are valid outcomes. Finite tests do not establish universal security.

## Expected results

| Months | Milestone |
|---|---|
| 1–2 | Frozen source manifest, prior-work/gap comparison, role/adversary model, properties and baseline plan; narrow scope if novelty hypothesis fails. |
| 3–4 | Mechanized bounded admission model, counterexample traces and explicit refinement assumptions. |
| 5–6 | Artifact case study and atomic certificate persistence prototype; adversarial/recovery corpus. |
| 7–9 | Experiment with organizational roles in separate AWS accounts or isolated trust domains; baseline and mutation campaign. Real partner organizations are not assumed. |
| 10–12 | Open release, technical report/manuscript submission, trace comparison and two student tutorials. |

The host institution will supervise two graduate researchers, subject to approved recruitment, covering formal modeling and systems evaluation. English/Portuguese tutorials will broaden access. Provide ARA progress feedback and report code/publications. No student recruitment or scientific outcome is represented as completed.

## Funds needed

Cash: two graduate stipends (2 × 12 × USD 2,000 = USD 48,000); direct research engineering (200 hours × USD 80 = USD 16,000); equipment USD 4,000; conference dissemination USD 2,500; direct publication/accessibility USD 1,500. Total USD 72,000; no administrative overhead. Institutional rates and appointments require validation; engineering support is unassigned.

AWS credits: EC2 experiment nodes USD 12,000; RDS for PostgreSQL persistence/recovery USD 4,000; S3 artifacts/results USD 2,000; CloudWatch USD 1,000; transfer USD 1,000. Total USD 20,000. These are capped planning allocations, not verified AWS price quotes. Validate regional rates, credit applicability and account setup; use stop thresholds and adapt the matrix. No GPU cluster, private dataset or Nitro-specific result is assumed.

## Additional information

**Current applications:** Development/research prototypes for verification, evidence admission and bounded action checking. No production certification or general AI capability is claimed. The strongest fit is AI-security formalization and cloud collaboration protocols, with a narrow software-verification contribution.

**Invalidating conditions:** Required-key compromise, unauthenticated policy, ambiguous parsing, bypass paths, broken host boundary, false input claims or incorrect specifications can invalidate intended guarantees. Freshness and log consistency require explicit evidence. Semantic model safety, malicious weights, side-channel freedom, quantum resistance, FHE/MPC and differential privacy are outside scope.

**License:** Active Rust manifests declare Apache-2.0 OR MIT. Confirm ownership, license texts, notices and adapter/dependency terms before public submission. Proposed research code will retain the dual license subject to institutional approval; no blanket claim is made for third-party/bundled files.

**Training:** Existing READMEs/runbooks cover core, CLI, GGUF and Sigstore reproduction. Planned additions cover threat models, counterexamples and model/implementation walkthroughs.

**Maintenance:** The local root lacks Git metadata. Insert verified [public URL], [frozen commit], [latest commit date], [human contributors committing in preceding 90 days] and [maintainer commitment]. File timestamps and AI agents are not substitutes for contributor history.

## Appendix A — Initial primary references

1. Arkhe source snapshot, reviewed October 22, 2026: README; config/architecture.json; docs/PROOF-CARRYING-BUDGET.md; docs/STAGE10-GGUF.md; docs/PREVIEW-ADMISSION.md; kernel/verification code and tests; integrations/cosign. [Insert permanent public snapshot/commit and evidence manifest before submission.]
2. Sigstore, [Overview](https://docs.sigstore.dev/about/overview/). Existing signing, identity and transparency mechanisms are baseline capabilities, not proposed inventions.
3. SLSA v1.2, [Provenance](https://slsa.dev/spec/v1.2/provenance). Distinguish provenance assertions from authorization of subsequent effects.
4. Laurie, Messeri and Stradling, [RFC 9162: Certificate Transparency Version 2.0](https://www.rfc-editor.org/rfc/rfc9162.html), 2021. Separate inclusion/consistency concepts; no Arkhe protocol-conformance claim.

Complete comparison with closest proof-carrying-output and authorization-composition literature with the PI before submission. These primary sources do not constitute an exhaustive novelty review. Keep the final reference appendix within two pages.

## Appendix B — Conditional Amazon support disclosure

[Confirm Amazon cash/credits received directly or indirectly by any team member in the preceding three years. If applicable supply title, amount/date/source, recipients, remaining credits and results. Otherwise remove after confirmation.]
