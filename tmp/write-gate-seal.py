from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790608.txt").read_text(
    encoding="utf-8"
)
marker = "Finished `test`"
body = marker + src.split(marker, 1)[1]
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = """Command: cargo test -p arkhe-chain
Workspace: D:\\arkhe
Date: 2026-11-10
Exit: 0
Result: 102 passed, 0 failed, 0 ignored, 0 doc-tests.
This run lets arkhe-chain ingest a length-prefixed transaction list and, with --seal and --time together, seal one block after sync. A named peer then syncs that block and both record height 1. --seal without --time exits 2. A short tail is malformed and leaves the earlier transaction in the mempool. Two sealing processes can fork. The process does not choose a proposer. The tip of the sealer is the block it sealed. The 30 second budget was not changed. There is no CanonicalVote and no discovery.
This log was written after the run. The tested sources did not include this file.

"""
Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-seal.log").write_bytes(
    (header + body).encode("utf-8")
)
