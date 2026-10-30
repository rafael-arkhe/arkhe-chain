# Projeto editorial Arkhe

**Arkhe: evidência e governança para agentes de IA**  
Manual de implementação com certificados verificáveis, políticas e limites de confiança.

Documentação editorial em português brasileiro; manuscrito principal em inglês
americano. Edição de trabalho: 0.3, 22/10/2026.

## Edição completa ampliada

Para impressão: [arquivos, configurações KDP e verificação dos PDFs](19-print-edition.md).

**Cerca de 49 mil palavras, 17 capítulos e quatro apêndices em en-US.**

- [EPUB completo](dist/arkhe-complete-en.epub)
- [Leitura em HTML](dist/arkhe-complete-en.html)
- [Manuscrito integral](manuscrito/arkhe-complete.en.md)
- [Pacote de fontes e laboratório](dist/arkhe-complete-en-source.zip)
- [Entrega, verificações e pendências editoriais](18-complete-edition.md)
- [Auditoria da pesquisa externa](17-research-audit.en.md)

## Entregas anteriores e documentação

- **Part I em inglês, redigida:** [HTML](dist/arkhe-part-i-en.html), [EPUB](dist/arkhe-part-i-en.epub) e [Markdown](manuscrito/00-part-i.en.md), com fontes, preliminares e capítulos 1–3.
- **Part II em inglês, redigida:** [HTML](dist/arkhe-part-ii-en.html), [EPUB](dist/arkhe-part-ii-en.epub) e [Markdown](manuscrito/00-part-ii.en.md), com capítulos 4–7 e [validação](13-part-ii-en.md).
- **Part III em inglês, redigida:** [HTML](dist/arkhe-part-iii-en.html), [EPUB](dist/arkhe-part-iii-en.epub) e [Markdown](manuscrito/00-part-iii.en.md), com capítulos 8–11 e [validação](14-part-iii-en.md).
- **Part IV em inglês, redigida:** [HTML](dist/arkhe-part-iv-en.html), [EPUB](dist/arkhe-part-iv-en.epub) e [Markdown](manuscrito/00-part-iv.en.md), com capítulos 12–14 e [validação](15-part-iv-en.md).
- **Part V em inglês, redigida:** [HTML](dist/arkhe-part-v-en.html), [EPUB](dist/arkhe-part-v-en.epub) e [Markdown](manuscrito/00-part-v.en.md), com capítulos 15–17 e [validação](16-part-v-en.md).
- [Revisão da proposta e verificação dos dados](01-revisao-e-dados.md).
- [Projeto editorial, sumário e produção](02-projeto-editorial.md).
- [Capítulo de amostra completo](manuscrito/07-do-resultado-a-autorizacao.md).
- [Matriz entre capítulos e código](03-matriz-tecnica.md).
- [Comercialização e experimento de demanda](04-comercializacao.md).
- [Fontes externas consultadas](05-fontes.md).
- [Registro de reprodução e limites de validação](06-validacao.md).
- [Checklist de publicação](07-publicacao.md).
- [Descrições em inglês para o KDP](08-descricao-kdp.md), com HTML da amostra e rascunho do livro completo.
- [Capa em inglês](09-capa.md), com JPEG para upload e original PNG.
- [Sumário completo e bibliografia técnica pesquisada](10-sumario-e-fontes.md), com 17 capítulos e referências por capítulo.
- [Sanitização editorial de nomes](11-sanitizacao-de-nomes.md), com política de referências e palavras-chave revisadas.
- [Prévia HTML](dist/arkhe-amostra.html) e [EPUB da amostra](dist/arkhe-amostra.epub).
- Amostra em inglês: [HTML](dist/arkhe-sample-en.html), [EPUB](dist/arkhe-sample-en.epub) e [Markdown](manuscrito/07-from-output-to-authorization.en.md).

A edição completa amplia os capítulos 1–17 e inclui os quatro apêndices. As partes
individuais acima são versões anteriores preservadas, não a edição ampliada.
Não foi realizada publicação, inscrição no Select, abertura de pré-venda nem
envio a contatos. Os preços são hipóteses de teste.

## Reprodução da edição

Na raiz do repositório:

```powershell
python docs/ebook/build_complete.py
python -m unittest discover -s docs/ebook/lab -v
python docs/ebook/build.py
python docs/ebook/build.py --lang en-US
python docs/ebook/build.py --lang en-US --section part-i
python docs/ebook/build.py --lang en-US --section part-ii
python docs/ebook/build.py --lang en-US --section part-iii
python docs/ebook/build.py --lang en-US --section part-iv
python docs/ebook/build.py --lang en-US --section part-v
cargo run --locked -p arkhe-kernel --example budget_pco
cargo test --locked -p arkhe-kernel --test budget_pco --test rejection_gates
```

O build requer Python e Pandoc no PATH; não usa bibliotecas Python externas.
O EPUB completo passou no EPUBCheck 5.4.0. A inspeção no Kindle Previewer
e o fechamento editorial pelo responsável permanecem pendentes.
Autor da edição completa: **Rafael Oliveira**. Os direitos e o expediente
deverão ser confirmados antes da publicação.

## Convenção editorial

Toda afirmação deve ser identificável como fato externo com fonte, comportamento
local reproduzido, implementação inspecionada, hipótese comercial ou trabalho
futuro. Especificação, teste sintético e operação real recebem qualificações
distintas. Nenhuma designação de confiança substitui referência e procedimento
de verificação.
