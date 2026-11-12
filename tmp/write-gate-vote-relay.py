from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790650.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 133 passed, 0 failed, 0 ignored, 0 doc-tests.
Votes learned from named peers are forwarded to that same list. With three validators, the third records the vote it did not hear directly. All three commit the height. The tip hash does not change. Two votes among three do not commit. There is no CanonicalVote. The 30 second budget was not changed. The previous log is gate-2026-11-10-missing-body.log, with 132 tests.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-vote-relay.log").write_bytes(
    (header + body).encode("utf-8")
)
