# Attestations

`AttestRegistry` (`src/attest.rs`) records signed statements and consumes single-use approvals. The node keeps it in state and operations ride in blocks. The covered flow is request, artifact proposal, evaluation, approval of the exact hash, single execution, and receipt.

## What does not exist yet

- Inclusion in a block is not finality. An inclusion proof is valid against the registry root at the node tip. Finality remains that of `finality` and `committed_height`, with limits described in [consenso.md](consenso.md).
- The registry root does not enter anchoring or the proof journal.
- Pending operations live only in memory on the node that received them. They are not written to the file and are not sent to other nodes. Peers only see them inside a block.
- `Execute` has no signature of its own. The block proposer signature covers it, so any validator that seals can consume a valid approval. The receipt does not name an executor.
- The operator reads grants from genesis and opens the chain with them, but has no command-line option to send attestations or executions. `submit_attestation` and `submit_execution` exist only in the library.
- `--show-genesis` does not print grant count. The hash it prints covers them.
- The registry accepts 4096 leaves over the chain lifetime, counting attestations and receipts. After that it returns `Attest("full")`.
- There is no API or explorer page.
- The only accepted scheme is Ed25519 (`ATTEST_SCHEME_ED25519`). EIP-712 and ERC-1271 are not implemented. Ed25519 is not post-quantum.
- Request `budget` is signed and is not charged anywhere.

## On the node

The registry is part of `ChainState`. Domain is `CHAIN_ID`, the node genesis hash, and audience `arkhe-chain/attest`. Policy keys are Ed25519 keys of accounts. Grants enter via `ArkheNode::new_with_grants` and `open_with_grants` and are part of genesis hash, one line `grant <account> <role> <grantor> <height>` per grant. Without grants, genesis hash is unchanged. A node opened without grants admits attestations and executes no approval.

In the operator genesis file the line is the same: `grant <account> <role> <grantor> <height>`. Role is `requester`, `author`, `evaluator`, or `approver`, lowercase. Height is the last height the grant is valid, only digits as a `u64` prints; `0500` and `+5` are `Malformed`. `parse_genesis` checks these lines and `parse_genesis_grants` returns them. Hash covers validators, then accounts, then grants, each group in file order. A grant naming an account absent from genesis returns `BadAccount` on open and does not create the file. A file created with certain grants only opens with the same ones; others return `Genesis`.

A block carries, after transactions, a list of up to 64 operations: `Admit` with the attestation or `Execute` with `approval`, `action`, and `artifact`. A block with no operations has the same bytes as before. A block may have operations and no transactions; without both it is `Malformed`. The proposer signature covers operations.

Operations are applied after transactions at block height. On import, any rejected operation rejects the block. `state_root` covers registry root and count from the first leaf, under `AKG:CHAIN:STATE:v2`. While the transaction MMR is empty, v2 writes 32 zero bytes in place of its root.

`submit_attestation` and `submit_execution` test the operation against state at the next height, after those already waiting, and place it in a queue of 256. `propose_and_seal_block` takes up to 64 from the queue. An operation that fails when building the block stays out and appears in `rejected`. After each block, the queue keeps only what still applies.

The node file does not store the registry separately. `open_with_grants` replays blocks and each header checks the root. Opening with other grants returns `Genesis`.

`attest_status`, `attest_receipt`, `attest_root`, `attest_count`, `attest_policy_digest`, and `attest_inclusion_proof` read the registry at the tip.

## Attestation

Fields: `version` (1), `scheme` (1), `chain_id`, `genesis`, `audience`, `signer`, 32-byte `nonce`, `not_before`, `expires` (heights, inclusive), `claim`, and `signature`.

`Attestation::id` is BLAKE3 domain `AKG:CHAIN:ATTEST:v1` over all fields except signature. Signature is Ed25519 over `AKG:CHAIN:ATTEST:SIG:v1` followed by id.

| `Claim` | Fields | Signer role |
| --- | --- | --- |
| `Request` | `task`, `budget` | `Requester` |
| `Artifact` | `request` (request id), `artifact` | `Author` |
| `Evaluation` | `artifact`, `suite`, `environment`, `evidence`, `passed` | `Evaluator` |
| `Approval` | `action`, `artifact`, `evaluation` (evaluation id), `policy` | `Approver` |
| `Revocation` | `delegate`, `role` | grantor |

## Policy

`AttestPolicy` has Ed25519 keys per account and grants (`delegate`, `role`, `grantor`, `expires`). Each account–role pair appears at most once. `AttestPolicy::digest` covers keys and grants. Revocations are registry state and sit outside the digest.

