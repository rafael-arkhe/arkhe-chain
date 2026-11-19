import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arkhe_sdk import verify_mcp


def test_mcp_admission():
    root = Path(__file__).resolve().parents[1]
    binary = root / "target" / "debug" / "arkhe-provenance-mcp.exe"
    if not binary.is_file():
        binary = root / "target" / "debug" / "arkhe-provenance-mcp"
    fixture = root / "fixtures" / "gate0"
    admission = json.loads((fixture / "admission.json").read_text(encoding="utf-8"))
    trust = json.loads((fixture / "trust.json").read_text(encoding="utf-8"))
    subject = __import__("hashlib").sha256((fixture / "subject.bin").read_bytes()).hexdigest()
    policy = __import__("hashlib").sha256((fixture / "policy.json").read_bytes()).hexdigest()
    verdict = verify_mcp(
        str(binary),
        admission,
        trust,
        "gate0-lab",
        subject_sha256=subject,
        policy_sha256=policy,
    )
    assert verdict["overall"] == "PASS"
    assert verdict["persistence"] == "NOT_PERFORMED"


if __name__ == "__main__":
    test_mcp_admission()
    print("sdk mcp admission PASS")
