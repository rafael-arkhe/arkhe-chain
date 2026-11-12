# ADR-001: Jules is replaceable orchestration

November 8, 2026: the operator catalog no longer lists a Jules session. `agi mcp` is the external entry and only prints the stdio launch line for `@agi-coder/mcp-server`. The Jules crate stays in the tree and is not invoked by `agi.exe`.

Status: accepted. Date: October 21, 2026.

The provider can create coding sessions and expose artifacts. The provider is not an authorization authority. A `Worker` returns a signed execution claim owned by a trusted host adapter; the independent kernel decides whether the exact protected action can proceed. No Jules-specific schema is embedded in the gate.

Consequences: another provider can implement the same worker contract. Jules completion, process certifications, or unknown fields do not substitute for test evidence or hardware attestation. Real provider sessions remain pending validation.
