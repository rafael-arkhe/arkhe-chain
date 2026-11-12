from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790630.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 121 passed, 0 failed, 0 ignored, 0 doc-tests.
This run checks a chain file against a genesis text with --status --genesis. A comment and uppercase hex still match the stored BLAKE3. An extra validator returns FAIL_CLOSED: GENESIS and leaves the file bytes unchanged. A file with the 32-byte trailer removed also returns GENESIS and is not rewritten. There is no discovery and no CanonicalVote. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-status-check.log").write_bytes(
    (header + body).encode("utf-8")
)
