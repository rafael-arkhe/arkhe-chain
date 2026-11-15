# Private key hardening (KMS/HSM) and governance contingency

This document lists custody requirements this crate does not yet meet. The node process keeps the proposer Ed25519 key in memory. There is no HSM, no k-of-n roster, and no immunity to intervention. An administrator can stop publication. With current code they cannot authorize a release alone, because this crate does not authorize release.

---

## 1. Core principles

1. **No master key or backdoor:**
   The Arkhe protocol has no global administrative keys (*god keys*), backdoors, or roles that can override consensus rules, revert blocks, or move funds unilaterally.
2. **Code-as-law governance:**
   Governance is exercised only through cryptographic compliance verdicts (`DecisionVerdict` in canonical domain `AKG:VERDICT:v1`) and block validation agreed among network validators.
3. **Fail-closed under any ambiguity:**
   Any signature anomaly, snapshot integrity issue, ZK proof format, or contingency configuration forces the node to reject the transaction or halt state advance (`FAIL_CLOSED:`), preventing silent acceptance of invalid data.
4. **Secret isolation and non-exportability:**
   The node currently keeps the Ed25519 signer in process memory. HSM or KMS custody is a requirement of an environment not yet validated, not a property of this crate.

---

## 2. Hybrid cryptography and key requirements

As specified in `docs/admissao.md` and `docs/consenso.md`, `arkhe-chain` operates under a dual model:

| Key role | Algorithm | Key / signature size | Signature domain | Protocol function |
| --- | --- | --- | --- | --- |
| **Proposer / validator** | Ed25519 | Key: 32 bytes<br>Signature: 64 bytes | `AKG:CHAIN:PROPOSER:v1`<br>`AKG:CHAIN:PRECOMMIT:v4` | Canonical block signatures and local precommit attestations. `v4` binds round, single part, and `arkhe-chain`. `v3`, `v2`, and `v1` only reopen old files. libp2p network identity. |
| **Transaction (sender)** | Ed25519 | Key: 32 bytes<br>Signature: 64 bytes | `AKG:CHAIN:SENDER:v1` | Signature over transaction `subject` (`nonce`, `sender`, `recipient`, `value`, `signature_mldsa`). |
| **Quantum resistance (ML-DSA)** | ML-DSA-65 (FIPS 204) | Key: 1952 bytes<br>Signature: 3309 bytes | `AKG:CHAIN:MLDSA65:v1` | Post-quantum signature over transaction data (`nonce`, `sender`, `recipient`, `value`). |
| **EVM governance / bridge** | Ethereum account / multisig | Address: 20 bytes | N/A (EVM calls) | ZK verifier contract updates (`setVerifier`) in `ArkheValidityBridge.sol`. |

---

## 3. Private key hardening (KMS / HSM)

To ensure operators or third parties cannot coerce or extract cryptographic credentials, every production validator node and governance system environment must meet the following hardening requirements:

### 3.1. Hardware and security module requirements
- **FIPS certification:** Mandatory use of hardware security modules certified under **FIPS 140-2/140-3 Level 3 or Level 4** (or Common Criteria EAL 4+).
- **Non-exportable material:**
  - All asymmetric keys must be generated inside the security enclave via hardware random number generator (TRNG).
  - Key attributes must prohibit plaintext export (*wrap* disabled or restricted to M-of-N quorum schemes with Shamir secret sharing).
- **Isolated signing operation:**
  - The validator node requests signature by sending only the canonical message preformatted in the specific Arkhe domain.
  - The cryptographic enclave validates format restrictions before computing the signature.
- **Post-quantum support in KMS:**
  - For ML-DSA-65 keys (FIPS 204), when cloud KMS does not offer native post-quantum primitives in silicon, use an isolation-based cryptographic module on Confidential Computing (such as AWS Nitro Enclaves, AMD SEV-SNP, or Intel SGX) with encrypted remote attestation, so seed material is never exposed to the host operating system.

### 3.2. Separation of duties and access controls (IAM / RBAC)
- Least privilege: the `ArkheNode` process execution identity has only `kms:Sign` permission on the ARN of its specific validator key.
- Immutable KMS policies protected against immediate deletion (*Key Deletion Protection* with mandatory 30-day quarantine).
- Direct administrative permissions disabled for individual user accounts in production environments.

