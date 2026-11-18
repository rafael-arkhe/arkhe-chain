#!/usr/bin/env python3
# =============================================================================
# Measure f, p_tail and J for the semantic false-accept model (Part 1).
#
#   J = (1 - f) * p_tail        deterrence holds iff  q_real * k * J >= delta
#   delta = Delta / c_H         (honest-vs-cheap cost gap, ~0.9 at a 10x gap)
#
#   f      = fraction of jobs where the cheap model's answer is semantically
#            INDISTINGUISHABLE from the reference (sim >= theta) -> evades audit
#   p_tail = among the divergent jobs (sim < theta), fraction where the cheap
#            answer is actually WRONG (so a judge would catch it)
#   theta  = similarity threshold calibrated to a false-reject rate alpha on
#            the honest-vs-honest pair (reference vs reference, independent
#            samples)
#
# Converts the CONJECTURE "J ~ 0.12-0.25" into a measured LEMMA with a CI.
#
# Requires GPU/API access to two models. Wire `generate_batch` to your backend
# if it is not OpenAI-compatible.
#
#   pip install datasets sentence-transformers numpy requests
#   python measure_J.py --endpoint http://localhost:8000/v1 \
#       --ref-model llama-3.1-70b-instruct --cheat-model llama-3.1-8b-instruct \
#       --n 1000 --temps 0.0,0.7 --concurrency 16
#
# Generations are cached to --cache; re-running with --reuse recomputes the
# whole (alpha x temp x judge x delta x k) grid with no model access at all.
#
# -----------------------------------------------------------------------------
# THREE CORRECTIONS over the first draft of this script
#
# 1. THE JUDGE IS REPORTED BOTH WAYS, AND "exact" IS PRIMARY.
#    The first draft judged correctness by containment (`gold in prediction`),
#    which scores "The capital is Paris, France" as correct for gold "Paris".
#    That inflates the cheap model's measured correctness, which deflates
#    p_tail, which deflates J, which INFLATES the break-even audit rate
#    q* = delta / (k * J). Inflated q* makes cheating look harder to deter
#    than it is, so the error is conservative for the defender -- but it is
#    still an error, and it must not be silent. Both judges now run:
#      exact    -> normalized equality. Primary. Optimistic J, so the LOWER
#                  bound on q*.
#      contains -> normalized containment. Sensitivity. Pessimistic J, so the
#                  UPPER bound on q*.
#    The honest claim is the bracket between them, not either number alone.
#
# 2. TEMPERATURE IS SWEPT, NOT FIXED AT 0.7.
#    Part 1 of the protocol assumes temperature 0. Sampling at 0.7 adds the
#    variance that makes theta calibratable, but it also adds noise to the
#    honest-vs-cheap similarities, which is exactly what f measures. Fixing
#    either value alone hides that trade. Both are run. If J moves a lot
#    between them, the quantity is fragile -- and that is the finding.
#    At temperature 0 the two honest samples typically collapse to identical
#    strings, so S_HH has no spread and theta pins to ~1.0; the script detects
#    this and says so rather than reporting a degenerate f.
#
# 3. delta IS SWEPT.
#    delta = Delta / c_H was hard-coded to 0.9. It is an assumption about the
#    cost gap, not a measurement, so it is swept over {0.8, 0.9, 0.95}.
# =============================================================================
import argparse
import json
import os
import re
import string
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np

ALPHAS = [0.001, 0.01, 0.05, 0.10]
DELTAS = [0.8, 0.9, 0.95]
KS = [10, 30, 100, 300, 1000]
JUDGES = ["exact", "contains"]
BOOTSTRAP = 2000


# ----------------------------------------------------------------------------
# Backend: OpenAI-compatible chat endpoint (vLLM / TGI / OpenAI).
# ----------------------------------------------------------------------------
def generate_batch(prompts, model, endpoint, temperature, seed,
                   max_tokens=64, concurrency=8, api_key=None):
    """Generate one completion per prompt. Order of the output matches input."""
    import requests

    headers = {}
    key = api_key or os.environ.get("OPENAI_API_KEY")
    if key:
        headers["Authorization"] = f"Bearer {key}"

    session = requests.Session()

    def one(prompt):
        body = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "seed": seed,
        }
        last = None
        for attempt in range(3):
            try:
                r = session.post(f"{endpoint}/chat/completions", json=body,
                                 headers=headers, timeout=120)
                r.raise_for_status()
                return r.json()["choices"][0]["message"]["content"].strip()
            except Exception as exc:  # noqa: BLE001 - surfaced after retries
                last = exc
        raise RuntimeError(f"generation failed after 3 attempts: {last}")

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        return list(pool.map(one, prompts))


