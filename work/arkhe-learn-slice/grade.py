"""Roda os casos da spec contra um programa, com veredito deterministico.

Camadas, e a ordem importa:

  orcamento de passos  -> VEREDITO. Linhas executadas, contadas em
                          `runner.py` via sys.settrace. Pro mesmo codigo e a
                          mesma entrada da o mesmo numero em qualquer
                          maquina, entao o veredito e atestavel.
  timeout de processo  -> REDE DE SEGURANCA. Nao e veredito. Se disparar, e
                          erro de infraestrutura e a fatia reporta como tal,
                          porque significa que o orcamento nao conteve a
                          execucao (codigo que desliga o tracer, por
                          exemplo).

O `process.rs` do agi-coder faz a camada de fora (TestCommand + timeout +
ProcessOutcome). A camada de dentro, o orcamento, nao existe la -- e e ela
que torna o resultado atestavel.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.join(HERE, "runner.py")

# Rede de seguranca generosa: com orcamento de passos o runner termina sozinho
# muito antes disso. Se estourar, algo escapou do contador.
SAFETY_TIMEOUT = 30.0

# Orcamento de um mutante = custo do baseline * FATOR + PISO. Derivado do
# baseline em vez de constante chumbada, porque o custo aceitavel depende da
# funcao: fib(16) gasta mais linhas que clamp. Entra no digest da spec.
BUDGET_FACTOR = 50
BUDGET_FLOOR = 2_000


def run_cases(source, entry, cases, tmpdir, budget, timeout=SAFETY_TIMEOUT):
    """Devolve (outcome, results).

    outcome: passed | failed | budget_exceeded | infra_timeout | infra_error
    results: um dict por caso, com `steps` sempre preenchido.
    """
    # Nome unico por conteudo, e bytecode cache desligado (-B).
    #
    # Antes todo candidato ia pro mesmo `cand.py`. O cache de bytecode do
    # Python valida o .pyc por (mtime, tamanho) da fonte: dois mutantes de
    # tamanho igual escritos dentro do mesmo tique de mtime -- o que acontece
    # direto, porque os mutantes de uma spec tem quase o mesmo tamanho --
    # faziam o segundo rodar o bytecode do primeiro. Resultado: o veredito
    # migrava entre execucoes conforme o timing do disco. Foi a causa real da
    # nao-determinismo, nao o timeout.
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]
    mod = os.path.join(tmpdir, f"cand_{digest}.py")
    if not os.path.isfile(mod):
        with open(mod, "w", encoding="utf-8") as fh:
            fh.write(source)
    cpath = os.path.join(tmpdir, f"cases_{digest}.json")
    with open(cpath, "w", encoding="utf-8") as fh:
        json.dump(cases, fh)

    try:
        proc = subprocess.run(
            [sys.executable, "-I", "-B", RUNNER, mod, entry, cpath,
             str(budget)],
            capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return "infra_timeout", []
    if proc.returncode != 0:
        return "infra_error", [{"stderr": (proc.stderr or "")[:300]}]
    try:
        blob = json.loads(proc.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return "infra_error", [{"stdout": (proc.stdout or "")[:300]}]
    if "load_error" in blob:
        return "infra_error", [blob]

    res = blob["results"]
    if any(r.get("budget_exceeded") for r in res):
        return "budget_exceeded", res
    return ("passed" if all(r["ok"] for r in res) else "failed"), res


def measure_budget(source, entry, cases, tmpdir):
    """Custo do baseline -> orcamento dos mutantes.

    Devolve (budget, max_steps, outcome). O baseline roda com teto alto e
    fixo; o que interessa e quantos passos ele realmente gasta.
    """
    outcome, res = run_cases(source, entry, cases, tmpdir, budget=1_000_000)
    if outcome not in ("passed", "failed"):
        return None, None, outcome
    max_steps = max((r.get("steps", 0) for r in res), default=0)
    return max(max_steps * BUDGET_FACTOR, BUDGET_FLOOR), max_steps, outcome


def input_size(args):
    """Tamanho do caso. Base da metrica de contraexemplo legivel.

    Um mutante que so falha com n=997 nao e exercicio de celular. Um que
    falha com lista vazia ou n=0 e.
    """
    total = 0
    for a in args:
        if isinstance(a, bool):
            total += 1
        elif isinstance(a, int):
            total += min(abs(a), 50)
        elif isinstance(a, (str, list, tuple, dict)):
            total += len(a)
        else:
            total += 1
    return total


def minimal_counterexample(cases, results):
    """O caso falho de menor tamanho de entrada."""
    fails = [
        (input_size(c["args"]), c, r)
        for c, r in zip(cases, results) if not r.get("ok", False)
    ]
    if not fails:
        return None
    fails.sort(key=lambda t: t[0])
    size, case, res = fails[0]
    if res.get("budget_exceeded"):
        got = f"estourou o orcamento em {res['steps']} passos"
    else:
        got = res.get("got", res.get("error"))
    return {"size": size, "args": case["args"], "expected": case["expected"],
            "got": got, "steps": res.get("steps")}


def make_tmpdir():
    return tempfile.mkdtemp(prefix="arkhe_slice_")
