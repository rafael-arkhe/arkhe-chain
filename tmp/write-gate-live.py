from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790622.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 114 passed, 0 failed, 0 ignored, 0 doc-tests.
This run prints height, committed height, tip, and mempool after the listen line. An empty --once chain printed height 0, committed 0, a tip of 64 zero hex digits, and mempool 0. A process holding one unsealed transfer reported mempool 1 and height 0 from memory. The same four values do not print again. A change prints once. This is not a new consensus round. There is no discovery. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-live.log").write_bytes(
    (header + body).encode("utf-8")
)
