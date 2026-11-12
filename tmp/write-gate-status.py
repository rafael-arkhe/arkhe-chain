from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790615.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 107 passed, 0 failed, 0 ignored, 0 doc-tests.
This run reads a chain file with --status --data and prints height, committed height, and the tip. It does not rewrite the file. --status without --data exits 2. --status together with --show-peers exits 2. An empty --once chain printed height 0, committed 0, and a tip of 64 zero hex digits. There is no discovery. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-status.log").write_bytes(
    (header + body).encode("utf-8")
)
