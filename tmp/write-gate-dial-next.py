from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790663.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 142 passed, 0 failed, 0 ignored, 0 doc-tests.
A refused dial does not hide the next named peer that extends the local tip and does not wait 30 seconds. Alone, that peer still returns P2p("dial-failure") and stores nothing. The vote follows the intact peer. The 30 second limit remains when a dial yields no error. There is no discovery and no CanonicalVote. The previous log is gate-2026-11-10-outsider-next.log, with 141 tests.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-dial-next.log").write_bytes(
    (header + body).encode("utf-8")
)
