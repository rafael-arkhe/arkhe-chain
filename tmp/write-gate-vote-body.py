from pathlib import Path

src = Path(r"C:\Users\Lemes\.cursor\projects\d-arkhe\terminals\790704.txt")
text = src.read_text(encoding="utf-8")
body = text.split("Finished `test`", 1)[1]
body = "    Finished `test`" + body
body = body.split("\n---", 1)[0].rstrip() + "\n"
header = (
    "Um corpo que não deixa 4096 bytes para o envelope dentro do pedido de 1 MiB fica de fora. "
    "O voto segue sem esse corpo. Um corpo de 1 MiB inteiro também fica de fora. "
    "Um corpo do tamanho do orçamento entra no pedido. "
    "O arquivo foi escrito depois da execução. Os fontes testados não incluem este arquivo.\n\n"
)
out = Path(r"D:\arkhe\kernel\arkhe-chain\docs\gate-2026-11-10-vote-body.log")
out.write_bytes((header + body).encode("utf-8"))
print(out, out.stat().st_size)
