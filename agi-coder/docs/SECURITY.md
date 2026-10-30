# Security and trust boundaries

## Guarantees under stated assumptions

With an uncompromised configured signer, trusted policy, and single-process execution, the gate detects record modification, mismatched requests, wrong artifact hashes, unauthorized signers/requesters/actions, stale or future records, and failing or absent tests. Journal replay checks stop duplicate dispatch within the process lifetime. MMR verification checks proof shape, leaf position, subtree path, peaks, leaf count, and trusted root.

## Deployment obligations

- Keep signing keys outside model-controlled processes. Never trust the public fixture keys (`07` or `2a` repeated 32 times).
- Load signer/requester allowlists and output expectations from trusted configuration. A policy supplied by an attacker provides no authority.
- Independently produce test artifacts for the exact output digest; signed counters are claims by the runtime, not proof of test execution.
- Authenticate callers before constructing `requested_by`; a DID string is not an authentication protocol.
- Isolate untrusted commands. Process mutation tests do not sandbox execution and kill only the direct child on timeout.
- Use a durable transactional journal, evidence store, and external effect reconciliation before irreversible production work. The included stores lose state on restart.
- Publish roots through an authenticated, independent channel if external auditability is required. Local MMR roots do not prove publication or prevent operator rollback.

## Unsupported claims

No GPU/TEE execution attestation, Rekor anchoring, RFC 3161 timestamp, distributed exactly-once execution, real Jules runtime attestation, full natural-language verification, formal program correctness, or AGI capability is claimed. A Jules session marked `COMPLETED` never implies passing tests. Review routing is advisory and cannot grant gate authorization.

The REST client uses HTTPS except explicit loopback mock endpoints, a sensitive API-key header, bounded polling and pagination, strict resource identifiers, and disabled redirects. Credentials are never included in intentional logs or serialized records. The MCP server offers read-only verification/calculation tools over stdio and grants no shell execution tool.

DeepInfer integration selects a local executable through trusted host configuration. Its generation response is unverified data, not gate evidence. Stdout/stderr are bounded and timeout kills the direct child; GPU descendants may need operator cleanup. Source pinning is not hardware attestation or model-weight verification. Prompt contents, generated text, and their hashes may be sensitive; persist them only under the caller's data policy. Model remote-code execution remains an explicit engine configuration choice.

Report issues privately to the repository owner before public disclosure. No security contact address is invented here.
