# Research audit for the complete edition

Cutoff: October 22, 2026. This audit checks the supplied external review against
primary publications; it does not adopt its conformance or product claims.

| Supplied claim | Finding | Editorial treatment |
|---|---|---|
| Agent execution-evidence profile is a standard | The named `-00` document exists as an individual Internet-Draft | Work in progress; do not describe it as an adopted agent standard |
| Workload-credential evidence binding | The named individual draft exists and discusses identity/policy correlation and additional transport/composition | Experimental mapping only; no native compatibility claim |
| Transparency architecture | RFC 9943 is a separate Standards Track architecture publication | Distinguish the published architecture from individual agent profiles |
| Proof-Carrying Contracts | arXiv 2610.28484 exists, with a proof-gated operation model | Research comparison, not implemented functionality or proof of Arkhe safety |
| Proof of Execution | arXiv 2607.05397 exists and explicitly separates assumptions and guarantees | Compare complete mediation, trace scope, and replay assumptions; do not claim validation of all hidden reasoning |
| Post-quantum signatures | FIPS 204 and 205 are final publications dated August 13, 2024 | Add algorithm agility; no universal mandate, hybrid support, or module-validation claim |
| Published runtime-attestation specification | OVERT site identifies version 1.1 and its maintainer | Identify provenance of the publication; no blanket claim that its normative profile mandates both PQ algorithms |
| Hybrid envelopes in an external project | Etch's maintainer describes a hybrid envelope | Maintainer assertion, not an independent audit or an Arkhe feature |
| Derivation-aware memory | arXiv 2610.07258 and the package describe lineage-gated reuse | Explain the complete-lineage assumption; no assertion that it prevents every inference attack |
| Journal resolves duplication generally | Local reservation semantics are narrower than remote exactly-once execution | Retain uncertainty and destination assumptions |
| New features guarantee compliance | Unsupported | Exclude the guarantee; keep controls and legal evaluation separate |

## Newly checked primary sources

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

The full abstracts/articles and the relevant draft sections were consulted to
classify scope. Papers remain research; publication on a preprint server is not
an implementation audit. A public specification maintained by a company is not
the same status as a final governmental cryptographic standard. A document's
intended Standards Track status is not approval. No benchmarking numbers from
these publications are copied into the book as Arkhe measurements.

## Scope of integration

New material is original explanatory engineering text: a local teaching lab,
worked cases, protocols, and migration checklists. It is explicitly separate
from native Arkhe formats. No external standard was implemented in the kernel,
no real evidence service was registered, and no post-quantum algorithm was added
to the product. The book's new memory example is a strict set-based teaching
policy, not an implementation or replication of the cited research package.
