from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790596.txt").read_text(
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
This run keeps the 85-test count. The execution client now speaks HTTPS with the system trust store and reads a chunked body. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-https.log").write_bytes(
    (header + body).encode("utf-8")
)
