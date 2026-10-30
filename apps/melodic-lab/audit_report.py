#!/usr/bin/env python3
"""
audit_report.py — Auditoria dos campos que o preflight_check.py não verifica.

Verifica:
  - Campos MMR obrigatórios (mmr_version, mmr_algorithm, leaf_index,
    leaf_count, peak_index, peaks, path).
  - Valores literais de mmr_version e mmr_algorithm.
  - Bounds de leaf_index, leaf_count, peak_index.
  - Estrutura de peaks e path.
  - Bloco c2pa presente para A e B.
  - pair_id derivado de sha256_a + sha256_b para cada val_score.

Uso:
  python3 audit_report.py arkhe_report.json
"""

import hashlib
import json
import re
import sys
from pathlib import Path

HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
MMR_VERSION = "aegis-mmr-inclusion-v1"
MMR_ALGORITHM = "sha256-asciihex"


def _is_hex64(v):
    return isinstance(v, str) and HEX64_RE.match(v) is not None


def audit_mmr(anchor, issues):
    """Audita o bloco anchor para conformidade com aegis-mmr-inclusion-v1."""
    required = ["mmr_version", "mmr_algorithm", "leaf_index",
                "leaf_count", "peak_index", "peaks", "path"]
    for f in required:
        if f not in anchor:
            issues.append(f"anchor.{f} ausente")

    # Se algum campo base falta, não tentar validar os outros
    if any(f not in anchor for f in ["mmr_version", "mmr_algorithm",
                                      "leaf_index", "leaf_count",
                                      "peak_index", "peaks", "path"]):
        return

    if anchor["mmr_version"] != MMR_VERSION:
        issues.append(f"mmr_version inválido: {anchor['mmr_version']}")
    if anchor["mmr_algorithm"] != MMR_ALGORITHM:
        issues.append(f"mmr_algorithm inválido: {anchor['mmr_algorithm']}")

    li = anchor["leaf_index"]
    lc = anchor["leaf_count"]
    pi = anchor["peak_index"]

    if not isinstance(li, int) or li < 0:
        issues.append(f"leaf_index inválido: {li}")
    if not isinstance(lc, int) or lc < 1:
        issues.append(f"leaf_count inválido: {lc}")
    if not isinstance(pi, int) or pi < 0:
        issues.append(f"peak_index inválido: {pi}")
    if isinstance(li, int) and isinstance(lc, int) and not (0 <= li < lc):
        issues.append(f"leaf_index fora de [0, {lc}): {li}")

    peaks = anchor["peaks"]
    if not isinstance(peaks, list) or len(peaks) == 0:
        issues.append("peaks vazio ou não é lista")
    else:
        expected_peaks = bin(lc).count("1") if isinstance(lc, int) and lc > 0 else 0
        if expected_peaks and len(peaks) != expected_peaks:
            issues.append(f"peaks: {len(peaks)} ≠ popcount(leaf_count)={expected_peaks}")
        for i, p in enumerate(peaks):
            if not isinstance(p, dict):
                issues.append(f"peaks[{i}] não é objecto")
                continue
            if "height" not in p or not isinstance(p["height"], int) or p["height"] < 0:
                issues.append(f"peaks[{i}].height inválido")
            if "hash" not in p or not _is_hex64(p["hash"]):
                issues.append(f"peaks[{i}].hash não é hex64")

    path = anchor["path"]
    if not isinstance(path, list):
        issues.append("path não é lista")
    else:
        for i, step in enumerate(path):
            if not isinstance(step, dict):
                issues.append(f"path[{i}] não é objecto")
                continue
            if step.get("direction") not in ("L", "R"):
                issues.append(f"path[{i}].direction inválido: {step.get('direction')}")
            if not _is_hex64(step.get("sibling_hash")):
                issues.append(f"path[{i}].sibling_hash não é hex64")


def audit_c2pa(raw, issues):
    """Verifica presença de c2pa para A e B."""
    c2pa = raw.get("c2pa")
    if not c2pa:
        issues.append("bloco c2pa ausente")
        return
    for target in ("a", "b"):
        entry = c2pa.get(target)
        if not entry:
            issues.append(f"c2pa.{target} ausente")
            continue
        for field in ("integrity", "signature", "hard_binding"):
            if field not in entry:
                issues.append(f"c2pa.{target}.{field} ausente")


def audit_calibration(raw, issues):
    """Verifica pair_id derivado em cada val_score."""
    melodic = raw.get("similarity", {}).get("melodic", {})
    cal = melodic.get("calibration", {})
    vals = cal.get("val_scores", [])
    if not vals:
        issues.append("val_scores vazio")
        return
    for i, v in enumerate(vals):
        pid = v.get("pair_id")
        a = v.get("sha256_a")
        b = v.get("sha256_b")
        if not pid:
            issues.append(f"val_scores[{i}].pair_id ausente")
            continue
        if not _is_hex64(pid):
            issues.append(f"val_scores[{i}].pair_id não é hex64")
        if not a or not b:
            issues.append(f"val_scores[{i}].sha256_a/b ausente")
            continue
        expected = hashlib.sha256((a + b).encode("ascii")).hexdigest()
        if pid != expected:
            issues.append(f"val_scores[{i}].pair_id não derivado")


def audit(report_path):
    try:
        raw = json.loads(Path(report_path).read_bytes())
    except Exception as e:
        print(f"✗ Erro ao ler {report_path}: {e}")
        return 2

    issues = []

    anchor = raw.get("anchor")
    if not anchor:
        issues.append("anchor ausente")
    else:
        audit_mmr(anchor, issues)

    audit_c2pa(raw, issues)
    audit_calibration(raw, issues)

    print("═" * 70)
    print(f"AUDIT: {report_path}")
    print("═" * 70)

    if issues:
        print(f"✗ {len(issues)} problema(s):")
        for i in issues:
            print(f"  - {i}")
        return 1

    print("✓ Todos os campos presentes e correctos")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("uso: python3 audit_report.py <report.json>", file=sys.stderr)
        sys.exit(2)
    sys.exit(audit(sys.argv[1]))
