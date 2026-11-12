from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790694.txt")
text = src.read_text(encoding="utf-8")
body = text.split("Finished `test`", 1)[1]
body = "    Finished `test`" + body
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = (
    "Um voto recusado porque o assinante não é o proposer encerra a passagem mesmo quando outro validador aceita um voto. "
    "A ponta não muda. Sozinho, o resultado continua NotProposer. "
    "A chamada pública de atestação ainda devolve a altura confirmada quando outro validador aceita. "
    "O arquivo foi escrito depois da execução. Os fontes testados não incluem este arquivo.\n\n"
)
out = Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-vote-proposer.log")
out.write_bytes((header + body).encode("utf-8"))
print(out, out.stat().st_size)
