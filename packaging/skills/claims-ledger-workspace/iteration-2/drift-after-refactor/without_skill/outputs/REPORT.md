<!-- Saved by the evaluator from the run's final reply (runs were told to report in the reply). -->
# pricekit 2.0 claims re-audit

The 1.4 ledger is no longer accurate: 3 enforced in 1.4, now 0 enforced, 2 partial, 1 absent. All 3 tests pass but do not cover what broke. README, source and tests untouched.

- **C-01 rounding: enforced -> partial.** Evidence re-pointed from roundHalfEven() to round(). round() always uses 2 decimals (convert() never passes the currency's minor unit, so JPY/KWD are wrong). Ties are detected after float multiplication: round(0.545) = 0.55 (should be 0.54), round(1.015) = 1.01 (should be 1.02); 573 of 10,000 ties in 0.005..99.995 differ. Tests use exactly representable 0.125/0.375.
- **C-02 60 s rate cache: enforced -> absent.** CHANGELOG 2.0.0 says it was removed; src/fx-cache.js, cachedRate() and its test are gone; convert() fetches on every call (two conversions = two fetches).
- **C-03 offline fallback: enforced -> partial (judgment call).** rateWithFallback() and its test unchanged, but REFERENCE_RATES is a hard-coded 2-pair table, not "last published"; other pairs give NaN from convert(); a hanging API has no timeout.

CLAIMS.md rebuilt by hand (claims_ledger.py is not in the repo).

## README problems (not edited)
1. "Rate cache" is now false; remove before tagging.
2. "Banker's rounding ... to the currency's minor unit": always 2 decimals; float tie errors.
3. "Offline fallback": only two hard-coded pairs; NaN otherwise; no timeout.
4. convert() not mentioned (missing, not wrong).
