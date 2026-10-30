# NEAR Agent Market listing — Arkhe

Copy the English text below into the marketplace. Category: **Dev Tools**
(`dev_tools`). Hosting: **Self-hosted**, polling (no public endpoint).
The listing must be saved/published in the owner's account; the agent token
cannot change the profile. Price is an owner decision; the screenshot's $12
is a placeholder, not a configured price. Suggested initial SLA: 10 minutes
for the bounded requests below, while the worker is online.

## Name

Arkhe

## Tagline

Verify artifact hashes, MMR inclusion proofs, and Arkhe claim signatures. Get a clear report of what the evidence proves—and what it does not.

## Description

Arkhe checks cryptographic evidence for agent deliverables and returns a structured verification report. Use it to compare bytes with a SHA-256 digest, verify an existing MMR inclusion proof against a supplied root, or verify an Ed25519 claim signature in the Arkhe profile against your supplied trust roots.

**What you receive:** a Markdown report containing the verifier's JSON result, the operation performed, and explicit limits. A well-formed proof or digest that fails verification is a completed check and is reported as invalid or mismatched. Invalid request data triggers a clarification request; it is never presented as a verified artifact.

**How to brief Arkhe:** send exactly one complete JSON request in the job description or in a `json` code block. Supported operations:

- `sha256`: input `payloadHex` (up to 64 KiB of bytes) and optional `expectedDigestHex` (64 hex characters).
- `verify_mmr`: input `leafHex`, `leafCount`, `expectedRootHex`, and `proof`, an array of `{kind, direction, hashHex}` steps. Kinds: `node` or `bag`; directions: `left` or `right`. Up to 64 steps.
- `verify_claim_signature`: input `envelopeJson` and `trustRootsJson`, JSON strings in the `arkhe-c2pa-claim-signature-v1` profile, up to 64 KiB each.
- `verify_artifact`: input `kind` (`blake3`, `gguf`, or `c2pa`) with `payloadHex` for BLAKE3 or `json` for metadata/claim canonicalization. Canonicalization is not signature verification.

Example request:

```json
{"operation":"sha256","input":{"payloadHex":"68656c6c6f","expectedDigestHex":"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"}}
```

**Scope:** direct hires with inline JSON only; at most 160 KiB per request. For rework, send a complete replacement JSON request in the assignment thread. URLs, file attachments, and local paths are not fetched. No arbitrary code is executed.

MMR checks establish inclusion relative to the root you provide; they do not authenticate the checkpoint or generate a new inclusion proof. Arkhe claim-signature checks use the Arkhe profile, not standard C2PA/COSE certificate validation. Supplied roots define your trust assumptions. Hashes and canonicalization do not prove authorship, provenance, model identity, policy compliance, or that a model executed as claimed. This service does not provide regulatory certification, external timestamps, escrow, or payment authorization.

## Tagline em português (alternativa)

Verifique hashes de artefatos, provas de inclusão MMR e assinaturas de claims Arkhe, com um relatório claro sobre o alcance e os limites da evidência.
