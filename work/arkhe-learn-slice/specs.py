"""Especificacoes semente: funcoes pequenas com casos de teste.

Escolhidas por dois criterios: caber numa tela de celular depois do
`ast.unparse`, e conter as classes de bug que um aluno de verificacao precisa
aprender a enxergar -- limite trocado, caso-base errado, ordem de condicao,
acumulador mal iniciado.

NOTA sobre o modelo de caso: o `Case` do agi-coder e `{ input: i64, expected:
i64 }`, ou seja, so funcoes de um inteiro pra um inteiro. Aqui os casos sao
`{args: [...], expected: ...}` com qualquer valor serializavel. Generalizar
`Case` assim e pre-requisito pro produto; nenhuma funcao real de exercicio
cabe em i64 -> i64.
"""

SPECS = [
    {
        "id": "clamp",
        "requirement": "Devolve n limitado ao intervalo fechado [lo, hi].",
        "entry": "clamp",
        "source": (
            "def clamp(n, lo, hi):\n"
            "    if n < lo:\n"
            "        return lo\n"
            "    if n > hi:\n"
            "        return hi\n"
            "    return n\n"
        ),
        "cases": [
            {"args": [5, 0, 10], "expected": 5},
            {"args": [-3, 0, 10], "expected": 0},
            {"args": [14, 0, 10], "expected": 10},
            {"args": [0, 0, 10], "expected": 0},
            {"args": [10, 0, 10], "expected": 10},
        ],
    },
    {
        "id": "sum_positives",
        "requirement": "Soma apenas os numeros maiores que zero da lista.",
        "entry": "sum_positives",
        "source": (
            "def sum_positives(xs):\n"
            "    total = 0\n"
            "    for x in xs:\n"
            "        if x > 0:\n"
            "            total = total + x\n"
            "    return total\n"
        ),
        "cases": [
            {"args": [[1, 2, 3]], "expected": 6},
            {"args": [[-1, 4, -2]], "expected": 4},
            {"args": [[0, 0, 5]], "expected": 5},
            {"args": [[]], "expected": 0},
            {"args": [[-7]], "expected": 0},
        ],
    },
    {
        "id": "max_of",
        "requirement": "Devolve o maior valor da lista. Lista vazia devolve None.",
        "entry": "max_of",
        "source": (
            "def max_of(xs):\n"
            "    if not xs:\n"
            "        return None\n"
            "    best = xs[0]\n"
            "    for x in xs:\n"
            "        if x > best:\n"
            "            best = x\n"
            "    return best\n"
        ),
        "cases": [
            {"args": [[3, 9, 4]], "expected": 9},
            {"args": [[-5, -2, -9]], "expected": -2},
            {"args": [[7]], "expected": 7},
            {"args": [[]], "expected": None},
            {"args": [[2, 2, 2]], "expected": 2},
        ],
    },
    {
        "id": "fizzbuzz",
        "requirement": "Multiplo de 15 -> FizzBuzz, de 3 -> Fizz, de 5 -> Buzz, senao o numero como texto.",
        "entry": "fizzbuzz",
        "source": (
            "def fizzbuzz(n):\n"
            "    if n % 15 == 0:\n"
            "        return 'FizzBuzz'\n"
            "    if n % 3 == 0:\n"
            "        return 'Fizz'\n"
            "    if n % 5 == 0:\n"
            "        return 'Buzz'\n"
            "    return str(n)\n"
        ),
        "cases": [
            {"args": [15], "expected": "FizzBuzz"},
            {"args": [9], "expected": "Fizz"},
            {"args": [10], "expected": "Buzz"},
            {"args": [7], "expected": "7"},
            {"args": [30], "expected": "FizzBuzz"},
            {"args": [1], "expected": "1"},
        ],
    },
    {
        "id": "is_palindrome",
        "requirement": "Diz se o texto le igual de tras pra frente.",
        "entry": "is_palindrome",
        "source": (
            "def is_palindrome(s):\n"
            "    i = 0\n"
            "    j = len(s) - 1\n"
            "    while i < j:\n"
            "        if s[i] != s[j]:\n"
            "            return False\n"
            "        i = i + 1\n"
            "        j = j - 1\n"
            "    return True\n"
        ),
        "cases": [
            {"args": ["arara"], "expected": True},
            {"args": ["abc"], "expected": False},
            {"args": ["aa"], "expected": True},
            {"args": ["ab"], "expected": False},
            {"args": [""], "expected": True},
            {"args": ["a"], "expected": True},
        ],
    },
    {
        "id": "binary_search",
        "requirement": "Indice de t na lista ordenada xs, ou -1 se nao existir.",
        "entry": "binary_search",
        "source": (
            "def binary_search(xs, t):\n"
            "    lo = 0\n"
            "    hi = len(xs) - 1\n"
            "    while lo <= hi:\n"
            "        mid = (lo + hi) // 2\n"
            "        if xs[mid] == t:\n"
            "            return mid\n"
            "        if xs[mid] < t:\n"
            "            lo = mid + 1\n"
            "        else:\n"
            "            hi = mid - 1\n"
            "    return -1\n"
        ),
        "cases": [
            {"args": [[1, 3, 5, 7], 5], "expected": 2},
            {"args": [[1, 3, 5, 7], 1], "expected": 0},
            {"args": [[1, 3, 5, 7], 7], "expected": 3},
            {"args": [[1, 3, 5, 7], 4], "expected": -1},
            {"args": [[2], 2], "expected": 0},
            {"args": [[], 1], "expected": -1},
        ],
    },
    {
        "id": "count_vowels",
        "requirement": "Conta quantas vogais (aeiou) existem no texto.",
        "entry": "count_vowels",
        "source": (
            "def count_vowels(s):\n"
            "    n = 0\n"
            "    for c in s:\n"
            "        if c in 'aeiou':\n"
            "            n = n + 1\n"
            "    return n\n"
        ),
        "cases": [
            {"args": ["casa"], "expected": 2},
            {"args": ["xyz"], "expected": 0},
            {"args": [""], "expected": 0},
            {"args": ["aeiou"], "expected": 5},
            {"args": ["bola"], "expected": 2},
        ],
    },
    {
        "id": "fib",
        "requirement": "N-esimo numero de Fibonacci, com fib(0)=0 e fib(1)=1.",
        "entry": "fib",
        "source": (
            "def fib(n):\n"
            "    a = 0\n"
            "    b = 1\n"
            "    for _ in range(n):\n"
            "        a, b = (b, a + b)\n"
            "    return a\n"
        ),
        "cases": [
            {"args": [0], "expected": 0},
            {"args": [1], "expected": 1},
            {"args": [2], "expected": 1},
            {"args": [6], "expected": 8},
            {"args": [10], "expected": 55},
        ],
    },
]
