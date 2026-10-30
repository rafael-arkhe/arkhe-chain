# Fail-Closed Provenance and Authorization for Cross-Organization AI Artifact Deployment

> SUPERSEDED: use proposal-arkhe-en.md, grounded in the Arkhe workspace, together with avaliacao-arkhe.md. This earlier draft used insufficient project evidence.

**Amazon Research Awards — AWS Cryptography, Fall 2026**  
**Status:** Working draft; institutional eligibility, scientific novelty and administrative fields must be resolved before submission. This is a proposed new research scope, not a description of completed work.  
**PI:** [Eligible PI name, full-time faculty/permanent researcher title, department, institution]  
**Co-PI:** [If applicable; must independently satisfy ARA eligibility]  
**Proposed collaborator:** Rafael Henrique do Nascimento Oliveira; role and institutional arrangement to be agreed  
**Duration:** 12 months from project start  
**Cash funding needed:** USD 72,000  
**AWS Promotional Credits needed:** USD 20,000  
**Amazon contact:** Optional; none identified in the supplied materials

## Abstract

AI artifacts can pass through multiple organizations before deployment, separating the party that produces an artifact from the party that approves or runs it. A valid artifact signature does not by itself establish that the artifact matches the currently authorized model, transformation history and deployment policy. We propose to investigate a small, fail-closed verification protocol binding artifact bytes, authorized transformations, organizational identities and policy versions at deployment time. The project will define bounded security properties, formalize a verification core, and evaluate an open-source reference implementation against signed-checksum baselines. A constrained deployment experiment will investigate how these checks compose with measured execution on AWS Nitro Enclaves. Outputs will include a threat model, machine-checked statements with explicit assumptions, adversarial test vectors, reproducible benchmarks and teaching materials. The intended contribution is a precise account of what provenance and authorization evidence can and cannot establish for cross-organization AI deployment, including counterexamples when freshness or trust assumptions fail.

**Keywords:** AI artifact provenance; authorization; formal verification; cross-organization protocols; confidential computing.

## Introduction

This is applied security research with a formal protocol component. Its domain is artifact admission for AI deployment across organizations, initially using a constrained set of GGUF model artifacts and manifests. The proposed problem is distinct from proving model behavior: byte integrity and authorized provenance do not establish alignment, factual accuracy or absence of malicious model functionality.

Rafael's supplied CV reports experience designing Arkhe's fail-closed architecture and lists a 2026 manuscript on four-gate verification of GGUF artifacts. These are preliminary background statements, not independently validated research results. The submitted game blueprint, Project Eclipse, supplies no evidence of the protocol proposed here. No production adoption, cryptographic proof or performance result is claimed for this new project.

The research question is: under explicit trust and freshness assumptions, can a compact verifier reject unauthorized artifact substitutions, policy rollback and context-mismatched approval across organizational boundaries while preserving practical deployment costs? A structured prior-work review will compare existing signing, software supply-chain attestation, transparency-log and enclave-attestation approaches. The project will proceed to implementation only after identifying a specific gap; combining existing components alone is not claimed as novelty. Candidate contributions are a compositional authorization definition, a narrowly verified admission core and a public corpus of cross-boundary failure cases.

For Amazon, potential applications include research tooling for customer AI artifact admission and collaboration among model producers, evaluators and deployment operators. This is a prospective use case; integration with any Amazon production service or private data is not assumed.

## Methods

**1. Scope and adversary.** Model three roles: producer, approving organization and deployment verifier. The adversary may replace or reorder stored artifacts and evidence, replay old approvals, supply malformed metadata, and control the network or host outside the stated trusted boundary. Identify which organizational roles may be corrupted for each theorem. Initial authenticity results assume trusted signing keys are not compromised. Availability, malicious authorized producers and vulnerabilities inside the admitted model remain outside those results.

