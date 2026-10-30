from pathlib import Path

root = Path(r'D:\arkhe\work\nixpkgs-arkhe-integration')
docs = {}
docs['ROOT'] = r'''# nixpkgs-arkhe

A fork of [NixOS/nixpkgs](https://github.com/NixOS/nixpkgs) hosting Nix
packages for the Arkhe Rust crates: a flake, overlays, and NixOS modules.
Project files are in [`arkhe/`](arkhe/). Official Nixpkgs integration is being
prepared; no upstream PR has been opened and no package has been accepted yet.

## Use the Arkhe packages

Run on Linux or WSL with Nix and the `nix-command flakes` features enabled:

```sh
nix build 'github:rafael-arkhe/nixpkgs-arkhe?dir=arkhe#arkhe-verify-cli'
nix run 'github:rafael-arkhe/nixpkgs-arkhe?dir=arkhe#arkhe-verify-cli' -- --help
nix build 'github:rafael-arkhe/nixpkgs-arkhe?dir=arkhe#arkhe-verify-wasm'
nix build 'github:rafael-arkhe/nixpkgs-arkhe?dir=arkhe#arkhe-sdd-parser'
```

The `dir=arkhe` parameter selects the Arkhe flake. The root flake remains the
Nixpkgs flake. To pin this integration as well, specify a repository revision:
`github:rafael-arkhe/nixpkgs-arkhe/<commit>?dir=arkhe`.

From a local checkout:

```sh
cd arkhe
nix flake check --no-update-lock-file --print-build-logs
bash scripts/check-reproducibility.sh arkhe-verify-cli arkhe-verify-wasm arkhe-sdd-parser
```

## Validation observed on October 29, 2026

| Scope | Result |
|---|---|
| Overlay with pinned Rust 1.96.0 | 24 checks passed on x86_64-linux, Ubuntu WSL, Nix 2.35.4 |
| Verifier, WASM, and SDD | Identical rebuilds on the same machine; hashes and logs are checked in |
| CA verifier variant | Built; content addressing confirmed |
| Proposed Nixpkgs package | Build, golden vectors, BLAKE3 test, and `nix-build --check` passed with the upstream base's standard Rust 1.99.0 |
| Another machine/VM for the current configuration | Pending; historical VM records use a different revision/toolchain |
| aarch64 and Darwin | Not built in this validation run |

Local results do not establish approval or successful GitHub CI runs.
The CA variant is optional and requires `ca-derivations`; regular builds do
not require that experimental feature.

## Documentation and upstream contribution

- [Packages, overlays, modules, and verification commands](arkhe/README.md).
- [Rust 1.96.0 overlay evidence](arkhe/docs/validation/rust-1.96.0/results.json).
- [Proposed `arkhe-verify` contribution to NixOS/nixpkgs](arkhe/nixpkgs/README.md).
- [Rust 1.99.0 upstream package evidence](arkhe/docs/validation/nixpkgs-upstream/results.json).
- [Reproducibility and verification limits](arkhe/docs/reproducibility.md).

Source revision
[`228da8e803e9f81041066e3a3a50f61e6ff4201c`](https://github.com/rafael-arkhe/nixpkgs-arkhe/tree/228da8e803e9f81041066e3a3a50f61e6ff4201c)
contains only the Arkhe workspace at its root, including Cargo.lock, without
the Nixpkgs tree. It is the immutable public source for the initial proposal,
maintained by `rafael-arkhe`. WASM, SDD, and the other packages remain in the overlay.

## Nixpkgs upstream reference

The original README from this fork's upstream base follows.

'''
docs['arkhe/README.md'] = r'''# nixpkgs-arkhe

Arkhe packages for the Nix ecosystem: a flake, overlays, and NixOS modules,
with reproducible builds and optional content-addressed derivations.

## Validation status

| Item | Status |
|---|---|
| Nix expressions written and reviewed | Observed in this directory |
| `nix flake check` / builds | PASS on x86_64-linux: 24 checks, October 29, 2026, Nix 2.35.4 on Ubuntu WSL, Rust 1.96.0 from rust-overlay; aarch64 not built |
| Bit-for-bit reproducibility | `arkhe-verify`, `arkhe-verify-wasm`, and `arkhe-sdd-parser`: identical `--rebuild` and `reproducible-*` outputs on the same machine (hashes below). The host/VM comparison in [docs/INTEGRATION-REVIEW.md](docs/INTEGRATION-REVIEW.md) used the previous configuration (Nixpkgs rustc) and **was not repeated** with Rust 1.96.0 |
| CA derivations | `arkhe-verify`: CA build with `ca=fixed:r:sha256:…`; same `narHash` as the regular build |
| `flake.lock` | Checked in; `nixpkgs` 31ecbac…, `rust-overlay` afcefd0…; inspect with `nix flake metadata` |
| `arkhe-mmrd`, `arkhe-journald`, `arkhe-gate`, `arkhe-anchor`, `arkhe-prove` | **Do not exist as crates** in this monorepo; no packages are provided for them |

Observed `narHash` values (x86_64-linux, October 29, 2026):

| Package | narHash |
|---|---|
| `arkhe-verify` | `sha256-+vmDoCqrEz9UPSLIPhB8oI6wXUCSB6tg3U5OUkQXAS0=` |
| `arkhe-verify-wasm` | `sha256-UQi2HohdpttuenoFcZ22EZVw8FW+GaN3aYFNRngIgn4=` |
| `arkhe-sdd-parser` | `sha256-MG84KZNsiV1eEVbbwiit4dWBlrM2EO7e3R5xwzyvChU=` |

A clean clone of the commit on ext4, built from scratch, produced the same
three `narHash` values: identical output contents across different checkouts.

**Store paths depend on the checkout filesystem.** On this WSL setup, files
under `/mnt/<drive>` appear as `rwxrwxrwx`. The executable bit contributes to
the source hash, so the `.drv` and output paths differ from an ext4 checkout,
even though the output `narHash` matches, as observed above. For comparable
paths across machines, build from a checkout on a Linux filesystem, compare
output `narHash` values, or use the CA variants.

In a Git checkout, new files enter the flake only after `git add`; use
`nix flake check path:$PWD` to test beforehand. This machine's global
`.gitignore` ignores `lib/`: add `arkhe/lib` with `git add -f`.

The workflow at `../.github/workflows/arkhe-nix.yml` repeats the build checks.
The current Rust 1.96.0 run is recorded in
[docs/validation/rust-1.96.0/results.json](docs/validation/rust-1.96.0/results.json).
The previous Rust 1.99.0 and VM run is preserved in
[docs/INTEGRATION-REVIEW.md](docs/INTEGRATION-REVIEW.md).

## What this repository provides

- **9 native packages and 1 WASM package** built from crates present in the monorepo.
- **1 metapackage** (`arkhe`) combining the CLIs in one profile.
- **An overlay** (`overlays.default`) and **a CA overlay** (`overlays.contentAddressed`).
- **NixOS modules** for `arkhe-node` (runtime) and `arkhe-audit` (offline workstation).
- **Verification scripts** for reproducibility, content addressing, and provenance.
- **A validated `by-name` recipe** for the proposed `arkhe-verify` contribution
  to Nixpkgs, with public sources and real hashes; see [status and diff](nixpkgs/README.md).

## Packages

| Attribute | Crate | Binary | `doCheck` |
|---|---|---|---|
| `arkhe-verify` (alias `arkhe-verify-cli`) | `arkhe-verify-cli` | `arkhe-verify` | Yes, with required golden vectors |
| `arkhe-sdd-parser` | `arkhe-sdd-parser` | `arkhe-sdd-parser` | Yes |
| `arkhe-runtime` | `arkhe-runtime` | `arkhe-runtime` | No |
| `arkhe-ask` | `arkhe-ask` | `arkhe-ask` | No |
| `arkhe-sql-migrate` | `arkhe-sql-migrate` | `arkhe-sql-migrate` | No |
| `arkhe-twin` | `arkhe-twin` | `arkhe-twin` | No |
| `arkhe-ollama` | `arkhe-ollama` | `arkhe-ollama` | No |
| `arkhe-crm-bridge` | `arkhe-crm-bridge-cli` | `arkhe-crm-bridge-cli` | No |
| `arkhe-python-gate` | `arkhe-python-bridge` | `arkhe-python-gate` | No |
| `arkhe-verify-wasm` | `arkhe-verify-wasm` | `arkhe-verify.wasm` | No |
| `arkhe` | — | Metapackage (`symlinkJoin`) | — |

Package details, heavy dependencies, and risks: [docs/packages.md](docs/packages.md).

## Usage

### Flake

```bash
nix build .#arkhe-verify
nix run .#arkhe-verify -- --help
nix build .#arkhe                # metapackage containing all CLIs
nix develop                      # cargo, rustc, clippy, rustfmt, jq, nix
```

The flake uses the `source/` snapshot and its `source-manifest.json`. In the
Nixpkgs fork, run these commands from `arkhe/`. For another workspace, pass
`src` explicitly to the `lib.mkPackages` API or `default.nix`.

### Overlay

```nix
{
  inputs.nixpkgs-arkhe.url = "github:rafael-arkhe/nixpkgs-arkhe?dir=arkhe";

  nixpkgs.overlays = [ inputs.nixpkgs-arkhe.overlays.default ];
  environment.systemPackages = [ pkgs.arkhe.arkhe-verify ];
}
```

### User profile

```bash
nix profile install .#arkhe
```

### Versioned source

The local snapshot is checked in with the package. The flake commit pins the
sources; `source-manifest.json` records each file's SHA-256 and is checked by
CI. The public `rafael-arkhe/arkhe` workspace has a different layout and must
not be substituted automatically for this snapshot.

```nix
let
  arkhe = import ./default.nix {
    inherit pkgs;
    src = ./source;
  };
in
arkhe.arkhe-verify
```

For another source, provide a snapshot with Cargo.lock and the same crates,
pinned by revision/hash, and repeat the checks.

## Reproducibility

The shared builder applies the following to every package:

- **Pinned toolchain**: Rust from `source/rust-toolchain.toml` (currently 1.96.0),
  through rust-overlay pinned in `flake.lock`. The `toolchain-version` check
  verifies `rustc --version`; the overlay flake does not use Nixpkgs rustc.
- **Per-package sources** (`lib/workspace.nix`): each derivation receives its
  `path` dependency closure, read from Cargo.toml files, the other crates'
  manifests, and external files declared in `crateExtras` (`default.nix`).
  Editing a crate outside the closure does not change the source hash.
  Inspect with `nix eval .#arkhe-verify.sourceCrates`. Observed: adding a line
  to `source/apps/arkhe-ask/src/auth.rs` changes the `arkhe-ask` derivation
  while leaving `arkhe-verify` and `arkhe-sdd-parser` unchanged.
- `--locked` and Cargo.lock checksums for every crate, with no floating versions.
  Vendored crates use a fixed-output derivation per crate.
- A network-isolated sandbox and `CARGO_NET_OFFLINE=true`.
- A fixed `SOURCE_DATE_EPOCH`.
- `--remap-path-prefix` to remove machine-specific absolute paths from binaries.
- Explicit `RUSTFLAGS`; the monorepo's `.cargo/config.toml` (`-Dwarnings`)
  is excluded from the snapshot.

### How to verify

```bash
cd arkhe

# 1. Check the snapshot against its SHA-256 manifest
python3 scripts/validate-source.py
python3 scripts/check-source-filter.py

# 2. Build packages, test suites, clippy, and independent second builds
nix build .#arkhe-verify-cli .#arkhe-verify-wasm .#arkhe-sdd-parser
nix flake check --no-update-lock-file -L

# 3. Rebuild against the output already registered in the store, bit for bit
./scripts/check-reproducibility.sh arkhe-verify arkhe-verify-wasm arkhe-sdd-parser

# 4. Get the NAR hash for comparison with another machine
nix path-info --json .#arkhe-verify | jq -r '.[].narHash'
```

What each check establishes:

| Check | Evidence |
|---|---|
| `arkhe-verify` (checkPhase) | Tests for `arkhe-verify-cli`, `arkhe-verify-core`, and `arkhe-core` pass; `golden_vectors` and `golden_contract` each run at least one test with the binary's compiler |
| `tests-arkhe-core`, `tests-arkhe-kernel`, `tests-arkhe-governance` | Core crate test suites; `tests-arkhe-core` requires a nonempty `golden_vectors` run |
| `arkhe-sdd-parser` + `sdd-parser-smoke` | Parser tests; the CLI produces identical `constitution.cbor`/`tasks.cbor` outputs in two runs |
| `tests-clippy` | `clippy -D warnings --all-targets` for core, kernel, governance, sdd-parser, and verify. **Exceptions** for existing monorepo failures: `too_many_arguments` (`arkhe-governance`) and `useless_vec` (`arkhe-kernel/tests/support/gravit_signatures.rs:279`); remove each exception when the code is fixed |
| `reproducible-*` | An independent second build (different derivation, sandbox, and time) produces byte-identical output (`diff -r`) |
| `source-manifest` | `source/` matches `source-manifest.json` |
| `toolchain-version` | `rustc` matches `rust-toolchain.toml` |

The `reproducible-*` checks do not vary the build directory (`/build`), kernel,
or machine. To test those differences, compare output `narHash` values across
machines or use the VM in [docs/vm-reproduction.md](docs/vm-reproduction.md).

### Update the snapshot

```bash
python3 scripts/update-source.py /path/to/monorepo [new-path ...]
python3 scripts/validate-source.py
```

This recopies every file listed in the manifest (missing files cause failure),
adds new paths, and rewrites `source-manifest.json`.

Provenance:

```bash
./scripts/provenance.sh . arkhe-verify arkhe-sql-migrate
```

Bit-for-bit equality across different rustc, binutils, or Nixpkgs versions is
**not guaranteed**. Reproducibility is relative to a particular `flake.lock`.
Read [docs/reproducibility.md](docs/reproducibility.md) before claiming complete
reproducibility.

## Content-addressed derivations (CA)

CA is optional and requires the experimental `ca-derivations` feature:

```bash
nix build .#legacyPackages.x86_64-linux.ca.arkhe-verify \
  --extra-experimental-features "nix-command flakes ca-derivations"

./scripts/verify-content-addressing.sh arkhe-verify
```

For NixOS:

```nix
nixpkgs.overlays = [
  inputs.nixpkgs-arkhe.overlays.contentAddressed
];
```

CA variants live under `legacyPackages.<system>.ca` so `nix flake check`
continues to work without the experimental feature enabled.

**Why CA is not the default.** Output addresses depend on content, so builds
with different contents receive different paths, and unchanged outputs can
avoid rebuilding dependents (early cutoff). However, `ca-derivations` remains
experimental and must be enabled on evaluators and builders. Cache signatures
are associated with realisations, and Hydra/third-party cache support is partial.
CA does not make a build deterministic; the mechanisms above address that.
Only the final package becomes CA; the toolchain and dependencies remain
input-addressed. Source inputs are already pinned: the snapshot enters the
store through the flake's `narHash`, and each Cargo.lock crate is downloaded
by checksum. See [ADR 0002](docs/adr/0002-builds-enderecados-por-conteudo.md).

## NixOS modules

```nix
{
  imports = [ inputs.nixpkgs-arkhe.nixosModules.arkhe-node ];

  services.arkheNode = {
    enable = true;
    environmentFile = "/run/secrets/arkhe.env";
  };
}
```

`services.arkheAudit` installs the verifier and prepares `/var/lib/arkhe-audit`
without enabling a network service. Both modules require the overlay
(`pkgs.arkhe.*`).

## Layout

```text
flake.nix              flake outputs (packages, checks, modules, apps)
default.nix            package set parameterized by src
overlay.nix            regular and CA overlays
lib/                   shared builder, per-package sources, pinned toolchain
pkgs/                  one file per package
modules/               NixOS modules (node, audit)
checks/                nix flake check definitions
scripts/               reproducibility, CA, and provenance helpers
nixpkgs/               validated by-name recipe, patch, and upstream proposal
docs/                  packages, reproducibility, and ADRs
```

## Limitations

- These packages do not replace an HSM, ICP-Brasil certification, or a compliance assessment.
- Builds establish what was built and from which inputs; they do not establish system security.
- The `arkhe-node`/`arkhe-audit` profiles are installation modules. They do not
  implement the measured boot chain (Secure Boot, UKI, TPM, IMA) described in
  the Arkhe Linux architecture.

## License

Apache-2.0. See [LICENSE](LICENSE).

## Integration review

See [docs/INTEGRATION-REVIEW.md](docs/INTEGRATION-REVIEW.md). The Nixpkgs fork's
root remains independent.

The WASM package uses lld and wasm-bindgen-cli from the same pinned Nixpkgs.
It includes the raw `lib/arkhe-verify.wasm` module and Node.js bindings at
`lib/arkhe_verify.js`. The artifact name does not imply that the PQC layer is enabled.

Consumer overlay verification and source isolation evidence are recorded in
`docs/validation/rust-1.96.0/`. The source probe changes only a temporary snapshot
copy. It also covers undeclared Cargo projects and generated wasm-bindgen files.
'''

