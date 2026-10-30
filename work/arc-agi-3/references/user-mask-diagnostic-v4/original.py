#!/usr/bin/env python3
"""Diagnóstico offline de máscaras de estado (ARC-AGI-3). Hash: BLAKE2b.

Entrada JSONL (um passo por linha): game, episode, level, t, action, frame (64x64
inteiros em [0,255]); opcional next_frame. Ações podem ser int ou objeto (ex.:
clique com coordenadas); a chave é o JSON canônico. Sem next_frame usa-se o frame
do passo seguinte do mesmo (game, episode, level); o último passo é descartado.

Contratos
- NÚCLEO = interseção das células mantidas por COMPARED_MASKS (declarado antes da
  avaliação). Todas as máscaras são julgadas no MESMO alvo: o hash do próximo frame
  restrito ao núcleo (core). O alvo full (frame completo) é só diagnóstico: exige
  acerto exato, então uma célula imprevisível o zera, qualquer que seja sua fração.
- Dois lookups, sempre reportados: unique (abstém se a chave tem >1 alvo no treino)
  e mode (alvo mais frequente; empate por ordem crescente do hash, sem "confiança").
- Toda razão traz o denominador no nome (issued / answered). Contagens absolutas:
  issued, unseen (chave ausente), abstained, answered, correct.
- Máscaras de variância aprendidas só no treino, limiares declarados (VAR_THRS), sem
  seleção automática. Máscara que apaga tudo é marcada degenerada.
- Incerteza: bootstrap por GRUPO de teste (episódio ou nível). O treino é fixo em cada
  amostra; LOO tem treinos sobrepostos, logo é descritivo e NÃO é comparável ao corte
  único (o treino muda de tamanho).

Uso:
  python mask_diagnostic_v4.py traces/ --split episode [--loo | --folds K] --out r.json
  python mask_diagnostic_v4.py --selftest
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

COMPARED_MASKS = ("none", "border2")
VAR_THRS = (0.01, 0.05, 0.1, 0.5)
VARIANTS = ("unique", "mode")
TARGETS = ("core", "full")
CNT = ("issued", "unseen", "abstained", "answered", "correct")
TRAIN_METRICS = ("masked_cells", "distinct_pre_states_train", "pairs_ge2_obs",
                 "conflict_count", "conflicts_raw_only", "conflicts_fusion_only",
                 "conflicts_mixed")


class Tr(NamedTuple):
    game: str
    ep: int
    lv: int
    t: int
    f: np.ndarray
    a: str
    nf: np.ndarray


def H(frame, keep):
    return hashlib.blake2b(np.where(keep, frame, 0).tobytes(), digest_size=12).digest()


def to_frame(x, where):
    arr = np.array(x)
    if arr.shape != (64, 64) or not np.issubdtype(arr.dtype, np.integer) \
            or arr.min() < 0 or arr.max() > 255:
        raise ValueError(f"{where}: frame deve ser 64x64 inteiro em [0,255]")
    return arr.astype(np.uint8)


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
            groups[(r["game"], r["episode"], r["level"])].append((f"{fp}:{ln}", r))
    out = defaultdict(list)
    for (g, e, lv), rows in groups.items():
        rows.sort(key=lambda x: x[1]["t"])
        ts = [x[1]["t"] for x in rows]
        if len(set(ts)) != len(ts):
            raise ValueError(f"t duplicado em {(g, e, lv)}")
        fr = [to_frame(x[1]["frame"], x[0]) for x in rows]
        for i, (w, r) in enumerate(rows):
            if r.get("next_frame") is not None:
                nf = to_frame(r["next_frame"], w)
            elif i + 1 < len(rows) and rows[i + 1][1]["t"] == r["t"] + 1:
                nf = fr[i + 1]
            else:
                continue  # lacuna ou último passo
            out[g].append(Tr(g, int(e), int(lv), int(r["t"]), fr[i],
                             json.dumps(r["action"], sort_keys=True), nf))
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


def make_masks(train):
    keep = {"none": np.ones((64, 64), bool)}
    keep["border2"] = keep["none"].copy()
    keep["border2"][[0, 1, 62, 63], :] = False
    keep["border4"] = keep["none"].copy()
    keep["border4"][[0, 1, 2, 3, 60, 61, 62, 63], :] = False
    ch = np.zeros((64, 64))
    for t in train:
        ch += (t.f != t.nf)
    rate = ch / len(train)
    for thr in VAR_THRS:
        keep[f"var{thr}"] = rate < thr  # aprendida só no treino
    return keep


def core_mask():
    k = make_masks_static()
    return np.logical_and.reduce([k[m] for m in COMPARED_MASKS])


def make_masks_static():
    none = np.ones((64, 64), bool)
    b2 = none.copy()
    b2[[0, 1, 62, 63], :] = False
    return {"none": none, "border2": b2}


def diagnose(train, test, by):
    keeps = make_masks(train)
    core = core_mask()
    none = keeps["none"]
    rp = [H(t.f, none) for t in train]
    ct = [H(t.nf, core) for t in train]
    ft = [H(t.nf, none) for t in train]
    ct_te = [H(t.nf, core) for t in test]
    ft_te = [H(t.nf, none) for t in test]
    raw = defaultdict(Counter)
    for t, p, c in zip(train, rp, ct):
        raw[(p, t.a)][c] += 1
    raw_conf = {k for k, c in raw.items() if sum(c.values()) >= 2 and len(c) > 1}
    res, tally = {}, {}
    for name, keep in keeps.items():
        tab = defaultdict(lambda: {"core": Counter(), "full": Counter(), "raw_pre": set()})
        for t, p, c, f in zip(train, rp, ct, ft):
            e = tab[(H(t.f, keep), t.a)]
            e["core"][c] += 1
            e["full"][f] += 1
            e["raw_pre"].add(p)
        ge2 = {k: v for k, v in tab.items() if sum(v["core"].values()) >= 2}
        conf = {k: v for k, v in ge2.items() if len(v["core"]) > 1}
        ro = fo = mx = 0
        for (_, a), v in conf.items():
            hits = [(rh, a) in raw_conf for rh in v["raw_pre"]]
            if all(hits):
                ro += 1
            elif not any(hits):
                fo += 1
            else:
                mx += 1
        tl = {v: {tg: defaultdict(lambda: [0] * 5) for tg in TARGETS} for v in VARIANTS}
        for t, c, f in zip(test, ct_te, ft_te):
            g = str(gkey(t, by))
            e = tab.get((H(t.f, keep), t.a))
            actual = {"core": c, "full": f}
            for v in VARIANTS:
                for tg in TARGETS:
                    r = tl[v][tg][g]
                    r[0] += 1
                    if e is None:
                        r[1] += 1
                        continue
                    cnt = e[tg]
                    if v == "unique" and len(cnt) > 1:
                        r[2] += 1
                        continue
                    pred = min(cnt, key=lambda h: (-cnt[h], h))
                    r[3] += 1
                    r[4] += pred == actual[tg]
        res[name] = {
            "masked_cells": int((~keep).sum()),
            "degenerate": bool(keep.sum() == 0),
            "distinct_pre_states_train": len({k[0] for k in tab}),
            "pairs_ge2_obs": len(ge2),
            "conflict_count": len(conf),
            "conflicts_raw_only": ro,
            "conflicts_fusion_only": fo,
            "conflicts_mixed": mx,
            "fragmentation_rate": None,  # indefinida sem rótulos lógicos independentes
        }
        tally[name] = {v: {tg: dict(tl[v][tg]) for tg in TARGETS} for v in VARIANTS}
    return res, tally


def change_profile(units):
    """Proxy NOMEADO (não identifica HUD): parcela das células que mudam e que caem
    fora do núcleo (nas linhas mascaradas por border2)."""
    core = core_mask()
    tot = out = 0
    for t in units:
        ch = t.f != t.nf
        tot += int(ch.sum())
        out += int((ch & ~core).sum())
    return {"core_cells": int(core.sum()), "outside_core_cell_fraction": 1 - core.mean(),
            "changed_cells_total": tot, "changed_cells_outside_core": out,
            "share_of_changes_outside_core": (out / tot) if tot else None}


def boot(tally_g, B, seed=0):
    gs = list(tally_g.values())

    def ratios(s):
        c = [sum(g[i] for g in s) for i in range(5)]
        d = lambda a, b: a / b if b else None
        return {"coverage_issued": d(c[3], c[0]), "abstention_issued": d(c[2], c[0]),
                "acc_answered": d(c[4], c[3]), "acc_issued": d(c[4], c[0])}

    def q(v, p):
        v = sorted(x for x in v if x is not None)
        return v[min(len(v) - 1, int(p * len(v)))] if v else None

    pt = ratios(gs)
    rng = random.Random(seed)
    samples = [ratios([gs[rng.randrange(len(gs))] for _ in gs]) for _ in range(B if gs else 0)]
    return {"n_groups": len(gs),
            "counts": {k: sum(g[i] for g in gs) for i, k in enumerate(CNT)},
            "ratios": {k: {"point": pt[k], "lo": q([s[k] for s in samples], .025),
                           "hi": q([s[k] for s in samples], .975)} for k in pt}}


def attach_test(res, tally, B):
    for m in res:
        res[m]["test"] = {v: {tg: boot(tally[m][v][tg], B) for tg in TARGETS}
                          for v in VARIANTS}


def run_single(units, by, frac, B):
    train, test = split_units(units, by, frac)
    res, tally = diagnose(train, test, by)
    attach_test(res, tally, B)
    ng = lambda u: len({gkey(t, by) for t in u})
    return {"mode": "single_split", "split": by, "n_train_groups": ng(train),
            "n_test_groups": ng(test), "change_profile": change_profile(units),
            "masks": res}


def run_kfold(units, by, folds, B, seed=0):
    ids = sorted({gkey(t, by) for t in units}, key=str)
    if len(ids) < max(folds, 2):
        raise ValueError("grupos insuficientes para as dobras pedidas")
    random.Random(seed).shuffle(ids)
    fold_of = {g: i % folds for i, g in enumerate(ids)}
    per_fold, pooled, ntr = [], None, []
    for f in range(folds):
        tr = [t for t in units if fold_of[gkey(t, by)] != f]
        te = [t for t in units if fold_of[gkey(t, by)] == f]
        if not tr or not te:
            print(f"AVISO: dobra {f} descartada (treino ou teste vazio)")
            continue
        res, tally = diagnose(tr, te, by)
        per_fold.append(res)
        ntr.append(len({gkey(t, by) for t in tr}))
        if pooled is None:
            pooled = {m: {v: {tg: {} for tg in TARGETS} for v in VARIANTS} for m in res}
        for m in res:
            for v in VARIANTS:
                for tg in TARGETS:
                    pooled[m][v][tg].update(tally[m][v][tg])
    summ = {}
    for m in per_fold[0]:
        summ[m] = {"degenerate": per_fold[0][m]["degenerate"]}
        for k in TRAIN_METRICS:
            v = [r[m][k] for r in per_fold]
            summ[m][k] = {"min": min(v), "mean": sum(v) / len(v), "max": max(v)}
        summ[m]["test"] = {v: {tg: boot(pooled[m][v][tg], B) for tg in TARGETS}
                           for v in VARIANTS}
    return {"mode": "loo" if folds == len(ids) else "kfold", "split": by,
            "folds_requested": folds, "folds_used": len(per_fold),
            "n_train_groups_per_fold": ntr, "change_profile": change_profile(units),
            "note": "treinos sobrepostos entre dobras; teste: bootstrap por grupo; "
                    "não comparável ao corte único",
            "masks": summ}


def fmt(x, nd=3):
    return "-" if x is None else f"{x:.{nd}f}"


def ci(d):
    return "-" if d["point"] is None else f"{d['point']:.3f}[{fmt(d['lo'])},{fmt(d['hi'])}]"


def show(game, rep):
    cp = rep["change_profile"]
    print(f"== {game} ({rep['mode']}, split={rep['split']}) núcleo={'∩'.join(COMPARED_MASKS)}"
          f" ({cp['core_cells']} células); mudanças fora do núcleo: "
          f"{fmt(cp['share_of_changes_outside_core'])} (proxy, não é detecção de HUD)")
    for v in VARIANTS:
        print(f"-- lookup {v}")
        print(f"{'mask':10}{'conf':>6}{'issued':>7}{'unseen':>7}{'abs_c':>6}{'ans_c':>6}"
              f"{'ok_c':>6}{'ans_f':>6}{'ok_f':>5}  {'cov_issued[IC]':<20}"
              f"{'core_acc_answered[IC]':<24}full_acc_answered[IC]")
        for n, m in rep["masks"].items():
            t = m["test"][v]
            c, f = t["core"], t["full"]
            conf = m["conflict_count"]
            conf = conf["mean"] if isinstance(conf, dict) else conf
            name = n + ("*" if m["degenerate"] else "")
            print(f"{name:10}{fmt(conf, 1):>6}{c['counts']['issued']:>7}{c['counts']['unseen']:>7}"
                  f"{c['counts']['abstained']:>6}{c['counts']['answered']:>6}"
                  f"{c['counts']['correct']:>6}{f['counts']['answered']:>6}"
                  f"{f['counts']['correct']:>5}  {ci(c['ratios']['coverage_issued']):<20}"
                  f"{ci(c['ratios']['acc_answered']):<24}{ci(f['ratios']['acc_answered'])}")


# ----------------------------- controle sintético -----------------------------
MODES = ("hud_episode", "narrow_sprite", "flag_row0")


def synth_rows(game, mode):
    """hud_episode: HUD (linha 0) com cor própria de cada episódio; sprite em 20..44.
    narrow_sprite: sprite confinado a 6 células (variância .1 as apaga); HUD constante.
    flag_row0: bit na linha 0 inverte a direção (border2 destrói sinal)."""
    rng = np.random.default_rng(0)
    rows = []
    lo, hi = (30, 35) if mode == "narrow_sprite" else (20, 44)
    for ep in range(4):
        for lv in range(3):
            pos = int(rng.integers(lo, hi + 1))
            for t in range(40):
                fr = np.zeros((64, 64), np.uint8)
                fr[30, pos] = 5
                if mode == "hud_episode":
                    fr[0, t % 64] = 5 + ep
                elif mode == "narrow_sprite":
                    fr[0, t % 64] = 9
                else:
                    fr[0, 0] = 1 + ep % 2
                act = int(rng.integers(0, 2))
                rows.append({"game": game, "episode": ep, "level": lv, "t": t,
                             "action": act, "frame": fr.tolist()})
                d = 1 if act else -1
                if mode == "flag_row0" and ep % 2:
                    d = -d
                pos = min(hi, max(lo, pos + d))
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
    R = {g: run_single(data[g], "episode", 0.5, 200) for g in MODES}
    M = lambda g: R[g]["masks"]
    T = lambda g, m, v, tg: M(g)[m]["test"][v][tg]
    r = lambda g, m, v, tg, k: T(g, m, v, tg)["ratios"][k]["point"]
    c = lambda g, m, v, tg, k: T(g, m, v, tg)["counts"][k]

    # 1) HUD de cor própria por episódio: raw nunca vê a chave no teste; border2 vê
    g = "hud_episode"
    assert c(g, "none", "unique", "core", "answered") == 0
    assert c(g, "border2", "unique", "core", "answered") > 0
    assert r(g, "border2", "unique", "core", "acc_answered") == 1.0
    assert M(g)["none"]["conflict_count"] == 0 and M(g)["border2"]["conflict_count"] == 0
    # alvo completo: responde (mode) mas nunca acerta, pois o HUD do teste difere
    assert c(g, "border2", "mode", "full", "answered") > 0
    assert c(g, "border2", "mode", "full", "correct") == 0
    assert c(g, "border2", "unique", "full", "abstained") > 0
    assert 0 < R[g]["change_profile"]["share_of_changes_outside_core"] < 1
    # 2) variância .1 apaga o sprite (que está NO núcleo): conflitos e acerto menor
    g = "narrow_sprite"
    assert M(g)["var0.1"]["masked_cells"] >= 6 and M(g)["var0.5"]["masked_cells"] == 0
    assert M(g)["border2"]["conflict_count"] == 0 and M(g)["var0.1"]["conflict_count"] > 0
    assert c(g, "var0.1", "unique", "core", "abstained") > 0
    assert r(g, "var0.1", "mode", "core", "acc_answered") < r(g, "border2", "mode", "core", "acc_answered")
    # 3) bit na linha 0: border2 funde estados e perde acerto no núcleo
    g = "flag_row0"
    assert M(g)["none"]["conflict_count"] == 0
    assert M(g)["border2"]["conflicts_fusion_only"] == M(g)["border2"]["conflict_count"] > 0
    assert c(g, "border2", "unique", "core", "abstained") > 0
    assert r(g, "border2", "mode", "core", "acc_answered") < 1.0
    # LOO: 4 episódios, treino de 3 em cada dobra, cada grupo testado uma vez
    L = run_kfold(data["hud_episode"], "episode", 4, 100)
    assert L["mode"] == "loo" and L["n_train_groups_per_fold"] == [3, 3, 3, 3]
    assert L["masks"]["none"]["test"]["unique"]["core"]["counts"]["issued"] == len(data["hud_episode"])
    print("SELFTEST OK")
    for g in MODES:
        show(g, R[g])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("traces", nargs="?", type=Path)
    ap.add_argument("--out", type=Path, default=Path("mask_report.json"))
    ap.add_argument("--split", choices=["level", "episode"], default="episode")
    ap.add_argument("--train-frac", type=float, default=0.5)
    ap.add_argument("--folds", type=int, default=0, help=">=2 liga o K-fold agrupado")
    ap.add_argument("--loo", action="store_true", help="leave-one-group-out")
    ap.add_argument("--boot", type=int, default=1000)
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if a.traces is None:
        ap.error("indique traces ou --selftest")
    report = {}
    for game, units in load(a.traces).items():
        if a.loo or a.folds >= 2:
            k = len({gkey(t, a.split) for t in units}) if a.loo else a.folds
            report[game] = run_kfold(units, a.split, k, a.boot)
        else:
            report[game] = run_single(units, a.split, a.train_frac, a.boot)
        show(game, report[game])
    a.out.write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()