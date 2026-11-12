from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790652.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 134 passed, 0 failed, 0 ignored, 0 doc-tests.
A peer that does not answer within 30 seconds does not hide the next named peer that extends the local tip. Alone, that peer still returns P2p("timeout"). The same timeout does not stop the vote: the answering peer records it, and the local vote stays. Equivocation, a different genesis, and every other error still stop the list. There is no discovery and no CanonicalVote. The 30 second budget was not changed. The previous log is gate-2026-11-10-vote-relay.log, with 133 tests.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-timeout-next.log").write_bytes(
    (header + body).encode("utf-8")
)
