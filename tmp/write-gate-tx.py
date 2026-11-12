from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790610.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 103 passed, 0 failed, 0 ignored, 0 doc-tests.
This run sends one transaction on /arkhe/tx/1 to a named validator. An outsider is refused before dialing. A transaction that does not decode is Malformed and is not stored. A sealer started with --seal and --time and no local transactions seals the first accepted transaction once, then the sender syncs that block and both record height 1. The process does not choose a proposer. Two sealers can still fork. The 30 second budget was not changed. There is no CanonicalVote and no discovery.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-tx.log").write_bytes(
    (header + body).encode("utf-8")
)
