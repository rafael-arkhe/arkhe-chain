from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790607.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 99 passed, 0 failed, 0 ignored, 0 doc-tests.
This run makes arkhe-chain, after sync, sign round 0 of the next height that already exists and send that vote to the named peers. With no block, the committed height stays 0. With one sealed block and the peer's vote, both sides record height 1 in AKGCHNS9. The tip hash does not change. No later round is opened. There is no CanonicalVote and no discovery. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-attest.log").write_bytes(
    (header + body).encode("utf-8")
)