docs['arkhe/CHANGELOG.md'] = r'''# Changelog

## [Unreleased]

### Added

- A fork landing page with Arkhe flake usage, commands, and validation limits.
- An upstream `arkhe-verify` proposal with immutable public sources, real hashes,
  a two-commit patch, and Rust 1.99.0 build/rebuild evidence.
- Rust 1.96.0 from rust-toolchain.toml through rust-overlay pinned in flake.lock
  (`lib/toolchain.nix`); a `toolchain-version` check.
- Per-package sources (`lib/workspace.nix`): path dependency closures read from
  Cargo.toml files, with empty targets for unused workspace members.
- The `arkhe-sdd-parser` package and `arkhe-verify-cli` alias.
- Checks: `tests-arkhe-core` (required golden vectors), `tests-arkhe-kernel`,
  `tests-arkhe-governance`, `tests-clippy`, `reproducible-*`, `source-manifest`,
  and `sdd-parser-smoke`.
- `scripts/update-source.py` to refresh the snapshot and manifest.

### Changed

- Project documentation is now written in American English (en-US).
- The `source/` snapshot was refreshed from the workspace (598 files).
- `arkhe-verify` requires nonempty `golden_vectors` and `golden_contract` runs
  in checkPhase.
- `arkhe-verify-wasm` builds only for wasm32 and fails evaluation when
  wasm-bindgen-cli does not match Cargo.lock.
- `scripts/check-reproducibility.sh` accepts multiple attributes and preserves
  differing outputs (`--keep-failed`); `verify-content-addressing.sh` no longer
  depends on jq.

## [0.1.0] - 2026-10-29

### Added

- A flake with pinned Nixpkgs and x86_64-linux/aarch64-linux systems.
- `overlays.default` and `overlays.contentAddressed`.
- The shared `lib/mk-arkhe-package.nix` builder with `--locked`,
  `cargoLock.lockFile`, offline builds, SOURCE_DATE_EPOCH, and path remapping.
- Packages: `arkhe-verify`, `arkhe-runtime`, `arkhe-ask`, `arkhe-sql-migrate`,
  `arkhe-twin`, `arkhe-ollama`, `arkhe-crm-bridge`, `arkhe-python-gate`,
  and `arkhe-verify-wasm`.
- The `arkhe` metapackage.
- The `arkhe-node` and `arkhe-audit` NixOS modules.
- `check-reproducibility.sh`, `verify-content-addressing.sh`, and `provenance.sh`.
- The `nixpkgs/by-name/ar/arkhe-verify/package.nix` template.
- Package and reproducibility documentation, plus two ADRs.

### Known limitations at that release

- No checked-in flake.lock; it had to be generated with `nix flake lock`.
- No builds were executed in the initial authoring environment (Nix was unavailable).
- `arkhe-verify-wasm` required a toolchain with the wasm32-unknown-unknown standard library.
- `arkhe-mmrd`, `arkhe-journald`, `arkhe-gate`, `arkhe-anchor`, and `arkhe-prove`
  did not exist as crates and were not packaged.

## Additional validation — 2026-10-29

- WASM: the pinned Rust standard library, an explicit lld linker, and Node.js
  wasm-bindgen bindings.
- The WASM package is exposed by the flake, with an MMR vector functional check in CI.
- The CI workflow builds all packages and checks.
- QEMU/KVM configuration and helpers reproduce builds in a separate store,
  without copying final Arkhe outputs.
- Per-package evidence is stored under `docs/validation/`.
'''
docs['arkhe/SECURITY.md'] = r'''# Security

## Scope

This repository provides Nix build recipes for binaries from the Arkhe
monorepo. It does not manage production signing keys, sign artifacts, or
implement its own cryptographic verification; verification belongs to the
`arkhe-verify-*` crates. The source snapshot includes explicitly identified
test fixtures.

## Reporting a vulnerability

Open a private advisory in the Arkhe repository using GitHub Security
Advisories, or contact the project maintainer. Do not open a public issue for
an exploitable vulnerability.

Include the affected attribute (`arkhe-verify`, `arkhe-ask`, etc.), the
flake.lock revision, the build command, and the observed behavior.

## Vulnerabilities in scope

- A package builds code that differs from its declared source.
- A dependency hash does not match Cargo.lock.
- A build path reintroduces network access or floating dependency resolution.
- A NixOS module grants more privileges than necessary.

## Issues outside this scope

- Binary differences caused by different rustc/binutils versions, a documented
  limitation in `docs/reproducibility.md`.
- Build failures caused by unavailable external services (PostgreSQL, Kafka).
- Missing packages for components that do not yet exist as crates.

## Limitations

These packages do not replace an HSM, ICP-Brasil certification, a compliance
assessment, or an independent audit. They provide builds from pinned sources,
with reproducibility evidence for the documented configurations. Trust in
released artifacts also depends on the custody of release signing keys,
which is outside this repository's scope.
'''
docs['arkhe/docs/packages.md'] = r'''# Packages

All overlay packages use `lib/mk-arkhe-package.nix`, which enforces `--locked`,
Cargo.lock, SOURCE_DATE_EPOCH, path remapping, and offline builds.

## `arkhe-verify`

- Crate: `verification/crates/arkhe-verify-cli`.
- Binary: `arkhe-verify`.
- `doCheck = true`: also tests arkhe-verify-core and arkhe-core, which contain local vectors.
- The lightest package; includes a `--help` smoke check.
- The initial upstream Nixpkgs candidate (`nixpkgs/by-name/ar/arkhe-verify`).

## `arkhe-sdd-parser`

- Crate: `governance/arkhe-sdd-parser`; binary: `arkhe-sdd-parser`.
- Its tests run in checkPhase; the SDD smoke check compares two identical CBOR outputs.
- Uses the same pinned Rust 1.96.0 toolchain as the other overlay packages.

## Libraries as checks

`tests-arkhe-core`, `tests-arkhe-kernel`, and `tests-arkhe-governance` run their
test suites with the pinned toolchain. The core check requires a nonempty
golden_vectors run. `arkhe-verify-cli` aliases the `arkhe-verify` package.

## `arkhe-runtime`

- Crate: `orchestration/arkhe-runtime`.
- Binary: `arkhe-runtime`.
- `doCheck = false`: requires PostgreSQL, a token, and an actor.
- Heavy dependencies: axum, sqlx (Postgres), and tokio.
- Reads DATABASE_URL, ARKHE_API_TOKEN, ARKHE_ACTOR, ARKHE_TENANT_ID, and
  ARKHE_LISTEN (default: `127.0.0.1:8788`).

## `arkhe-ask`

- Crate: `apps/arkhe-ask`.
- Binary: `arkhe-ask`.
- `doCheck = false`: requires PostgreSQL/pgvector and optionally Kafka.
- The heaviest dependencies in the package set: opentelemetry*, rskafka,
  axum-keycloak-auth, and pgvector. This is the longest build.
- Listens on ARKHE_LISTEN (default: `127.0.0.1:3000`).

## `arkhe-sql-migrate`

- Crate: `storage/sql/crates/arkhe-sql-migrate`.
- Binary: `arkhe-sql-migrate`.
- `doCheck = false`: migrations require an accessible database.

## `arkhe-twin`

- Crate: `work/arkhe-twin`.
- Binary: `arkhe-twin`.
- `doCheck = false`.

## `arkhe-ollama`

- Crate: `integration/arkhe-ollama`.
- Binary: `arkhe-ollama`.
- `doCheck = false`: tests start a local axum server.

## `arkhe-crm-bridge`

- Crate: `integration/arkhe-crm-bridge` (Cargo package `arkhe-crm-bridge-cli`).
- Binary: `arkhe-crm-bridge-cli`; without an explicit `[[bin]]` declaration,
  the binary takes the Cargo package name.
- `doCheck = false`.
- rusqlite's `bundled` feature builds SQLite from source; external sqlite and
  pkg-config are not required.

## `arkhe-python-gate`

- Crate: `integrations/arkhe-python-runtime/bridge` (Cargo package `arkhe-python-bridge`).
- Binary: `arkhe-python-gate`, declared in `[[bin]]`.
- `doCheck = false`.
- The crate also produces a cdylib, but this package installs only the binary.

## `arkhe-verify-wasm`

- Crate: `verification/crates/arkhe-verify-wasm`.
- Artifact: `$out/lib/arkhe-verify.wasm`.
- `doCheck = false`; uses a custom installPhase.
- Uses the pinned rustc's WASM standard library, explicit lld, and compatible wasm-bindgen-cli.
- Includes Node.js bindings. `wasm-smoke` runs 20 valid MMR proofs,
  106 tampering cases, and a malformed policy.
- Included in packages, checks, and CI.

## `arkhe`

- A symlinkJoin metapackage containing all nine CLIs.
- Does not include the WASM artifact.

## Unavailable components

There are no packages for arkhe-mmrd, arkhe-journald, arkhe-gate, arkhe-anchor,
or arkhe-prove. These components appear in the Arkhe Linux architecture, but
corresponding crates do not exist in this monorepo.
'''
docs['arkhe/docs/reproducibility.md'] = r'''# Reproducibility and content addressing

## Current configuration: Rust 1.96.0

flake.lock pins Nixpkgs and rust-overlay by revision and narHash. rust-overlay
provides official compiler and standard library tarballs, each pinned by SHA-256.
`lib/toolchain.nix` reads the exact channel from `source/rust-toolchain.toml`
(1.96.0); the snapshot matches the original workspace file. The WASM variant
uses the same compiler with the wasm32-unknown-unknown standard library.
The development shell and clippy use the components declared in that file.

Packages use rustPlatform.buildRustPackage, cargoLock.lockFile from the
snapshot, and checksums from the original Cargo.lock. Compilation uses
`--locked`, `--offline`, CARGO_NET_OFFLINE=true, and a sandbox. Fetching pinned
inputs is separate from compilation.

SOURCE_DATE_EPOCH=315532800, CARGO_INCREMENTAL=0, TZ=UTC, LC_ALL=C, and path
remapping make the environment explicit. Inspection of the three priority
artifacts confirmed the absence of the local prefixes `/mnt/d/arkhe`,
`/home/arkhen`, and `D:\arkhe`.

## Per-package sources

`lib/workspace.nix` computes path dependency closures, including build
dependencies and the tested crates' development dependencies. Only code in
that closure and declared compile-time fixtures enter src. Discovery starts
from explicit workspace members and their path dependencies; unrelated Cargo
projects below the root are not discovered. Build/environment directories and
generated wasm-bindgen `pkg/` files are excluded. Other crates' manifests and
the shared Cargo.lock remain available to Cargo's resolver. Empty targets for
those crates are created in postPatch without compiling them.

Lockfile or manifest changes may change the hash because they affect dependency
resolution. Editing unused crate code does not change the package's src or
derivation. `scripts/check-source-filter.py` checks this with a temporary copy
of arkhe-ask: verifier, WASM, and SDD remain unchanged, while the positive
control, arkhe-ask, changes. The probe also adds an undeclared Cargo project
and changes a generated WASM file without affecting the three priority targets.
CI repeats this probe.

## Verify on WSL/Linux

Open Ubuntu WSL and run:

```bash
source ~/.nix-profile/etc/profile.d/nix.sh
cd /mnt/d/arkhe/work/nixpkgs-arkhe-integration/arkhe
export NIX_CONFIG='experimental-features = nix-command flakes'
python3 scripts/validate-source.py
python3 scripts/check-source-filter.py
nix build .#arkhe-verify-cli .#arkhe-verify-wasm .#arkhe-sdd-parser --no-update-lock-file
nix flake check --no-update-lock-file -L
./scripts/check-reproducibility.sh arkhe-verify-cli arkhe-verify-wasm arkhe-sdd-parser
```

arkhe-verify runs the CLI/core/verifier suites in checkPhase. The targets
`arkhe-core --test golden_vectors` and `arkhe-verify-core --test golden_contract`
are required and must each run at least one passing test. The tests-arkhe-core,
tests-arkhe-kernel, and tests-arkhe-governance checks exercise the libraries;
the first again requires golden_vectors.

The reproducible-* checks perform a second build with an additional environment
variable and compare outputs with `diff -r`. The script above complements
those checks: it uses `nix build --rebuild`, disables substitution, and compares
the same derivation against its registered output. Differences cause failure;
`--keep-failed` preserves output for inspection with diffoscope.

The SDD smoke test runs the CLI and compares constitution.cbor and tasks.cbor
from two runs. The WASM smoke test executes valid and tampered MMR proofs
through Node.js bindings. Clippy has two exceptions documented in the README;
this does not establish that every lint passes.

## Content addressing

CA is optional: __contentAddressed=true, outputHashMode="recursive", and
outputHashAlgo="sha256". Variants are available under legacyPackages.<system>.ca.
The final address depends on output content, but evaluators/builders must
enable experimental ca-derivations, and the cache must support realisations.
CA does not replace build comparisons or make a nondeterministic compilation
deterministic.

```bash
nix build .#legacyPackages.x86_64-linux.ca.arkhe-verify-cli \
  --extra-experimental-features 'nix-command flakes ca-derivations'
bash scripts/verify-content-addressing.sh arkhe-verify-cli
```

The CA verifier variant was built and inspected in this run. Regular mode
remains the default for compatibility. Inputs are pinned: Git sources through
the consumer lock/commit and the snapshot SHA-256 manifest, crates through
Cargo.lock checksums, and compiler/standard libraries through rust-overlay hashes.

## Evidence and limitations

[Rust 1.96.0 results](validation/rust-1.96.0/results.json) record 24 successful
x86_64-linux checks, three actual bit-identical rebuilds, hashes, compiler
version, source isolation, and path inspection. Suite and toolchain logs are
in the same directory. Verification uses pinned inputs; it does not establish
equality across different architectures or versions.

The checkout's executable bits contribute to the src hash. DrvFS and a Git
checkout on ext4 can produce different source/derivation paths even when the
compiled contents match. Compare output narHash values across environments.
CA can also give matching final addresses when contents match. The README
preserves the cross-checkout observation recorded at revision 5cf45f52f.

The [previous VM run](INTEGRATION-REVIEW.md) used Nixpkgs Rust 1.99.0. Those
results remain historical; VM reproduction was not repeated for Rust 1.96.0.
In this run, aarch64 was declared in the flake but its builds were not executed.
'''

