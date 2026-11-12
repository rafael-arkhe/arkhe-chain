from pathlib import Path

term = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790583.txt").read_text(encoding="utf-8")
body = term[term.index("USER=") : term.index("\n---\nexit_code")].strip() + "\n"
header = """Reexecution: WSL2 Ubuntu, user arkhen, uid 1000, host DESKTOP-G1BRFD4.
Same physical machine as the Windows workspace D:\\arkhe. Not a second person.
Tree: /home/arkhen/arkhe-chain-rerun with src/p2p.rs from the unpublished working tree.
The retained sync bodies are included. The 30 second budget was not changed.
This is not commit fb22f02a.
Command: cargo test -p arkhe-chain --no-fail-fast
Date: 2026-11-10T11:07:22Z
Exit: 0
Result: 79 passed, 0 failed, 1 ignored, 0 doc-tests.
The ignored test is a_live_execution_client_confirms_without_settling. It was not run.
The 9 November run of this account failed the 1025-block sync before bodies were retained.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-wsl-arkhen-2026-11-10.log").write_bytes(
    (header + body).encode("utf-8")
)
