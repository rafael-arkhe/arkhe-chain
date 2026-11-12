from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790635.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 125 passed, 0 failed, 0 ignored, 0 doc-tests.
This run dials a peer whose genesis BLAKE3 differs. When the chain file was created by that start, FAIL_CLOSED: P2P: genesis removes the file. When the file already existed, the same error leaves the bytes unchanged. There is no discovery and no CanonicalVote. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-fresh-dial.log").write_bytes(
    (header + body).encode("utf-8")
)
