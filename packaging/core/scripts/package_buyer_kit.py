#!/usr/bin/env python3
"""Package a self-contained Gate 0 buyer audit kit (P-04 & P-10).

Bundles the compiled `arkhe-provenance-mcp` binary, public `trust.json`,
receipts, bytes, and a one-page standalone audit guide (`AUDIT-1-PAGE.md`)
with SHA256SUMS and an explicit zero-secret-leakage check. Never bundles any
`arkhe-secret/v1` file or private seed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import sys
import zipfile
from pathlib import Path

CORE_ROOT = Path(__file__).resolve().parents[1]

ONE_PAGE_GUIDE = """# Arkhe Verify — Guia de Auditoria Independente (1 Página)

Este pacote é autocontido. Não exige banco de dados, internet, código-fonte nem a máquina de quem emitiu os recibos.
**Nenhuma chave privada (`arkhe-secret/v1`) acompanha este pacote.**

> **Atenção:** os arquivos em `fixtures/` são vetores públicos de laboratório (`purpose: gate0-lab`) para comprovar a reprodutibilidade do verificador. Para uso em produção, substitua `trust.json` pela chave pública que a sua própria equipe configurou fora de banda.

## 1. Confira integridade do pacote antes de executar

Confira `SHA256SUMS` com sua ferramenta padrão (ex.: `sha256sum -c SHA256SUMS` no Linux/macOS ou `Get-FileHash` no Windows), ou execute:

```bash
python -B verify_release.py --kit . --run-gate0
```

## 2. Execute os 7 comandos de auditoria

(No Windows use `.\\arkhe-provenance-mcp.exe`; no Linux/macOS use `./arkhe-provenance-mcp`.)

```bash
# 1. Admissão (exit 0, overall PASS)
./arkhe-provenance-mcp verify --receipt fixtures/admission.json --trust fixtures/trust.json --expect-purpose gate0-lab --subject fixtures/subject.bin --policy fixtures/policy.json

# 2. Commit (exit 0, overall PASS)
./arkhe-provenance-mcp verify --receipt fixtures/commit.json --trust fixtures/trust.json --expect-purpose gate0-lab --admission fixtures/admission.json

# 3. Âncora pendente sem transporte externo (exit 2, overall INCONCLUSIVE)
./arkhe-provenance-mcp verify --receipt fixtures/anchor.json --trust fixtures/trust.json --expect-purpose gate0-lab --commit fixtures/commit.json

# 4. Artefato com prova de Merkle (exit 0, overall PASS)
./arkhe-provenance-mcp verify --receipt fixtures/artifact.json --trust fixtures/trust.json --expect-purpose gate0-lab --artifact fixtures/artifact.bin --model fixtures/model.json --data fixtures/data.json --pipeline fixtures/pipeline.json

# 5. Ação de agente SEM veredito de invariante (exit 2, overall INCONCLUSIVE, llm_output INCONCLUSIVE)
./arkhe-provenance-mcp verify --receipt fixtures/action.json --trust fixtures/trust.json --expect-purpose gate0-lab --plan fixtures/plan.json --output fixtures/artifact.bin --model fixtures/model.json --artifact fixtures/artifact.bin

# 6. MESMA ação de agente COM veredito nomeado (exit 0, overall PASS, llm_output PASS)
./arkhe-provenance-mcp verify --receipt fixtures/action.json --trust fixtures/trust.json --expect-purpose gate0-lab --plan fixtures/plan.json --output fixtures/artifact.bin --model fixtures/model.json --artifact fixtures/artifact.bin --invariant fixtures/verdict.json --expect-invariant invariant.valor-present

# 7. Veredito de invariante isolado (exit 0, overall PASS)
./arkhe-provenance-mcp verify --receipt fixtures/verdict.json --trust fixtures/trust.json --expect-purpose gate0-lab --output fixtures/artifact.bin --action fixtures/action.json
```

## 3. Tabela de vereditos esperados

| # | Recibo | `overall` esperado | Componente decisivo | Código de saída |
|---|---|---|---|---|
| 1 | `admission.json` | `PASS` | `subject: PASS`, `policy: PASS` | `0` |
| 2 | `commit.json` | `PASS` | `recompute: PASS`, `binding: PASS` | `0` |
| 3 | `anchor.json` | `INCONCLUSIVE` | `anchor: INCONCLUSIVE` | `2` |
| 4 | `artifact.json` | `PASS` | `merkle: PASS` + 4 vínculos `PASS` | `0` |
| 5 | `action.json` (sem veredito) | `INCONCLUSIVE` | `llm_output: INCONCLUSIVE` | `2` |
| 6 | `action.json` (com veredito nomeado) | `PASS` | `llm_output: PASS` | `0` |
| 7 | `verdict.json` | `PASS` | `held: PASS`, `binding: PASS` | `0` |

