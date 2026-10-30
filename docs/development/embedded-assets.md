# Embedded assets and stale compilation

Treat a binary that embeds stale assets as a class of correctness bugs. A successful
build does not establish which migration/schema/vector revision it contains.

- Literal Rust include!, include_str! and include_bytes! are tracked by rustc.
  Existing golden-vector fixtures use this mechanism; an extra build.rs is not
  required merely because the file is a canonical vector or JSON schema.
- Proc-macro discovery of a directory, such as sqlx::migrate!, must have build.rs
  emit cargo:rerun-if-changed for the directory (or an enclosing directory).
  Watching only the existing files misses newly added/removed migration files.
- Build scripts and external generators that read schemas/vectors must declare
  their inputs, generator/configuration and relevant environment variables using
  Cargo dependency directives, or execute the generator explicitly before builds.
  Those dependencies need review when the generator changes.
- New nonliteral macro paths require extending the dependency audit explicitly;
  they must not silently escape the check. Existing assets should be regenerated
  and verified independently against their recorded bytes after changes.

scripts/check_embedded_assets.py scans active workspace crates for literal include
macros and migration macros. It verifies existence, recognizes compiler tracking,
requires directory watches for migrations, and rejects unsupported nonliteral paths.
scripts/check_architecture.py includes this gate, so the existing local workflow
runs it. It is a bounded source audit, not a Rust parser or a proof of arbitrary
third-party proc-macro/generator behavior.

Regression tests cover missing watches, directory watches with newly added files,
insufficient per-file watches, missing include fixtures and unsupported dynamic
paths. The independent golden-vector regeneration gate remains a separate check.
