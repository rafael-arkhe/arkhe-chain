from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790613.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 105 passed, 0 failed, 0 ignored, 0 doc-tests.
This run adds catch_up. A process that stays up dials its named peers again and signs round 0 of a height that appeared after startup. The test submits one transaction after both processes are listening. The follower then imports that block and both record height 1. An empty catch-up before the transaction returns 0. Without --once, the process repeats that pass every second and exits 1 if the pass fails. This is not a new round. There is no CanonicalVote and no discovery. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-catch.log").write_bytes(
    (header + body).encode("utf-8")
)
