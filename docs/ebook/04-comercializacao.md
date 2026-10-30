# Comercialização como experimento

## Oferta revisada

O produto é um manual para pessoas que precisam integrar agentes a sistemas com
autoridade de escrita. A promessa é aprender contratos, verificação, admissão e
execução com exemplos que podem ser reproduzidos. Não prometer cumprimento
automático de regulação, redução percentual de incidentes nem prova geral de LLM.

Descrição curta de trabalho:

> Como distinguir uma resposta plausível de uma proposta que seu sistema pode
> autorizar? Este manual apresenta o ambiente Arkhe por meio de contratos de
> intenção, registros de trabalho, certificados e políticas. Você acompanha um
> exemplo de código executável, entende como verificar evidência offline e aprende
> onde começam as responsabilidades do host e do executor. Os limites dos
> protótipos ficam explícitos em cada etapa.

Essa descrição representa a direção do livro. Só anunciar os capítulos e formatos
que estiverem efetivamente prontos na data de venda.

## Cenários de royalty — Amazon.com, USD

Hipóteses didáticas: imposto aplicável zero, sem price matching, sem retenções,
sem reembolsos, venda elegível, entrega de 1 MB a US$ 0,15/MB no cenário de 70%.
Reconferir arquivo convertido e condições reais no painel. Fórmulas baseadas em
[S01/S02](05-fontes.md).

| Preço | Opção | Royalty por unidade | Unidades inteiras para ≥ US$ 1.000 |
|---:|---:|---:|---:|
| US$ 12,99 | 70% | US$ 8,988, aproximadamente 8,99 | 112 |
| US$ 12,99 | 35% | US$ 4,5465, aproximadamente 4,55 | 220 |
| US$ 39,99 | 35% | US$ 13,9965, aproximadamente 14,00 | 72 |
| US$ 49,99 | 35% | US$ 17,4965, aproximadamente 17,50 | 58 |

Os tetos de unidades usam valores não arredondados. No texto original, 57 vendas
a US$ 49,99 resultam em cerca de US$ 997,30, abaixo da meta. A comparação de
US$ 12,99 a 70% com US$ 39,99 a 35% mostra maior royalty por unidade para o
segundo cenário, mas o preço maior só melhora receita por visitante se conservar
mais de aproximadamente **64,2% da conversão** do primeiro. Não há dados de
conversão do Arkhe para decidir isso agora.

Esses valores são royalties brutos do exemplo, não renda líquida do autor.
Vendas a clientes no Brasil têm requisitos próprios: 70% exige Select e preço
elegível. Os preços USD não são uma tabela de preços para Amazon.com.br.

## Escolha de canal proposta

Hipótese inicial: Amazon via KDP **sem Select** e oferta D2C separada, caso a
venda simultânea do ebook seja prioridade. Select exige exclusividade digital
no período de inscrição [S03]. Incluir código ou atualizações num pacote não
elimina a exclusividade sobre o mesmo conteúdo digital.

US$ 39,99 na Amazon e US$ 59–79 no D2C permanecem candidatos, não preços
validados. O pacote direto pode incluir EPUB, futura edição PDF, exemplos
versionados e erratas. Antes da venda, especificar o que já existe, prazo de
entrega e duração das atualizações. A tarefa atual entrega EPUB/HTML da amostra;
não entrega PDF do livro completo nem cria área privada de clientes.

Margem de contribuição D2C por unidade:

```text
preço recebido
− taxas percentuais e fixas do processador/plataforma
− tributos e retenções atribuíveis
− custo esperado de reembolsos/chargebacks
− custo variável de entrega, suporte e atualizações
= contribuição antes de aquisição
− custo de aquisição por comprador
= contribuição depois de aquisição
```

Não existe base para anunciar margem de 90% ou receita mensal mínima.

## Teste antes do lançamento completo

1. Distribuir a amostra a leitores compatíveis com o público. Pedir execução do
   laboratório e identificar obstáculos. Não tratar elogio como compra.
2. Usar uma página com promessa, amostra, escopo e formulário opt-in. Ainda não
   foi publicada. Não criar depoimentos, contadores de inscritos ou escassez fictícios.
3. Instrumentar por origem: visitante qualificado, download iniciado, cadastro
   confirmado, conclusão do laboratório declarada e interesse de compra.
4. Testar ofertas com períodos e tráfego comparáveis. Lista de espera mede
   interesse; validar disposição a pagar exige reserva/pré-venda claramente
   descrita ou venda real, somente quando houver produto e condições de entrega.
5. Comparar contribuição por visitante, reembolsos e satisfação, além da conversão.
   Não comparar só receita por exemplar.

Metas internas propostas para a primeira rodada: três reproduções independentes
do laboratório, dez entrevistas e cem visitas qualificadas por oferta antes de
tirar conclusões exploratórias. São metas operacionais arbitrárias, não amostra
estatística suficiente nem benchmarks do setor. Se o tráfego não chegar, registrar
“inconclusivo”. Não transformar pouca observação em previsão de receita.

Perguntas para entrevista: qual ação o agente pode executar hoje; o que bloqueia
a autorização; que evidência já é retida; quem aprova a compra; qual alternativa
é usada; qual parte da amostra foi reproduzida; e o que justificaria pagar pelo
manual em vez de consultar o repositório.

## Material de divulgação preparado

**Chamada:** “Aprenda a vincular uma saída de agente a uma política verificável.”

**Texto da amostra:** “Execute um certificado de orçamento com código executável, veja o gate
aceitar a proposta correta e entenda as rejeições. A amostra explica o que a
prova estabelece e o que continua dependendo do host.”

**Convite para lista de espera:** “Receba aviso da edição completa e das erratas
da amostra. O cronograma e o preço serão informados antes da compra.”

Esses textos estão preparados para revisão. Não houve publicação nem coleta de
dados pessoais nesta tarefa.
