#!/usr/bin/env python3
"""Diagnóstico offline de máscaras de estado (ARC-AGI-3 traces).

Entrada: JSONL, uma linha por passo:
  {"game","episode","level","t","action","frame":[[int]*64]*64}
O frame do passo t é o estado ANTES de `action`; o de t+1 é o resultado.
Uso: python mask_diagnostic.py traces.jsonl --out report.json [--split level|episode]
     python mask_diagnostic.py --selftest
Todas as razões vêm acompanhadas das contagens absolutas.
"""
import argparse, hashlib, json
from collections import defaultdict, Counter
import numpy as np


def hkey(a):
    return hashlib.blake2b(np.ascontiguousarray(a).tobytes(), digest_size=12).digest()


def load(path):
    groups = defaultdict(list)
    with open(path) as f:
        for line in f:
            if line.strip():
                r = json.loads(line)
                groups[(r["game"], r["episode"], r["level"])].append(r)
    out = defaultdict(list)  # game -> [(episode, level, [(f_t, a, f_t1)])]
    for (g, e, l), steps in groups.items():
        steps.sort(key=lambda r: r["t"])
        fr = [np.array(s["frame"], dtype=np.uint8) for s in steps]
        tr = [(fr[i], steps[i]["action"], fr[i + 1]) for i in range(len(steps) - 1)]
        if tr:
            out[g].append((e, l, tr))
    return out


def split_units(units, by, frac):
    """Corte por nível ou episódio (nunca por passo). Determinístico por ordenação."""
    ids = sorted({(u[0] if by == "episode" else (u[0], u[1])) for u in units}, key=str)
    n_train = max(1, int(round(len(ids) * frac)))
    train_ids = set(ids[:n_train])
    key = (lambda u: u[0]) if by == "episode" else (lambda u: (u[0], u[1]))
    return ([u for u in units if key(u) in train_ids],
            [u for u in units if key(u) not in train_ids])


def make_masks(train_trans, var_thr):
    keep = {n: np.ones((64, 64), bool) for n in ("none", "border2", "border4", "variance")}
    for k in (0, 1, 62, 63):
        keep["border2"][k, :] = False
    for k in (0, 1, 2, 3, 60, 61, 62, 63):
        keep["border4"][k, :] = False
    if train_trans:  # aprendida SÓ no treino: células que mudam em >= var_thr das transições
        rate = np.mean([(a != c) for a, _, c in train_trans], axis=0)
        keep["variance"] = rate < var_thr
    return keep


def apply(fr, keep):
    return hkey(np.where(keep, fr, 0))


def table(trans, keep, raw_keep):
    t = defaultdict(lambda: {"next": Counter(), "raw_pre": set()})
    for f0, a, f1 in trans:
        e = t[(apply(f0, keep), a)]
        e["next"][apply(f1, keep)] += 1
        e["raw_pre"].add(apply(f0, raw_keep))
    return t


def diagnose(train_u, test_u, var_thr):
    tr = [x for u in train_u for x in u[2]]
    te = [x for u in test_u for x in u[2]]
    masks = make_masks(tr, var_thr)
    raw = table(tr, masks["none"], masks["none"])
    raw_conflict = {k for k, v in raw.items() if sum(v["next"].values()) >= 2 and len(v["next"]) > 1}
    raw_pre_conflict = {k[0] for k in raw_conflict}
    res = {}
    for name, keep in masks.items():
        t = table(tr, keep, masks["none"])
        ge2 = {k: v for k, v in t.items() if sum(v["next"].values()) >= 2}
        conf = {k: v for k, v in ge2.items() if len(v["next"]) > 1}
        intrinsic = sum(1 for v in conf.values() if v["raw_pre"] & raw_pre_conflict)
        cov = cor = 0
        for f0, a, f1 in te:
            e = t.get((apply(f0, keep), a))
            if e:
                cov += 1
                cor += e["next"].most_common(1)[0][0] == apply(f1, keep)
        res[name] = {
            "masked_cells": int((~keep).sum()),
            "distinct_pre_states_train": len({k[0] for k in t}),
            "pairs_train": len(t),
            "pairs_ge2_obs": len(ge2),
            "obs_in_ge2_pairs": sum(sum(v["next"].values()) for v in ge2.values()),
            "conflict_count": len(conf),
            "conflict_rate": (len(conf) / len(ge2)) if ge2 else None,
            "conflicts_fusion_induced": len(conf) - intrinsic,  # bruto determinístico, máscara fundiu
            "conflicts_raw_nondeterminism": intrinsic,          # o bruto já conflita
            "test_transitions": len(te),
            "test_covered": cov,
            "test_correct_when_covered": cor,
            "lookup_coverage": (cov / len(te)) if te else None,
            "holdout_error": ((cov - cor) / cov) if cov else None,
            "fragmentation_rate": None,  # indefinida sem rótulos manuais de estados lógicos
        }
    return res


def selftest():
    rng = np.random.default_rng(0)
    rows = []
    for ep in range(2):
        for lv in range(3):
            pos = int(rng.integers(5, 50)); tick = 0
            for t in range(60):
                fr = np.zeros((64, 64), np.uint8)
                fr[30, pos] = 5; fr[0, tick % 64] = 9  # HUD/contador na linha 0
                act = int(rng.integers(0, 2))
                rows.append({"game": "synth", "episode": ep, "level": lv, "t": t,
                             "action": act, "frame": fr.tolist()})
                pos = min(63, max(0, pos + (1 if act else -1))); tick += 1
    import tempfile, os
    p = os.path.join(tempfile.mkdtemp(), "s.jsonl")
    with open(p, "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("traces", nargs="?")
    ap.add_argument("--out", default="mask_report.json")
    ap.add_argument("--split", choices=["level", "episode"], default="level")
    ap.add_argument("--train-frac", type=float, default=0.5)
    ap.add_argument("--var-thr", type=float, default=0.5, help="limiar arbitrário; varrer")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    path = selftest() if a.selftest else a.traces
    rep = {}
    for g, units in load(path).items():
        train_u, test_u = split_units(units, a.split, a.train_frac)
        rep[g] = {"split": a.split, "train_units": len(train_u), "test_units": len(test_u),
                  "masks": diagnose(train_u, test_u, a.var_thr)}
    json.dump(rep, open(a.out, "w"), indent=2)
    for g, r in rep.items():
        print(f"== {g} (split={r['split']}, train={r['train_units']}, test={r['test_units']})")
        print(f"{'mask':9} {'pre_st':>7} {'ge2':>5} {'conf':>5} {'fus':>5} {'raw':>4} {'cov':>6} {'err':>6}")
        for n, m in r["masks"].items():
            f = lambda x: "-" if x is None else f"{x:.3f}"
            print(f"{n:9} {m['distinct_pre_states_train']:7d} {m['pairs_ge2_obs']:5d} {m['conflict_count']:5d} "
                  f"{m['conflicts_fusion_induced']:5d} {m['conflicts_raw_nondeterminism']:4d} "
                  f"{f(m['lookup_coverage']):>6} {f(m['holdout_error']):>6}")


if __name__ == "__main__":
    main()