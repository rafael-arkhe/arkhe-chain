# Proposed pilot plan and acceptance criteria

This plan is a negotiation input for the SOW. Duration, staffing and targets are proposals until signed. Use synthetic data first and no customer funds.

## Phases

Week 1 after kickoff: validate rights and access, agree one evidence profile, record a baseline review workflow, freeze synthetic fixtures and trust roots. Exit requires written approval of schema and threat model.

Week 2: implement the isolated ingestion adapter and a deterministic export. Exit requires reproducible builds and traceable WER mapping. An experienced engineer owns implementation review. Rafael leads requirements and evaluation design within his demonstrated skills.

Week 3: run negative, concurrency and recovery scenarios. Exit requires evidence of rejection, idempotency and reconciliation. Record defects and their severity.

Week 4: an independent reviewer verifies a bundle offline, compares the workflow with the baseline and issues a signed acceptance or reasoned rejection. The team decides whether to license, extend, stop or redesign. Four weeks is an estimate, not an unconditional delivery guarantee.

## Test matrix

T01 valid synthetic statement and matching outcome: bundle validates against approved fixture roots. T02 altered token byte: signature or digest check rejects. T03 untrusted key or wrong issuer: rejects. T04 unknown key version: quarantines until an approved trust update. T05 expired token presented for live use: rejects; historical analysis has a separate labelled result. T06 wrong recipient, amount, currency or operator mandate: rejects under the agreed profile. T07 repeated source event: same evidence identity, no duplicate charge. T08 same event ID with conflicting bytes: quarantines and reports conflict.

T09 missing outcome: reports authorization only. T10 outcome followed by reversal or reorganization: appends a new event and updates derived status without rewriting evidence. T11 reordered and missing events: reconciles to source cursor and identifies gaps. T12 storage failure after validation: issues no successful recording receipt. T13 tenant mismatch: rejects cross-tenant read or link. T14 changed checkpoint or proof: rejects. T15 unknown or revoked trust root: follows the agreed retained-key policy and reports uncertainty. T16 sandbox data submitted as production: rejects. T17 malicious JSON, size overflow and invalid encoding: rejects within resource limits. T18 competing ingestion workers: one durable event identity and consistent replay results.

## Measurement

Measure ingestion latency, export latency and offline verification separately, including record count, bytes, CPU, runtime, operating system, cache state and cryptographic profile. Report p50 and p95 from a declared sample. No sub-50 ms target is asserted as achieved. Compare minutes of reviewer effort on the same frozen task set with and without the bundle. Any cost saving is measured, not projected as a fixed percentage.

Coverage means the fraction of expected source records represented in a reconciled export window, not the percentage of all customer payments in existence. Invalid fixture acceptance must be zero in the agreed mandatory suite. This is a pilot criterion, not a guarantee that all vulnerabilities are absent.

## Exit package

Versioned schema, synthetic fixtures, test results, source revision identifiers, build instructions, operator runbook, trust material, sample bundle, independent review notes and a defect register. Mainnet escrow code and deployment are excluded. Expansion requires a signed change order and an external smart contract audit where applicable.
