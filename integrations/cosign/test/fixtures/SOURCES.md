# Immutable public Sigstore verification fixtures

- `message.sigstore.json`: `V3.MESSAGE_SIGNATURE.TLOG_HASHEDREKORDV002` from
  [sigstore-js bundles.ts at 769a53d8713248a8bf49edfc2a5d1955b0dcc24d](https://github.com/sigstore/sigstore-js/blob/769a53d8713248a8bf49edfc2a5d1955b0dcc24d/packages/verify/src/__tests__/__fixtures__/bundles.ts).
  JSON serialization removes undefined fields. SHA-256:
  `15c300660614df9e377110bb2136a7369064643501f710bc7d6807ceb9d36483`.
- `artifact.txt`: exactly `hello, world!`, no newline; the same upstream `ARTIFACT`.
- `trusted-root.public.json`: unchanged bytes from
  [root-signing trusted_root.json at f138b503846c9b9c5a78eeee470aae395ee85dfa](https://github.com/sigstore/root-signing/blob/f138b503846c9b9c5a78eeee470aae395ee85dfa/targets/trusted_root.json).
  SHA-256: `6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66`.
- `policy.public.json`: Arkhe test policy; exact identity/issuer taken from the
  upstream certificate and a fixed signing-time window covering December 14, 2025.

The upstream artifacts are licensed under Apache-2.0; see `LICENSE.sigstore`.
These are public verification materials, containing no private keys. The root is
a frozen test snapshot, not an automatically updated production trust authority.
No CI step regenerates fixtures, signs artifacts or contacts external services.
