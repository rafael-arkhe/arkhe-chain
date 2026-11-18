# `SpecSafety` — machine-checked, non-bounded

`Spec => []Safety` for the deterministic-inference-verifiable-by-hash invariant
is now a **THEOREM**, discharged by `tlapm`. It is no longer a hand-audited
LEMMA, and it is no longer bounded to a finite instance.

## What was run, and what it returned

Run on 2026-11-18, Ubuntu/WSL2 x86_64, `tlapm` installed under `$HOME` (no sudo).

| # | Check | Tool | Result |
|:--|:--|:--|:--|
| 1 | `DetInferProof.tla` | `tlapm` 1.6.0-pre (rev `bf665f4`) | **All 133 obligations proved**, exit 0 |
| 2 | `DetInferProof.tla` | `tlapm` 1.5.0 (stable) | **All 133 obligations proved**, exit 0 |
| 3 | fail-open mutant | `tlapm` 1.6.0-pre | **1/133 failed**, exit 3 — as required |
| 4 | `DetInferMC.tla` finite instance | TLC 2.19 | 209,410 distinct states, **no error**, 37 s |

Check 1 passed on the **first** run. Neither of the two anticipated sticking
points needed backend tuning — see "The two sticking points" below for why.

`tlapm.out` in this directory is the verbatim log of check 1.

### Check 3 is the one that makes checks 1 and 2 mean something

A proof that passes tells you nothing on its own: a vacuous or
contradictory module proves everything. So the spec was mutated to be
**fail-open** — in `Verify`, an unresolvable receipt is `"ADMITTED"` instead of
`"EXCLUDED"` — a two-line diff (module name + one branch), and re-proved with
`--cleanfp` in a fresh directory so no fingerprint could be inherited.

`tlapm` refused it, failing exactly one obligation: step `<4>1` in the
`x = r` case of `Verify`, the leaf that forces `"ADMITTED"` into the
all-resolvable-and-hash-matching branch. The one step that carries the safety
argument is the one step that breaks when safety is broken. That is the
signature of a load-bearing proof rather than a tautological one.

### Check 4 is corroboration, not evidence

TLC on the finite instance (`Value = {0,1}`, `Hash(v) = 10 + v`,
`Infer = sum mod 2`, at most 3 coexisting receipts) reproduces the previously
reported 209k figure exactly. It is strictly weaker than check 1 — one instance
versus all instances — and is kept only because an independent tool agreeing on
an overlapping claim is cheap evidence against a `tlapm` misconfiguration.

## Reproducing

```bash
bash run_tlapm.sh
```

On Windows, inside WSL:

```bash
wsl -d Ubuntu -- bash /mnt/d/arkhe/formal/proof/detinfer/run_tlapm.sh
```

`TLAPM_CHANNEL=stable` selects the 1.5.0 installer instead of the 1.6.0-pre
tarball; `PREFIX=...` changes the install directory. The script installs under
`$HOME` by default, so it needs no root. It writes `tlapm.out` next to itself
and exits non-zero if any obligation fails.

TLC, for check 4:

```bash
java -cp /path/to/tla2tools.jar tlc2.TLC -workers 4 -config DetInferMC.cfg DetInferMC.tla
```

Delete any `TLAPS.tla` **stub** before running — real `tlapm` ships the genuine
standard module, and a stub left over from offline SANY parsing shadows it.
`run_tlapm.sh` does this automatically when it finds one.

## What carried the proof

Three structural corrections, all present in `DetInferProof.tla`:

1. **`Determinism` and `FailClosed` are not separately inductive.** They are
   state consequences of `Inv == TypeOK /\ Soundness`, discharged by
   `DeterminismFromInv` / `FailClosedFromInv`. Attempting to make them
   inductive and discharging them `BY DEF ... Next` is the naive error.
2. **`Resolve` is parametrized by the store** (`ResolveIn(S, h)`), which makes
   the uniqueness and monotonicity lemmas constant-level. They can then be
   instantiated at both `cas` and `cas'`, which is what the `Store` case needs;
   a state-level `Resolve` cannot be, and the Store case stalls there.
3. **The `Verify` / `x = r` leaf expands the nested `IF` by hand** rather than
   asking a backend to unfold it from `DEF Verify`.

`HashInjective` is load-bearing in exactly one place: `ResolveInUnique`.

## The two sticking points, in retrospect

Both anticipated failures were pre-empted rather than encountered:

- **`CHOOSE` in `ResolveInSpec`.** Already in the witness idiom
  (`<1>1. \E v \in S : Hash(v) = h` then `BY <1>1 DEF ResolveIn`). Zenon took
  it. Fallbacks `BY <1>1 DEF ResolveIn, Zenon` or `, Isa` were not needed.
  `BY DEF CHOOSE` is never right — `CHOOSE` is primitive and has no definition.
- **The nested `IF` in `Verify`.** Expanded explicitly before the first run,
  on the reasoning that it was cheaper than two `tlapm` cycles. Whether the
  compact `BY <3>3, <1>V DEF Verify` form would also have worked under 1.6.0-pre
  was not tested — the explicit form is kept because the negative control shows
  this is the leaf that matters.

A related detail: the four `ResolveMonotone` instantiations in the `Store` case
are written as four separate steps (`<3>4`–`<3>7`) rather than one
`\A h \in {r.wh, r.ih, r.ph, r.eh}` step, so that a failure would name which
hash field stalled.

## What this does NOT establish

Unchanged, and no formal tool closes either:

- **`HashInjective` is an `ASSUME`.** Real soundness is SHA-256 collision
  resistance, which is a cryptographic assumption, not a theorem. The proof
  says: *if* the hash is injective on `Value`, safety holds. The finite
  instance (check 4) verifies the premise mechanically for its own `Hash`,
  which demonstrates the premise is satisfiable — not that SHA-256 satisfies it.
- **`Infer` purity on real hardware is a `CONJECTURE`.** The spec treats `Infer`
  as a function; a GPU with non-deterministic reduction order is not one.

These two are the model↔hardware bridge. The proof is now as strong as formal
methods can make it, which means the remaining risk has moved entirely into
those two assumptions. That is a real improvement in the sense that there is
nothing left to prove, and no improvement at all in the sense that an attacker
would attack the bridge, not the model.
