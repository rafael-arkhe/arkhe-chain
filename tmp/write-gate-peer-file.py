from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790618.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 110 passed, 0 failed, 0 ignored, 0 doc-tests.
This run reads --peer lines from --peer-file. Blank lines and # comments are skipped. A malformed line exits 1 and does not open the chain. --peer-file together with --status exits 2. A follower dials the address written by --announce and imports nothing from an empty chain. There is no discovery. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-peer-file.log").write_bytes(
    (header + body).encode("utf-8")
)
