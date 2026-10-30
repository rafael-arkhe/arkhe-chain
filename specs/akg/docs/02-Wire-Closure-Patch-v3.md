# Wire Closure Patch v3 — Final Preconditions

Status: `PRE-FREEZE CANDIDATE`

## WC3-1 — VerificationMethod subordinate types

The following names are semantic types, not interchangeable textual aliases:

- `profile_ref`
- `obligation_ref`
- `projection_ref`
- `ruleset_ref`
- `expected_result`
- `actual_result`

Each MUST have either an existing normative definition or an explicit
normative clarification before B.0.2 freezes.

`expected_result` and `actual_result` MUST NOT be silently collapsed into a
new `result_value` union.

Additionally:

`result_digest => ExactResultDigestPreimage`

The exact preimage must be specified before freeze.

## WC3-2 — PolicyDigest

`PolicyDigest` MUST bind the exact resolved policy artifact.

Its computation MUST be defined by a `PolicyResolutionProfile`.

B.0.2 MUST NOT presume an Arkhe `PolicyCore`.

`ResolvedPolicyDigest != BoundPolicyDigest => REJECT`

## WC3-3 — ClaimRef

PoC wire type:

`ClaimRef = text_id`

B.0.2 MUST NOT create a new claim namespace rule.

## WC3-4 — Normative snapshot

Propagation audits MUST execute only against a consolidated normative snapshot.

The snapshot excludes:

- historical text
- superseded text
- drafts
- research notes
- prior versions

Pipeline:

`WireClosurePatchV3 -> NormativeSnapshot -> PropagationAudits -> B.0.2Freeze`
