from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790641.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 129 passed, 0 failed, 0 ignored, 0 doc-tests.
A vote refused as unknown stays on the sender. After the peer imports the block on its own dial, the same vote is stored. The sender's dial does not deliver the block. One vote does not commit the height. There is no discovery and no CanonicalVote. The 30 second budget was not changed. The previous log is gate-2026-11-10-longer-peer.log, with 128 tests.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-vote-again.log").write_bytes(
    (header + body).encode("utf-8")
)
