"""Validate full input coverage, local evidence paths and deterministic backlog rendering."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/backlog"


def render(data):
    lines = ["# Backlog reconciliado do Arkhe", "", "Data: 22/10/2026. Escopo: checkout local, dois workspaces independentes.", "",
             "A lista de entrada não é inventário de implementação. Evidência local não é CI remoto nem qualificação de produção. Nenhum item recebe THEOREM nesta execução.", "",
             "[Critérios](../MATURITY-CRITERIA.md) · [Decisão do journal](../adr/ADR-018-journal-persistence.md) · [Perfis MMR](../MMR-PROFILE.md) · [Mandato e broker](../ACTION-BROKER.md) · [Resultados executados](../evidence/2026-10-22-feature-backlog/RESULTS.md)", "",
             "A coluna P mostra prioridade original → revisada. P0 é bloqueador da capacidade indicada, não de todo o monorepo. Dependências originais estão no JSON; a ordem reconciliada substitui estimativas por semanas.", ""]
    for section in sorted({int(x["id"].split(".")[0]) for x in data["items"]}):
        lines += [f"## {section}. {data['sections'][str(section)]}", "", "| ID | Feature da entrada | P | Estado atual | Evidência e aceite restante |", "|---|---|---|---|---|"]
        for x in data["items"]:
            if int(x["id"].split(".")[0]) != section:
                continue
            links = "; ".join(f"[{p}](../../{p})" for p in x["evidence"])
            note = x["assessment"] + (" Depende de: " + ", ".join(x["depends_on"]) + "." if x["depends_on"] else "")
            lines.append("| " + " | ".join([x["id"], x["feature"].replace("|", "\\|"), x["original_priority"] + " → " + x["priority"], x["status"], ("Escopo: " + x["scope"] + ". " + note + " " + links).replace("\n", " ").replace("|", "\\|")]) + " |")
        lines.append("")
    lines += ["## Ordem corrigida", "", *[f"{n}. {v}" for n, v in enumerate(data["execution_order"], 1)], "",
              "## Limites e bloqueadores de ativação", "", *[f"- {v}" for v in data["activation_blockers"]], "",
              "Os estados de fonte e execução têm eixos distintos. IMPLEMENTADO indica implementação e teste local identificado; PARCIAL não encerra o requisito integral; ALTERNATIVA preserva um contrato existente; PENDENTE/NÃO ADOTADO/ADIADO não contam como entrega.", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    source = (BASE / "source.md").read_bytes()
    data = json.loads((BASE / "features.json").read_text(encoding="utf-8"))
    ids = re.findall(r"^\| (\d+\.\d+) \|", source.decode("utf-8"), re.M)
    actual = [x["id"] for x in data["items"]]
    if actual != ids or len(actual) != len(set(actual)):
        raise SystemExit("FAIL input IDs missing, duplicated or reordered")
    if hashlib.sha256(source).hexdigest() != data["source_sha256"]:
        raise SystemExit("FAIL input source hash mismatch")
    allowed = {"IMPLEMENTADO", "PARCIAL", "ALTERNATIVA", "PENDENTE", "NÃO ADOTADO", "ADIADO"}
    graph = {x["id"]: x["depends_on"] for x in data["items"]}
    active, done = set(), set()
    def visit(node):
        if node in active:
            raise SystemExit("FAIL dependency cycle at " + node)
        if node in done:
            return
        active.add(node)
        for dep in graph[node]:
            if dep not in graph:
                raise SystemExit("FAIL unknown dependency " + dep)
            visit(dep)
        active.remove(node)
        done.add(node)
    for x in data["items"]:
        if x["status"] not in allowed or not x["assessment"] or not x["evidence"]:
            raise SystemExit("FAIL missing assessment/evidence " + x["id"])
        if x.get("priority") not in {"P0", "P1", "P2", "P3"} or not x.get("scope"):
            raise SystemExit("FAIL corrected priority/scope missing " + x["id"])
        for path in x["evidence"]:
            resolved = (ROOT / path).resolve()
            if not resolved.is_relative_to(ROOT) or not resolved.exists():
                raise SystemExit("FAIL missing/unsafe evidence " + path)
        visit(x["id"])
    output = BASE / "BACKLOG.md"
    text = render(data)
    if args.write:
        output.write_text(text, encoding="utf-8", newline="\n")
    elif not output.exists() or output.read_text(encoding="utf-8") != text:
        raise SystemExit("FAIL stale rendered backlog; use --write")
    print(f"PASS backlog: {len(ids)} items, unique coverage, source hash, evidence paths, acyclic dependencies and rendered content")


if __name__ == "__main__":
    main()
