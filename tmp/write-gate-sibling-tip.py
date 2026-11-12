from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790646.txt").read_text(
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
A sibling tip is stored as Fork and the sync call returns 0. The local tip stays. The next sealed block extends that canonical tip, and the sibling remains. A missing body is still P2p("fork"). Equivocation still stops the call. There is no discovery and no CanonicalVote. The 30 second budget was not changed. The previous log, gate-2026-11-10-vote-fork.log, still treated a sibling tip as an error that stops the peer list.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-sibling-tip.log").write_bytes(
    (header + body).encode("utf-8")
)
