# Applying this slice to Arkhe

Recommended destination:

`crates/arkhe-core/`

The currently visible public repository snapshot has an `arkhe-core` crate, but its top-level source files are empty in that snapshot. Treat this package as a candidate implementation to merge with the actual local branch rather than blindly overwriting unpublished work.

## Suggested mapping

- `src/canonical.rs` -> `crates/arkhe-core/src/canonical.rs`
- `src/digest.rs` -> `crates/arkhe-core/src/digest.rs`
- `src/types.rs` -> merge into the kernel type layer after review
- `tests/golden_vectors.rs` -> kernel integration tests
- `tests/mutation.rs` -> kernel invariant/mutation tests
- `vectors/canonicalization-v1.json` -> `vectors/p0/`
- `reference/python/arkhe_p0_ref.py` -> `tools/reference/` or `tests/reference/`

## Do not do yet

- Do not call the encoding public wire v1.
- Do not migrate C2PA bytes through the Arkhe canonicalizer.
- Do not add signing keys.
- Do not add MMR encoding to this same change.
- Do not remove `--locked` from normal CI after the intended dependency update is committed.

## Required repository gates

Once integrated into the real workspace:

    cargo fmt --check
    cargo check --locked --workspace
    cargo clippy --locked --workspace --all-targets -- -D warnings
    cargo test --locked --workspace
    cargo audit

Then run the independent vector generator and confirm the Rust tests still accept exactly the checked-in vectors.
