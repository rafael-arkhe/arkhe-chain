from pathlib import Path
for path in [
    Path(r"D:\arkhe\kernel\arkhe-chain\docs\sincronizacao.md"),
    Path(r"D:\arkhe\kernel\arkhe-chain\docs\homologacao.md"),
]:
    text = path.read_text(encoding="utf-8")
    indices = [i for i in range(len(text)) if text.startswith("connection-closed", i)]
    print(path.name, indices)
    for i in indices:
        print(text[i:i+160].replace("\n", " "))
        print("---")
