# Proof and anchor

`submit_proof_and_bridge_assets` reads the journal and compares it to the sealed header. It then calls `UndeployedVerifier`, which returns `VerifierAbsent`. An `Ok` from a verifier is mapped to `ProofRejected`. The method does not return success and does not return a fabricated settlement hash.

The phase-0 journal is `u64be || bytes32 || bytes32`: block number, `claimed_root`, and `parent_hash`. The file `circuits/validity_slash.json` pins profile `arkhe-validity-slash-v1`, phase 0, system `risc0-groth16`, selector `73c457ba`, 260-byte seal, and max gas 276000. `image_id` is null. A set value, including 32 bytes in hex, makes `load_circuit` return `CircuitConfig`. There is no guest image id, verification key, or ELF.

The layout checked on the proof shape is a 4-byte selector, journal, and 260-byte seal. Block 0, zero root, or an all-zero seal is `ProofRejected`.

`contracts/Groth16Verifier.sol` does not embed a verification key. `verifyProof` returns false. `contracts/ArkheValidityBridge.sol` reverts `VerifierAbsent` when `zkVerifier` is the zero address. There is no pairing and no send to Base Sepolia.

## Anchor

`btc_op_return` is the 5 bytes `ARKHE` followed by the 32 bytes of `state_root`. `check_btc_op_return` accepts only those 37 bytes. Wrong prefix, wrong root, or other size, including a 77-byte buffer, is `InvalidAnchorPrefix`.

`AnchorPlan.broadcast` is false. This crate does not broadcast a Bitcoin transaction.

## Citing an execution block

`cite_ethereum_execution` links an already sealed Arkhe block to an execution block number and hash supplied by the caller. The commitment is BLAKE3 of `AKG:ETH:LINK:v1\0`, height, Arkhe block hash, `state_root`, execution number, and execution hash. Zero number or all-zero execution hash is `EthereumHeader`. Missing height is `UnknownBlock`.

The citation lives in snapshot `AKGCHNS7`. The same citation may be repeated. Another hash, another number, or a number that does not advance with height is `EthereumConflict` and does not replace the stored citation. A failed write does not leave the citation in memory. `settled` stays false. `confirm_ethereum_execution` asks the hash from the execution client. `https` uses the system certificate store and carries no authentication. Without a client, the response is `RpcAbsent`. A different hash is `EthereumConflict` and the stored citation remains. Confirmation does not enter the file: on reopen, `confirmed` is false again. `settleBlockWithProof` still reverts without a verifier. The two chains do not become one.