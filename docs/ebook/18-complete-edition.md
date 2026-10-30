# Edição completa ampliada — entrega

Entregue em 22/10/2026, em inglês americano: **cerca de 49 mil palavras**, contadas por
separação em espaços, incluindo código, títulos e bibliografia. São 17 capítulos,
cinco partes temáticas e uma sexta parte com quatro apêndices. As partes antigas
foram preservadas; a edição completa incorpora duas ampliações por capítulo,
casos concretos, decisões de implementação e respostas comentadas dos 17 exercícios.

## Arquivos

- [EPUB completo](dist/arkhe-complete-en.epub)
- [HTML completo](dist/arkhe-complete-en.html)
- [Manuscrito integral editável](manuscrito/arkhe-complete.en.md)
- [Fontes e laboratório em ZIP](dist/arkhe-complete-en-source.zip)
- [Pesquisa e verificação de alegações](17-research-audit.en.md)

## Pesquisa e desenvolvimento

A nova pesquisa distingue RFC publicado, Internet-Draft individual, artigo de
pesquisa e alegação do mantenedor. As propostas recentes de recibos de execução
não são apresentadas como padrões aprovados. Contratos com provas, verificação
de execução, assinaturas pós-quânticas e linhagem de memória são discutidos com
seus pressupostos e limites, sem atribuir implementações inexistentes ao Arkhe.
As referências primárias e seus estados estão na auditoria vinculada acima.

O laboratório original em `lab/` acompanha o livro: autorização, limites de
custo, adulteração, replay, falha entre efeito e confirmação, linhagem de memória
e cadeia de eventos. Usa somente a biblioteca padrão Python, dois bancos locais
e dados sintéticos. Seu HMAC de demonstração não é assinatura pública; seu
protocolo não é o protocolo nativo do Arkhe. Não houve chamada externa nem deploy.

## Verificações realizadas

- 27 testes do laboratório executados e aprovados nesta tarefa.
- EPUBCheck 5.4.0: zero erros fatais, erros ou advertências.
- XML, manifesto, spine, idioma en-US e capa incorporada verificados.
- 17 capítulos, quatro apêndices, 17 exercícios e 17 respostas confirmados.
- 343 links internos do HTML conferidos, sem destinos ausentes.
- Manifesto de hashes dos insumos e relatório de montagem preservados.

Evidências: [montagem](evidence/build-report-complete-en.json),
[EPUBCheck](evidence/epubcheck-complete-en.log),
[conferência editorial estrutural](evidence/editorial-qa-complete-en.json) e
[demonstração](evidence/publisher-demo.json).
Os resultados nativos nas partes anteriores são históricos; não foram repetidos
nem somados aos 27 testes novos como se fossem uma nova execução única.

## Reprodução

Na raiz do repositório:

```powershell
python -m unittest discover -s docs/ebook/lab -v
python docs/ebook/lab/publisher.py --output docs/ebook/evidence/publisher-demo.json
python docs/ebook/build_complete.py
```

Python e Pandoc são necessários. O build usa EPUBCheck quando o JAR e Java estão
disponíveis; o relatório registra se a validação foi executada. As ferramentas
de terceiros e o repositório nativo não são redistribuídos dentro do ZIP editorial.

## Fechamento para publicação

O conteúdo integral está entregue. Autor informado: **Rafael Oliveira**, incluído
no manuscrito e nos metadados HTML/EPUB. Permanecem a confirmação de direitos,
o aceite editorial do responsável e a inspeção no Kindle Previewer. EPUBCheck
não confirma aceitação pelo KDP nem qualidade visual em todos os dispositivos.
A inspeção visual automatizada local não foi realizada: a política do navegador
recusou navegação `file:`; a conferência continuou por análise estática, sem contornar
o bloqueio. Não houve publicação ou upload. A sanitização editorial conserva
nomes necessários nas fontes e identificadores literais, sem alegar liberação
jurídica de marcas.
