# E02 demo fixtures (real artifacts, synthetic receipts)

Two artifacts that exist in this repository, committed with `arkhe-mmr@1`,
2 leaves, reference on index 0.

## Leaves (real repo artifacts)

| Leaf | kind | subject (BLAKE3-256 of the file bytes) | source |
|---|---|---|---|
| `stage10-gguf/bundle.json` | `gguf-supply-chain` | `4accface05c07750535ad33c7ffa0c16337ada8aa95cdcbd366b040d934c8676` | `output/stage10-gguf/bundle.json` |
| `stage8-detection.json` | `stage8-alert` | `5be927f338c62f0ad34e70950dac2442e87f736ca6c908c0dd4972bc55a1c96e` | `output/stage8-detection.json` |

`producer` of each leaf is the lab public key of the artifact's own profile
(`output/stage10-gguf/trust.lab.json` builder key; Stage 8 lab fixture key).
Labels are `synthetic-poc` because both source profiles are lab synthetics;
the digests, keys and bytes are real and reproducible from this repository.

## Receipts (synthetic)

The `ref.json`/`anchor.json` payer, signatures and slots are synthetic: the
devnet faucet answered HTTP 429 twice on 2026-10-23, so no on-chain anchor
was published yet (spec §9: do not retry around a 429). Everything the
receipts assert is consistent with the dataset, so all three engines
(browser WASM, server Node, CLI) verify `VERIFIED` against these files —
but the anchoring claim itself is not real until the receipts above are
replaced by captured `getTransaction` receipts from a funded devnet account.

## Verify

```
node scripts/e02_verify.mjs --receipt apps/arkhe-intra/public/e02/fixtures/ref.json --anchor apps/arkhe-intra/public/e02/fixtures/anchor.json --dataset apps/arkhe-intra/public/e02/fixtures/dataset.json
```

The same files load in the `/verificar/e02` page ("Carregar demonstração")
and verify locally in the browser via `arkhe-verify-wasm`.

## Regenerate

```
node scripts/e02_anchor.mjs dataset --out apps/arkhe-intra/public/e02/fixtures/dataset.json \
  --artifact apps/arkhe-intra/public/e02/fixtures/artifacts/stage10-gguf.json \
  --artifact apps/arkhe-intra/public/e02/fixtures/artifacts/stage8-alert.json
# real receipts, once the anchor account is funded:
node scripts/e02_anchor.mjs anchor --keypair <seed.txt> --dataset apps/arkhe-intra/public/e02/fixtures/dataset.json \
  --out apps/arkhe-intra/public/e02/fixtures --artifact apps/arkhe-intra/public/e02/fixtures/artifacts/stage10-gguf.json
```
