"""Teste diferencial pra separar mutante equivalente de spec fraca.

O problema que isto resolve: quando um mutante passa em todos os casos da
spec, ha duas causas possiveis e elas ensinam coisas OPOSTAS.

  equivalente  -- o mutante tem o mesmo comportamento do original pra toda
                  entrada. `clamp` com `n <= lo` em vez de `n < lo` e disso:
                  quando n == lo, devolver `lo` ou `n` da o mesmo valor.
                  NAO e exercicio. Apresentar como bug ensinaria algo falso.
  spec fraca   -- o mutante e genuinamente diferente, e a spec simplesmente
                  nao tem caso que o pegue. `clamp` com `return 0` em vez de
                  `return lo` e disso: passa porque TODOS os casos usam lo=0.
                  E o melhor exercicio do produto inteiro.

Como separar: roda baseline e mutante sobre centenas de entradas aleatorias.
Se discordarem uma vez, e spec fraca -- e a entrada discordante **e o caso de
teste que faltava**, que vira por si um segundo exercicio ("escreva o teste
que pega isto"). Se nunca discordarem, e provavelmente equivalente.

"Provavelmente" e honesto: equivalencia de programas e indecidivel. Isto e
amostragem, nao prova. Com 300 entradas por mutante, um mutante que difere
so em entrada rarissima passa por equivalente e e descartado -- erra pro lado
seguro, que e descartar exercicio bom, nao ensinar coisa errada.
"""
from __future__ import annotations

import random

N_INPUTS = 300


def _ints(rng, n, lo=-12, hi=12):
    return [rng.randint(lo, hi) for _ in range(n)]


def gen_clamp(rng):
    lo = rng.randint(-10, 10)
    hi = lo + rng.randint(0, 20)
    return [rng.randint(lo - 15, hi + 15), lo, hi]


def gen_list_int(rng):
    return [_ints(rng, rng.randint(0, 6))]


def gen_fizzbuzz(rng):
    return [rng.randint(-20, 60)]


def gen_palindrome(rng):
    n = rng.randint(0, 7)
    return ["".join(rng.choice("aab") for _ in range(n))]


def gen_binary_search(rng):
    xs = sorted(set(_ints(rng, rng.randint(0, 7), -15, 15)))
    # metade das vezes procura algo que existe
    t = rng.choice(xs) if xs and rng.random() < 0.5 else rng.randint(-18, 18)
    return [xs, t]


def gen_count_vowels(rng):
    n = rng.randint(0, 9)
    return ["".join(rng.choice("aeioubcdxyz") for _ in range(n))]


def gen_fib(rng):
    return [rng.randint(0, 16)]


GENERATORS = {
    "clamp": gen_clamp,
    "sum_positives": gen_list_int,
    "max_of": gen_list_int,
    "fizzbuzz": gen_fizzbuzz,
    "is_palindrome": gen_palindrome,
    "binary_search": gen_binary_search,
    "count_vowels": gen_count_vowels,
    "fib": gen_fib,
}


def inputs_for(spec_id, seed=4242, n=N_INPUTS):
    """Entradas aleatorias deterministicas pra uma spec."""
    gen = GENERATORS.get(spec_id)
    if gen is None:
        return None
    rng = random.Random(seed)
    seen, out = set(), []
    for _ in range(n * 3):
        args = gen(rng)
        key = repr(args)
        if key in seen:
            continue
        seen.add(key)
        out.append(args)
        if len(out) >= n:
            break
    return out


def as_cases(args_list, expected_list):
    return [{"args": a, "expected": e} for a, e in zip(args_list, expected_list)]