## 4. O que `PASS` garante — e o que não garante

- **Garante:** a assinatura Ed25519 confere sob a chave pública do `trust.json` que você nomeou, e o hash SHA-256 dos bytes que você tem em mãos coincide com o hash escrito no recibo.
- **Não garante:** que o conteúdo seja verdadeiro no mundo real, que uma ação externa tenha ocorrido, nem autoriza qualquer efeito (`{"effect":"none"}`). `INCONCLUSIVE` (exit 2) e `FAIL` (exit 1) nunca são sucesso.
"""


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def assert_no_secrets(root: Path) -> None:
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() in {".exe", ".bin"}:
            continue
        if path.name.endswith(".secret") or ".secret." in path.name:
            raise RuntimeError(f"REFUSED: secret filename detected in buyer kit: {path}")
        if path.suffix.lower() == ".json":
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and (data.get("schema") == "arkhe-secret/v1" or "seed_hex" in data):
                raise RuntimeError(f"REFUSED: private secret JSON detected in buyer kit: {path}")
        elif path.name not in {"AUDIT-1-PAGE.md", "verify_release.py"}:
            text = path.read_text(encoding="utf-8", errors="ignore")
            if "arkhe-secret/v1" in text or '"seed_hex"' in text:
                raise RuntimeError(f"REFUSED: private secret detected in buyer kit: {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build self-contained Gate 0 buyer audit kit.")
    parser.add_argument("--profile", choices=["debug", "release"], default="release")
    parser.add_argument("--out", type=Path, default=CORE_ROOT / "dist" / "arkhe-verify-gate0-kit")
    args = parser.parse_args()

    ext = ".exe" if platform.system().lower() == "windows" else ""
    bin_src = CORE_ROOT / "target" / args.profile / f"arkhe-provenance-mcp{ext}"
    if not bin_src.is_file():
        print(f"ERROR: compiled binary not found at {bin_src}. Run cargo build first.", file=sys.stderr)
        return 1

    out_dir: Path = args.out.resolve()
    if out_dir.exists():
        shutil.rmtree(out_dir)
    fixtures_dst = out_dir / "fixtures"
    fixtures_dst.mkdir(parents=True, exist_ok=True)

    shutil.copy2(bin_src, out_dir / f"arkhe-provenance-mcp{ext}")
    if ext == "":
        os.chmod(out_dir / "arkhe-provenance-mcp", 0o755)

    for src in sorted((CORE_ROOT / "fixtures" / "gate0").iterdir()):
        if src.is_file():
            shutil.copy2(src, fixtures_dst / src.name)

    shutil.copy2(CORE_ROOT / "scripts" / "verify_release.py", out_dir / "verify_release.py")
    for lic in ("LICENSE-APACHE", "LICENSE-MIT"):
        lic_src = CORE_ROOT / lic
        if not lic_src.is_file():
            raise RuntimeError(f"Missing required license file: {lic_src}")
        shutil.copy2(lic_src, out_dir / lic)
    (out_dir / "AUDIT-1-PAGE.md").write_text(ONE_PAGE_GUIDE, encoding="utf-8", newline="\n")

    assert_no_secrets(out_dir)

    checksum_lines: list[str] = []
    files = sorted(p for p in out_dir.rglob("*") if p.is_file() and p.name != "SHA256SUMS")
    for p in files:
        rel = p.relative_to(out_dir).as_posix()
        checksum_lines.append(f"{sha256_file(p)}  {rel}")
    (out_dir / "SHA256SUMS").write_text("\n".join(checksum_lines) + "\n", encoding="utf-8", newline="\n")

    zip_path = out_dir.with_suffix(".zip")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(out_dir.rglob("*")):
            if p.is_file():
                zf.write(p, arcname=p.relative_to(out_dir).as_posix())

    manifest = {
        "schema": "arkhe-buyer-kit-summary/v1",
        "kit_dir": str(out_dir),
        "zip_path": str(zip_path),
        "zip_sha256": sha256_file(zip_path),
        "file_count": len(files) + 1,
        "contains_private_secrets": False,
        "gate0_closed_by_author_build": False,
    }
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