# ----------------------------------------------------------------------------
# SQuAD / TriviaQA-style answer normalization and the two judges.
# ----------------------------------------------------------------------------
def normalize(s):
    s = s.lower()
    s = "".join(ch for ch in s if ch not in set(string.punctuation))
    s = re.sub(r"\b(a|an|the)\b", " ", s)
    return " ".join(s.split())


def is_correct(pred, gold_aliases, judge):
    """judge='exact'    -> normalized equality against any gold alias (primary)
       judge='contains' -> normalized containment (generous; sensitivity only)"""
    p = normalize(pred)
    golds = {normalize(a) for a in gold_aliases}
    golds.discard("")
    if not golds:
        return False
    if judge == "exact":
        return p in golds
    if judge == "contains":
        return any(g == p or g in p for g in golds)
    raise ValueError(f"unknown judge: {judge}")


# ----------------------------------------------------------------------------
def embed_cos(emb, a, b):
    ea = emb.encode(a, normalize_embeddings=True)
    eb = emb.encode(b, normalize_embeddings=True)
    return np.sum(ea * eb, axis=1)


def summarize(s_hh, s_ch, wrong_by_judge, alpha, rng):
    """One (temp, alpha) cell: theta, f, and p_tail/J for each judge."""
    theta = float(np.quantile(s_hh, alpha))
    evade = s_ch >= theta
    f = float(np.mean(evade))
    divergent = ~evade

    cell = {"theta": theta, "f": f, "n_divergent": int(divergent.sum())}
    n = len(s_ch)

    for judge, wrong in wrong_by_judge.items():
        p_tail = float(np.mean(wrong[divergent])) if divergent.any() else 0.0
        J = (1.0 - f) * p_tail

        # Bootstrap over PROMPTS. This is a CI on prompt sampling only; it does
        # not cover model stochasticity (one sample per prompt) or the choice
        # of theta, which is itself estimated from the same data.
        boot = np.empty(BOOTSTRAP)
        for b in range(BOOTSTRAP):
            bi = rng.integers(0, n, n)
            ev = s_ch[bi] >= theta
            dv = ~ev
            pb = np.mean(wrong[bi][dv]) if dv.any() else 0.0
            boot[b] = (1.0 - np.mean(ev)) * pb
        lo, hi = (float(x) for x in np.percentile(boot, [2.5, 97.5]))

        cell[judge] = {
            "p_tail": p_tail,
            "J": J,
            "J_CI95_prompt_resample": [lo, hi],
            "qstar": {
                str(d): {str(k): (d / (k * J) if J > 0 else float("inf"))
                         for k in KS}
                for d in DELTAS
            },
        }
    return cell


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--endpoint", help="OpenAI-compatible base URL")
    ap.add_argument("--ref-model")
    ap.add_argument("--cheat-model")
    ap.add_argument("--n", type=int, default=1000)
    ap.add_argument("--seed", type=int, default=1234)
    ap.add_argument("--temps", default="0.0,0.7",
                    help="comma-separated sampling temperatures to sweep")
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--max-tokens", type=int, default=64)
    ap.add_argument("--sim-model", default="all-MiniLM-L6-v2")
    ap.add_argument("--cache", default="J_generations.json",
                    help="where generations are written")
    ap.add_argument("--reuse", default=None,
                    help="recompute the grid from a cache file; no model access")
    ap.add_argument("--out", default="J_result.json")
    args = ap.parse_args()

    temps = [float(t) for t in args.temps.split(",") if t.strip()]
    rng = np.random.default_rng(args.seed)

    # ---------------- generations: either reuse a cache or produce them -----
    if args.reuse:
        with open(args.reuse, encoding="utf-8") as fh:
            cache = json.load(fh)
        print(f"[*] reusing generations from {args.reuse} "
              f"(n={len(cache['golds'])}, temps={list(cache['by_temp'])})")
    else:
        missing = [n for n in ("endpoint", "ref_model", "cheat_model")
                   if not getattr(args, n)]
        if missing:
            ap.error("--endpoint, --ref-model and --cheat-model are required "
                     "unless --reuse is given")

        from datasets import load_dataset

        ds = load_dataset("trivia_qa", "rc.nocontext", split="validation")
        idx = rng.choice(len(ds), size=min(args.n, len(ds)), replace=False)
        rows = ds.select(idx.tolist())
        prompts = [f"Answer with the fact only, no sentence.\nQ: {q}\nA:"
                   for q in rows["question"]]
        golds = [a["aliases"] + a.get("normalized_aliases", [])
                 for a in rows["answer"]]

        cache = {
            "golds": golds,
            "ref_model": args.ref_model,
            "cheat_model": args.cheat_model,
            "n": len(prompts),
            "by_temp": {},
        }
        for t in temps:
            print(f"[*] generating at temperature {t} "
                  f"(3 x {len(prompts)} completions)")
            cache["by_temp"][str(t)] = {
                # Two independent honest samples calibrate theta; one cheap
                # sample is the thing being measured. Distinct seeds matter:
                # identical seeds would make ref_a and ref_b the same draw.
                "ref_a": generate_batch(prompts, args.ref_model, args.endpoint,
                                        t, 1, args.max_tokens,
                                        args.concurrency),
                "ref_b": generate_batch(prompts, args.ref_model, args.endpoint,
                                        t, 2, args.max_tokens,
                                        args.concurrency),
                "cheat": generate_batch(prompts, args.cheat_model,
                                        args.endpoint, t, 3, args.max_tokens,
                                        args.concurrency),
            }
        with open(args.cache, "w", encoding="utf-8") as fh:
            json.dump(cache, fh, indent=2)
        print(f"[*] generations cached to {args.cache}")

    golds = cache["golds"]

    # ---------------- scoring grid (no model access past this point) --------
    from sentence_transformers import SentenceTransformer
    emb = SentenceTransformer(args.sim_model)

    result = {
        "n": cache["n"],
        "ref_model": cache["ref_model"],
        "cheat_model": cache["cheat_model"],
        "sim_model": args.sim_model,
        "alphas": ALPHAS,
        "deltas": DELTAS,
        "ks": KS,
        "primary_judge": "exact",
        "by_temp": {},
    }

    for t_key, gen in cache["by_temp"].items():
        ref_a, ref_b, cheat = gen["ref_a"], gen["ref_b"], gen["cheat"]
        s_hh = embed_cos(emb, ref_a, ref_b)
        s_ch = embed_cos(emb, ref_a, cheat)

        identical = float(np.mean([a == b for a, b in zip(ref_a, ref_b)]))
        degenerate = bool(np.std(s_hh) < 1e-6 or identical > 0.99)

        wrong_by_judge = {
            j: np.array([not is_correct(cheat[i], golds[i], j)
                         for i in range(len(cheat))])
            for j in JUDGES
        }

        block = {
            "S_HH_mean": float(np.mean(s_hh)),
            "S_HH_std": float(np.std(s_hh)),
            "honest_pair_identical_frac": identical,
            "degenerate_theta": degenerate,
            "cheat_accuracy": {
                j: float(np.mean(~wrong_by_judge[j])) for j in JUDGES
            },
            "by_alpha": {},
        }
        for alpha in ALPHAS:
            block["by_alpha"][str(alpha)] = summarize(
                s_hh, s_ch, wrong_by_judge, alpha, rng)
        result["by_temp"][t_key] = block

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)

    # ---------------- report ------------------------------------------------
    for t_key, block in result["by_temp"].items():
        print(f"\n=== temperature {t_key} ===")
        print(f"S_HH mean={block['S_HH_mean']:.4f} "
              f"std={block['S_HH_std']:.4f}  "
              f"honest pair identical: {block['honest_pair_identical_frac']:.3f}")
        if block["degenerate_theta"]:
            print("  !! DEGENERATE: the two honest samples barely differ, so "
                  "theta pins to ~1.0 and f is not meaningful at this "
                  "temperature. Treat this column as a determinism check, not "
                  "as a measurement of J.")
        print(f"cheat accuracy: exact={block['cheat_accuracy']['exact']:.3f} "
              f"contains={block['cheat_accuracy']['contains']:.3f}")
        for alpha in ALPHAS:
            c = block["by_alpha"][str(alpha)]
            print(f"\n  alpha={alpha:<6} theta={c['theta']:.4f}  "
                  f"f={c['f']:.3f}  divergent={c['n_divergent']}")
            for j in JUDGES:
                d = c[j]
                tag = "PRIMARY  " if j == "exact" else "sensitiv."
                lo, hi = d["J_CI95_prompt_resample"]
                print(f"    {tag} {j:<9} p_tail={d['p_tail']:.3f}  "
                      f"J={d['J']:.3f}  CI95[{lo:.3f}, {hi:.3f}]")
            print("    break-even real-audit rate q* = delta / (k * J), "
                  "exact judge:")
            for d_val in DELTAS:
                cells = []
                for k in KS:
                    q = c["exact"]["qstar"][str(d_val)][str(k)]
                    cells.append(f"k={k}:{'INF' if q > 1 else f'{q:.4f}'}")
                print(f"      delta={d_val}: " + "  ".join(cells))

    print(f"\nDeterrence holds iff q_real * k * J >= delta.")
    print("q* above 1 is infeasible: no audit rate deters at that k.")
    print("The exact judge gives the LOWER bound on q* and the contains judge "
          "the UPPER bound; the honest claim is the bracket, not one number.")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
