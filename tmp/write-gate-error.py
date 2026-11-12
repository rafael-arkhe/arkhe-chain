from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790620.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 112 passed, 0 failed, 0 ignored, 0 doc-tests.
This run prints the chain error before exit 1. --status on a missing file printed FAIL_CLOSED: SNAPSHOT and did not create the file. A malformed --peer-file printed FAIL_CLOSED: MALFORMED and did not open the chain. --announce to a directory printed FAIL_CLOSED: SNAPSHOT and exited 1. --status without --data exited 2 with empty stderr. There is no discovery. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-error.log").write_bytes(
    (header + body).encode("utf-8")
)
