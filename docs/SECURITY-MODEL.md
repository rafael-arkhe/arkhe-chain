# Security Model

## Safety
- no protected transition without verified evidence;
- cognition has no signing keys;
- cognition has no direct WormGraph writer;
- orchestration schedules but cannot authorize;
- emergency stop is fail-closed.

## Liveness
Fail-closed is not liveness.
Recovery requires operator paths, backend redundancy and documented key rotation.

## Important non-claim
This reference environment does not prove that the Cognition Layer is AGI,
nor that Dream-RSI, causal world modeling or metacognitive calibration work.
