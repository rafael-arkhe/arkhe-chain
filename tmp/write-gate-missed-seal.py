from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790672.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 150 passed, 0 failed, 0 ignored, 0 doc-tests.
A seal waits until this pass has heard every named peer. A peer that was not reached does not let another answer seal. The transaction stays in the mempool and no block is produced. A peer that answered with a fork is not a missed peer. Equivocation and a different genesis still fail the pass. There is no discovery and no CanonicalVote. The previous log is gate-2026-11-10-reply-next.log, with 149 tests.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-missed-seal.log").write_bytes(
    (header + body).encode("utf-8")
)
