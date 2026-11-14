"""Merkle Mountain Range com prova de inclusao.

Por que nao reusar o `Mmr` do scaffold: la a raiz e
`blake3(concat(todos os leaves))`, o que serve pra detectar alteracao mas nao
produz prova de inclusao. Para credencial de aluno isso nao basta -- o caso de
uso e "provar que ESTA tentativa esta no meu historico sem mostrar o
historico inteiro". Com hash da concatenacao, provar uma tentativa exige
revelar todas.

Construcao padrao:
  leaf   = H(0x00 || dado)
  no     = H(0x01 || esquerda || direita)
  raiz   = bagging dos peaks da direita pra esquerda:
           acc = peaks[-1]; para p em reversed(peaks[:-1]): acc = H(0x01||p||acc)

Os leaves sao decompostos em montanhas (arvores binarias perfeitas) pela
decomposicao binaria de n: 11 leaves -> montanhas de 8, 2 e 1.

A prova e recalculada a partir dos leaves em O(n) em vez de manter o array
plano do MMR. Para centenas de tentativas isso e irrelevante e o codigo fica
muito menos sujeito a erro -- a aritmetica de indice do array plano e a parte
onde implementacoes de MMR costumam errar.
"""
from __future__ import annotations

import blake3 as _b3

LEAF = b"\x00"
NODE = b"\x01"


def _h(*parts):
    h = _b3.blake3()
    for p in parts:
        h.update(p)
    return h.digest()


def leaf_hash(data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    return _h(LEAF, data)


def _node(left, right):
    return _h(NODE, left, right)


def _mountain_sizes(n):
    """Decomposicao binaria de n, do maior pro menor. 11 -> [8, 2, 1]."""
    sizes, bit = [], 1 << (n.bit_length() - 1) if n else 0
    while bit:
        if n & bit:
            sizes.append(bit)
        bit >>= 1
    return sizes


def _peak(leaves):
    """Raiz de uma arvore binaria perfeita (len(leaves) = potencia de 2)."""
    level = list(leaves)
    while len(level) > 1:
        level = [_node(level[i], level[i + 1]) for i in range(0, len(level), 2)]
    return level[0]


def _bag(peaks):
    """Raiz do MMR a partir dos peaks, da direita pra esquerda."""
    if not peaks:
        return b""
    acc = peaks[-1]
    for p in reversed(peaks[:-1]):
        acc = _node(p, acc)
    return acc


def peaks(leaves):
    out, off = [], 0
    for size in _mountain_sizes(len(leaves)):
        out.append(_peak(leaves[off:off + size]))
        off += size
    return out


def root(leaves):
    return _bag(peaks(leaves))


def gen_proof(leaves, index):
    """Prova de inclusao do leaf `index`.

    Devolve dict com:
      path       caminho de irmaos dentro da montanha, de baixo pra cima,
                 cada item {"side": "left"|"right", "hash": hex}
      peaks_left peaks das montanhas ANTES da montanha do leaf (hex)
      peaks_right idem, DEPOIS
    """
    n = len(leaves)
    if not 0 <= index < n:
        raise IndexError(index)

    sizes = _mountain_sizes(n)
    off, mi = 0, None
    for i, size in enumerate(sizes):
        if off <= index < off + size:
            mi, m_off, m_size = i, off, size
            break
        off += size
    if mi is None:
        raise IndexError(index)

    # caminho dentro da montanha
    level = list(leaves[m_off:m_off + m_size])
    pos = index - m_off
    path = []
    while len(level) > 1:
        sibling = pos ^ 1
        path.append({
            "side": "right" if sibling > pos else "left",
            "hash": level[sibling].hex(),
        })
        level = [_node(level[i], level[i + 1]) for i in range(0, len(level), 2)]
        pos //= 2

    all_peaks = peaks(leaves)
    return {
        "index": index,
        "n_leaves": n,
        "path": path,
        "peaks_left": [p.hex() for p in all_peaks[:mi]],
        "peaks_right": [p.hex() for p in all_peaks[mi + 1:]],
    }


def verify_proof(leaf, proof, expected_root):
    """Recomputa a raiz a partir do leaf e da prova. Fail-closed."""
    try:
        acc = leaf
        for step in proof["path"]:
            sib = bytes.fromhex(step["hash"])
            acc = _node(sib, acc) if step["side"] == "left" else _node(acc, sib)
        mountain_peaks = (
            [bytes.fromhex(x) for x in proof["peaks_left"]]
            + [acc]
            + [bytes.fromhex(x) for x in proof["peaks_right"]]
        )
        return _bag(mountain_peaks) == expected_root
    except (KeyError, TypeError, ValueError):
        return False
