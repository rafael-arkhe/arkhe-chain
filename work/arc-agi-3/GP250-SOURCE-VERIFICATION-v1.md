# GP-250: fonte primária localizada

Fonte preservada em references/ztare-gp250/source.md, commit 624d63c24759fa8c7c1ecde4311f9a1507c26e30, SHA256 d2271b6dc9849a91aa0919d68a74fdbe31bc20ebe9d1aec4a5f2e1e8959bce11. URL fixa: https://github.com/sparckix/ztare/blob/624d63c24759fa8c7c1ecde4311f9a1507c26e30/research_areas/seams/substrates/arc/GP-250_arc_agi_3_interactive_program_synthesis_seam.md. Obtida pela API GitHub/tree e raw; o fetch pelo leitor web falhou em cache. Nenhum código externo foi executado.

## Escopo confirmado pela documentação

A atribuição geral de replay/holdout e zero false ratifications deixa de ser não verificada. O documento descreve programas candidatos, replay e rollout futuro. BC-3 define a ausência de episódios rotulados solved cujo modelo ratificado falhe em replay posterior do episódio inteiro. A fonte exclui reivindicação de competitividade no leaderboard. Contém planos e registros de resultados sintéticos, inclusive alegações de certificados em domínio finito; esses certificados não foram executados ou auditados nesta consulta. A frase literal extensa reproduzida no anexo não foi encontrada nesse arquivo; seu conteúdo geral tem suporte, mas não se certifica aquela passagem como citação textual exata. A documentação não reivindica certificado equivalente para ambientes ARC reais.

## O que isso corrige no histórico local

As buscas anteriores não localizaram a fonte: esse era um status de verificação, não prova de inexistência. Agora o registro muda para DECLARAÇÃO DOCUMENTAL CONFIRMADA, com o alcance BC-3. Os relatórios históricos permanecem preservados e recebem este adendo. Não se infere garantia semântica universal de aprovação correta, nem implementação Arkhe a partir da descrição externa.

## Correções ainda necessárias ao novo anexo

- ContainmentGate autoriza operações sob políticas; não implementa por si só replay de um modelo de transição. O gate histórico dos probes é avaliação Python separada. O checker de invariantes é sumarizador offline, sem política conjunta de ratificação ligada ao kernel.
- Prefixo/freeze/sufixo e métricas futuras já foram executados. Falta um programa candidato admitido e uma política explícita de aceitação para um holdout confirmatório novo, não simplesmente criar a ideia de holdout.
- O estudo arXiv2607.15439 não testar holdout não estabelece que nenhum outro sistema o teste. Sua variante de verificação agrupa mecanismos e custa mais; ranking do tratamento não identifica isoladamente o efeito da verificação. Ganhos de capacidade/esforço frequentemente maiores que diferenças entre variantes não significam dominância universal da capacidade.
- Modelo programático é uma representação, ainda não uma família operacional de busca. Faltam linguagem/gramática ou mecanismo de síntese, orçamento numérico, interface/estado, restrições, política de seleção de candidatos e denominadores/limiares de aceitação. Um programa também pode memorizar.
- Observação completa não é sinônimo de last-render: status, progresso, múltiplos frames e demais metadados precisam de contrato. Uma função somente observação atual/ação pode ser insuficiente com estado oculto; histórico/estado de memória pode ser necessário.
- Replay e gates finitos validam o escopo testado, não zero modelos errados aprovados. Corretude universal pode exigir prova de equivalência em um domínio explicitamente formalizado.

Nenhuma nova ação ARC, síntese de programas ou alteração no gate nativo foi realizada. A localização de uma fonte não muda os quatro FAIL empíricos da família joint-rank.
