from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790678.txt").read_text(
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
A body that does not match the local tip does not release the next seal and does not stop the pass. Nothing from that body is stored. When the peer later returns the matching block, the next pass seals the block above it. The zero tip has no body. Equivocation and a different genesis still fail the pass. There is no discovery and no CanonicalVote. The previous log is gate-2026-11-10-tip-body.log, also 151 tests.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-tip-mismatch.log").write_bytes(
    (header + body).encode("utf-8")
)
