from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790665.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 143 passed, 0 failed, 0 ignored, 0 doc-tests.
A connection that closes during the request does not hide the next named peer that extends the local tip. Alone, that peer still returns P2p("connection-closed") and stores nothing. The vote follows the intact peer. The 30 second limit remains when a dial yields no error. There is no discovery and no CanonicalVote. The previous log is gate-2026-11-10-dial-next.log, with 142 tests.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-closed-next.log").write_bytes(
    (header + body).encode("utf-8")
)