**2. Evidence and authorization.** Specify a canonical, versioned manifest binding an artifact digest, algorithm identifiers, artifact format constraints, transformation-parent digests, approving identities, policy version and deployment context. Use established cryptographic libraries rather than new primitives. Specify domain separation, parsing bounds, rejection of duplicate/ambiguous fields and handling of unknown versions. Acceptance requires complete evidence and an explicit current policy decision. Missing or unverifiable evidence produces rejection. A provenance chain proves only the signed assertions accepted under the trust policy, not that an asserted transformation was honestly executed.

Freshness will depend on an explicit external source of current authorization, or a short-lived challenge tied to a deployment session. Offline verification without trusted state cannot generally establish that a signed policy is the latest; demonstrate this limitation through replay counterexamples. A Merkle-style log may be evaluated as an evidence structure, but inclusion alone will not be treated as proof of global consistency or non-equivocation.

**3. Formal core.** Select one mechanized proof environment with the PI in month 1. Formalize parsing-to-decision boundaries and establish rejection of artifact-digest mismatch, context mismatch and missing required authorization under the modeled assumptions. State any signature-unforgeability and hash assumptions separately from mechanized functional proofs. Analyze rollback only when the trusted freshness premise is present. Publish theorem statements, model bounds and counterexamples; do not describe verification of the small core as end-to-end verification of all dependencies. A Lean implementation is a possible choice, not a commitment to deliver new primitive proofs in CSLib.

**4. Deployment binding.** Build a controlled Nitro Enclaves experiment to bind the manifest decision to a measured verifier and session context. Explicitly analyze how the artifact checked is the artifact subsequently consumed, including streaming/hash completion and mutable-buffer or storage substitution. Keep a simpler non-enclave path for reproducibility. Hardware availability is an implementation dependency; a local substitute will not be labeled hardware-attested. Attestation validation, keys, enclave code and the relevant hardware/software trust assumptions will be documented. No claim of side-channel freedom, FHE, MPC or cryptographically guaranteed inference privacy is made.

**5. Evaluation.** Compare (A) trusted signed artifact digests, (B) signed manifests with policy checks, and (C) the proposed protocol, with and without the enclave extension where applicable. Freeze the threat model and baseline configurations before benchmarking. Include tampered bytes, wrong issuer, wrong tenant/context, missing transformation links, stale policy, replayed sessions, truncated artifacts, malformed encodings and concurrent artifact substitution. Include valid inputs to measure false rejection.

Use redistributable public artifacts after license review and synthetic malformed inputs; no private Amazon dataset is required. Release seeds, versions, machine types and experiment scripts. Measure attack outcomes by class, honest-case acceptance, verification latency (median/p95), throughput, memory, evidence size and compute cost across artifact sizes and chain depths. Run at least 30 independent timing repetitions per selected configuration after warm-up; publish uncertainty and failures. Attack tests establish behavior on the tested corpus, not universal security. Report whether the new protocol adds protection over a correctly configured baseline; a null result is an acceptable scientific outcome.

## Expected results

| Period | Deliverable and completion evidence |
|---|---|
| Months 1–2 | Prior-work comparison, explicit gap/no-gap decision, threat model, baseline definitions and benchmark plan. If no defensible gap emerges, narrow to a documented negative result with PI review. |
| Months 3–4 | Versioned protocol specification, formal core and initial machine-checked properties; publish unresolved proof obligations. |
| Months 5–6 | Reference verifier and adversarial corpus; verify coverage of all specified rejection classes and valid-case fixtures. |
| Months 7–9 | Deployment-binding experiment and reproducible comparison against baselines; document enclave and non-enclave trust differences. |
| Months 10–12 | Public release, technical report, submitted research manuscript and two student tutorials; report limitations and results to ARA. |

The proposed institution will supervise two graduate researchers, subject to recruitment and approved appointments. Student participation will cover formal methods and reproducible systems evaluation. Open exercises and Portuguese/English tutorial materials will broaden access; no recruitment or demographic outcome is claimed as already achieved.

