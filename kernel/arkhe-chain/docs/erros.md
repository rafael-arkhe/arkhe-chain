# Errors

Every `ChainError` variant is fail-closed. Stable text starts with `FAIL_CLOSED:`.

| Variant | When it appears |
| --- | --- |
| `MempoolEmpty` | Seal with no transaction in the queue |
| `MempoolFull` | Queue at 1000 |
| `EmptyValidators` | Empty validator set |
| `NotProposer` | Identity outside the set |
| `BadProposerKey` | Unreadable proposer key |
| `BadProposerSignature` | Ed25519 signature on block or precommit does not verify |
| `BadAccount` | Rejected account identifier |
| `BadTimestamp` | Timestamp zero or not advancing |
| `BadSignatureLength` | `signature_mldsa` length not 3309 and not empty |
| `UnverifiedSignature` | Empty ML-DSA field, invalid signature, or missing key |
| `Admission` | Verdict, payload, or subject rejected |
| `Attest` | Attestation or execution rejected by the attest registry; reasons are in [atestados.md](atestados.md) |
| `BadNonce` | Nonce is not the next one |
| `SelfTransfer` | Send to the same account |
| `InsufficientBalance` | Debit greater than balance |
| `Overflow` | Sum does not fit in `u64` |
| `Mmr` | Frontier does not accept the leaf |
| `Malformed` | Bytes are not the canonical block |
| `ParentMismatch` | Parent or height does not extend the tip |
| `Fork` | Valid sibling that does not replace the tip |
| `QuorumAbsent` | `bft_commit` without more than two thirds of validators on the highest round of the canonical hash |
| `RoundRegression` | Precommit from a round lower than already stored for the same hash |
| `BadPartSet` | Precommit whose part count is not 1, or whose part hash is not the block hash |
| `ChainId` | Precommit whose identifier is not `arkhe-chain` |
| `Equivocation` | Two blocks from the same proposer at the same height |
| `StateMismatch` | Root or MMR count differs from the header |
| `UnknownBlock` | Height or hash this chain does not have |
| `LockPoisoned` | Poisoned lock |
| `AnchorAddress` | EVM address without `0x` and 40 hex digits |
| `EthereumHeader` | Execution block number zero or all-zero execution hash |
| `EthereumConflict` | Second different citation at the same height, or execution number not advancing |
| `CircuitConfig` | Circuit pin differs from embedded file, or `image_id` set |
| `ProofRejected` | Journal, selector, or seal does not bind the block |
| `InvalidSelector` | Selector other than `73c457ba` |
| `InvalidSealLength` | Seal other than 260 bytes |
| `InvalidAnchorPrefix` | Buffer other than `ARKHE` plus `state_root` |
| `AuditBundle` | Offline bundle version, checkpoint, receipt, or leaf index mismatch |
| `ExternalAnchorAbsent` | No public transparency-log proof (expected until Rekor/mainnet is wired) |
| `ExternalAnchorStub` | Documented offline stub (e.g. `rekor:dryrun:`); not a production trust root |
| `VerifierAbsent` | Groth16 verifier not deployed |
| `RpcAbsent` | Settlement client absent |
| `RpcTimeout` | Settlement did not respond in time |
| `RpcUnavailable` | Settlement unavailable |
| `EmergencyHalt` | Emergency halt enabled |
| `HaltConfig` | Unreadable halt file |
| `P2p` | Out-of-set peer, own key (`self`), sync fork, hash, limit, or timeout |
| `Snapshot` | File does not reproduce state |