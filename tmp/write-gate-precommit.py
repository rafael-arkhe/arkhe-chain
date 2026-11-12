from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790605.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 97 passed, 0 failed, 0 ignored, 0 doc-tests.
This run sends one signed precommit on /arkhe/precommit/1 to a named validator. A bad signature and an unknown hash are refused and are not stored. Two votes on the canonical hash record the next height. The tip hash does not change. The sender does not store that committed height. There is no CanonicalVote and no discovery. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-precommit.log").write_bytes(
    (header + body).encode("utf-8")
)