## Funds needed

Request USD 72,000 cash: two graduate research stipends (2 × 12 months × USD 2,000 = USD 48,000); direct research engineering support (200 hours × USD 80 = USD 16,000); dedicated research equipment (USD 4,000); conference dissemination (USD 2,500); and direct publication/accessibility costs (USD 1,500). These are planning estimates pending institutional rates and appointment rules; no administrative overhead is requested. Engineering support is unassigned and does not presume payment to Rafael.

Request USD 20,000 AWS Promotional Credits for a capped experimental plan: EC2, including Nitro Enclaves-capable parent instances, USD 15,000; S3 artifacts and benchmark outputs, USD 2,000; CloudWatch experiment telemetry, USD 1,000; and measured data transfer, USD 2,000. The EC2 allocation provisionally supports up to 4,000 aggregate parent-instance hours at an assumed blended USD 3.75/hour. This is a budget allowance, not an AWS price quote. Region, instance availability, current rates and credit applicability must be validated before launch. Set budgets and stop thresholds; scale the experimental matrix to the approved allocation. No GPU fleet or private dataset purchase is assumed. See the separate budget draft for detail.

## Additional information

**Current applications:** The supplied CV describes Arkhe-related design work and a GGUF verification manuscript. There is no independently verified deployment evidence in the supplied material. This project will produce a research prototype, not certify the existing platform.

**Trustworthiness:** Results depend on declared key ownership, correct canonical encoding, sound policy distribution, cryptographic assumptions, reproducible builds and the modeled trusted boundary. Key compromise, false issuer statements, unchecked parser paths, equivocation, freshness failures, artifact substitution after verification and hardware flaws may invalidate claims. Record and test these boundaries explicitly. Model behavior and semantic safety remain outside the proposed guarantees.

**License:** Proposed new code: Apache-2.0, subject to institutional approval and dependency review. Existing Arkhe code license is not established by the supplied PDFs; reuse requires confirmation. No existing code is represented as already Apache-licensed.

**Training:** Planned deliverables are a quick-start, protocol specification, adversarial fixtures, reproducible benchmark instructions and two student tutorials. Existing tutorial availability is unverified.

**Maintenance:** Repository URL, recent commit dates and number of active human contributors must be inserted after verification: [repository], [latest commit], [human contributors in preceding 90 days]. The CV's reported test count is not evidence of current maintenance. The institution must designate maintainers and agree a post-award support plan before submission.

## Appendix A — References and prior-work completion

Administrative sources: [AWS Cryptography Fall 2026 CFP](https://www.amazon.science/research-awards/call-for-proposals/aws-cryptography-call-for-proposals-fall-2026); [ARA rules](https://www.amazon.science/research-awards/program-rules); [ARA FAQ](https://www.amazon.science/research-awards/frequently-asked-questions); [2026 proposal template](https://www.amazon.science/_attachment/ara-proposal-template?id=000001a0-f857-d623-a5b5-fc57a5260001).

Applicant background: Rafael Henrique do Nascimento Oliveira, supplied CV, two pages; “Specify, Don't Simulate: A Fail-Closed Four-Gate Verification Pipeline for Verifiable GGUF Model Artifacts,” listed in the CV as Zenodo, 2026. [Confirm authors, DOI, version, actual results and rights before citing as prior work.]

Before submission, replace this paragraph with verified primary technical references and a concrete comparison against the closest signing/attestation, transparency and deployment-verification systems. The novelty claim is unresolved until that comparison is complete. Keep Appendix A within two pages in the final PDF.

## Appendix B — Conditional prior Amazon support disclosure

[Confirm for every team member whether Amazon cash or AWS credits were received directly or indirectly in the preceding three years. If yes, provide project title, amount and dates, source, recipients, remaining credits and results. If no, remove this appendix after confirmation.]
