# arkhe-chain

**arkhe-chain** is a local node that extends a tip. Admission is `ArkheNode::ingest`. Transaction payload is canonical CBOR of `DecisionVerdict` in domain `AKG:VERDICT:v1`.

There is no type `ArkheChain` and no function `ingest_transaction`. The crate is **not homologated**. Gates **A3** and **A4** remain **PENDING** (a third person must rerun on the published commit). Full gate history, logs, and open items are in [docs/homologacao.md](docs/homologacao.md)—not summarized here.

## Publication

| Mirror | Location |
| --- | --- |
| GitHub | <https://github.com/rafael-arkhe/arkhe-chain> |
| Hashtree | `htree://npub16azl5mr3qp2tf6duv0z6uh2ky4cvp60gj30yhnm0882k420c5a6shjzett/arkhe-chain` |
| Hashtree (web) | <https://git.iris.to/#/npub16azl5mr3qp2tf6duv0z6uh2ky4cvp60gj30yhnm0882k420c5a6shjzett/arkhe-chain> |
| Radicle (lean mirror) | `rad:zC1r1HgkAcmHm8fLCqaNugjny8i1` — may lag the monorepo and may not include the latest **A1** gate artifacts |

This crate’s `Cargo.toml` inherits version, edition, and license from the Arkhe workspace. Tests below are run from the workspace root, not from an isolated clone of the GitHub standalone layout.

## Build and test

From the Arkhe workspace root:

```text
cargo test -p arkhe-chain -- --test-threads=1
```

**Latest documented A1 gate** (15 November 2026): [docs/gate-2026-11-15-a1-tree.log](docs/gate-2026-11-15-a1-tree.log) — exit 0, **236** passed, **0** failed, **0** ignored; tree **T** at commit `076c9459a8f60117a3883a45b020312598c49009`. The homologation record and log are **T′** artifacts on the branch that contains them.

After **C2** (`4ff40ef7`, `tests/c2_canonical_vote.rs`), the development branch reports **248** passed locally with the same command; there is **no published A1 log** yet for that suite size. Incremental Windows logs (e.g. 217 tests) are not the A1 source of truth—see [docs/homologacao.md](docs/homologacao.md).

## Gate status (summary)

| ID | Status | Notes |
| --- | --- | --- |
| A1 | Logged (**T**) | 236/0/0 at `076c9459`; log SHA256 in [homologacao.md](docs/homologacao.md) |
| A3 | **PENDING** | Third-person rerun on published **T′**; `arkhen` on this machine does not close A3 |
| A4 | **PENDING** | Third-person rerun on published root when applicable |
| C1 | Open | Sibling stays `Fork`; precommit threshold does not move the tip |
| C2 | Partial LEMMA | `CanonicalVote` + pure `consensus::bft_commit` and 4096-leaf `rotation_proof` paths tested; live **Precommit v4** and `ArkheNode::bft_commit` on the tip unchanged; **CanonicalVote** is not the live wire yet |
| F1 | Open | Guest ELF, 32-byte `image_id`, verification key |
| F2 | Open | No Bitcoin payout the crate declares; `broadcast` stays false |
| F3 | Open | `settled` stays false; confirmation does not enter the file |
| KMS | Open | No HSM custody; see [docs/seguranca_chaves.md](docs/seguranca_chaves.md) |
| Testnet | Scaffolding | `testnet/` — not homologated; see [docs/testnet.md](docs/testnet.md) |

Details and historical logs: [docs/homologacao.md](docs/homologacao.md).

## Documentation

- [Gate record](docs/homologacao.md)
- [Admission](docs/admissao.md)
- [Attestations](docs/atestados.md)
- [State and snapshot](docs/estado.md)
- [Tip, fork, and finality](docs/consenso.md)
- [Synchronization](docs/sincronizacao.md)
- [Proof and anchor](docs/liquidacao.md)
- [Key hardening and contingency](docs/seguranca_chaves.md)
- [Errors](docs/erros.md)
- [Rules (A/P/R/R4)](docs/regras.md)
- [Audit remediation](docs/audit-remediation.md)
- [Local testnet (scaffolding)](docs/testnet.md) — `testnet/`; not homologated

## Limits the code maintains

- Every send requires Ed25519 and ML-DSA-65. Empty field, size other than 3309 bytes, invalid signature or missing key does not move balance.
- A sibling block from another proposer, with the same parent and height, returns `Fork` and does not replace the tip.
- Two distinct blocks from the same proposer at the same height return `Equivocation`.
- `finality` is local depth. On the live path, `ArkheNode::bft_commit` counts only the highest round and passes only with more than two thirds of validators, weight 1 each, on the canonical hash; wire signatures use `AKG:CHAIN:PRECOMMIT:v4` (round, single part equal to block hash, identifier `arkhe-chain`). The `consensus` module also defines `CanonicalVote` and a pure `consensus::bft_commit` for quorum checks under test (**C2**); that path is not the live wire, and production precommit behavior on the tip is unchanged.
- `submit_proof_and_bridge_assets` returns `VerifierAbsent`. Set `image_id` does not load. `verifyProof` in the contract returns false.
- Accepted anchor is 37 bytes, `ARKHE` followed by `state_root`. `broadcast` stays false.
- `cite_ethereum_execution` cites execution block reported by caller and stores that citation. Another citation at the same height is `EthereumConflict`. `confirm_ethereum_execution` confirms only when a client returns the same hash. Without client, response is `RpcAbsent`. `settled` stays false and confirmation does not enter the file.
- `accepted_peers` lists node validators. There is no peer discovery on the network.

## Testnet

Scaffolding and hygiene for a local devnet are in [docs/testnet.md](docs/testnet.md) and `testnet/README.md`. Running testnet scripts does not homologate the crate.