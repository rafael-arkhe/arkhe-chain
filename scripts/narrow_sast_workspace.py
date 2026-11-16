"""Rewrite the root workspace so CodeQL can load manifests under sparse checkout.

A full members list that points at missing crates makes the Rust extractor report
every file as extracted-with-errors and produces unusable SARIF noise.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEMBERS = [
    "kernel/arkhe-chain",
    "kernel/arkhe-core",
    "kernel/arkhe-kernel",
    "governance/arkhe-governance",
    "verification/crates/arkhe-verify-core",
]


def rewrite_workspace_members(text: str) -> str:
    start = text.find("members = [")
    if start < 0:
        raise SystemExit("FAIL: Cargo.toml has no members list")
    end = text.find("]", start)
    if end < 0:
        raise SystemExit("FAIL: Cargo.toml members list is unclosed")
    body = ",\n".join(f'  "{member}"' for member in MEMBERS)
    return text[:start] + "members = [\n" + body + ",\n]" + text[end + 1 :]


def strip_missing_dev_deps(manifest: Path) -> None:
    """Drop path dev-dependencies that are absent from the sparse tree."""
    text = manifest.read_text(encoding="utf-8")
    if "arkhe-agent" not in text:
        return
    lines = []
    for line in text.splitlines(keepends=True):
        if "arkhe-agent" in line and "path" in line:
            continue
        lines.append(line)
    manifest.write_text("".join(lines), encoding="utf-8")


def main() -> None:
    cargo = ROOT / "Cargo.toml"
    cargo.write_text(rewrite_workspace_members(cargo.read_text(encoding="utf-8")), encoding="utf-8")
    strip_missing_dev_deps(ROOT / "kernel" / "arkhe-kernel" / "Cargo.toml")
    missing = [member for member in MEMBERS if not (ROOT / member / "Cargo.toml").is_file()]
    if missing:
        raise SystemExit("FAIL missing sparse members: " + ", ".join(missing))
    print("PASS narrowed workspace to " + ", ".join(MEMBERS))


if __name__ == "__main__":
    main()
