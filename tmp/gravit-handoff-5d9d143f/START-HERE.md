# Arkhe / Gravit interoperability handoff

Read `gravit-2026-10-26/round2/README.md` for current results and limitations.
The parent README preserves the earlier primitive-only round.

With Python cryptography 50.0.1 and Node.js installed, run:

```
python gravit-2026-10-26/round2/verify.py
```

The optional --with-arkhe flag requires the original complete Arkhe workspace;
this archive contains the decision reader and frozen primitive outputs, not
the full Arkhe workspace or its Rust dependency graph.
No account credentials are included. All captured hosted inputs are public.
