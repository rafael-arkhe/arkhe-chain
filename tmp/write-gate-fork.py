from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790624.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 116 passed, 0 failed, 0 ignored, 0 doc-tests.
This run prints forks N from --status --data. A chain with one stored sibling printed forks 1, height 1, and the previous tip. The file bytes were unchanged. A sibling does not replace the tip. There is no discovery. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-fork.log").write_bytes(
    (header + body).encode("utf-8")
)
