# AGI/MMR/v1 profile

All primitive hashes are 32-byte BLAKE3. `D(domain, parts)` hashes the UTF-8 domain byte length as u64 big-endian, the domain, then each part's u64 big-endian length followed by its bytes. Parts are ordered and not concatenated without framing.

| Item | Domain | Parts |
| --- | --- | --- |
| Leaf | `AGI/MMR/LEAF/v1` | raw 32-byte record digest |
| Parent | `AGI/MMR/NODE/v1` | left hash, right hash |
| Initial bag | `AGI/MMR/BAG/v1` | single byte 0, rightmost peak |
| Bag step | `AGI/MMR/BAG/v1` | single byte 1, next peak to the left, accumulated bag |
| Empty bag | `AGI/MMR/EMPTY/v1` | no parts |
| Root | `AGI/MMR/ROOT/v1` | leaf count as u64 big-endian, bag hash |

Peaks are the maximal perfect binary subtrees from left to right, corresponding to set bits of the leaf count from largest to smallest. Bagging folds right to left with an explicit empty-accumulator marker. The final root binds the exact leaf count, including for the empty graph.

An inclusion proof contains `leaf_index`, `leaf_count`, bottom-up `siblings`, and left-to-right `peaks`. The verifier derives the selected peak and relative leaf position from count/index. Each relative position bit determines sibling order. Sibling count must equal that peak's tree height; peak count must equal the population count of the leaf count. The reconstructed peak and bagged root must match. Extra paths or peaks are rejected.

JSON uses lowercase 64-character hex digests. Rust uses u64 indices; JavaScript supports only nonnegative safe integer indices/counts (through 2^53-1) and returns false outside that range. The in-memory implementation prioritizes clarity; rebuilding roots/proofs is O(n), not a persisted logarithmic storage engine.

`scripts/generate-mmr-vectors.py` is an independently implemented Python forest reference. Generation is a deliberate local action; CI reads committed fixtures and never regenerates them. Profile changes require reviewed changes to code, documentation, and fixtures. The WER fixture is separate and Rust-generated; no independent WER claim is made.
