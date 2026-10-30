#!/usr/bin/env python3
"""Diagnóstico offline de máscaras de estado (ARC-AGI-3 traces). Hash: BLAKE2b.

Entrada: JSONL, uma linha por passo. Campos obrigatórios:
  game, episode, level, t, action, frame (64x64)   [opcional: next_frame]
Sem next_frame, usa-se o frame do passo seguinte (o último passo é descartado).
Atenção: (game, episode, level) é a identidade do grupo; episódios de arquivos
diferentes com o mesmo id são fundidos.

Métricas de previsão: a chave de consulta usa a máscara; o ALVO é o hash do
próximo frame restrito ao NÚCLEO (interseção das células mantidas por todas as
máscaras, aprendida no treino), igual para todas as máscaras. Assim nenhuma
máscara é favorecida por julgar um alvo mais fácil.
Incerteza: bootstrap por grupo (episódio ou nível) sobre as tallies de teste.
A variância entre dobras NÃO é apresentada como erro padrão.

Uso:
  python mask_diagnostic_v3.py traces/ --out r.json [--split level|episode] [--folds 5]
  python mask_diagnostic_v3.py --selftest
"""
import argparse
import hashlib
import json
import random
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import NamedTuple

import numpy as np

MASKS = ("none", "border2", "border4", "variance")
TRAIN_METRICS = ("distinct_pre_states_train", "pairs_ge2_obs", "obs_ge2_fraction",
                 "conflict_count", "conflicts_raw_only", "conflicts_fusion_only",
                 "conflicts_mixed")


class Tr(NamedTuple):
    game: str
    ep: int
    lv: int
    t: int
    f: np.ndarray
    a: int
    nf: np.ndarray


def H(frame, keep):
    return hashlib.blake2b(np.where(keep, frame, 0).tobytes(), digest_size=12).digest()


