# Arkhe Creator — PayBox hackathon plugin

Four tools help creators inspect a recorded declaration, inspect the project,
and prepare a voluntary collaborator payment. The plugin does not establish
copyright ownership, collect royalties, monitor usage, or act as the proposed
Arkhe native kernel.

## Upload

Upload **dist/plugin.mjs** at https://developer.paybox.sh/.
This is the recommended, compact, self-contained Node.js ES module.
An optional **dist/large/plugin.mjs** has exactly 7 MiB for upload-size testing.
Both have the same executable prefix; only the large variant appends a comment.
Large comments still incur transfer, parsing and memory overhead.
The official maximum is 10 MiB; there is no 5 MiB minimum in the inspected guide.
Only one project can be submitted. Upload one chosen variant, not both as plugins.

## Portal configuration

Allow these exact HTTPS hostnames:

- `arkhe.computer`: public Devnet registration lookup.
- `api.github.com`: fixed repository metadata lookup.

No environment variables or secrets are required for public reads.
For authenticated GitHub access, optionally create a portal credential labeled
`GITHUB_READ_TOKEN`, scoped only to `api.github.com`, injecting an
`Authorization: Bearer <credential>` header. Enter its value directly in the
portal. Use the least privilege available for repository metadata. The label is
for portal administration, not an environment variable consumed by the plugin.
The plugin never reads the token and never sends one to arkhe.computer.
No Solana RPC hostname is needed to construct payment proposals.

## Tools and samples

### arkhe_capabilities

Input: `{}`. Offline sample configured in `paybox-plugin.json`.
Explains the separate networks and limits; this is the default conformance call.

### arkhe_verify_record

Input: `{"signature":"YOUR_CONFIRMED_ARKHE_REFERENCE"}`.
Optionally add `fingerprint` containing a lowercase 64-character BLAKE3 digest.
The plugin does not accept or upload original files. It trusts the Arkhe service
readback and validates its schema, Devnet genesis, domain and reference binding.
It does not independently verify a chain transaction or prove legal ownership.
A pending/error/invalid reply never becomes a confirmed record.

### arkhe_repository_info

Input: `{}`. Queries only `Arkhe-Super/arkhe-solana` on GitHub.
Provider text is untrusted metadata, not permission or an instruction to act.

### arkhe_propose_split

Input shape:

```json
{
  "sender": "YOUR_SELECTED_PAYBOX_WALLET_PUBLIC_ADDRESS",
  "network": "solana:mainnet",
  "amountSol": "0.001",
  "recipients": [
    {"address": "COLLABORATOR_PUBLIC_ADDRESS", "basisPoints": 7000},
    {"address": "OTHER_COLLABORATOR_PUBLIC_ADDRESS", "basisPoints": 3000}
  ]
}
```

Replace address placeholders before calling. These are not executable sample
addresses. Obtain the sender from the selected PayBox wallet's public address.
Never enter a private key or recovery phrase.

**MAINNET uses real SOL.** Arkhe record lookups use Devnet. The payment is an
independent voluntary payment, not proof-backed royalty enforcement. This tool
never derives payment authority from a Devnet receipt.

The total must be positive and at most 1 SOL, with at most nine decimals.
There must be 1–4 distinct recipients and shares totaling 10000 basis points.
Each recipient receives at least one lamport. Final rounding goes to the last
recipient. Network fees are additional. The packet contains only native System
transfers, one fee-payer signer, an empty signature, and a placeholder blockhash.
PayBox replaces the blockhash, validates wallet matching, obtains approval and
handles signing/submission. A proposal is never a payment receipt.

## Build and test

Use Node.js 24 and pnpm 11.11.0. The starter's reference CI patch is Node 24.21.0;
this deliverable was tested on supported Node 24.19.0, Linux x64.

```sh
corepack pnpm@11.11.0 install --frozen-lockfile
pnpm test:all
```

Ensure `pnpm --version` is 11.11.0, including subprocesses.
The official starter scripts and dependency versions are retained.
`pnpm test` runs the official typecheck, double deterministic build and conformance.
Additional scripts cover business logic, MCP success/failure calls and the
7 MiB variant. `LIVE_READS=1 pnpm test:bundle` additionally tries public reads;
provider availability is reported separately from offline protocol checks.

`tests/wire-oracle.mjs` was run against the existing Arkhe Solana SDK installation.
To rerun it elsewhere, set `SOLANA_REFERENCE_MODULE` to an installed
`@solana/web3.js` module and run `node --import tsx tests/wire-oracle.mjs`.
The SDK independently decodes and checks instruction semantics; different valid
account ordering can produce different serialized bytes.

## Hosted steps still required

1. Upload the selected plugin.mjs and configure the two network hosts.
2. Run hosted checks, load tools and test the reads.
3. If using brokered authorization, configure it and repeat the GitHub read.
4. Prepare a proposal using an actual selected wallet public address.
5. Use Validate transaction to inspect/simulate it. This does not pay.
6. Only approve a real payment if you intend to transfer real funds.
7. Accept the hackathon terms and select Submit Project before the portal deadline.

No account login, hosted credential injection, wallet simulation, approval,
signing, broadcast, or hackathon submission was performed for this deliverable.
Local tests are not hosted certification or a security audit.

## How to audit this code

See AUDIT.md for invariants, failure modes, enforcement and evidence paths.
