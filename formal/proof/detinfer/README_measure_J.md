# `measure_J.py` — status: PROPOSAL, with the grid math verified

`J = (1 - f) * p_tail` is still a **CONJECTURE** (`J ~ 0.12-0.25`). Closing it
needs two models, which this machine does not have. What *was* closed here is
everything that does not need a GPU: the three corrections are applied, and the
scoring grid is covered by a self-test that runs with no model access.

```bash
python test_measure_J.py      # ALL CHECKS PASSED, exit 0
```

## The three corrections

**1. The judge is reported both ways, and `exact` is primary.**
The first draft judged correctness by containment, scoring
*"The capital is Paris, France"* as correct for gold *"Paris"*. That inflates
the cheap model's measured correctness, deflating `p_tail`, deflating `J`, and
so **inflating** the break-even audit rate `q* = delta / (k * J)`. An inflated
`q*` makes cheating look harder to deter than it is, so the error was
conservative for the defender — but it was silent, which is the actual problem.
Both judges now run on every cell: `exact` gives the lower bound on `q*`,
`contains` the upper bound. The honest claim is the bracket.

Test `[2]` asserts that direction rather than assuming it: on a constructed
sample it confirms `contains` deflates `p_tail` (1.000 → 0.750), deflates `J`
(0.500 → 0.375), and inflates `q*`.

**2. Temperature is swept, not fixed at 0.7.**
Part 1 of the protocol assumes temperature 0; 0.7 was hard-coded. Sampling at
0.7 supplies the variance that makes `theta` calibratable but adds noise to the
honest-vs-cheap similarity, which is the thing `f` measures. `--temps 0.0,0.7`
runs both. At temperature 0 the two honest samples usually collapse to
identical strings, so `S_HH` has no spread and `theta` pins to ~1.0; the script
detects this (`degenerate_theta`) and labels that column a determinism check
rather than reporting a meaningless `f`.

**3. `delta = Delta / c_H` is swept over {0.8, 0.9, 0.95}.**
It is an assumption about the honest-vs-cheap cost gap, not a measurement.

## Also changed

- **`alpha` is swept free of charge.** Everything downstream of generation
  (`theta`, `f`, `p_tail`, `J`, `q*`) is post-hoc on fixed outputs, so the
  whole `alpha x temp x judge x delta x k` grid costs one generation run.
- **Generations are cached** (`--cache`), and `--reuse` recomputes the entire
  grid with no model access. Re-running the analysis never re-bills inference.
- **Generation is parallel** (`--concurrency`, retries). The draft issued one
  serial HTTP request per prompt: at `n=1000` and two temperatures that is 6000
  sequential round trips.
- **The bootstrap CI is labelled for what it is** —
  `J_CI95_prompt_resample`. It resamples prompts only. It does not cover model
  stochasticity (one sample per prompt) nor the fact that `theta` is estimated
  from the same data it is then applied to.

## One substantive thing the self-test exposed

Test `[5]` sweeps `alpha` over continuous similarity distributions, and `f`
moves hard: `0.92 → 0.83 → 0.71 → 0.60` as `alpha` goes `0.001 → 0.1`. Since
`J = (1 - f) * p_tail`, `J` is dominated by `f`, and `f` is set by the
threshold you chose, not by the cheap model. At a defensible `alpha = 0.01`,
`f ≈ 0.83` leaves `1 - f ≈ 0.17`, so reaching the conjectured `J ≈ 0.12-0.25`
requires `p_tail ≈ 0.7-1.0` — nearly every divergent answer being outright
wrong.

That is the load-bearing assumption in the whole deterrence argument, and it is
an assumption about the *cheap model's error profile*, not about the audit.
If the 8B model is merely more verbose than the 70B rather than more wrong, it
fails the similarity check while still being right, `p_tail` collapses, and
`q*` goes infeasible at every plausible `k`. The measurement is worth running
mainly to find out which of those two worlds is real.

(Those numbers are from synthetic distributions in the self-test. They are not
a measurement of any model — they show which input the result is sensitive to.)

## Running it for real

```bash
pip install datasets sentence-transformers numpy requests
python measure_J.py --endpoint http://localhost:8000/v1 \
    --ref-model llama-3.1-70b-instruct --cheat-model llama-3.1-8b-instruct \
    --n 1000 --temps 0.0,0.7 --concurrency 16
```

Then, with no GPU:

```bash
python measure_J.py --reuse J_generations.json --out J_result.json
```

The output of the real run is what turns `J` from `CONJECTURE` into an
empirical `LEMMA` with a CI, and it is the input `q*` needs in Part 1.
Until then this stays `PROPOSAL`.
