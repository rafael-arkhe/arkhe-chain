# pricekit

Currency conversion for checkout pages.

- **Banker's rounding**: amounts are rounded half-to-even to the currency's minor unit.
- **Rate cache**: FX rates are cached for 60 seconds, so checkout never waits on the rate API twice.
- **Offline fallback**: if the rate API is down, the last published reference rates are used.
