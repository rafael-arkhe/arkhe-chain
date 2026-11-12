from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790612.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 104 passed, 0 failed, 0 ignored, 0 doc-tests.
This run seals each accepted transaction from a named peer. The first block uses the given timestamp. The next block uses the parent timestamp plus one. When a vote is stored, the receiver signs round 0 of the canonical height if it had not voted, and after the quorum advances it signs the following height when that block exists. Two submitted transfers produce height 2, committed height 2, and the second header timestamp is the first plus one. The tip hash is that second block. There is no CanonicalVote and no discovery. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-second.log").write_bytes(
    (header + body).encode("utf-8")
)
