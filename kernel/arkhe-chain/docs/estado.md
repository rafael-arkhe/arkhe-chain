# State and snapshot

The genesis account is `genesis-alloc`. Initial supply is `100_000_000`. Debit and credit of a transfer happen together, or neither happens.

The MMR leaf is `tx.record()`, hash `AKG:CHAIN:TXREC:v1` over the full canonical transaction, including payload. The frontier is `arkhe_verify_core::rbb::mmr::Frontier`. `mmr_root` returns that raw root.

`state_root` is a separate commitment, domain `AKG:CHAIN:STATE:v1`, over MMR root, count, balances, and nonces. Account keys are not in that commitment. The block header stores `state_root`. On import, reproduced state must match that field and `mmr_count`.

When the attest registry has at least one leaf, the domain becomes `AKG:CHAIN:STATE:v2` and the commitment also covers that registry’s root and count. State with an empty registry keeps the v1 commitment, byte for byte. `mmr_count` still counts only transactions. Details are in [atestados.md](atestados.md).

## File

`ArkheNode::open` replays the chain from genesis. `new` without a path stays in memory only.

The file written without a paused walk is `AKGCHNS7`: height, tip, MMR peaks, balances, nonces, blocks, mempool, Ed25519 keys, ML-DSA keys, sibling blocks, precommits with round, and execution-block citations. The file ends with the 32-byte BLAKE3 of genesis. `AKGCHNS8` adds announced tip, cursor, and bodies already checked when sync hits the limit. The import that finishes clears that cursor. `AKGCHNS9` adds height confirmed by quorum. That height in the file is a claim: `open` runs `bft_commit` again with votes already checked; without quorum the file does not open and is not rewritten. `AKGCHN10` joins that height to the sync cursor. `AKGCHNS6` still opens; precommit in that file has no round and comes back as round 0. `AKGCHNS5` still opens and carries empty citations. `AKGCHNS1`, `AKGCHNS2`, `AKGCHNS3`, and `AKGCHNS4` return `Snapshot`. `ArkheNode::open` still opens a file without those 32 bytes, and the next write stores the hash from whoever opened. The `arkhe-chain` process does not adopt that file: it returns `Genesis` and does not rewrite. Another BLAKE3 is `Genesis` on both paths, and the file is not rewritten.

A mismatch in height, tip, peaks, balances, nonces, or keys also returns `Snapshot`. A precommit with altered signature does not open, and the file is not rewritten. A failed write on seal does not move tip, balance, or mempool. A failed write when storing a precommit removes that precommit from memory.

Import and seal replay the queue. What no longer applies is dropped. The next nonce remains.