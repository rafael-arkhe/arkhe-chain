from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790604.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 96 passed, 0 failed, 0 ignored, 0 doc-tests.
This run records the next height when bft_commit passes. A higher height first is CommitGap. The tip hash does not change. A later missing quorum does not erase the stored height. AKGCHNS9 keeps that height across reopen. There is no CanonicalVote. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-commit.log").write_bytes(
    (header + body).encode("utf-8")
)
