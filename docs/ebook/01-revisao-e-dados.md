# Revisão da proposta e verificação dos dados

Consulta: 22/10/2026. Escopo: texto fornecido pelo autor e checkout em `D:/arkhe`.
Os identificadores S01–S11 remetem a [fontes com links](05-fontes.md).

## Parecer editorial

A proposta acerta ao substituir uma exposição monográfica por um manual orientado
a decisões de implementação. Deve, entretanto, reduzir o número de promessas:
autenticar bytes, verificar um predicado, admitir evidência, autorizar uma ação e
observar sua execução são tarefas diferentes. O título e a descrição devem
prometer ensinar essas fronteiras, com exemplos reproduzíveis.

O comprador é uma pessoa responsável por sistemas de agentes — engenharia de
plataforma, arquitetura, segurança ou governança. Agentes podem ajudar na descoberta
do conteúdo, mas não há evidência de que constituam o comprador deste livro.
Orçamento empresarial não demonstra intenção de compra nem ausência de
sensibilidade a preço.

## Auditoria das afirmações externas

| Afirmação original | Resultado | Tratamento na edição |
|---|---|---|
| Faixa de 70% de US$ 2,99 a US$ 12,99 desde julho de 2026 | Confirmada na documentação oficial: vigência em 07/07/2026 na Amazon.com [S01] | Manter com data, moeda, loja e condições; não generalizar para reais |
| 35% acima de US$ 12,99 | Correta para os preços USD propostos dentro dos limites da loja [S01, S02] | Apresentar fórmula e distinguir royalty de lucro |
| 70% menos delivery fee | Redação imprecisa [S02] | Usar `0,70 × (preço − imposto aplicável − entrega)` no cenário correspondente |
| Amazon + PDF integral no site | Viável como hipótese de distribuição sem Select; faltava a restrição [S03] | Select exige exclusividade digital no período; extras não tornam uma cópia integral elegível |
| 70% no Brasil | O texto omitia condição relevante [S02] | Depende de Select e requisitos locais de preço; sem Select, vendas a clientes no Brasil ficam em 35% |
| Ebooks técnicos tipicamente US$ 29–69 | Faixa não demonstrada por amostra e método | Retirar como estatística; não confundir preço anunciado com vendas |
| Receita mensal potencial US$ 1.500–6.000 | Sem dados de unidades, tráfego e custos | Retirar como previsão; substituir por cenários explícitos |
| Livros de governança US$ 51–99 | Generalização não sustentada | Um comparável consultado, Trustworthy AI, anuncia US$ 24,99 [S08]; isso não define o preço do Arkhe |
| RPM de US$ 25–40 por mil páginas em IA | Não comprovado e inadequado como sinal de disposição a pagar | KENP depende de fundo, mercado e páginas lidas; não é tarifa fixa por gênero [S04] |
| Mercado de agentes US$ 89,6 bilhões em 2026, +215% | Fonte primária/metodologia não localizada | Remover; repetição em um artigo não valida tamanho do mercado |
| Governança e segurança = 16,7% do gasto em IA | Confirmada como declaração da IDC sobre média de gasto planejado de sua pesquisa [S05] | Citar com esse recorte; não extrapolar para todas as empresas nem para livros |
| 45% têm orçamento autônomo para agentes | Não confirmada na forma apresentada | Remover. O relatório G2 consultado usa 45% para perdas de ganho esperado com supervisão/correção [S09] |
| Margens D2C acima de 90% | Não demonstradas para este produto | Calcular taxas, impostos, suporte, reembolsos, atualização e aquisição |
| US$ 39,99 é preço justo | Hipótese comercial | Testar receita líquida por visitante, satisfação e reembolso |
| Empresas compram sem sensibilidade ao preço | Hipótese frágil | Entrevistar compradores e testar conversão; não assumir reembolso corporativo |
| Reguladores exigirão a arquitetura Arkhe | Não sustentada | Descrever como recurso de engenharia; nenhuma fonte consultada exige Arkhe |

Não confirmar uma afirmação não demonstra que ela seja falsa. Significa que não
há sustentação suficiente para publicá-la como fato nesta edição.

## Governança e regulação

O NIST AI RMF é de uso voluntário [S06]. Pode organizar perguntas de governança,
mas a adoção do framework não certifica o produto. A Comissão Europeia descreve
aplicação faseada do AI Act e, na página consultada, datas específicas para
sistemas de alto risco [S07]. Não reduzir isso a “todo agente precisa de prova
criptográfica em 2026”. Jurisdição, papel do operador e classificação do sistema
precisam ser analisados antes de qualquer alegação de conformidade.

## Correções de arquitetura

1. **Determinismo:** o core de verificação tem contrato de resultado determinístico
   para entradas canônicas iguais. Isso não implica replay bit a bit da inferência
   de qualquer LLM, driver ou GPU.
2. **Assinaturas híbridas:** não sustentar essa promessa no capítulo introdutório.
   Os perfis inspecionados usam Ed25519; não foi estabelecido um protocolo híbrido
   ativo de aceitação para o fluxo da amostra.
3. **PCO:** há um certificado aritmético finito com produtor e checker separados.
   Não é prova geral de raciocínio, de pesos de LLM ou de verdade factual.
4. **WormGraph/MMR:** inclusão requer checkpoint confiável. Não prova sozinha
   cronologia, consistência entre checkpoints, autenticidade do emissor ou hardware.
   Perfis do principal e do workspace AGI não são intercambiáveis.
5. **Gate e journal:** autorização não garante efeito único. Identidade da operação,
   reserva, persistência e reconciliação pertencem ao protocolo do executor.
6. **DePIN:** o DTO Verde e a fixture são sintéticos; não há interoperabilidade real
   autenticada demonstrada. Filecoin, Helium e validação TEE não estão implementados
   nessa fatia.
7. **Slashing:** conflito local e retry não bastam para punição. Detector sancionável
   e política econômica permanecem trabalho futuro/não adotado conforme o backlog.
8. **CostTracker:** registra valores fornecidos e protege contra overflow; não mede
   automaticamente custos de Rekor, NRAS ou armazenamento.
9. **C2PA/WASM:** assinatura do perfil Arkhe não equivale à validação padrão completa
   C2PA/COSE. A documentação de API declara essa fronteira.

Os arquivos que fundamentam essas correções estão na [matriz técnica](03-matriz-tecnica.md).

## Escopo e extensão

As faixas originais somam **195–250 páginas**, e não 180–220. Além disso, “um
capítulo de amostra (Parte I + Parte II)” corresponderia a 80–100 páginas.
Esta edição propõe um capítulo autônomo, com problema, arquitetura e laboratório,
e orçamento editorial de aproximadamente 53 mil palavras para o livro completo.
No Kindle a paginação varia; número de páginas será estimativa da edição impressa,
nunca garantia do EPUB.
