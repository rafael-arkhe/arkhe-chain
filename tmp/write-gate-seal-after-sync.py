from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790636.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 126 passed, 0 failed, 0 ignored, 0 doc-tests.
This run syncs a block sealed at 1700000000 and then seals with --time 50. The next block is stored at 1700000001. The vote for that new block is refused by the peer who does not have it yet, so the process exits with FAIL_CLOSED: UNKNOWN_BLOCK. The file stays at height 2. Height 0 still uses --time. There is no discovery and no CanonicalVote. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-seal-after-sync.log").write_bytes(
    (header + body).encode("utf-8")
)
