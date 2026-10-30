# How to audit this code

| Invariant / condition | Threat | Enforcement | Evidence |
|---|---|---|---|
| Sum of allocated lamports equals total | Lost or invented funds | `allocateSplit`: BigInt arithmetic, 10000 bps, final remainder | 298 generated totals plus explicit 33/68 allocation |
| Only positive amounts <=1 SOL | Overlarge or ambiguous payment | Exact decimal conversion and cap | Zero, negative, exponent, precision and cap rejection tests |
| Proposal contains only intended native transfers | Hidden instructions or signing | Restricted legacy serializer, one zero signature, no signer API | Independent SDK decodes sender, recipient, amounts, account roles, program and signature |
| Proposal never claims payment success | Misleading financial claim | Unsigned PayBox helper and explicit MAINNET messages | MCP proposal response and no network dependency for construction |
| Devnet evidence cannot authorize mainnet spend | Cross-network authority confusion | Separate tools; payment takes no receipt or rights claim | Wrong-network payment rejected; capability output distinguishes networks |
| Evidence belongs to the requested reference | Substituted receipt | Schema, domain, genesis, kind and exact reference binding | Wrong reference/status/genesis/kind tests |
| File comparison is equality of supplied fingerprint only | Claiming authorship or exact byte differences | Explicit match/different/not_requested labels | Three-way comparison tests; no file upload implementation |
| No arbitrary destination URLs | SSRF or credential forwarding | Fixed URLs and host allowlist, HTTPS, no redirects, five-second timeout | Host, protocol, credentials and response-size tests |
| Remote bodies and outputs are bounded | Memory/log exhaustion | Streaming 128 KiB response limit and small schemas | Oversized body rejected; starter output bounds |
| Credentials remain outside source and artifact | Secret disclosure | Optional host-scoped brokered Authorization header; no secret env reads | Source inspection; hosted credential operation NOT TESTED |
| Same source produces identical artifact | Irreproducible release | Pinned official lockfile; two builds | `evidence/conformance.json` |
| Padded variant preserves executable prefix | Upload fixture changes tools | Exact original bytes followed by one inert comment | Prefix, syntax, exact byte size and separate conformance checks |

## Trust boundaries

Readback trusts the Arkhe service and the configured HTTPS path; it is not a
second independent cryptographic verifier. A malicious provider can still lie
within its schema. Public declarations do not establish ownership.

PayBox is responsible for wallet availability, sender matching, simulation,
approval, signing, replay protection and final transaction execution. This
plugin is a proposal generator. A successful proposal, simulation or receipt
must not be interpreted as proof of economic entitlement.

No financial operation is automatically retried. A later explicit proposal may
represent another payment; inspect PayBox's terminal result before retrying.

The attached padding draft was corrected: exact byte budgeting avoids its
newline discrepancy; comments are not zero-cost; AST source offsets and root
length can differ even where executable syntax is unchanged. No generic formal
proof of JavaScript semantic equivalence is claimed.

## Evidence scope

- Official starter 1.0.2: all 14 SHA-256 checks matched before customization.
- Required pnpm 11.11.0; Node 24.19.0 (supported major, not reference CI patch).
- Nine logic tests; two independent Solana SDK cases.
- Local MCP capability/proposal/rejection checks.
- Live public GitHub metadata read passed without a secret.
- Invalid Arkhe reference failed without a fabricated confirmation.
- Positive receipt matching uses a synthetic unit-test fixture, not a real
  confirmed transaction produced in this run.
- Credential injection, hosted limits, wallet validation and payments remain
  NOT RUN. Configure and test those boundaries in the portal.
