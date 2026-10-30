# Arkhe P0 Executable v0

A drop-in experimental replacement for the currently empty `crates/arkhe-core` skeleton.

The accessible repository snapshot currently contains an `arkhe-core` package with empty source files, so this artifact is intentionally self-contained and does not claim to match unpushed local changes.

## Run

From this package:

    cd crates/arkhe-core
    cargo test
    cargo clippy --all-targets -- -D warnings

For integration into the Arkhe workspace, copy the crate files into `crates/arkhe-core`, update the workspace lockfile deliberately once, validate the full workspace, then return CI to `--locked`.

## What this implements

- restricted deterministic-CBOR canonicalization profile;
- SHA-256 + BLAKE3 digest agility;
- 0..N typed causal provenance;
- conditional authentication and anchor fields;
- claimed/trusted time distinction;
- optional witness evidence;
- canonicalization and mutation tests.

## What this intentionally does not implement yet

- final wire/API v1;
- MMR proofs/checkpoints;
- external anchor finality;
- authorization proofs;
- signing/key management;
- C2PA bridge integration.