---

## 4. Decentralization the code does not deliver yet

To ensure code development and governance are not captured or stalled by single entities, the following pillars apply:

### 4.1. Distributed validator set
- **Jurisdictional and geographic diversity:**
  - Validators registered in `validators` must be operated by independent organizations in distinct legal jurisdictions.
  - No single operator may control a majority of active validators.
- **Immunity to reorgs and forks:**
  - Per `arkhe-chain` architecture, a sibling block from another proposer is recorded as `Fork` and **never replaces the adopted canonical tip**.
  - Proposers attempting divergent blocks at the same height are marked `Equivocation`.
- **No unilateral quorum:**
  - `bft_commit` passes only when the highest round of the canonical hash exceeds two thirds of configured validators. New precommit requires a single part equal to block hash and identifier `arkhe-chain`. The tip does not move. There is no `CanonicalVote`.

### 4.2. Source governance and release process
- **Multi-signature for code changes:**
  - Commits to canonical repositories and software releases require Ed25519/GPG cryptographic signatures from at least M-of-N independent maintainers.
- **Audit and reproducible homologation:**
  - Dossier `docs/homologacao.md` records that a second person has not yet rerun the gate and that isolated checkout is not the test command. Homologation mark was not granted.
- **Decentralized code and state distribution:**
  - Permanent mirroring on decentralized immutable protocols (such as Hashtree/Nostr via `htree://` and git peer-to-peer), eliminating single points of censorship on centralized platforms.

### 4.3. Smart contract governance (bridge)
- In `contracts/ArkheValidityBridge.sol`, parameter `governance` is immutable (`address public immutable governance`).
- Governance address must be a multi-sig contract (e.g. Gnosis Safe with timelock) maintained by decentralized entities with qualified minimum quorum.
- The only prerogative of the governance address is updating the ZK verifier contract (`setVerifier`), auditable via `VerifierUpdated`. There are no methods to redeem or retroactively modify settled blocks (`settledBlocks`).

---

## 5. Contingency policy and failure modes (fail-closed)

Operational continuity and asset protection rest on strict contingency rules:

### 5.1. Deterministic emergency halt (`emergency.halt`)
- **Mechanism:** Defined via `arkhe-chain.properties` (`emergency.halt=true`).
- **Behavior:**
  - Total immediate block on new mempool admission (`ingest`), block proposal and seal (`propose_and_seal_block`), and external block adoption (`import_block`).
  - State, balances, and MMR records remain 100% preserved and unchanged.
- **Fail-closed on invalid configuration:**
  - If the properties file is corrupted, removed, or set to a value other than `true` or `false`, `load_emergency_halt` returns `HaltConfig` and the node enters preventive halt (`inner.emergency_halt = true`).

### 5.2. ZK settlement contingency and RPC failures
- When a settlement proof is submitted without an active Groth16 verifier or transport RPC is unavailable:
  - The protocol triggers `hold_for_absent_verifier`, creating an in-memory `SettlementContingency`.
  - Bitcoin anchor remains local (`broadcast = false`), no balance changes, and no spurious receipt is forged (`receipt = None`).
  - Contingency waits for decentralized resolution without compromising the local ledger.

### 5.3. Key rotation on suspected compromise
1. **Identification and isolation:**
   If a validator key is suspected leaked, the operator must immediately revoke KMS/HSM access and notify the validator set.
2. **Replacement without consensus rupture:**
   - Validator set replacement is reflected in node startup with the new authorized public key configuration.
   - Attempts by the old key to sign blocks on the current chain are discarded by updated nodes (`NotProposer` or `BadProposerSignature`).
3. **Secure persistence:**
   File written now is `AKGCHNS7`. `AKGCHNS6` and `AKGCHNS5` still open. Tampered file that does not reproduce state returns `ChainError::Snapshot`.

---

## 6. Compliance summary

This text does not guarantee immunity. What the crate does today is refuse missing signature, require more than two thirds of validators on the highest round of `bft_commit`, and stop when `emergency.halt` is on. HSM, FIPS 140, Nitro, SGX, and release multisig are not in this repository.