from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790619.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 111 passed, 0 failed, 0 ignored, 0 doc-tests.
This run prints mempool N from --status --data. An empty chain printed mempool 0. A chain with one unsealed transfer printed mempool 1, height 0, and committed 0. The file bytes were unchanged. --status does not seal. There is no discovery. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-mempool.log").write_bytes(
    (header + body).encode("utf-8")
)
