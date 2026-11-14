"""Executa os casos contando passos, com orcamento deterministico.

    python -I runner.py <modulo.py> <entry> <cases.json> <budget>

Por que existe: o veredito de um exercicio nao pode depender da carga da
maquina. Com `subprocess.timeout`, um mutante que entra em loop infinito as
vezes aparecia como `kill` e as vezes como `t/o`, e a contagem da fatia se
movia +-5 entre execucoes. Se o progresso do aluno vai num OVB, isso e
inaceitavel: o mesmo exercicio tem de dar o mesmo veredito sempre, em
qualquer maquina.

O orcamento e em **linhas executadas**, contadas via `sys.settrace`. Pro
mesmo codigo e a mesma entrada, a contagem e identica em qualquer lugar --
e portanto atestavel.

Nao e barreira de seguranca. Codigo que chama `sys.settrace(None)` escapa do
contador, e um `except:` pelado engole o sinal de estouro (por isso
BudgetExceeded herda de BaseException, e nao de Exception). O timeout de
subprocesso continua existindo por fora, como rede de seguranca; se ele
disparar, e erro de infraestrutura, nao veredito.
"""
from __future__ import annotations

import importlib.util
import json
import sys


class BudgetExceeded(BaseException):
    """BaseException de proposito: `except Exception` do aluno nao captura."""


class StepCounter:
    __slots__ = ("steps", "limit", "filename")

    def __init__(self, limit, filename):
        self.steps = 0
        self.limit = limit
        self.filename = filename

    def tracer(self, frame, event, arg):
        if frame.f_code.co_filename != self.filename:
            return None
        if event == "line":
            self.steps += 1
            if self.steps > self.limit:
                raise BudgetExceeded()
        return self.tracer


def main():
    mod_path, entry, cases_path, budget = (
        sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]))

    with open(cases_path, encoding="utf-8") as fh:
        cases = json.load(fh)

    spec = importlib.util.spec_from_file_location("cand", mod_path)
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
        fn = getattr(mod, entry)
    except BaseException as e:
        print(json.dumps({"load_error": f"{type(e).__name__}: {e}"}))
        return

    results = []
    for c in cases:
        counter = StepCounter(budget, mod_path)
        sys.settrace(counter.tracer)
        try:
            got = fn(*c["args"])
            over = False
            err = None
        except BudgetExceeded:
            got, over, err = None, True, None
        except Exception as e:
            got, over, err = None, False, f"{type(e).__name__}: {e}"
        finally:
            sys.settrace(None)

        if over:
            results.append({"ok": False, "steps": counter.steps,
                            "budget_exceeded": True})
        elif err is not None:
            results.append({"ok": False, "steps": counter.steps, "error": err})
        else:
            ok = got == c["expected"] and type(got) is type(c["expected"])
            results.append({"ok": bool(ok), "steps": counter.steps, "got": got})

    print(json.dumps({"results": results}, default=repr))


if __name__ == "__main__":
    main()
