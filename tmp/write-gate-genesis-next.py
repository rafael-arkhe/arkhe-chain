from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790653.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 135 passed, 0 failed, 0 ignored, 0 doc-tests.
A different genesis does not hide the next named peer that extends the local tip. Alone, that peer still returns P2p("genesis") and imports nothing. The vote follows the peer on the same genesis. The local vote stays when every named peer has a different genesis. Equivocation still stops the list. There is no discovery and no CanonicalVote. The 30 second budget was not changed. The previous log is gate-2026-11-10-timeout-next.log, with 134 tests.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-genesis-next.log").write_bytes(
    (header + body).encode("utf-8")
)
