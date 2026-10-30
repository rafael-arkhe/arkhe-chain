"""Generate SDR-001: a consolidated status report derived from tracking registries.

The report is descriptive. It grants no authority, seals no runtime and declares
no freeze. Every count is derived from the source JSON files at generation time.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs" / "SDR-001-CONSOLIDATED.md"
EVIDENCE = ROOT / "docs" / "evidence"
TIMESTAMP_PREFIX = "> Gerado em:"

SOURCES = (
    ("implementation-backlog", "config/implementation-backlog.json"),
    ("capability-status", "config/capability-status.json"),
    ("e01-onboarding-backlog", "config/e01-onboarding-backlog.json"),
    ("architecture", "config/architecture.json"),
)


def load(relative: str):
    path = ROOT / relative
    raw = path.read_bytes()
    return json.loads(raw.decode("utf-8")), hashlib.sha256(raw).hexdigest()


def cell(value) -> str:
    text = "" if value is None else str(value)
    return text.replace("|", "\\|").replace("\n", " ").strip()


def tally(items, key: str):
    counts = {}
    for item in items:
        value = item.get(key, "UNKNOWN")
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items(), key=lambda pair: (-pair[1], pair[0])))


def evidence_directories():
    if not EVIDENCE.is_dir():
        return []
    directories = [
        entry
        for entry in EVIDENCE.iterdir()
        if entry.is_dir() and not entry.name.endswith("-sdr-001")
    ]
    directories.sort(key=lambda entry: entry.name, reverse=True)
    return [entry.name for entry in directories]


def digests():
    return {
        "implementation-backlog": load("config/implementation-backlog.json")[1],
        "capability-status": load("config/capability-status.json")[1],
        "e01-onboarding-backlog": load("config/e01-onboarding-backlog.json")[1],
        "architecture": load("config/architecture.json")[1],
    }


def build(now):
    backlog = load("config/implementation-backlog.json")[0]
    capabilities = load("config/capability-status.json")[0]
    cohort = load("config/e01-onboarding-backlog.json")[0]
    architecture = load("config/architecture.json")[0]
    hashes = digests()

    findings = backlog.get("items", [])
    capability_items = capabilities.get("capabilities", [])
    cohort_items = cohort.get("items", [])
    state_counts = tally(findings, "state")
    priority_counts = tally(findings, "priority")
    capability_counts = tally(capability_items, "status")
    evidence = evidence_directories()
    pending_cohort = [item for item in cohort_items if item.get("state") != "DONE"]

    lines = []
    add = lines.append

    add("# SDR-001 — Relatório consolidado de conformidade e auditoria")
    add("")
    add("> Documento derivado exclusivamente dos registros de rastreio do repositório.")
    add("> Não concede autoridade, não sela runtime e não declara freeze.")
    add(f"{TIMESTAMP_PREFIX} {now or '—'}")
    add("> Comando: `python scripts/generate_sdr.py`")
    add("")
    add("## Fontes")
    add("")
    add("| Registro | Caminho | SHA-256 |")
    add("| --- | --- | --- |")
    for name, relative in SOURCES:
        digest = hashes[name]
        add(f"| {cell(name)} | `{cell(relative)}` | `{digest[:16]}…` |")
    add("")

    add("## Resumo")
    add("")
    add("| Métrica | Valor |")
    add("| --- | --- |")
    add(f"| Achados registrados | {len(findings)} |")
    for state, count in state_counts.items():
        add(f"| Achados em `{cell(state)}` | {count} |")
    add(f"| Crates Rust registrados | {len(architecture.get('rust_members', []))} |")
    add(f"| Pacotes Node registrados | {len(architecture.get('node_packages', []))} |")
    add(f"| Capacidades registradas | {len(capability_items)} |")
    add(f"| Itens da coorte E01 | {len(cohort_items)} |")
    add(f"| Itens E01 pendentes | {len(pending_cohort)} |")
    add(f"| Diretórios de evidência | {len(evidence)} |")
    add("")
    add(
        "Prioridades: "
        + ", ".join(f"`{cell(priority)}`={count}" for priority, count in priority_counts.items())
        + "."
    )
    add("")

    add("## Achados de implementação")
    add("")
    add("| ID | Prioridade | Estado | Falta gerar | Depende de |")
    add("| --- | --- | --- | --- | --- |")
    for item in findings:
        depends = ", ".join(item.get("depends_on") or []) or "—"
        add(
            "| {id} | {priority} | `{state}` | {next_step} | {depends} |".format(
                id=cell(item.get("id")),
                priority=cell(item.get("priority")),
                state=cell(item.get("state")),
                next_step=cell(item.get("next_step")),
                depends=cell(depends),
            )
        )
    add("")
    add(
        "`execution_authority` permanece `false` em todos os achados. "
        "Estado registrado não equivale a capacidade demonstrada."
    )
    add("")

    add("## Capacidades")
    add("")
    add("| Capacidade | Status | Fonte |")
    add("| --- | --- | --- |")
    for item in capability_items:
        add(
            "| {id} | `{status}` | `{source}` |".format(
                id=cell(item.get("id")),
                status=cell(item.get("status")),
                source=cell(item.get("source")),
            )
        )
    add("")
    add(
        "Estado global da arquitetura: `{}`.".format(
            cell(capabilities.get("global_architecture_state"))
        )
    )
    add("")
    add(
        "Distribuição por status: "
        + ", ".join(f"`{cell(key)}`={value}" for key, value in capability_counts.items())
        + "."
    )
    add("")

    add("## Coorte E01")
    add("")
    add("| Item | Título | Estado |")
    add("| --- | --- | --- |")
    for item in cohort_items:
        add(
            "| {id} | {title} | `{state}` |".format(
                id=cell(item.get("id")),
                title=cell(item.get("title")),
                state=cell(item.get("state")),
            )
        )
    add("")
    add(
        "Estudo humano: `{}`; independência de papéis: `{}`.".format(
            cell(cohort.get("human_study_status")),
            cell(cohort.get("roles", {}).get("independence")),
        )
    )
    add("")

    add("## Evidências disponíveis")
    add("")
    if evidence:
        for name in evidence[:12]:
            add(f"- `docs/evidence/{cell(name)}`")
        if len(evidence) > 12:
            add(f"- … e mais {len(evidence) - 12} diretórios")
    else:
        add("- Nenhum diretório de evidência encontrado.")
    add("")

    add("## Limites")
    add("")
    add("- `authority=false` e `runtime_verified=false` em todos os registros de rastreio.")
    add("- A cobertura dinâmica de contenção não constitui admissão nem selo de runtime.")
    add("- Perfil de assinatura Arkhe não equivale a validação C2PA/COSE/X.509 padrão.")
    add("- Nenhuma capacidade AGI, RSI geral ou modelo causal é afirmada por este relatório.")
    add("- Contagens e estados refletem apenas os arquivos-fonte no momento da geração.")
    add("")
    return "\n".join(lines) + "\n"


def snapshot(now, report):
    backlog = load("config/implementation-backlog.json")[0]
    capabilities = load("config/capability-status.json")[0]
    cohort = load("config/e01-onboarding-backlog.json")[0]
    architecture = load("config/architecture.json")[0]
    hashes = digests()
    findings = backlog.get("items", [])
    capability_items = capabilities.get("capabilities", [])
    cohort_items = cohort.get("items", [])
    return {
        "schema": 1,
        "kind": "generated-status-report",
        "authority": False,
        "runtime_verified": False,
        "generated_at": now,
        "report": "docs/SDR-001-CONSOLIDATED.md",
        "report_sha256": hashlib.sha256(report.encode("utf-8")).hexdigest(),
        "sources": {
            name: {"path": relative, "sha256": hashes[name]}
            for name, relative in SOURCES
        },
        "counts": {
            "findings": len(findings),
            "findings_by_state": tally(findings, "state"),
            "findings_by_priority": tally(findings, "priority"),
            "capabilities": len(capability_items),
            "capabilities_by_status": tally(capability_items, "status"),
            "cohort_items": len(cohort_items),
            "cohort_pending": len([item for item in cohort_items if item.get("state") != "DONE"]),
            "rust_members": len(architecture.get("rust_members", [])),
            "node_packages": len(architecture.get("node_packages", [])),
            "evidence_directories": len(evidence_directories()),
        },
        "findings": [
            {
                "id": item.get("id"),
                "priority": item.get("priority"),
                "state": item.get("state"),
                "depends_on": item.get("depends_on", []),
                "next_step": item.get("next_step"),
            }
            for item in findings
        ],
        "capabilities": [
            {"id": item.get("id"), "status": item.get("status"), "source": item.get("source")}
            for item in capability_items
        ],
        "cohort": {
            "cohort_id": cohort.get("cohort_id"),
            "human_study_status": cohort.get("human_study_status"),
            "items": [
                {"id": item.get("id"), "state": item.get("state"), "title": item.get("title")}
                for item in cohort_items
            ],
        },
    }


def strip_timestamp(text):
    return "\n".join(
        line for line in text.splitlines() if not line.startswith(TIMESTAMP_PREFIX)
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="compare the committed report with a fresh generation",
    )
    parser.add_argument(
        "--stdout", action="store_true", help="print the report instead of writing files"
    )
    args = parser.parse_args()

    if args.check:
        if not REPORT.is_file():
            print(f"missing report: {REPORT}", file=sys.stderr)
            return 1
        committed = REPORT.read_text(encoding="utf-8")
        generated = build(None)
        if strip_timestamp(committed) != strip_timestamp(generated):
            print("SDR-001 is stale; run python scripts/generate_sdr.py", file=sys.stderr)
            return 1
        print("SDR-001 is current.")
        return 0

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    report = build(now)
    if args.stdout:
        print(report, end="")
        return 0

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(report, encoding="utf-8", newline="\n")

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    target = EVIDENCE / f"{stamp}-sdr-001"
    target.mkdir(parents=True, exist_ok=True)
    (target / "snapshot.json").write_text(
        json.dumps(snapshot(now, report), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"wrote {REPORT.relative_to(ROOT)}")
    print(f"wrote {(target / 'snapshot.json').relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
