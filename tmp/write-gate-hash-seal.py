from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790680.txt")
text = src.read_text(encoding="utf-8")
body = text.split("Finished `test`", 1)[1]
body = "    Finished `test`" + body
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = (
    "Um corpo cujo hash nao confere encerra a passagem mesmo quando outro par nomeado respondeu. "
    "O bloco desse par permanece importado. A transacao local nao e selada. "
    "O arquivo foi escrito depois da execucao. Os fontes testados nao incluem este arquivo.\n\n"
)
# Keep the Portuguese wording with accents in the header.
header = (
    "Um corpo cujo hash não confere encerra a passagem mesmo quando outro par nomeado respondeu. "
    "O bloco desse par permanece importado. A transação local não é selada. "
    "O arquivo foi escrito depois da execução. Os fontes testados não incluem este arquivo.\n\n"
)
out = Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-hash-seal.log")
out.write_bytes((header + body).encode("utf-8"))
print(out, out.stat().st_size)
