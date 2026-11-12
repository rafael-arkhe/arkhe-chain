from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790634.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 124 passed, 0 failed, 0 ignored, 0 doc-tests.
This run writes the listen address and a # genesis line. A peer file with a different BLAKE3 returns FAIL_CLOSED: GENESIS and does not create the chain file. Two different genesis lines return FAIL_CLOSED: MALFORMED and do not create the file. The same hash still starts. There is no discovery and no CanonicalVote. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-announce-genesis.log").write_bytes(
    (header + body).encode("utf-8")
)
