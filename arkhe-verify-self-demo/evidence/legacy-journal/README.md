# Authenticated legacy dispatch and durable journal evidence

Source proposal: https://github.com/rafael-arkhe/arkhe/pull/3
Commit: c774f1cf2e1f1d00c10ed3ccdeb7a949288caba8
CI: https://github.com/rafael-arkhe/arkhe/actions/runs/40180552021 (success)

Observed on Windows with Rust 1.96.0, using `--locked`:

- `tests.txt`: 15 passing broker/journal tests, one ignored child helper. The
  parent crash test explicitly invokes that helper in a subprocess, observes
  process exit 86 after a synced external-effect marker, then reopens the journal
  and verifies UNCERTAIN without a second dispatch.
- `snapshot-tests.txt`: the same 15 tests pass from the isolated review snapshot.
- `runtime-check.txt`: actual arkhe-runtime with `sqlite-dispatch` compiles.
- `host-factory-check.txt`: the exact runtime factory compiles in the snapshot.
- `policy-regression.txt`: nine policy tests pass; two properties use 10,000
  generated permitted requests each.
- `clippy.txt`: kernel library and the three selected broker/journal test targets
  pass Clippy with warnings denied. This is a scoped check, not all workspace targets.
- `github-run.json` and `public-artifacts/`: successful Linux run, public OIDC
  bundle and logs, including the same 15 broker/journal tests and native policy
  tests. The admitted production WASM accepts the positive control and rejects
  15 attacks. Journal tests execute natively; they do not execute inside WASM.
- `independent-offline-verification.json`: downloaded WASM and bundle verified
  offline locally using the separately acquired Cosign TUF trust snapshot, exact
  new workflow identity and pinned WASM hash; positive control and 15 attacks
  executed again. Archive ZIP digest and all 16 release manifest entries match.

Public artifact ID: 12594018161. ZIP SHA-256:
`e6255fb3e6d7c737c5bd1693f6faf15a383566e3f75da53ac25f83f721e1bce1`.
WASM SHA-256:
`c4d406396711c594c14c9694b06a3b76102b14297eac7e72494d0b1fc1c6e6e5`.
The included independent trust snapshot documents this run's input; a recipient
must obtain roots through its own trusted configuration/authenticated acquisition.

Reproduce from `source/` in the archive:

```sh
cargo test --locked -p arkhe-kernel --features sqlite-broker --test authenticated_dispatch --test broker_durable --test action_broker
cargo test --locked -p arkhe-verify-core --test policy_compatibility --test policy_adversarial
cargo check --locked -p arkhe-host-dispatch
```

The production factory installs an operator-owned authenticated policy context
around the existing resolver. Its regular gate/broker paths then enforce proof
and preserve the inner governance requirements. Unsigned requests, unsupported
executors and journals fail closed. Existing callers must use this configured
factory/profile; this is not evidence of an updated live deployment. The snapshot
includes production runtime wiring as reference, while the small host-dispatch
package compiles the factory without unrelated HTTP/PostgreSQL services.

For local SQL effects, one SQLite transaction commits effect, receipt, operation
and consumed nonce, or rolls them all back. The host callback must only use local
SQL. External dispatch reserves durably first and never retries uncertain work
automatically; no distributed atomicity or provider exactly-once claim is made.
Authenticated AP2 payments remain blocked until closed-mandate and nonce
consumption are combined. The previous public-signing evidence remains separate;
the new CI metadata records the status of this proposal's run.

`source-manifest.json` hashes the reviewed snapshot; every staged Git blob was
checked against it before commit. The archive manifest independently hashes each
packaged source/evidence file. These hashes identify bytes; they do not replace
operator trust or authenticate this local archive by themselves.