def load(path: Path):
    files = [path] if path.is_file() else sorted(path.glob("*.jsonl"))
    groups = defaultdict(list)
    for fp in files:
        for ln, line in enumerate(fp.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            r = json.loads(line)
            for k in ("game", "episode", "level", "t", "action", "frame"):
                if r.get(k) is None:
                    raise ValueError(f"{fp}:{ln}: campo obrigatório ausente: {k}")
            groups[(r["game"], r["episode"], r["level"])].append(r)
    out = defaultdict(list)
    for (g, e, lv), rows in groups.items():
        rows.sort(key=lambda r: r["t"])
        fr = [np.array(r["frame"], dtype=np.uint8) for r in rows]
        for i, r in enumerate(rows):
            if r.get("next_frame") is not None:
                nf = np.array(r["next_frame"], dtype=np.uint8)
            elif i + 1 < len(rows):
                nf = fr[i + 1]
            else:
                continue
            if fr[i].shape != (64, 64):
                raise ValueError(f"frame {fr[i].shape} != (64, 64)")
            out[g].append(Tr(g, int(e), int(lv), int(r["t"]), fr[i], int(r["action"]), nf))
    return out


def gkey(tr, by):
    return tr.ep if by == "episode" else (tr.ep, tr.lv)


def split_units(units, by, frac):
    ids = sorted({gkey(t, by) for t in units}, key=str)
    if len(ids) < 2:
        raise ValueError("são necessários >= 2 grupos para separar treino e teste")
    n = max(1, min(len(ids) - 1, int(round(len(ids) * frac))))
    tr_ids = set(ids[:n])
    return ([t for t in units if gkey(t, by) in tr_ids],
            [t for t in units if gkey(t, by) not in tr_ids])


def make_masks(train, var_thr):
    keep = {n: np.ones((64, 64), bool) for n in MASKS}
    keep["border2"][[0, 1, 62, 63], :] = False
    keep["border4"][[0, 1, 2, 3, 60, 61, 62, 63], :] = False
    ch = np.zeros((64, 64))
    for t in train:
        ch += (t.f != t.nf)
    keep["variance"] = (ch / len(train)) < var_thr  # aprendida só no treino
    return keep


def diagnose(train, test, by, var_thr):
    keeps = make_masks(train, var_thr)
    core = np.logical_and.reduce(list(keeps.values()))
    none = keeps["none"]
    rp = [H(t.f, none) for t in train]
    raw = defaultdict(Counter)
    for t, p in zip(train, rp):
        raw[(p, t.a)][H(t.nf, none)] += 1
    raw_conf = {k for k, c in raw.items() if sum(c.values()) >= 2 and len(c) > 1}
    cn_train = [H(t.nf, core) for t in train]
    cn_test = [H(t.nf, core) for t in test]
    res, tally = {}, {}
    for name, keep in keeps.items():
        tab = defaultdict(lambda: {"next": Counter(), "core": Counter(), "raw_pre": set()})
        for t, p, cn in zip(train, rp, cn_train):
            e = tab[(H(t.f, keep), t.a)]
            e["next"][H(t.nf, keep)] += 1
            e["core"][cn] += 1
            e["raw_pre"].add(p)
        ge2 = {k: v for k, v in tab.items() if sum(v["next"].values()) >= 2}
        conf = {k: v for k, v in ge2.items() if len(v["next"]) > 1}
        ro = fo = mx = 0
        for (_, a), v in conf.items():
            hits = [(rh, a) in raw_conf for rh in v["raw_pre"]]
            if all(hits):
                ro += 1
            elif not any(hits):
                fo += 1
            else:
                mx += 1
        tl = defaultdict(lambda: [0, 0, 0])  # grupo -> [n, cobertos, corretos]
        for t, cn in zip(test, cn_test):
            g = str(gkey(t, by))
            tl[g][0] += 1
            e = tab.get((H(t.f, keep), t.a))
            if e is not None:
                tl[g][1] += 1
                tl[g][2] += e["core"].most_common(1)[0][0] == cn
        n_obs = len(train)
        obs2 = sum(sum(v["next"].values()) for v in ge2.values())
        res[name] = {
            "masked_cells": int((~keep).sum()),
            "distinct_pre_states_train": len({k[0] for k in tab}),
            "pairs_train": len(tab),
            "pairs_ge2_obs": len(ge2),
            "obs_in_ge2_pairs": obs2,
            "obs_ge2_fraction": obs2 / n_obs if n_obs else None,
            "conflict_count": len(conf),
            "conflict_rate": len(conf) / len(ge2) if ge2 else None,
            "conflicts_raw_only": ro,
            "conflicts_fusion_only": fo,
            "conflicts_mixed": mx,
            "fragmentation_rate": None,  # indefinida sem rótulos de estados lógicos
        }
        tally[name] = dict(tl)
    return res, tally, int(core.sum())


def bootstrap(tallies, B=1000, seed=0):
    gs = list(tallies.values())

    def stat(s):
        n = sum(g[0] for g in s)
        c = sum(g[1] for g in s)
        k = sum(g[2] for g in s)
        return (c / n if n else None), ((c - k) / c if c else None)

    def q(v, p):
        v = sorted(x for x in v if x is not None)
        return v[min(len(v) - 1, int(p * len(v)))] if v else None

    cov, err = stat(gs)
    rng = random.Random(seed)
    cs, es = [], []
    for _ in range(B if gs else 0):
        c, e = stat([gs[rng.randrange(len(gs))] for _ in gs])
        cs.append(c)
        es.append(e)
    return {"n_groups": len(gs),
            "n": sum(g[0] for g in gs), "covered": sum(g[1] for g in gs),
            "correct": sum(g[2] for g in gs),
            "lookup_coverage": {"point": cov, "lo": q(cs, .025), "hi": q(cs, .975)},
            "holdout_error_core": {"point": err, "lo": q(es, .025), "hi": q(es, .975)},
            "tallies": {g: list(v) for g, v in tallies.items()}}


def run_single(units, by, frac, var_thr, boot):
    train, test = split_units(units, by, frac)
    res, tally, core_cells = diagnose(train, test, by, var_thr)
    for m in res:
        res[m]["test"] = bootstrap(tally[m], boot)
    return {"mode": "single_split", "split": by, "train_transitions": len(train),
            "test_transitions": len(test), "core_cells": core_cells,
            "var_thr": var_thr, "masks": res}


def run_kfold(units, by, folds, var_thr, boot, seed=0):
    ids = sorted({gkey(t, by) for t in units}, key=str)
    if len(ids) < folds:
        raise ValueError("grupos insuficientes para as dobras pedidas")
    random.Random(seed).shuffle(ids)
    fold_of = {g: i % folds for i, g in enumerate(ids)}
    per_fold, pooled = [], {m: {} for m in MASKS}
    for f in range(folds):
        tr = [t for t in units if fold_of[gkey(t, by)] != f]
        te = [t for t in units if fold_of[gkey(t, by)] == f]
        if not tr or not te:
            print(f"AVISO: dobra {f} descartada (treino ou teste vazio)")
            continue
        res, tally, _ = diagnose(tr, te, by, var_thr)
        per_fold.append(res)
        for m in MASKS:
            pooled[m].update(tally[m])  # cada grupo aparece em exatamente uma dobra de teste
    summ = {}
    for m in MASKS:
        summ[m] = {}
        for k in TRAIN_METRICS:
            v = [r[m][k] for r in per_fold if r[m][k] is not None]
            summ[m][k] = ({"min": min(v), "mean": sum(v) / len(v), "max": max(v),
                           "n_folds": len(v)} if v else {"n_folds": 0})
        summ[m]["test"] = bootstrap(pooled[m], boot)
    return {"mode": "kfold", "split": by, "folds_requested": folds,
            "folds_used": len(per_fold), "var_thr": var_thr,
            "note": "train-side: min/média/max descritivos; teste: bootstrap por grupo",
            "masks": summ}


def fmt(x, nd=3):
    return "-" if x is None else f"{x:.{nd}f}"


def ci(d):
    return "-" if d["point"] is None else f"{d['point']:.3f}[{fmt(d['lo'])},{fmt(d['hi'])}]"


def show(game, rep):
    print(f"== {game} ({rep['mode']}, split={rep['split']})")
    print(f"{'mask':9} {'pre_st':>7} {'ge2':>6} {'conf':>6} {'raw':>5} {'fus':>5} {'mix':>5}  cov[IC95]  err_core[IC95]")
    for n, m in rep["masks"].items():
        def g(k):
            v = m[k]
            return v.get("mean") if isinstance(v, dict) else v
        print(f"{n:9} {fmt(g('distinct_pre_states_train'),1):>7} {fmt(g('pairs_ge2_obs'),1):>6} "
              f"{fmt(g('conflict_count'),1):>6} {fmt(g('conflicts_raw_only'),1):>5} "
              f"{fmt(g('conflicts_fusion_only'),1):>5} {fmt(g('conflicts_mixed'),1):>5}  "
              f"{ci(m['test']['lookup_coverage'])}  {ci(m['test']['holdout_error_core'])}")


MODES = ("moving_hud", "flag_row0", "blink_hud", "marker_displaced")


def bootstrap_diff(t_ref, t_mask, B=1000, seed=0):
    """Δ = máscara − referência. Reamostra GRUPOS e recalcula as estatísticas
    AGREGADAS em cada amostra (mesma definição da tabela principal)."""
    groups = sorted(set(t_ref) & set(t_mask))

    def stat(t, gs):
        n = sum(t[g][0] for g in gs)
        c = sum(t[g][1] for g in gs)
        k = sum(t[g][2] for g in gs)
        return (c / n if n else None), ((c - k) / c if c else None)

    def delta(gs):
        cr, er = stat(t_ref, gs)
        cm, em = stat(t_mask, gs)
        return (None if cr is None or cm is None else cm - cr,
                None if er is None or em is None else em - er)

    def q(v, p):
        v = sorted(x for x in v if x is not None)
        return v[min(len(v) - 1, int(p * len(v)))] if v else None

    dc, de = delta(groups)
    cs, es = [], []
    rng = random.Random(seed)
    for _ in range(B if groups else 0):
        c, e = delta([groups[rng.randrange(len(groups))] for _ in groups])
        cs.append(c)
        es.append(e)
    return {"n_groups": len(groups),
            "delta_cov": {"point": dc, "lo": q(cs, .025), "hi": q(cs, .975)},
            "delta_err": {"point": de, "lo": q(es, .025), "hi": q(es, .975)}}


def verdict(diff, d_pre, conf_ref, conf_mask, margin):
    """'util' = não inferioridade: limite superior de Δerr <= margem (política,
    não derivada dos dados) e conflitos de treino não aumentam."""
    if d_pre is not None and abs(d_pre) < 0.01 and conf_mask == conf_ref:
        return "sem_efeito"
    de = diff["delta_err"]
    if de["lo"] is not None and de["lo"] > 0:
        return "custoso"
    if conf_mask <= conf_ref and de["hi"] is not None and de["hi"] <= margin:
        return "util"
    if conf_mask > conf_ref:
        return "inconclusivo (conflitos de treino aumentaram)"
    return "inconclusivo"


def trade_off(masks, name, margin=0.02, B=1000):
    g = lambda v: v["mean"] if isinstance(v, dict) else v
    ref, m = masks["none"], masks[name]
    st_ref = g(ref["distinct_pre_states_train"])
    st = g(m["distinct_pre_states_train"])
    d_pre = (st - st_ref) / st_ref if st_ref else None
    cr, cm = g(ref["conflict_count"]), g(m["conflict_count"])
    diff = bootstrap_diff(ref["test"]["tallies"], m["test"]["tallies"], B)
    return d_pre, cr, cm, diff, verdict(diff, d_pre, cr, cm, margin)


def show_summary(game, rep, margin=0.02):
    print(f"\n== {game} — trade-off  (Δ = máscara − none; margem de não inferioridade "
          f"= {margin}, escolha de política)")
    print(f"{'mask':9} {'Δpre_st':>8} {'Δcov[IC95]':>24} {'Δerr[IC95]':>24} {'Δconf':>7}  veredito")
    for n in rep["masks"]:
        if n == "none":
            continue
        d_pre, cr, cm, diff, v = trade_off(rep["masks"], n, margin)
        dc, de = diff["delta_cov"], diff["delta_err"]
        cs = "-" if dc["point"] is None else f"{dc['point']:+.3f}[{fmt(dc['lo'])},{fmt(dc['hi'])}]"
        es = "-" if de["point"] is None else f"{de['point']:+.3f}[{fmt(de['lo'])},{fmt(de['hi'])}]"
        print(f"{n:9} {fmt(d_pre, 3):>8} {cs:>24} {es:>24} {cm - cr:>+7.1f}  {v}")


def synth_rows(game, mode):
    """moving_hud: HUD na linha 1 que muda de coluna a cada passo.
    flag_row0: bit na linha 0 inverte a direção (border2 destrói sinal).
    blink_hud: célula da linha 1 que alterna a cada passo (taxa por célula = 1.0).
    marker_displaced: marcador na linha 1 cuja coluna é função de pos e t
                      (não é um sprite que teleporta; é uma célula que se desloca)."""
    assert mode in MODES
    rng = np.random.default_rng(0)
    rows = []
    for ep in range(3):
        for lv in range(2):
            flag = (ep + lv) % 2
            pos = int(rng.integers(25, 40))
            for t in range(60):
                fr = np.zeros((64, 64), np.uint8)
                fr[30, pos] = 5
                if mode == "flag_row0":
                    fr[0, 0] = 1 + flag
                elif mode == "moving_hud":
                    fr[1, t % 64] = 9
                elif mode == "blink_hud":
                    fr[1, 10] = 9 if t % 2 == 0 else 0
                else:
                    fr[1, (pos * 7 + t * 13) % 64] = 9
                act = int(rng.integers(0, 2))
                rows.append({"game": game, "episode": ep, "level": lv, "t": t,
                             "action": act, "frame": fr.tolist()})
                d = 1 if act else -1
                pos = min(44, max(20, pos + (-d if (mode == "flag_row0" and flag) else d)))
    return rows


def write_synth(path: Path):
    with path.open("w", encoding="utf-8") as f:
        for mode in MODES:
            for r in synth_rows(mode, mode):
                f.write(json.dumps(r) + "\n")


def selftest():
    p = Path(tempfile.mkdtemp()) / "synth.jsonl"
    write_synth(p)
    data = load(p)
    assert set(data) == set(MODES)
    R = {g: run_single(data[g], "level", 0.5, 0.5, 200)["masks"] for g in MODES}
    A, B, C, D = (R[g] for g in MODES)
    d = lambda M, k: M[k]["distinct_pre_states_train"]
    cv = lambda M, k: M[k]["test"]["lookup_coverage"]["point"]
    er = lambda M, k: M[k]["test"]["holdout_error_core"]["point"]
    V = lambda M, k: trade_off(M, k, B=200)[4]

    # moving_hud: border2 reduz estados; variance (por taxa de célula) não remove
    assert d(A, "none") > d(A, "border2") and d(A, "border2") == d(A, "border4")
    assert d(A, "variance") == d(A, "none")
    assert A["none"]["conflict_count"] == 0 and A["border2"]["conflict_count"] == 0
    assert cv(A, "border2") > cv(A, "none") and er(A, "border2") == 0
    assert trade_off(A, "border2", B=200)[3]["delta_cov"]["point"] > 0  # sinal: máscara − none
    assert V(A, "border2") == "util" and V(A, "variance") == "sem_efeito"
    # flag_row0: border2 funde estados e aumenta o erro
    assert B["none"]["conflict_count"] == 0
    assert B["border2"]["conflicts_fusion_only"] == B["border2"]["conflict_count"] > 0
    assert er(B, "border2") > er(B, "none") and V(B, "border2") != "util"
    # blink_hud: variance remove a célula que pisca
    assert d(C, "variance") < d(C, "none") and V(C, "variance") == "util"
    # marker_displaced: variance não remove célula que se desloca
    assert d(D, "variance") == d(D, "none") and V(D, "variance") == "sem_efeito"
    # k-fold
    K = run_kfold(data["moving_hud"], "level", 3, 0.5, 100)
    assert K["folds_used"] == 3 and K["masks"]["none"]["test"]["n"] == len(data["moving_hud"])
    print("SELFTEST OK")
    for g in MODES:
        show(g, {"mode": "single_split", "split": "level", "masks": R[g]})
        show_summary(g, {"masks": R[g]})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("traces", nargs="?", type=Path)
    ap.add_argument("--out", type=Path, default=Path("mask_report.json"))
    ap.add_argument("--split", choices=["level", "episode"], default="level")
    ap.add_argument("--train-frac", type=float, default=0.5)
    ap.add_argument("--folds", type=int, default=0, help=">=2 liga o K-fold agrupado")
    ap.add_argument("--var-thr", type=float, default=0.5, help="exploratório; varrer")
    ap.add_argument("--boot", type=int, default=1000)
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--summary", action="store_true", help="tabela de trade-off com IC")
    ap.add_argument("--margin", type=float, default=0.02, help="não inferioridade de Δerr (política)")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if a.traces is None:
        ap.error("indique traces ou --selftest")
    report = {}
    for game, units in load(a.traces).items():
        report[game] = (run_kfold(units, a.split, a.folds, a.var_thr, a.boot)
                        if a.folds >= 2 else
                        run_single(units, a.split, a.train_frac, a.var_thr, a.boot))
        show(game, report[game])
        if a.summary:
            show_summary(game, report[game], a.margin)
    a.out.write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()