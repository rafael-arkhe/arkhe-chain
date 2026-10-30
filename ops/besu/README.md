# B0: local checkpoint anchoring

This experiment follows the official four-validator QBFT tutorial:
https://docs.besu-eth.org/private-networks/tutorials/qbft/

It pins `hyperledger/besu:26.7.1` and rejects reported versions below 26.7.1.
It does not establish that this minimum remains sufficient for future deployments.
Production operators must separately maintain their current security baseline.

## Reproduce

Prerequisites: Docker or Podman, migrated PostgreSQL 16 runtime role, Node 24,
Rust/WASM toolchain and wasm-pack. Run from the repository root:

```
npm install --prefix ops/local/besu-tools --no-save --package-lock=false ethers@6.16.0 solc@0.8.30
cargo build -p arkhe-bugbounty --locked
cargo test -p arkhe-bugbounty --features postgres-integration --locked
wasm-pack build verification/crates/arkhe-verify-wasm --target nodejs --out-dir pkg --locked
python scripts/besu_b0.py up
```

Set `ARKHE_TEST_DATABASE_URL` for persistence tests. The dedicated synthetic B0
fixture tenant defaults to `bugbounty-b0-local`; override with `ARKHE_B0_TENANT`.
Set `DATABASE_URL` and `ARKHE_TENANT_ID` to the actual persisted tenant for export:

```
target/debug/export_checkpoint ops/local/besu-b0/checkpoint.json
python scripts/besu_b0.py anchor --checkpoint ops/local/besu-b0/checkpoint.json
python scripts/besu_b0.py stop
```

Windows binaries use `.exe`. For Docker append `--engine docker` to Python
commands; Podman defaults to connection `arkhe-runtime`.

## What is checked

The exporter serializes against WormGraph appends using a tenant advisory lock,
reads record hashes by persistent append position, builds an MMR and persists its
checkpoint in the append-only checkpoint table. It exports a proof and canonical
checkpoint bytes. Existing record positions are assigned once by additive migration;
all subsequent writers must use the graph admission methods and shared lock.

The anchor script independently reproduces the checkpoint encoding, checks its
BLAKE3 domain-separated digest, verifies MMR inclusion using the actual WASM
module, and rejects a changed leaf. It then checks Besu's reported version and
four validators, deploys AnchorRegistry, anchors the checkpoint digest, waits for
a successful receipt, reads back the digest, and checks retry/conflict/owner rules.
The contract stores the checkpoint digest, **not** an Ethereum MPT root or WER.
It is one registry per tenant/stream. MMR verification stays offline.

RPC is published only on localhost:18545. The private test wallet, node keys,
checkpoint and receipts stay in ignored local storage or the named container volume.
The wallet is a disposable test account, never a production credential.
Stop the four validators after use; their volume is preserved.

## Limits

Local single-host validators do not demonstrate four independent organizations.
B0 proves anchoring mechanics for persisted fixtures, not production verification,
HackenProof interoperability, B1 multi-log, B2 consortium, B3 Ed25519 on-chain,
B4 Tessera privacy, C2PA promotion or deployment compliance.
The dedicated GitHub workflow is configured; a local PASS is not remote execution.

## Local execution evidence

Local results (including failures retained before corrected runs) are under
`docs/evidence/local/2026-10-17/arkhe-bugbounty-persistence/RESULTS.md`.
A passing B0 run contains a real contract address, transaction hash and block
number; its checkpoint is built from four persisted synthetic fixture WERs.
The checkpoint and receipt are copied beside those results without wallet keys.
The evidence does not promote the crate, C2PA or a consortium to production-ready.
