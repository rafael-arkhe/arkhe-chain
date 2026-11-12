from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790639.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 127 passed, 0 failed, 0 ignored, 0 doc-tests.
A peer whose announced tip is already a canonical block on this node returns 0. The local tip stays, no sibling is stored, and this call does not extend the peer. A sibling is still P2p("fork"). There is no discovery and no CanonicalVote. The 30 second budget was not changed. The previous log is gate-2026-11-10-vote-behind.log, with 126 tests.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-shorter-peer.log").write_bytes(
    (header + body).encode("utf-8")
)
