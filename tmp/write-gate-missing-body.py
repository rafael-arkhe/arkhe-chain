from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790649.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 132 passed, 0 failed, 0 ignored, 0 doc-tests.
A missing block body is P2p("fork") and does not hide the next named peer that extends the local tip. Alone, that peer still returns P2p("fork") and stores nothing. After a later peer imports, a following missing body does not turn the call into an error. Equivocation, the timeout, a different genesis, and every other error still stop the list. There is no discovery and no CanonicalVote. The 30 second budget was not changed. The previous log is gate-2026-11-10-longer-extension.log, with 131 tests.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-missing-body.log").write_bytes(
    (header + body).encode("utf-8")
)
