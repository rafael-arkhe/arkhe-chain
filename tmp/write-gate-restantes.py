from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790591.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 85 passed, 0 failed, 1 ignored, 0 doc-tests.
The ignored test is a_live_execution_client_confirms_without_settling. It was not run.
This run adds four tests to the 81-test log: a zero-value transfer, the HTTP execution client, the mempool of 1000 distinct senders, and a sync that stops after 30 seconds on an unanswered address. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-restantes.log").write_bytes(
    (header + body).encode("utf-8")
)
