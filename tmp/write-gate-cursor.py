from pathlib import Path

term = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790584.txt").read_text(encoding="utf-8")
start = term.index("    Finished `test` profile")
body = term[start : term.index("\n---\nexit_code")].strip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 81 passed, 0 failed, 1 ignored, 0 doc-tests.
The ignored test is a_live_execution_client_confirms_without_settling. It was not run.
This run adds the two cursor tests to the earlier 79-test log. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-cursor.log").write_bytes(
    (header + body).encode("utf-8")
)
