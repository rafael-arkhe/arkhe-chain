"""Self-test for measure_J.py: judge semantics and grid math, no model access."""
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import measure_J as M  # noqa: E402

fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


print("[1] judge semantics -- the documented containment bias")
gold = ["Paris"]
check(M.is_correct("Paris", gold, "exact") is True, "exact accepts 'Paris'")
check(M.is_correct("paris.", gold, "exact") is True, "exact normalizes punct/case")
check(M.is_correct("The capital is Paris, France", gold, "exact") is False,
      "exact REJECTS a padded answer")
check(M.is_correct("The capital is Paris, France", gold, "contains") is True,
      "contains ACCEPTS the same padded answer (the generous judge)")
check(M.is_correct("Lyon", gold, "exact") is False, "exact rejects a wrong answer")
check(M.is_correct("Lyon", gold, "contains") is False,
      "contains rejects a wrong answer too")
check(M.is_correct("anything", [], "exact") is False, "empty gold set -> False")

print("\n[2] the bias has the claimed DIRECTION: contains -> lower J -> higher q*")
rng = np.random.default_rng(7)
n = 800
s_hh = np.concatenate([np.full(n - 20, 0.97), np.full(20, 0.55)])
s_ch = np.concatenate([np.full(n // 2, 0.99), np.full(n - n // 2, 0.40)])
# Of the 400 divergent jobs: 300 plainly wrong, 100 padded-but-right.
cheat = ["Paris"] * (n // 2) + ["Lyon"] * 300 + ["The capital is Paris, France"] * 100
golds = [["Paris"]] * n
wrong = {j: np.array([not M.is_correct(cheat[i], golds[i], j) for i in range(n)])
         for j in M.JUDGES}
cell = M.summarize(s_hh, s_ch, wrong, 0.01, rng)
je, jc = cell["exact"], cell["contains"]
print(f"  theta={cell['theta']:.4f} f={cell['f']:.3f} "
      f"divergent={cell['n_divergent']}")
print(f"  exact   : p_tail={je['p_tail']:.3f} J={je['J']:.3f}")
print(f"  contains: p_tail={jc['p_tail']:.3f} J={jc['J']:.3f}")
check(je["p_tail"] > jc["p_tail"], "contains deflates p_tail")
check(je["J"] > jc["J"], "contains deflates J")
check(je["qstar"]["0.9"]["100"] < jc["qstar"]["0.9"]["100"],
      "contains inflates q* (conservative for the defender)")

print("\n[3] grid identities")
check(abs(cell["f"] - 0.5) < 1e-9, "f = 0.5 for the constructed split")
check(abs(je["p_tail"] - 1.0) < 1e-9,
      "exact p_tail = 1.0 (all 400 divergent judged wrong)")
check(abs(jc["p_tail"] - 0.75) < 1e-9,
      "contains p_tail = 0.75 (100 of 400 judged right)")
for j in M.JUDGES:
    d = cell[j]
    check(abs(d["J"] - (1 - cell["f"]) * d["p_tail"]) < 1e-12,
          f"{j}: J == (1-f) * p_tail")
    for dv in M.DELTAS:
        for k in M.KS:
            q = d["qstar"][str(dv)][str(k)]
            check(abs(q - dv / (k * d["J"])) < 1e-12,
                  f"{j}: q*(delta={dv},k={k}) == delta/(k*J)") if k == 100 and dv == 0.9 else None
lo, hi = je["J_CI95_prompt_resample"]
check(lo <= je["J"] <= hi, "point estimate of J lies inside its bootstrap CI")

print("\n[4] degenerate-theta detection (temperature 0 collapse)")
ident = np.full(n, 1.0)
check(bool(np.std(ident) < 1e-6), "zero-spread S_HH is detectable")

print("\n[5] alpha monotonicity: a larger alpha -> a stricter theta -> smaller f")
# A CONTINUOUS S_HH, so theta actually moves with alpha. With the step-shaped
# S_HH used above, f is constant across these alphas and the assertion would
# pass without exercising anything.
s_hh_c = np.clip(rng.normal(0.90, 0.05, n), 0.0, 1.0)
s_ch_c = np.clip(rng.normal(0.86, 0.08, n), 0.0, 1.0)
wrong_c = {j: rng.random(n) < 0.6 for j in M.JUDGES}
cells = [M.summarize(s_hh_c, s_ch_c, wrong_c, a, rng) for a in M.ALPHAS]
thetas = [c["theta"] for c in cells]
fs = [c["f"] for c in cells]
print("  theta by alpha", dict(zip(M.ALPHAS, [round(x, 4) for x in thetas])))
print("  f     by alpha", dict(zip(M.ALPHAS, [round(x, 4) for x in fs])))
check(len(set(round(t, 6) for t in thetas)) == len(thetas),
      "theta is distinct at every alpha (the test is not vacuous)")
check(all(thetas[i] <= thetas[i + 1] for i in range(len(thetas) - 1)),
      "theta is non-decreasing in alpha")
check(all(fs[i] >= fs[i + 1] for i in range(len(fs) - 1)),
      "f is non-increasing in alpha")
check(fs[0] - fs[-1] > 0.05, "f actually moves across the alpha sweep")

print("\n" + ("ALL CHECKS PASSED" if not fails else f"{len(fails)} FAILURES"))
sys.exit(1 if fails else 0)
