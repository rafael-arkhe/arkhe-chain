from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790675.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 151 passed, 0 failed, 0 ignored, 0 doc-tests.
Announcing the local tip without its block does not release the next seal. The zero tip has no body. When the peer returns that block, the next pass seals the block above it. A sibling is not behind. Equivocation and a different genesis still fail the pass. There is no discovery and no CanonicalVote. The previous log is gate-2026-11-10-behind-seal.log, also 151 tests, from the run that accepted a bare tip announcement.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-tip-body.log").write_bytes(
    (header + body).encode("utf-8")
)
