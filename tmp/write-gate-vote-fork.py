from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790645.txt").read_text(
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
A sibling carried in a vote is stored as Fork and does not replace the tip. The fork answer does not end the process. A body that skips a height stays unknown and stores nothing. Equivocation still stops the process. There is no discovery and no CanonicalVote. The 30 second budget was not changed. The previous log, gate-2026-11-10-vote-block.log, said a body that does not extend the tip stores no sibling.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-vote-fork.log").write_bytes(
    (header + body).encode("utf-8")
)
