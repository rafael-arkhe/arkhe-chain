<!-- Saved by the evaluator from the run's final reply: the run's own Write was refused for report files. -->
# Claims ledger report: vaultlite

**Verdict:** 8 claims from vaultlite/README.md: 1 enforced, 2 partial, 5 absent. Tests run: `python -m pytest` 4 passed (crypto helpers and read/write logging only). No source edits.

## Headline findings
1. C-03 "Zero-knowledge server" is false: server.py holds MASTER_KEY, put() receives plaintext, get() decrypts and returns it.
2. C-08 `vaultlite status` cannot report a problem: cli.py:6 always prints "store SECURE, encryption OK, rotation OK" and exits 0. pyproject.toml defines no console script.
3. C-06 "SOC 2 Type II certified": no report or certificate in the repository.
4. C-04 Automatic key rotation: no rotation code; single master key.
5. C-07 p99 < 2 ms: no benchmark, no HTTP layer.

## Partly real
6. C-01 AES-256-GCM at rest: values are encrypted, but the store is an in-memory dict and nothing loads VAULTLITE_KEY.
7. C-05 Full audit log: reads and writes logged; delete() never logs; log is a plain editable file; failed reads logged as reads.

## Real
8. C-02 Fresh random nonce per secret: seal() draws os.urandom(12); covered by a passing test.

| ID | State | Claim | Gap |
|---|---|---|---|
| C-01 | partial | Encrypted at rest with AES-256-GCM. | In-memory only; key never loaded; key length unchecked |
| C-02 | enforced | Every secret has its own random nonce. | — |
| C-03 | absent | Zero-knowledge server. | Server holds the key and decrypts |
| C-04 | absent | Automatic key rotation every 30 days. | No rotation code |
| C-05 | partial | Full audit log of every read, write and delete. | Deletes not logged or tested |
| C-06 | absent | SOC 2 Type II certified infrastructure. | No report or certificate |
| C-07 | absent | p99 latency under 2 ms. | No benchmark |
| C-08 | absent | `vaultlite status` confirms your store is healthy. | Constant output, no checks |

## Overclaims
| Where | Pattern | Fix |
|---|---|---|
| cli.py:6 | OC-1 Constant verdict | Run real checks, print failures, exit non-zero |
| README line 8 | contradicted | Remove, or "encrypted with a key the server holds" |
| README line 9 | phantom feature | Remove or move to Planned |
| README line 11 | OC-7 Borrowed authority | Remove unless a current report exists |
| README line 12 | OC-5 Invented number | Remove or publish a benchmark |
| README line 7 | OC-6 Scope creep | "encrypted with AES-256-GCM (in-memory store, no persistence yet)" |

## Not checked
Only README.md as source; no CI history; hosting and SOC 2 work are outside the repo.

## Next steps
1. Remove C-03, C-06, C-04, C-07 from the landing page or move to Planned.
2. C-08: real checks, [project.scripts] entry, test that a missing key fails status.
3. C-01: load VAULTLITE_KEY and refuse to start without 32 bytes; test stored bytes are not plaintext.
4. C-05: log deletes and test it.
5. Optional: run claims_ledger.py check in CI.
