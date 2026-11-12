# vaultlite README claims review

**Scope:** `vaultlite/` at version 0.3.0 (`pyproject.toml`). Each claim in `vaultlite/README.md` was checked against the source code and tests in this folder.
**Date:** 2026-11-02
**What was run:** Python 3.14.2, cryptography 50.0.1, pytest 9.0.2.
- `python -m pytest`: **4 passed** (`tests/test_crypto.py` x3, `tests/test_audit.py` x1).
- `python -m vaultlite.cli status`: prints the "healthy" line, exits 0.
- A probe script, kept outside the repo, called `server.put/get/delete` directly. Its results are quoted below.

No source files were changed.

## Bottom line

Do not put this README on the landing page as written. Of the six feature bullets:

- **1 holds, with qualifications:** AES-256-GCM with a fresh random nonce per secret.
- **1 holds only in part:** the audit log records reads and writes but not deletes.
- **2 are contradicted by the code:** "zero-knowledge server" and "automatic key rotation".
- **2 have no evidence in the repo at all:** SOC 2 Type II and p99 under 2 ms.
- **The health-check instruction is misleading:** `vaultlite status` prints a hard-coded "SECURE" message without checking anything.

## Claim by claim

| # | README claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Encrypted at rest with AES-256-GCM; every secret has its own random nonce | **Partly true** | `crypto.py:7` creates 256-bit keys. `crypto.py:11-12` uses `os.urandom(12)` as the nonce for each seal, then `AESGCM.encrypt`. The tests check the round trip, that nonces are fresh, and that a tampered blob is rejected (all pass). **However:** (a) nothing is ever written to disk. `server.STORE` is an in-memory dict (`server.py:6`), so "at rest" only covers process memory, and every secret is lost on restart. (b) `MASTER_KEY = None` (`server.py:5`). The comment says it is "loaded from VAULTLITE_KEY at startup", but no code reads that variable or any other environment variable. Out of the box, `put` fails with `TypeError` (confirmed by the probe). (c) No AAD is used (`None`), so a ciphertext stored under one secret name can be swapped in under another name and will still decrypt. |
| 2 | Zero-knowledge server: the server never sees plaintext secrets | **False** | `server.py:1` says itself that "The server holds the master key and serves secrets to clients." `put()` takes the plaintext `value` and encrypts it on the server (`server.py:10`). `get()` decrypts on the server and returns plaintext (`server.py:16`). This is server-side encryption, which is the opposite of zero-knowledge. |
| 3 | Automatic key rotation every 30 days | **False / not implemented** | No rotation code exists anywhere (grep for `rotat` finds only the hard-coded string in `cli.py:6`). There is one module-level key, no key versioning, no re-encryption path and no scheduler. |
| 4 | Full audit log of every read, write and delete | **Partly true** | `put` logs `write` and `get` logs `read` (`server.py:11,15`), and `test_audit.py` passes. **But `delete()` logs nothing** (`server.py:19-20`): the probe's log showed `write:db, read:db, read:missing` and no delete entry. Other gaps: `get` writes a `read` entry *before* the lookup, so reads that fail (missing names) are logged as reads. The log is a plain file at the relative path `audit.log` with no integrity protection. The `user` field is whatever the caller passes in, and there is no authentication anywhere in the code. "Append-only" is only a file-open mode, not a guarantee. |
| 5 | SOC 2 Type II certified infrastructure | **Unsupported** | The repo has no infrastructure, deployment config, audit report or attestation reference. SOC 2 is an attestation about an organization's controls, not a property of code. Keep this claim only if you can hand the customer the actual report. Otherwise remove it. |
| 6 | Fast: p99 latency under 2 ms | **Unsupported** | The repo has no benchmarks and no performance tests. `server.py` is a set of plain functions with no HTTP server, so there is nothing whose latency could be measured as shipped. |
| - | "Run `vaultlite status` to confirm your store is healthy" | **Misleading** | `cli.status()` (`cli.py:5-7`) always prints `store SECURE, encryption OK, rotation OK` and returns 0. It checks nothing: no key, no store, no rotation (which doesn't exist). Also, `pyproject.toml` defines no `[project.scripts]` entry, so installing the package gives no `vaultlite` command. It only runs as `python -m vaultlite.cli status`. |

## Other things a security reviewer will notice

- `server.py` calls itself "HTTP handlers", but there is no HTTP layer, transport security, authentication or authorization in the repo.
- The tests cover only the crypto helper and read/write logging. Nothing tests delete logging, key loading, rotation, the status command or persistence.

## Suggested README wording, if it has to ship now

> vaultlite is an early-stage (0.3.0) secrets store library. Secret values are encrypted with AES-256-GCM using a fresh random 96-bit nonce per write, under a single server-held 256-bit key. Secrets are currently held in memory only. Reads and writes are recorded in a local JSON-lines audit log.

Drop "zero-knowledge", "automatic key rotation", "SOC 2 Type II" and "p99 < 2 ms" until code or documents exist that back them. Either make `vaultlite status` perform real checks or remove that line.

## Fixes that would turn claims true (not done, no source edits were made)

1. Log deletes in `server.delete`, and log reads only after they succeed (or record the outcome).
2. Actually load `MASTER_KEY` from `VAULTLITE_KEY` and fail clearly if it is missing.
3. Persist the encrypted store to disk if "at rest" is going to mean what readers assume.
4. Bind the secret name as AAD in `seal`/`open_sealed`.
5. Implement key versioning and rotation before claiming rotation.
6. Make `status` check real state, and add a `[project.scripts]` entry.
