"""Fatia vertical: spec -> mutantes -> exercicios -> veredito deterministico.

    python -I run_slice.py

A pergunta original era se mutacao automatica produz exercicio julgavel em 15
segundos numa tela de celular. Produz. A pergunta desta versao e a seguinte:
**o veredito de cada exercicio e o mesmo em toda execucao?** Sem isso o
progresso do aluno nao e atestavel, e atestacao e o diferencial do produto.

A troca que resolve: `subprocess.timeout` saiu do caminho do veredito e virou
rede de seguranca; quem decide agora e orcamento de linhas executadas,
contado em `runner.py`. Mesmo codigo e mesma entrada dao o mesmo numero em
qualquer maquina.

Quatro categorias, e tres sao exercicio:

  ache_o_bug     a spec pega: valor errado.
  nunca_termina  a spec pega: estourou o orcamento. Antes era descartado como
                 timeout; agora e um tipo proprio.
  spec_fraca     a spec NAO pega, mas o fuzz diferencial pega. Vem com o caso
                 de teste que faltava.
  equivalente    nenhuma entrada distingue do original. NAO e exercicio.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import fuzz  # noqa: E402
import grade  # noqa: E402
import mutate  # noqa: E402
from specs import SPECS  # noqa: E402

MAX_LINES = 12
MAX_WIDTH = 48
MAX_DIFF_LINES = 2
MAX_INPUT_SIZE = 12

COUNTERS = (
    "mutants", "killed_value", "killed_budget", "survived", "weak_spec",
    "equivalent", "undetermined", "infra", "legible_bug", "legible_hang",
    "legible_weak",
)


def fits_phone(source):
    lines = source.split("\n")
    return len(lines) <= MAX_LINES and max(len(l) for l in lines) <= MAX_WIDTH


def build_oracle(base, spec, tmp, budget):
    """Casos de fuzz com o baseline como verdade. None se nao houver gerador."""
    args_list = fuzz.inputs_for(spec["id"])
    if not args_list:
        return None
    outcome, res = grade.run_cases(
        base, spec["entry"],
        [{"args": a, "expected": None} for a in args_list],
        tmp, budget=budget,
    )
    if outcome not in ("passed", "failed") or not all("got" in r for r in res):
        return None
    return fuzz.as_cases(args_list, [r["got"] for r in res])


def process_spec(spec, tmp, all_ex):
    base, mutants = mutate.generate(spec["source"])
    row = dict.fromkeys(COUNTERS, 0)
    row["spec"] = spec["id"]
    row["baseline_fits"] = fits_phone(base)
    row["mutants"] = len(mutants)

    budget, base_steps, base_outcome = grade.measure_budget(
        base, spec["entry"], spec["cases"], tmp)
    row["base_steps"] = base_steps
    row["budget"] = budget
    if base_outcome != "passed":
        row["ERRO"] = f"baseline: {base_outcome}"
        return row

    oracle = build_oracle(base, spec, tmp, budget)
    if oracle is None:
        row["ERRO"] = "sem oraculo diferencial"

    for mid, msrc, label in mutants:
        outcome, res = grade.run_cases(
            msrc, spec["entry"], spec["cases"], tmp, budget=budget)

        if outcome.startswith("infra_"):
            # Nao e veredito: o orcamento deveria ter contido isso.
            row["infra"] += 1
            continue

        if outcome == "budget_exceeded":
            tipo = "nunca_termina"
            ce = grade.minimal_counterexample(spec["cases"], res)
            row["killed_budget"] += 1
        elif outcome == "failed":
            tipo = "ache_o_bug"
            ce = grade.minimal_counterexample(spec["cases"], res)
            row["killed_value"] += 1
        else:
            row["survived"] += 1
            tipo, ce = "indeterminado", None
            if oracle:
                fo, fr = grade.run_cases(msrc, spec["entry"], oracle, tmp,
                                         budget=budget)
                if fo in ("failed", "budget_exceeded"):
                    tipo = "spec_fraca"
                    ce = grade.minimal_counterexample(oracle, fr)
                    row["weak_spec"] += 1
                elif fo == "passed":
                    tipo = "equivalente"
                    row["equivalent"] += 1
                else:
                    row["infra"] += 1
                    continue
            else:
                row["undetermined"] += 1

        if tipo in ("equivalente", "indeterminado"):
            continue

        dl = mutate.diff_lines(base, msrc)
        checks = {
            "cabe_na_tela": fits_phone(msrc),
            "diff_local": dl <= MAX_DIFF_LINES,
            "contraexemplo_pequeno": ce is not None and ce["size"] <= MAX_INPUT_SIZE,
        }
        legible = all(checks.values())
        if legible:
            row[{"ache_o_bug": "legible_bug",
                 "nunca_termina": "legible_hang",
                 "spec_fraca": "legible_weak"}[tipo]] += 1

        all_ex.append({
            "spec": spec["id"],
            "requirement": spec["requirement"],
            "mutant_id": mid,
            "erro_nomeado": label,
            "tipo": tipo,
            "baseline": base,
            "candidato": msrc,
            "diff_linhas": dl,
            "linhas": len(msrc.split("\n")),
            "largura_max": max(len(l) for l in msrc.split("\n")),
            "budget": budget,
            "contraexemplo": ce,
            "checks": checks,
            "legivel": legible,
        })
    return row


def fingerprint(exercises):
    """Hash canonico do conjunto. Dois runs iguais => mesmo hash.

    Inclui `steps` do contraexemplo de proposito: prova que a contagem de
    passos tambem e estavel, nao so a classificacao.
    """
    rows = sorted(
        (e["spec"], e["mutant_id"], e["tipo"], e["legivel"], e["budget"],
         json.dumps(e["contraexemplo"], sort_keys=True, ensure_ascii=False))
        for e in exercises
    )
    blob = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def main():
    tmp = grade.make_tmpdir()
    out_dir = os.path.join(HERE, "exercises")
    os.makedirs(out_dir, exist_ok=True)
    try:
        all_ex, summary = [], []
        for spec in SPECS:
            summary.append(process_spec(spec, tmp, all_ex))

        fp = fingerprint(all_ex)
        with open(os.path.join(out_dir, "exercises.json"), "w",
                  encoding="utf-8") as fh:
            json.dump({"fingerprint": fp, "total": len(all_ex),
                       "exercicios": all_ex}, fh, ensure_ascii=False, indent=2)

        hdr = ("spec              mut  base$  orcam  bug  hang  surv  fraca "
               " equiv  infra   leg")
        print("=" * len(hdr))
        print(hdr)
        print("-" * len(hdr))
        t = dict.fromkeys(COUNTERS, 0)
        for r in summary:
            leg = r["legible_bug"] + r["legible_hang"] + r["legible_weak"]
            print(f"{r['spec']:17s}{r['mutants']:4d} {str(r['base_steps']):>6s} "
                  f"{str(r['budget']):>6s} {r['killed_value']:4d} "
                  f"{r['killed_budget']:5d} {r['survived']:5d} "
                  f"{r['weak_spec']:6d} {r['equivalent']:6d} {r['infra']:6d} "
                  f"{leg:5d}"
                  + ("   <-- " + r["ERRO"] if "ERRO" in r else ""))
            for k in t:
                t[k] += r[k]
        print("-" * len(hdr))
        leg_tot = t["legible_bug"] + t["legible_hang"] + t["legible_weak"]
        print(f"{'TOTAL':17s}{t['mutants']:4d} {'':>6s} {'':>6s} "
              f"{t['killed_value']:4d} {t['killed_budget']:5d} "
              f"{t['survived']:5d} {t['weak_spec']:6d} {t['equivalent']:6d} "
              f"{t['infra']:6d} {leg_tot:5d}")
        print("=" * len(hdr))
        print()

        usable = t["killed_value"] + t["killed_budget"] + t["weak_spec"]
        surv = max(t["survived"], 1)
        print(f"mutantes gerados               : {t['mutants']}")
        print(f"  erro de valor                : {t['killed_value']}")
        print(f"  estourou o orcamento         : {t['killed_budget']}")
        print(f"  sobreviveram a spec          : {t['survived']}")
        print(f"    -> spec fraca (exercicio)  : {t['weak_spec']}")
        print(f"    -> equivalente (descartado): {t['equivalent']} "
              f"({100*t['equivalent']/surv:.0f}% dos sobreviventes)")
        print(f"  infraestrutura (nao veredito): {t['infra']}")
        print()
        print(f"exercicios candidatos          : {usable}")
        print(f"exercicios LEGIVEIS            : {leg_tot} de {usable} "
              f"({100*leg_tot/max(usable,1):.0f}%)")
        print(f"  'ache o bug'                 : {t['legible_bug']}")
        print(f"  'nunca termina'              : {t['legible_hang']}")
        print(f"  'spec fraca'                 : {t['legible_weak']}")
        print(f"legiveis por spec              : "
              f"{leg_tot/max(len(SPECS),1):.1f}")
        print()
        print(f"baselines que cabem na tela    : "
              f"{sum(1 for r in summary if r['baseline_fits'])}/{len(summary)}")
        print(f"FINGERPRINT                    : {fp}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
