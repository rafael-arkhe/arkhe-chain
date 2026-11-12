from pathlib import Path
path = Path(r"D:\arkhe\kernel\arkhe-chain\tests\block_sync.rs")
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
del lines[906:988]
path.write_bytes("".join(lines).encode("utf-8"))
print(len(lines))
