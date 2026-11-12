from pathlib import Path

term = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790572.txt").read_text(encoding="utf-8")
body = term[term.index("USER=") : term.index("\n---\nexit_code")].strip() + "\n"
header = """Reexecution: WSL2 Ubuntu, user arkhen, uid 1000, host DESKTOP-G1BRFD4.
Same physical machine as the Windows workspace D:\\arkhe. Not a second person.
Tree: /home/arkhen/arkhe-chain-rerun. Overlay of the unpublished working tree on the published vendor snapshot. Not commit 105101c0.
Command: cargo test -p arkhe-chain --no-fail-fast
Date: 2026-11-09T22:54:30Z
Exit: 101
Result: 78 passed, 1 failed, 1 ignored, 0 doc-tests.
Failure: sync_keeps_the_cursor_past_1024_headers returned P2p("timeout"). The 30s sync budget did not import 1025 blocks in this debug run.
An earlier run in the same hour, while container images were downloading, failed the same test and stopped at that binary.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-wsl-arkhen-2026-11-09.log").write_bytes(
    (header + body).encode("utf-8")
)
