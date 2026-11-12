from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790629.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 120 passed, 0 failed, 0 ignored, 0 doc-tests.
This run prints the stored genesis BLAKE3 from --status and from the listen status. Comments and uppercase hex do not change that hash. A file with the 32-byte trailer removed prints genesis absent. Neither read rewrote the file. There is no discovery and no CanonicalVote. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-status-genesis.log").write_bytes(
    (header + body).encode("utf-8")
)