docs['arkhe/docs/vm-reproduction.md'] = r'''# VM reproduction with a separate store

This experiment uses QEMU/KVM and NixOS. The system source disk and the VM's
writable disk are separate from the host Nix store. No host directory is
mounted in the VM. Pinned dependencies and sources are copied over SSH, but
the helper refuses to include any final Arkhe output in the copied closure.

This compares two environments on the same physical machine. It is not an
audit by another operator or on another machine.

## Create the VM

On Linux with Nix, SSH, and access to /dev/kvm, run from `arkhe/`:

```bash
export NIX_CONFIG='experimental-features = nix-command flakes ca-derivations'
workdir=$(mktemp -d)
ssh-keygen -q -t ed25519 -N '' -f "$workdir/id_ed25519"
vm=$(nix build --impure --file checks/repro-vm.nix \
  --argstr flakePath "$PWD" \
  --argstr sshPublicKey "$(cat "$workdir/id_ed25519.pub")" \
  --no-link --print-out-paths)
NIX_DISK_IMAGE="$workdir/repro.qcow2" \
  "$vm/bin/run-arkhe-repro-vm-vm" > "$workdir/console.log" 2>&1 &
```

Wait for SSH on local port 22429. Verify the host key shown on the first
connection, using a separate known_hosts file for this experiment.

```bash
ssh -i "$workdir/id_ed25519" -p 22429 \
  -o StrictHostKeyChecking=ask -o UserKnownHostsFile="$workdir/known_hosts" \
  root@127.0.0.1 'uname -a; findmnt /nix/.ro-store'
python3 scripts/seed-reproduction-guest.py "$PWD" root@127.0.0.1 \
  --identity-file "$workdir/id_ed25519" --known-hosts-file "$workdir/known_hosts" \
  --evidence-dir "$workdir/evidence"
ssh -i "$workdir/id_ed25519" -p 22429 \
  -o UserKnownHostsFile="$workdir/known_hosts" root@127.0.0.1 \
  'python3 /root/arkhe/scripts/validate-source.py &&
   python3 /root/arkhe/scripts/reproduce-in-guest.py /root/arkhe /root/arkhe/expected-host.json /root/validation'
scp -r -i "$workdir/id_ed25519" -P 22429 \
  -o UserKnownHostsFile="$workdir/known_hosts" root@127.0.0.1:/root/validation "$workdir/"
```

Seeding imports local dependencies without requiring cache signatures. Its
manifest records paths and verifies that the closure excludes Arkhe outputs.
The compiler and dependencies are shared across environments; Arkhe artifacts
are compiled separately. The guest requires all targets to be absent before
building, disables binary substitution and remote builders, and records each
package's derivation and NAR hash. Build all targets on the host before seeding
so expected-host.json contains every comparison hash.

When finished, shut down the VM over SSH with poweroff. Keep the disk and
evidence if you want to inspect the environment later.

## Compare final results

```bash
python3 scripts/compare-reproduction.py "$workdir/evidence/expected-host.json" \
  "$workdir/validation/results.json" > "$workdir/evidence/comparison.json"
```

If host and VM builds ran concurrently, update the host hashes in the manifest
before comparison. The comparison tool rejects incomplete results, binary
substitution, and remote builders.
'''
docs['arkhe/docs/INTEGRATION-REVIEW.md'] = r'''# Historical review: Rust 1.99.0 — October 29, 2026

This run corresponds to commit c52d666f1, before the Rust 1.96.0 pin and SDD
parser were added. The VM results below are historical. For the current
configuration, see [Rust 1.96.0 results](validation/rust-1.96.0/results.json)
and [verification instructions](reproducibility.md). VM reproduction was not
repeated with Rust 1.96.0.

The Arkhe layer resides in arkhe/, preserving the Nixpkgs flake and packages
at the repository root. Use `nix build ./arkhe#arkhe-verify` or
`github:rafael-arkhe/nixpkgs-arkhe?dir=arkhe` once the branch is integrated.

## Fixes

- An explicit source/ snapshot with a SHA-256 manifest validating 593 files.
  The public rafael-arkhe/arkhe workspace has a different layout and cannot
  serve as the source for these packages.
- Root CI for master/main and PRs, building all packages and checks.
- Native verifier tests include the CLI, arkhe-verify-core, and arkhe-core.
- The audit profile installs only the selected verifier. The service environment
  file remains a runtime path outside the store.
- LF line endings for Nix files/scripts; original snapshot bytes preserved.
- WASM with the pinned Rust standard library, explicit lld, and compatible
  wasm-bindgen-cli. Raw artifact: lib/arkhe-verify.wasm; Node.js bindings:
  lib/arkhe_verify.js.
- WASM included in packages/checks. The artifact name does not imply PQC is enabled.
- QEMU/KVM helpers for dependency seeding, guest builds, and comparison. The seed
  includes metapackage-specific dependencies and excludes Arkhe outputs.

## Results

| Validation | Status |
|---|---|
| x86_64-linux and aarch64-linux evaluation | PASS |
| Eight native executables, WASM, and metapackage on x86_64-linux | PASS |
| nix flake check, including modules and smoke tests | PASS |
| Native verifier tests | 81 passed |
| WASM executed in Node.js | 20 valid proofs; 106 tampering cases and a malformed policy rejected |
| Local verifier rebuild | Identical hash |
| CA verifier build | PASS |
| Reproduction of ten outputs in a QEMU/KVM VM | Derivations and NAR hashes identical to the host |

The host uses Nix 2.35.4; the VM uses Nix 2.34.9, NixOS, and its own 6.18.59
kernel. Both use the same pinned Nixpkgs and Rust 1.99.0. The VM has separate
disks without mounting the host store. Every target output was absent before
compilation; binary substitution and remote builders were disabled.

The experiment ran on the same physical machine, sharing dependencies and
toolchain. It demonstrates reproduction of the specified outputs in this
pinned environment. ARM64 was evaluated, but executed builds were x86_64-linux.

## Evidence

- [Consolidated results](validation/results.json).
- [Host derivations and hashes](validation/full/host-results.json).
- [Final comparison of ten outputs](validation/vm/comparison.json).
- [Original VM results](validation/vm/guest/results.json).
- [Final seed without Arkhe outputs](validation/vm/final-seed/seed-paths.json).
- Full logs in validation/full/ and validation/vm/guest/.
- [Instructions for repeating the experiment](vm-reproduction.md).

Some original VM results have matches_host: null because host hashes were not
yet available when the concurrent run started. The final comparison ran after
both builds finished and passed for every output.

Initial preparation omitted lndir and stdenv-linux-no-cc, dependencies unique
to the metapackage. The helper was fixed and the metapackage rebuilt with an
identical hash; the initial attempt's log was preserved. The prebuild-* logs
record parallel builds inside the same VM after initial target absence checks.

## Scope at this historical revision

The snapshot was a copy of local sources without a signed upstream release.
At that revision, the by-name template still contained fakeHash and required
a real source revision/hash before submission to official Nixpkgs. See the
[current upstream proposal](../nixpkgs/README.md) for its updated status.
This layer does not implement measured boot, TPM, IMA, or hybrid operating
system signatures. Builds did not exercise database or external service integrations.
'''
docs['arkhe/docs/adr/0001-flake-overlay-e-pacotes.md'] = r'''# ADR 0001 — Flake, overlay, and buildRustPackage

## Context

The Arkhe monorepo is a Cargo workspace with multiple members, dependencies
recorded in Cargo.lock, and no Git dependencies. The goal is to distribute
Arkhe binaries through Nix without duplicating the dependency graph or
introducing floating dependency resolution.

## Decision

- A flake with Nixpkgs pinned in flake.lock and x86_64-linux/aarch64-linux systems.
- An overlay (overlays.default) exposing pkgs.arkhe.*.
- A shared builder (lib/mk-arkhe-package.nix) using rustPlatform.buildRustPackage,
  with cargoLock.lockFile pointing to the workspace Cargo.lock.
- One file per package under pkgs/, without duplicated build logic.

## Rejected alternatives

| Alternative | Reason |
|---|---|
| naersk | Less control over determinism flags and cargoLock; another build dependency |
| crane | Powerful, but requires manually separating dependencies and artifacts; unnecessary complexity for nine binaries |
| fetchCargoVendor with a manual hash | Another hash to maintain for each Cargo.lock change; cargoLock.lockFile already verifies each crate's checksum |
| flake-utils | Another dependency for two systems; lib.genAttrs is sufficient |
| A package for each library crate | Rust libraries have no useful Nix consumer here; the distributed artifacts are binaries |

## Consequences

- The first build resolves and verifies locked crates even for a small binary.
  The Nix cache reduces the cost of later builds.
- Local src is filtered to exclude target/, node_modules/, and unrelated snapshots.
- Explicit RUSTFLAGS neutralizes the monorepo .cargo/config.toml's -Dwarnings,
  preventing a newer rustc warning from becoming a packaging failure.
- Adding a crate requires a file under pkgs/ and registration in default.nix.

This decision describes the overlay. The separate upstream Nixpkgs proposal
uses cargoHash; see [the contribution guide](../../nixpkgs/README.md).
'''
docs['arkhe/docs/adr/0002-builds-enderecados-por-conteudo.md'] = r'''# ADR 0002 — Content-addressed builds

## Context

The stated requirement is fully reproducible, content-addressed builds.
By default, Nix store paths are input-addressed: they derive from the
derivation's hash rather than the produced contents. Two builds of the same
derivation share a path even if their contents differ, which can conceal
nondeterminism.

## Decision

- Every package accepts contentAddressed ? false.
- When enabled, the derivation receives __contentAddressed = true and
  outputHashMode = "recursive".
- CA variants are exposed under legacyPackages.<system>.ca rather than
  packages, so nix flake check works without the experimental feature.
- The content-addressed overlay enables this mode for NixOS consumers.

## Rejected alternatives

| Alternative | Reason |
|---|---|
| Make CA the default | ca-derivations is experimental and requires explicit configuration; it would break nix flake check on default installations |
| Use nix store make-content-addressed as the only strategy | Rewrites the closure after building; does not detect nondeterminism during production. Still useful as an additional check |
| Ignore CA and call an input-addressed build content-addressed | Would misrepresent the addressing model |

## Consequences

- CA requires experimental-features = nix-command flakes ca-derivations.
- With CA, changed contents receive changed addresses, making differences visible.
- CA does not make builds deterministic; it makes addresses depend on contents.
  Determinism comes from the mechanisms in [reproducibility.md](../reproducibility.md).
- Automated verification lives in scripts/verify-content-addressing.sh and
  the CI ca job.
'''
docs['arkhe/nixpkgs/README.md'] = r'''# Proposed NixOS/nixpkgs contribution

The initial proposal packages arkhe-verify at version
0.1.0-unstable-2026-10-29, maintained by rafael-arkhe.
The Cargo crate is arkhe-verify-cli; the installed executable is arkhe-verify.
The official PR has not been opened and awaits human review.

## Files for review

- [By-name recipe](by-name/ar/arkhe-verify/package.nix), with real hashes.
- [Two-commit patch](arkhe-verify-upstream.patch): maintainer registration and
  package addition, separated according to Nixpkgs conventions.
- [Proposed PR description](pull-request.md), disclosing assistance from
  OpenAI Codex (GPT-6). Commits include Assisted-by trailers.
- [Results and limitations](../docs/validation/nixpkgs-upstream/results.json),
  accompanied by build, test, and rebuild logs.

The overlay flake does not import this recipe. It targets a Nixpkgs checkout
with the maintainer entry applied by the patch. Copying only the recipe without
registering rafael-arkhe leaves meta.maintainers incomplete.

## Immutable public source

Revision 228da8e803e9f81041066e3a3a50f61e6ff4201c in
[rafael-arkhe/nixpkgs-arkhe](https://github.com/rafael-arkhe/nixpkgs-arkhe/tree/228da8e803e9f81041066e3a3a50f61e6ff4201c)
contains only the Arkhe workspace sources, including Cargo.lock. It is the
arkhe/source tree from integration commit 9c1d848c9b08ff7c9ac9b685c3f586717ed6d082,
published at the root of the independent arkhe/source-2026-10-29 branch.
The original manifest is [source-manifest.json](../source-manifest.json).

This source commit does not contain the Nixpkgs tree. It does not assume a
v0.1.0 release tag; the unstable version identifies the snapshot used.

| Input | Pinned hash |
|---|---|
| Source | `sha256-IX8kHrWuRQn9jOb1mwXwJ9eoMkelO+1PpFlbu/dEiiI=` |
| Cargo dependencies | `sha256-J2aSDP8/OcFVQdilWyYs+4f8VXwhxEhT9uSh+8egyH8=` |

## Observed validation

On October 29, 2026, Ubuntu WSL x86_64-linux, Nix 2.35.4, using NixOS/nixpkgs
base 0470df609861fede4cec47148a001f04513bdabc:

- Build and arkhe-core, arkhe-verify-core, and CLI tests passed.
- Four golden vectors and one golden contract passed, explicitly required.
- The passthru BLAKE3 empty-input test passed.
- nix-build --check passed with bit-identical rebuilt output.
- Maintainer schema validation, nixfmt, and diff checks passed.

Output NAR hash: `sha256-aVjRxtMiLJv/rvdYT+qPMMWF3zDMCaCeWbEN3cK5ak8=`.
This recipe uses the Nixpkgs base's standard Rust 1.99.0. The overlay uses
pinned Rust 1.96.0 with [separate evidence](../docs/validation/rust-1.96.0/results.json).
Another machine/VM, aarch64, Darwin, and nixpkgs-review were not tested in this
upstream recipe validation run.

## Repeat in a Linux checkout

Start from the base revision above, with the patch saved outside the checkout:

```sh
git switch -c arkhe-verify-init 0470df609861fede4cec47148a001f04513bdabc
git am /path/to/arkhe-verify-upstream.patch
nix-build -A arkhe-verify --no-out-link
nix-build -A arkhe-verify.tests --no-out-link
nix-build -A arkhe-verify --check --keep-failed --no-out-link
nix-build lib/tests/maintainers.nix --no-out-link
nix-shell -p nixfmt --run 'nixfmt --check pkgs/by-name/ar/arkhe-verify/package.nix maintainers/maintainer-list.nix'
git diff --check
```

Source and dependencies are fixed-output. Builds and tests use --frozen,
offline mode, and sandboxing. Cargo.lock is not imported from a derivation
during evaluation. The official recipe does not require ca-derivations; the
experimental CA variant remains in the overlay. By-name packages do not need
an all-packages.nix entry.

The initial proposal is limited to the native verifier. WASM, SDD, and the
other packages remain in the overlay. Publishing this material in the fork
does not establish acceptance in Nixpkgs. Before submission, the responsible
contributor must review the diff and description under the
[automation/AI policy](https://github.com/NixOS/nixpkgs/blob/0470df609861fede4cec47148a001f04513bdabc/CONTRIBUTING.md#automationai-policy).
'''

for rel, content in docs.items():
    if rel == 'ROOT':
        path = root / 'README.md'
        original = path.read_text(encoding='utf-8')
        upstream = original[original.index('<p align="center">'):]
        path.write_text(content + upstream, encoding='utf-8', newline='\n')
    else:
        (root / rel).write_text(content, encoding='utf-8', newline='\n')
