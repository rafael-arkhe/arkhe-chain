"""Motor de mutacao sobre AST de Python.

Esta e a peca que NAO existe no agi-coder. O crate `agi-coder-verification`
grada mutantes que o chamador escreve a mao (closures Rust `|x: i64| Ok(x+2)`);
o proprio lib.rs diz "finite-domain engine, not an automatic test generator".
Sem geracao automatica nao ha esteira de conteudo, e sem esteira de conteudo
nao ha produto de aprendizado.

Cada mutacao altera **exatamente um no** da AST (ou remove exatamente um
statement), entao o diff e localizado por construcao -- requisito pra o
exercicio ser julgavel numa tela de celular.

A saida passa por `ast.unparse`, e o baseline mostrado ao aluno tambem. Assim
a unica diferenca entre os dois textos e a mutacao, e nao a formatacao.

Nota de implementacao: a primeira versao casava indice entre `ast.walk` (BFS)
e um NodeTransformer (DFS). Nao bate -- a mutacao caia em no errado e quatro
das oito specs geravam zero mutante. Agora cada no recebe um id estavel antes
de qualquer mutacao, e a aplicacao busca por id.
"""
from __future__ import annotations

import ast

# ---------------------------------------------------------------------------
# Operadores. O rotulo e pedagogico: e o que o app diz ao aluno DEPOIS de ele
# responder, pra nomear a classe do erro em vez de so dizer "errado".
# ---------------------------------------------------------------------------

CMP_SWAP = {
    ast.Lt: [(ast.LtE, "limite trocado: < virou <="),
             (ast.Gt, "comparacao invertida: < virou >")],
    ast.LtE: [(ast.Lt, "limite trocado: <= virou <"),
              (ast.GtE, "comparacao invertida: <= virou >=")],
    ast.Gt: [(ast.GtE, "limite trocado: > virou >="),
             (ast.Lt, "comparacao invertida: > virou <")],
    ast.GtE: [(ast.Gt, "limite trocado: >= virou >"),
              (ast.LtE, "comparacao invertida: >= virou <=")],
    ast.Eq: [(ast.NotEq, "comparacao invertida: == virou !=")],
    ast.NotEq: [(ast.Eq, "comparacao invertida: != virou ==")],
    ast.In: [(ast.NotIn, "pertinencia invertida: in virou not in")],
    ast.NotIn: [(ast.In, "pertinencia invertida: not in virou in")],
}

BIN_SWAP = {
    ast.Add: [(ast.Sub, "operacao trocada: + virou -")],
    ast.Sub: [(ast.Add, "operacao trocada: - virou +")],
    ast.Mult: [(ast.Add, "operacao trocada: * virou +")],
    ast.FloorDiv: [(ast.Mult, "operacao trocada: // virou *")],
    ast.Div: [(ast.Mult, "operacao trocada: / virou *")],
    ast.Mod: [(ast.FloorDiv, "operacao trocada: % virou //")],
}

BOOL_SWAP = {
    ast.And: (ast.Or, "conectivo trocado: and virou or"),
    ast.Or: (ast.And, "conectivo trocado: or virou and"),
}

BODY_FIELDS = ("body", "orelse", "finalbody")


def _tag(tree):
    for i, node in enumerate(ast.walk(tree)):
        node._sid = i
    return tree


def _find(tree, sid):
    for node in ast.walk(tree):
        if getattr(node, "_sid", None) == sid:
            return node
    return None