## Admission

`admit(att, height)` checks, in this order: version and scheme (`Attest("version")`), `chain_id`, `genesis`, and `audience` equal to the registry’s (`Attest("domain")`), account shape, height window (`Attest("window")`), known key and signature (`UnverifiedSignature`), signer and nonce not yet used (`Attest("replay")`), 4096 leaves in the registry (`Attest("full")`), and 64 attestations per signer (`Attest("quota")`).

A revocation is admitted only when the signer is the `grantor` of the grant (`Attest("authority")`). It takes effect from the height it was admitted.

Admission does not require role and does not check links or content. A false evaluation signed by an account with a key is admitted.

## Execution

`execute(approval, action, artifact, height, effect)` runs `effect` after all checks. If `effect` fails, the approval stays unused and the registry does not change. If it passes, the approval is consumed and the receipt enters the MMR in the same call. Exclusion between concurrent calls is `&mut self`.

| Check | Error |
| --- | --- |
| unknown id | `Attest("unknown")` |
| attestation is not `Approval` | `Attest("kind")` |
| approval already consumed | `Attest("consumed")` |
| height outside approval or evaluation window | `Attest("window")` |
| approver or evaluator without current role | `Attest("authority")` |
| `policy` differs from registry digest | `Attest("policy")` |
| `action` differs from requested | `Attest("action")` |
| `artifact` differs from request | `Attest("artifact")` |
| evaluation missing, wrong type, or wrong artifact | `Attest("link")` |
| evaluation with `passed = false` | `Attest("evaluation")` |
| evaluator equals approver, or author equals one of them | `Attest("separation")` |
| no artifact proposal from current author for current requester request | `Attest("link")` |

## Status

`status(id, height)` returns separate fields. None of them assert the statement is true.

| Field | Meaning |
| --- | --- |
| `signature_valid` | signature verified on admission |
| `authority_confirmed` | signer has the claim type’s role at requested height |
| `included` | leaf index in registry MMR |
| `execution_recorded` | receipt leaf index when approval was executed |
| `evidence_referenced` | statement cites an evidence hash; registry does not store evidence or verify fetchability |

`inclusion_proof(leaf)` returns proof, leaf, and root. Verification is `arkhe_verify_core::rbb::mmr::verify`.

`OfflineVerificationBundle::from_registry` exports one executed approval, its receipt, and an MMR inclusion proof against a `RegistryCheckpoint`. `verify_inclusion` replays `arkhe_verify_core::rbb::mmr::verify` with a checkpoint obtained independently of the bundle. `verify_external_anchoring`: `ExternalAnchoringProof::RekorWitness` verifies RFC 6962 inclusion, checkpoint binding, and signed checkpoint envelopes (pinned Sigstore trusted root). Witnesses that include Rekor SET material fail closed (`ExternalAnchorRekor("set-pending")`) until SET verification ships. Stubs (`rekor:dryrun`), absent anchors, and `BtcOpReturnPlan` without a broadcast still fail closed. Mainnet broadcast is not implemented.

## Tests

`cargo test -p arkhe-chain --test attest` runs 14 tests. Each invariant has at least one rejection: field changed after signature, signature from another domain, second execution, 16 concurrent executions with one effect, key without role, expired grant, revoked grant, approval for A used on B, and false statement that only gets provable statuses.

`cargo test -p arkhe-chain --test audit_bundle` runs 5 tests: local MMR inclusion, tampered checkpoint/leaf rejection, fail-closed stub variants, recorded Rekor witness acceptance (synthetic, no SET), and witness falsifiers. `cargo test -p arkhe-chain --test rekor_fixture` runs 2 tests: committed public Rekor Merkle+checkpoint offline (`verify_recorded_witness_rekor_log`) and fail-closed `set-pending` when SET is present. `cargo test -p arkhe-chain --test rekor_online` skips unless `ARKHE_REKOR_ONLINE=1`.

`cargo test -p arkhe-chain --test attest_chain` runs 5 tests with two nodes: the second replays operations and reaches the same root and receipt; a resigned block with one fewer operation, wrong order, other artifact, or repeated execution is rejected; transfer and operation share a block; reopened file rebuilds registry and refuses other grants.

`cargo test -p arkhe-chain --test operator a_genesis_grant` covers the `grant` line: parsing, seven refused shapes, hash equal to `new_with_grants`, and binary does not create file for missing account and does not open file with different grants.

There is no fork test, P2P sync test, or precommit test with blocks carrying operations.

The case where artifact author is also approver or evaluator is in code and has no test.