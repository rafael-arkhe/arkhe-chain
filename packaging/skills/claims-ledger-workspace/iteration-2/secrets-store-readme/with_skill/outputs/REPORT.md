<!-- Saved by the evaluator from the run's final reply (runs were told to report in the reply). -->
# Claims ledger report: vaultlite

**Verdict:** 8 claims from README (v0.3.0): 1 enforced, 2 partial, 5 absent; 4 overclaims in user-facing text. `check` prints OK enforced 1, partial 2, absent 5. Tests: `python -m pytest` 4 passed.

## Headline findings
1. C-03 Zero-knowledge contradicted: server.py holds MASTER_KEY; put() encrypts plaintext on the server; get() decrypts and returns it.
2. C-04 Key rotation does not exist; yet `vaultlite status` prints "rotation OK" (cli.py:6).
3. C-08 `vaultlite status` is a hard-coded string (cli.py:6), exits 0; no console script in pyproject.toml.
4. C-06 SOC 2 Type II: no report, letter or infrastructure in the repo.
5. C-07 p99 < 2 ms: no benchmark, no HTTP server.
6. C-01 Encrypted at rest: half true; in-memory dict; names in clear; MASTER_KEY None, VAULTLITE_KEY never loaded.
7. C-05 Full audit log: delete() never logs; no tamper protection.

| ID | State | Claim |
|---|---|---|
| C-01 | partial | Encrypted at rest with AES-256-GCM. |
| C-02 | enforced | Every secret has its own random nonce. |
| C-03 | absent | Zero-knowledge server. |
| C-04 | absent | Automatic key rotation every 30 days. |
| C-05 | partial | Full audit log of every read, write and delete. |
| C-06 | absent | SOC 2 Type II certified infrastructure. |
| C-07 | absent | p99 latency under 2 ms. |
| C-08 | absent | `vaultlite status` confirms your store is healthy. |

## Overclaims
| Where | Pattern | Fix |
|---|---|---|
| cli.py:6 | OC-1 | Compute each item; NOT CHECKED / FAIL; non-zero exit |
| cli.py:6 | OC-4 | Remove "rotation OK" or "rotation: not implemented" |
| README.md:10 | OC-7 | Remove SOC 2 unless a current report exists |
| README.md:11 | OC-5 | Remove or publish a benchmark |

Accurate landing copy today: "Secrets encrypted with AES-256-GCM, unique random nonce per secret; the server holds the key."

## Next steps
C-03 drop "zero-knowledge" or redesign; C-04/C-08 real status checks + entry point; C-06/C-07 remove or move to Planned; C-01 persistence + key loading + ciphertext test; C-05 log deletes + test. Optional CI check.