def _collect(tree):
    """Lista de sites mutaveis. Cada um identifica o no pelo id estavel."""
    sites = []
    for node in ast.walk(tree):
        sid = node._sid

        if isinstance(node, ast.Compare) and len(node.ops) == 1:
            for new_op, label in CMP_SWAP.get(type(node.ops[0]), []):
                sites.append({"kind": "cmp", "sid": sid, "op": new_op,
                              "label": label})
            # trocar a ordem dos operandos
            sites.append({"kind": "cmp_flip", "sid": sid, "op": None,
                          "label": "operandos trocados de lado"})

        elif isinstance(node, ast.BinOp):
            for new_op, label in BIN_SWAP.get(type(node.op), []):
                sites.append({"kind": "bin", "sid": sid, "op": new_op,
                              "label": label})

        elif isinstance(node, ast.BoolOp):
            swap = BOOL_SWAP.get(type(node.op))
            if swap:
                sites.append({"kind": "bool", "sid": sid, "op": swap[0],
                              "label": swap[1]})

        elif isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            sites.append({"kind": "not", "sid": sid, "op": None,
                          "label": "negacao removida: caiu o not"})

        elif isinstance(node, ast.Constant) and isinstance(node.value, int) \
                and not isinstance(node.value, bool):
            for delta in (1, -1):
                sites.append({
                    "kind": "const", "sid": sid, "op": node.value + delta,
                    "label": f"constante deslocada: {node.value} virou "
                             f"{node.value + delta}"})

        elif isinstance(node, ast.Return) and node.value is not None:
            sites.append({"kind": "ret_const", "sid": sid, "op": 0,
                          "label": "retorno fixo: devolve sempre 0"})

        elif isinstance(node, ast.AugAssign):
            for new_op, label in BIN_SWAP.get(type(node.op), []):
                sites.append({"kind": "augassign", "sid": sid, "op": new_op,
                              "label": label})

        elif isinstance(node, ast.Subscript) and isinstance(node.slice, ast.Name):
            sites.append({"kind": "index_off", "sid": sid, "op": 1,
                          "label": "indice deslocado: acessa a posicao seguinte"})

        # remocao de um statement: so onde o corpo tem mais de um
        for field in BODY_FIELDS:
            stmts = getattr(node, field, None)
            if isinstance(stmts, list) and len(stmts) >= 2:
                for i in range(len(stmts)):
                    sites.append({"kind": "del_stmt", "sid": sid, "op": None,
                                  "field": field, "index": i,
                                  "label": "linha removida: faltou um passo"})
    return sites


class _NotRemover(ast.NodeTransformer):
    def __init__(self, sid):
        self.sid = sid

    def visit_UnaryOp(self, node):
        self.generic_visit(node)
        if getattr(node, "_sid", None) == self.sid:
            return node.operand
        return node


def _apply(source, site):
    """Reparse limpo + aplica o site. Devolve a fonte mutada, ou None."""
    tree = _tag(ast.parse(source))
    kind = site["kind"]

    if kind == "not":
        tree = _NotRemover(site["sid"]).visit(tree)
    elif kind == "del_stmt":
        parent = _find(tree, site["sid"])
        if parent is None:
            return None
        stmts = getattr(parent, site["field"])
        if len(stmts) < 2:
            return None
        stmts.pop(site["index"])
    else:
        node = _find(tree, site["sid"])
        if node is None:
            return None
        if kind == "cmp":
            node.ops = [site["op"]()]
        elif kind == "cmp_flip":
            node.left, node.comparators[0] = node.comparators[0], node.left
        elif kind in ("bin", "augassign"):
            node.op = site["op"]()
        elif kind == "bool":
            node.op = site["op"]()
        elif kind == "const":
            node.value = site["op"]
        elif kind == "ret_const":
            node.value = ast.Constant(value=site["op"])
        elif kind == "index_off":
            node.slice = ast.BinOp(left=node.slice, op=ast.Add(),
                                   right=ast.Constant(value=site["op"]))
        else:
            return None

    try:
        ast.fix_missing_locations(tree)
        return ast.unparse(tree)
    except (SyntaxError, ValueError, AttributeError, TypeError):
        return None


def normalize(source):
    """Fonte canonica: o que o aluno ve como baseline."""
    return ast.unparse(ast.parse(source))


def generate(source, limit=None):
    """Devolve (baseline_canonico, [(mutant_id, fonte, rotulo)]).

    Descarta mutante que nao compila e mutante cujo texto e identico ao
    baseline -- acontece, por exemplo, quando trocar os operandos de `a == b`
    da na mesma coisa.
    """
    base = normalize(source)
    sites = _collect(_tag(ast.parse(source)))

    seen, out = set(), []
    for idx, site in enumerate(sites):
        text = _apply(source, site)
        if text is None or text == base or text in seen:
            continue
        seen.add(text)
        out.append((f"m{idx:03d}_{site['kind']}", text, site["label"]))
        if limit and len(out) >= limit:
            break
    return base, out


def diff_lines(base, mutant):
    """Quantas linhas diferem. Localidade do diff = legibilidade."""
    a, b = base.split("\n"), mutant.split("\n")
    if len(a) != len(b):
        return max(len(a), len(b)) - min(len(a), len(b)) + sum(
            1 for x, y in zip(a, b) if x != y)
    return sum(1 for x, y in zip(a, b) if x != y)
