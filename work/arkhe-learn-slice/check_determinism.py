"""Prova que o veredito nao depende da execucao.

    python -I check_determinism.py [n]

Roda a fatia inteira n vezes em processos separados e compara o fingerprint,
que e o hash de (spec, mutante, tipo, legivel, orcamento, contraexemplo) de
cada exercicio -- incluindo a contagem de passos do contraexemplo. Se os n
hashes forem iguais, a classificacao E a contagem de passos sao estaveis.

Antes desta mudanca isto falhava: com `subprocess.timeout` decidindo o
veredito, mutante que entra em loop infinito as vezes era morto pelos casos
antes de travar e as vezes estourava o relogio, migrando entre as colunas
`kill` e `t/o`. A contagem se movia +-5 entre execucoes.

Para carregar a maquina de proposito e tornar o teste mais severo, rode algo
pesado em paralelo enquanto isto executa: o resultado nao deve mudar.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FP = re.compile(r"^FINGERPRINT\s*:\s*([0-9a-f]{64})$", re.M)
COUNTS = re.compile(
    r"erro de valor\s*:\s*(\d+).*?"
    r"estourou o orcamento\s*:\s*(\d+).*?"
    r"sobreviveram a spec\s*:\s*(\d+).*?"
    r"spec fraca \(exercicio\)\s*:\s*(\d+).*?"
    r"equivalente \(descartado\)\s*:\s*(\d+).*?"
    r"infraestrutura \(nao veredito\)\s*:\s*(\d+)",
    re.S,
)


def one_run(i):
    proc = subprocess.run(
        [sys.executable, "-I", os.path.join(HERE, "run_slice.py")],
        capture_output=True, text=True, cwd=HERE, timeout=1200,
    )
    if proc.returncode != 0:
        print(f"  run {i}: FALHOU\n{proc.stderr[-800:]}")
        return None, None
    m = FP.search(proc.stdout)
    c = COUNTS.search(proc.stdout)
    return (m.group(1) if m else None), (c.groups() if c else None)


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    print(f"rodando a fatia {n} vezes, em processos separados\n")

    fps, counts = [], []
    for i in range(1, n + 1):
        fp, c = one_run(i)
        if fp is None:
            sys.exit("nao consegui extrair o fingerprint")
        fps.append(fp)
        counts.append(c)
        print(f"  run {i}: {fp[:32]}...  "
              f"valor={c[0]} orcam={c[1]} surv={c[2]} fraca={c[3]} "
              f"equiv={c[4]} infra={c[5]}")

    print()
    same_fp = len(set(fps)) == 1
    same_counts = len(set(counts)) == 1
    print(f"fingerprints identicos : {same_fp}")
    print(f"contagens identicas    : {same_counts}")
    if not same_fp:
        print("\nDIVERGIU. hashes distintos:")
        for h in sorted(set(fps)):
            print(f"  {h}  ({fps.count(h)}x)")
    print()
    if same_fp and same_counts:
        print("VEREDITO: deterministico em " + str(n) + " execucoes.")
        print("O conjunto de exercicios e o veredito de cada um sao")
        print("reproduziveis, entao dao pra entrar num OVB. Isto NAO prova")
        print("determinismo entre maquinas nem entre versoes de Python -- a")
        print("contagem de linhas depende do que o compilador de bytecode")
        print("emite, e isso pode mudar numa release. O orcamento e o")
        print("fingerprint tem de entrar no digest junto com a versao.")
        return 0
    print("VEREDITO: ainda nao e deterministico.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
