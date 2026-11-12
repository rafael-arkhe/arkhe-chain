from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790606.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 98 passed, 0 failed, 0 ignored, 0 doc-tests.
This run returns the receiver's own v4 precommit when the incoming vote is stored. The sender stores its own verified vote before dialing, stores the returned vote, and both sides record the next height. A receiver with no vote returns none, and neither side commits. A refused vote carries no echo. The tip hash does not change. There is no CanonicalVote and no discovery. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-echo.log").write_bytes(
    (header + body).encode("utf-8")
)
