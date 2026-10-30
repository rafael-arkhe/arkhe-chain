# Arkhe Phase 1 — Frozen MMR Profile + Golden Vectors

This bundle completes the requested MMR Phase-1 closure.

## Frozen ProfileRef

`arkhe-mmr@1`

`BLAKE3-256:bcd07a275061ef385fccdd184030c2358fdd0937477cb0ef30cf8148342f2450`

## MMR roots

| leaves | mmr_size | root |
|---:|---:|---|
| 1 | 1 | `60499eb380feaca0c5b5385982e20abe3b4b3ef7ff5037dfad344b5f8a802c7b` |
| 3 | 4 | `edf432b5854467f8ceaa0102e37dae99200e96c9b184b02681ad4145ac4cbbf0` |
| 4 | 7 | `ff55b1c86c203cbc5c84a79803d4f921e317a8e72c0645535db4c1cc2e7d5d94` |
| 5 | 8 | `3686670ec4a843bc3caaf0d302906e7cb161f791ddbd739ffa0dbeda61f069bf` |
| 7 | 11 | `5b72738d4f0581752327a48be16dae227da624f7e0316b39f512f1f787fbdb64` |

## Contents

- `spec/mmr-profile-v1.md` — frozen human-readable profile.
- `spec/mmr-profile-v1.json` — machine-readable ProfileCore and ProfileRef.
- `tests/golden_vectors.json` — static Phase-1 golden contract.
- `tests/golden_vectors.rs` — native/WASM adapter harness, including all MMR proofs.
- `tests/verify_mmr_vectors.py` — structural/reproduction audit.
- `scripts/generate_vectors.py` — stdlib-only independent MMR reference generator.
- `schemas/golden-vectors-v1.schema.json`.
- `docs/EXECUTION.md`.
- `MANIFEST.sha256`.

The generator is intentionally outside the conformance CI gate.
CI should consume committed `golden_vectors.json`.
