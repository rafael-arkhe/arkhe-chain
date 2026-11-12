from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790623.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 115 passed, 0 failed, 0 ignored, 0 doc-tests.
This run prints validators, accounts, and the BLAKE3 of the parsed genesis with --show-genesis. Comments, blank lines, and uppercase hex did not change the hash. An added validator changed it. A file with no validator printed FAIL_CLOSED: EMPTY_VALIDATORS and exited 1. --show-genesis without --genesis exited 2 with empty stderr. No chain file was opened. There is no discovery. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-genesis.log").write_bytes(
    (header + body).encode("utf-8")
)
