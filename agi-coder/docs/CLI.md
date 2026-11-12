# CLI

The cargo target is `agi`. On Windows the file name is `agi.exe`. `cargo run -p agi-coder-cli` uses that target. Release archives and the CLI image copy it to `agi-coder` as well.

The process has no execution authority. Exit status is nonzero when argument parsing fails, a file cannot be read, a proof or campaign is rejected, or a library call returns an error.

## Operator commands

| Command | Result |
| --- | --- |
| `agi status` | JSON catalog of local and pending capabilities. It does not re-run tests. |
| `agi mcp` | Stdio launch entry for `@agi-coder/mcp-server`. Does not start the server or open a session. |
| `agi pending` | JSON for the seven pending capabilities. Each report stays negative: no weights, no database, no published root, no GPU proof, no editor, no observed CI, no desktop window. |
| `agi observe --workspace <dir> --output <directory>` | Writes `deepinfer.json`, `postgres.json`, `autonomy.json`, and `hosted-ci.json` from a local probe. `weights_loaded`, `native_generation`, `connected`, `deployed`, `editor`, and `executed` stay false. A URL is rejected. |
| `agi ui --bind 127.0.0.1:8791` | Serves the operator page on a numeric loopback address until the process stops. |
| `agi plan "<goal>"` | Deterministic design → implement → test → audit → deploy plan. Does not edit a repository. |
| `agi arc3 --actions 1,1` | Continues the saved local-seek frame, then applies the actions. `reset` starts at level 1. Level 3 has walls. A finished level sets `ratio` to the steps taken over the known shortest path. `official` is false and `score` is null. The frame is saved to `observations/local-seek.json`. |
| `agi run --demo --goal "<goal>"` | Offline five-stage demonstration. Prints `mode: offline-demo` and `deployed: false`. |
| `agi release --workspace <dir> --output <directory>` | Checks `design/DESIGN.md` and the built `agi` binary, runs `cargo test -p agi-coder-cli --lib`, then recomputes the ten faculty fixture files. It writes `manifest.json` only if those checks pass. The deploy stage is inconclusive. `production` and `editor` stay false. A URL is rejected. |

`ui` rejects `0.0.0.0`, public addresses, port 0, and host names. The page can call `status`, `plan`, and the demo. It returns 404 for `infer` and `verify-spec`.

## Receipt

The operator receipt is ed25519 and 174 bytes. `agi attest-receipt <seed-hex> <receipt-hex>` signs that body with a seed that must differ from the process seed. The page prepares a draft with the signature left empty and accepts a pasted signature only after `verify` succeeds for a different key and the MMR inclusion proof. A missing or malformed bundle returns an error and does not become a pass.

A session assessment of `pass` means those local checks verified. It does not set `authority`, `declares_agi`, or `deployed`. `agi run --demo` stays `deployed: false` and `deployment: inconclusive` whether or not a receipt verifies. ML-DSA-65 is not used.

A public key that is not 32 bytes is HTTP 400, `{ "error", "authority": false }`, and the assessment stays `pending`. A different ed25519 key whose signature does not match the receipt is a recorded fail, `signature rejected`, and the assessment becomes `contested`. Neither outcome sets authority.

A blank entity is not an attestation. `agi` records that separation as a fail, `entity is missing`, issues no receipt, and the assessment becomes `contested`. `authority` and `declares_agi` stay false.

## Terminal commands

These stay on the terminal because they read a trusted local file or start a host process.

| Command | Result |
| --- | --- |
| `agi infer --bridge-config <file> --request <file>` | Unverified DeepInfer proposal. `verified` stays false. |
| `agi verify-spec <manifest>` | Process campaign. Nonzero when the campaign is not accepted. Commands run on the host. |
| `agi verify --record <file> --intent <file> --policy <file> --now <unix>` | Gate decision for one signed record. The policy file must be trusted separately from the record. |
| `agi anchor <hex-hash>...` | Local MMR root and proofs. Scope is `local-only`. |
| `agi mmr --value <hash> --root <hash> --proof <file>` | Inclusion check against the supplied root. |
| `agi cost <ledger>` | Sum of an explicit integer micro-USD ledger. |

`agi --help` lists the same commands.
