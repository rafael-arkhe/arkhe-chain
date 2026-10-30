# Edição para impressão — correção de arquivos KDP

## Correção posterior: dimensões exigidas pelo KDP

O usuário informou que a configuração em uso exige **14,250 × 10,417 polegadas**.
Para essa configuração, usar `D:/arkhe/output/pdf/arkhe-hardcover-cover-14.250x10.417.pdf`,
não a capa comum abaixo. O novo PDF tem exatamente essas dimensões, texto e
geometria vetoriais, fontes incorporadas e fundo estendido por toda a página.
O miolo de 216 páginas permanece o mesmo. A altura é compatível com capa dura
de miolo 6 × 9; essa configuração foi inferida, sem acesso à conta.

A calculadora oficial foi consultada com capa dura, papel branco, preto e branco,
6 × 9 e 216 páginas, mas manteve o botão de cálculo desabilitado. Por isso, as
dimensões externas seguem o erro informado pelo usuário; o posicionamento interno
das dobras é nominal e precisa ser conferido no pré-visualizador ou modelo oficial.
Não se afirma que houve validação de upload ou comparação com um modelo baixado.
Ver [relatório específico](evidence/hardcover-cover-qa.json) e
[requisitos de capa dura](https://kdp.amazon.com/en_US/help/topic/GDTKFJPNQCBTMRV6).

## Arquivos corretos e configuração correspondente

- Miolo: `D:/arkhe/output/pdf/arkhe-paperback-interior-6x9.pdf`
- Capa aberta: `D:/arkhe/output/pdf/arkhe-paperback-cover-6x9-white.pdf`

Selecionar no KDP **capa comum, 6 × 9 polegadas (15,24 × 22,86 cm),
miolo preto e branco, papel branco, sem sangria no miolo**. O PDF contém
216 páginas, incluindo uma página final vazia para completar o total par.
O acabamento da capa pode ser fosco ou brilhante, sem alterar as dimensões.

Essas são escolhas editoriais adotadas nesta correção porque as opções anteriores
não foram informadas. Este par de arquivos substitui a configuração anterior:
não deve ser enviado mantendo a expectativa antiga de 14,813 × 10,417 polegadas.
Papel creme, capa dura ou outra dimensão exigem recalcular a capa.

## Alterações

O miolo foi diagramado a partir do mesmo manuscrito integral que gerou o EPUB,
com texto selecionável, sumário com páginas, 23 tabelas e 36 blocos de código.
Não é uma impressão automática da versão HTML nem uma redução das páginas
produzidas pelo KDP. As referências incluem seus endereços impressos. Linhas de
código longas quebram visualmente; os arquivos do laboratório conservam o código
executável. As margens laterais são 0,875 polegada em ambos os lados, e as
superior/inferior são 0,75 polegada. O corpo tem 10 pontos, código e tabelas 8.

A capa é um novo projeto vetorial de uma página, com contracapa, lombada,
frente e autor Rafael Oliveira. A imagem frontal anterior de 992 × 1586 pixels
não foi ampliada para simular resolução de impressão. Há área branca vazia
de 2 × 1,2 polegada para o código de barras gerado pelo KDP; não foi inventado ISBN.

Cálculo para 216 páginas em papel branco e impressão preta:

```
lombada = 216 × 0,002252 = 0,486432 polegada
largura total = 0,125 + 6 + 0,486432 + 6 + 0,125 = 12,736432 polegadas
altura total = 0,125 + 9 + 0,125 = 9,25 polegadas
```

As fórmulas e condições são as publicadas nos
[requisitos de capa comum do KDP](https://kdp.amazon.com/en_US/help/topic/G201953020).
O espaço do código segue as
[orientações de códigos de barras](https://kdp.amazon.com/pt_BR/help/topic/G5HDYGP4BXLX4RUW).

## Verificação e limites

Conferência automatizada em todas as páginas dos dois PDFs: nenhum caractere
fora dos limites; todas as fontes incorporadas; sem criptografia, anotações
ou marcadores de navegação PDF. Capa sem imagem rasterizada ou transparência.
Conferência visual por amostragem de capa, sumário, texto, código, tabela e
referências. A paginação antiga de 423 páginas não corresponde à nova edição.

Relatórios: [montagem](evidence/print-build-report.json) e
[preflight](evidence/print-qa.json). Scripts: `build_print.py` e `check_print.py`,
com Python, ReportLab, pypdf, pdfplumber, Pandoc e as fontes indicadas no código.

Não houve acesso à conta, alteração das opções do KDP ou novo upload. Portanto,
a correção local está concluída, mas a aceitação do KDP ainda não foi verificada.
Enviar estes dois PDFs juntos, aplicar a configuração acima e conferir novamente
o Pré-visualizador de livros impressos, inclusive o posicionamento do código de
barras. O EPUB existente continua sendo o arquivo da edição Kindle.
