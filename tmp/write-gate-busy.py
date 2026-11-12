from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790633.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 123 passed, 0 failed, 0 ignored, 0 doc-tests.
This run keeps one arkhe-chain process on a data file. A second process on that file returns FAIL_CLOSED: BUSY and leaves the bytes unchanged. --status still reads height 0 while the first process holds the file. After the first process exits, a later start succeeds. The leftover .lock file does not block that start. There is no discovery and no CanonicalVote. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-busy.log").write_bytes(
    (header + body).encode("utf-8")
)
