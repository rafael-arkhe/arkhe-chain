from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790602.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 89 passed, 0 failed, 0 ignored, 0 doc-tests.
The count is unchanged. A node with a file now writes AKGCHNS8 when sync stops at 128 headers. Reopening that file resumes the walk. The linking import clears the cursor and the file returns to AKGCHNS7. A node without a file still keeps the cursor in memory. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-resume.log").write_bytes(
    (header + body).encode("utf-8")
)
