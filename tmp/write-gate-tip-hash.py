from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790600.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 89 passed, 0 failed, 0 ignored, 0 doc-tests.
This run adds a_short_announced_tip_is_refused and a_body_that_does_not_match_its_hash_is_refused. A tip that is not 32 bytes is P2p("tip"). A body whose hash is not the requested hash is P2p("hash"). Neither imports a block. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-tip-hash.log").write_bytes(
    (header + body).encode("utf-8")
)
