from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790603.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 95 passed, 0 failed, 0 ignored, 0 doc-tests.
This run adds a chosen listen address, a refused UDP bind, an ordered list of configured peers, and the arkhe-chain process. spawn_server_on binds the given address. sync_configured dials that list and does not discover peers. An empty list is P2p("empty"). The process opens a key genesis, listens, and with --once exits after writing AKGCHNS7. The 30 second budget was not changed.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-listen.log").write_bytes(
    (header + body).encode("utf-8")
)
