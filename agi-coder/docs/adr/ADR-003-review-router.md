# ADR-003: Review routing cannot authorize execution

Status: accepted. Date: October 21, 2026.

Invariant violations or failed tests route to AutoReject. Only passing, explicitly documentation-only changes of at most 20 lines route to AutoAccept. Missing, skipped, ambiguous, or broader changes require review. File classification and line counts must come from a trusted diff inspector supplied by the host.

Consequences: routing is advisory and intentionally narrow. Even AutoAccept must pass the independent containment gate. Dependency updates are not presumed trivial. A signed human-review protocol is deferred rather than represented by an unchecked Boolean.
