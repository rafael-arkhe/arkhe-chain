# VerificationMethod Subtypes Clarification

Status: `PROPOSED NORMATIVE CLARIFICATION — NOT MERGED`

This file exists to make the remaining W02-04 gap explicit. It deliberately
does not invent the missing semantic value domains.

## 1. Nominal reference types

The following remain nominally distinct even if a later wire profile gives
them the same primitive representation:

- `profile_ref`
- `projection_ref`
- `ruleset_ref`

A conforming B.0.2 implementation MUST NOT erase the nominal type distinction.

`obligation_ref` identifies an obligation already defined by the applicable
IntentCore semantics.

## 2. Result types

`expected_result` and `actual_result` remain distinct normative type names.

This clarification does NOT introduce `result_value`.

Before freeze, the parent RFC MUST either:

1. import an already-normative definition for each result type; or
2. add an explicit semantic definition for each result type.

Until then their exact wire projection is `BLOCKED`.

## 3. result_digest

`result_digest` exists in `ContractualVerifier`, but its exact preimage is not
defined by the current normative corpus.

Freeze requirement:

`result_digest => ExactResultDigestPreimage`

No `DomainResult`, `ResultProjection`, or hash construction is introduced here.

## 4. Status

`W02-04 = OPEN`

This file is a closure record, not evidence that W02-04 is resolved.
