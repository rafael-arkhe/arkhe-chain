from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790671.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 149 passed, 0 failed, 0 ignored, 0 doc-tests.
A transaction reply does not dial. With named peers the transaction stays in the mempool. The next pass seals once a peer answers. With no named peers the reply still waits for the seal. Equivocation and a different genesis still fail the pass. There is no discovery and no CanonicalVote. The previous log is gate-2026-11-10-wait-seal.log, with 148 tests.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-reply-next.log").write_bytes(
    (header + body).encode("utf-8")
)
