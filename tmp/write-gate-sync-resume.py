from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790655.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 136 passed, 0 failed, 0 ignored, 0 doc-tests.
A walk that stops after 128 headers does not end the operator. The cursor stays in AKGCHNS8. The next call imports the chain and commits the heights. The tip hash does not change. There is no discovery and no CanonicalVote. The 30 second budget was not changed. The previous log is gate-2026-11-10-genesis-next.log, with 135 tests.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-sync-resume.log").write_bytes(
    (header + body).encode("utf-8")
)
