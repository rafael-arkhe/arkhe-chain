from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790598.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 87 passed, 0 failed, 0 ignored, 0 doc-tests.
The former ignored test is gone. an_http_execution_client_confirms_without_settling talks to a local JSON-RPC and confirms through HttpExecutionRpc. settled stays false and the confirmation is not stored. This is not a public chain and not geth.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-zero-ignored.log").write_bytes(
    (header + body).encode("utf-8")
)
