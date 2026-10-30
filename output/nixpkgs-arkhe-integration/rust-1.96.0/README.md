# Rust 1.96.0 integration

Prepared locally at commit 9c1d848c9. Apply to the fork base using:

```bash
git am --keep-cr arkhe-rust-1.96.0.patch
```

The complete series was applied to a temporary index of origin/master; its tree matched the prepared HEAD exactly. --keep-cr preserves the byte-exact source snapshot.

Rust 1.96.0, 24 x86_64-linux flake checks, required golden vectors, verifier/WASM/SDD rebuild comparisons and verifier CA validation passed in Ubuntu WSL. Current evidence is in arkhe/docs/validation/rust-1.96.0/. Earlier Rust 1.99 VM evidence remains historical. Nothing was pushed.
