from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790625.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 117 passed, 0 failed, 0 ignored, 0 doc-tests.
This run compares the named peer's genesis BLAKE3 before importing. A server with one sealed block and a client missing one account returned P2p("genesis"). The client stayed at height 0 and bob's balance stayed 0. A missing hash is the same refusal. There is no discovery. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-genesis-check.log").write_bytes(
    (header + body).encode("utf-8")
)
