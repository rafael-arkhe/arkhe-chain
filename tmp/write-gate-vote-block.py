from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790644.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 129 passed, 0 failed, 0 ignored, 0 doc-tests.
A vote carries its block when the body extends the receiver's tip by one height and fits in 1 MiB. The receiver signs round 0 of that height. Two votes record the height. The tip hash does not change. A body that does not extend the tip is ignored and stores no sibling. One vote does not commit the height. There is no discovery and no CanonicalVote. The 30 second budget was not changed. The previous log, gate-2026-11-10-vote-again.log, said the sender's dial does not deliver the block.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-vote-block.log").write_bytes(
    (header + body).encode("utf-8")
)
