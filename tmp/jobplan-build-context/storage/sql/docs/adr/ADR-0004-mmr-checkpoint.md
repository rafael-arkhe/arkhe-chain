# ADR-0004 — MMR checkpoints bind frozen MMRProfile v1

Status: Accepted.

ProfileRef:

`arkhe-mmr@1`

`BLAKE3-256:bcd07a275061ef385fccdd184030c2358fdd0937477cb0ef30cf8148342f2450`

Checkpoints store leaf_count, mmr_size, root, peaks, covered hash and
profile_digest. They are append-only.
