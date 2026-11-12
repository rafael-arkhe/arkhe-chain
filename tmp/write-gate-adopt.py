from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790631.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 122 passed, 0 failed, 0 ignored, 0 doc-tests.
This run starts the process on a file it just created, then again on the same file. A different genesis text returns FAIL_CLOSED: GENESIS and leaves the bytes unchanged. Removing the 32-byte trailer also returns GENESIS, and the process does not rewrite the file. A new file is still created. ArkheNode::open still opens a file without the trailer. There is no discovery and no CanonicalVote. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-adopt.log").write_bytes(
    (header + body).encode("utf-8")
)
