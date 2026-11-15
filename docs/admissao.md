# Admission

`ArkheNode::ingest` takes a `Transaction`. There is no second function that takes the transaction and verdict separately.

The payload is canonical CBOR of `arkhe_core::decision::DecisionVerdict`, domain `AKG:VERDICT:v1`. The map has keys `version`, `subject`, `event_type`, `policy_id`, `policy_digest`, `rule_id`, `decision` (`ALLOW` or `REJECT`), and `reason` (`RULE_ALLOWED`, `RULE_REJECTED`, `NO_RULE_MATCHED`, `POLICY_UNAVAILABLE`, or `EMERGENCY_STOP`). Only `RULE_ALLOWED` yields `Allow`. The verdict `subject` must equal `Transaction::subject`.

`subject` includes `signature_mldsa` and excludes the payload and `sender_signature`.

## Signatures

Every send carries both fields:

| Field | Size | Domain | Message |
| --- | --- | --- | --- |
| `signature_mldsa` | 3309 bytes, ML-DSA-65 (`fips204`, feature `ml-dsa-65`) | `AKG:CHAIN:MLDSA65:v1` | nonce, sender, recipient, and value |
| `sender_signature` | 64 bytes, Ed25519 | `AKG:CHAIN:SENDER:v1` | transaction subject |

The ML-DSA-65 public key is 1952 bytes. An empty `signature_mldsa` field returns `UnverifiedSignature`. Any size other than 3309 returns `BadSignatureLength`. Invalid signature or missing key returns `UnverifiedSignature` before moving balance.

The order in `apply_tx` is shape, Ed25519 key, Ed25519 verify, ML-DSA key, ML-DSA verify, verdict, nonce, transfer, and MMR.

## Nonce, value, and queue

The nonce must be the account’s next. Any other value is `BadNonce`. A non-allow verdict does not consume nonce, but the transaction still needs valid signatures to reach `Admission("not-allow")`.

Zero value does not change balances and still appends a leaf to the MMR. Transfer to the same account is `SelfTransfer`. Insufficient balance is `InsufficientBalance` and the transaction does not enter the mempool.

The mempool holds 1000 transactions. Payload fits 4096 bytes. A block seals at most 250 transactions. `propose_and_seal_block` only extends this node’s tip by one. Timestamp must be greater than zero and greater than the parent’s.

`emergency.halt=true` in `arkhe-chain.properties` blocks ingest, seal, and import. Text that is not exactly `true` or `false` is `HaltConfig` and the node stays stopped.