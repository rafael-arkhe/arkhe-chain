from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790668.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 145 passed, 0 failed, 0 ignored, 0 doc-tests.
A request that is not answered within 10 seconds does not hide the next named peer that extends the local tip. Alone, that peer still returns P2p("rr-timeout") and stores nothing. The vote follows the intact peer. An idle connection now closes after 60 seconds, so it does not mask that request timeout. The 30 second limit remains when a dial yields no error. There is no discovery and no CanonicalVote. The previous log is gate-2026-11-10-malformed-next.log, with 144 tests.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-rr-timeout-next.log").write_bytes(
    (header + body).encode("utf-8")
)
