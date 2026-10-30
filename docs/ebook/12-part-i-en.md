# Part I — edição de trabalho em inglês americano

Texto completo: [Markdown](manuscrito/00-part-i.en.md),
[HTML](dist/arkhe-part-i-en.html), [EPUB](dist/arkhe-part-i-en.epub).

Inclui sumário completo, seleção de fontes, 19 referências, preliminares e os
capítulos 1–3. A narrativa usa um cenário fictício de publicação de documentos;
as tabelas e controles são propostas de engenharia, não funcionalidades declaradas
como implementadas. As observações sobre código indicam os arquivos inspecionados.

Cada capítulo contém exercício, entrega esperada, rejeição relevante e limites.
Não houve nova execução de testes do produto para esta entrega de prosa. A
validação de empacotamento está em
[build-report-part-i-en.json](evidence/build-report-part-i-en.json).
EPUBCheck e Kindle Previewer continuam pendentes. Autoria/licença e revisão humana
continuam necessárias para a edição final. O orçamento anterior de palavras por
capítulo é meta editorial; a extensão real desta primeira redação consta no relatório.

Build:

```powershell
python docs/ebook/build.py --lang en-US --section part-i
```
