<!-- Saved by the evaluator from the run's final reply (runs were told to report in the reply). -->
# pricekit 2.0 claims re-check

**Verdict:** 3 claims, README unchanged since 1.4: 0 enforced, 2 partial, 1 absent (was 3 enforced). 1 overclaim users see. claims.json updated, CLAIMS.md re-rendered; check prints OK enforced 0, partial 2, absent 1. Before edits the checker failed 4 times (C-01 anchor and trace gone after rename; fx-cache.js and its test deleted).

1. C-02 absent: CHANGELOG 2.0.0 removed the cache; convert() fetches on every call (src/convert.js:5). README still promises 60 s caching; the opposite is now true.
2. C-01 partial: no minor-unit lookup (always 2 decimals; JPY/KWD wrong); ties detected on the float, 573/10,000 decimal ties wrong (1.015 -> 1.01, 0.545 -> 0.55); tests use binary-exact ties.
3. C-03 partial (predates 2.0): REFERENCE_RATES is a hard-coded 2-pair table, no source/date; unknown pairs give NaN from convert().

| ID | State | Claim | Gap |
|---|---|---|---|
| C-01 | partial (was enforced) | Amounts are rounded half-to-even to the currency's minor unit. | Always 2 decimals; float tie errors; exact-tie tests only |
| C-02 | absent (was enforced) | FX rates are cached for 60 seconds, so checkout never waits on the rate API twice. | Cache removed in 2.0.0 |
| C-03 | partial (was enforced) | If the rate API is down, the last published reference rates are used. | Hard-coded 2-pair table; NaN for unknown pairs |

## README (not edited)
| Where | Problem | Suggested fix |
|---|---|---|
| README.md:6 | Feature no longer exists | Delete, or "Rates are fetched for every conversion (no cache, to avoid stale prices)." |

Wording notes: README.md:5 "to the currency's minor unit" overstates; README.md:7 "last published" overstates.

Not checked: node --test 3 passed; no 1.4 code available to date the C-01/C-03 gaps. Evidence by anchors (no source edits).
Next steps: C-02 decide README or restore cache; C-01 minor-unit table + integer rounding + tie tests; C-03 throw on unknown pair, date the table; add check to CI.
