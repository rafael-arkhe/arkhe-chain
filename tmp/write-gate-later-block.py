from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790698.txt")
text = src.read_text(encoding="utf-8")
body = text.split("Finished `test`", 1)[1]
body = "    Finished `test`" + body
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = (
    "Uma altura que não confirma não esconde o bloco seguinte. O voto desse bloco é enviado. "
    "A ponta não muda. A altura confirmada permanece. "
    "Dois votos entre três continuam sem quórum: bft_commit devolve QuorumAbsent. "
    "Com quórum na altura posterior, bft_commit devolve CommitGap e a altura confirmada permanece. "
    "O arquivo foi escrito depois da execução. Os fontes testados não incluem este arquivo.\n\n"
)
out = Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-later-block.log")
out.write_bytes((header + body).encode("utf-8"))
print(out, out.stat().st_size)
