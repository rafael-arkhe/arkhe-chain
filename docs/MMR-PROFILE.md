# Perfis MMR em uso

O perfil principal normativo é [arkhe-mmr@1](../specs/mmr/spec/mmr-profile-v1.md), congelado para os golden vectors. Este índice não altera o perfil nem seu digest.

| Ponto | Arkhe principal |
|---|---|
| Domínios | leaf 00, node 01, bag/root 02 |
| Peaks | Esquerda para direita, alturas decrescentes |
| Bagging | Direita para esquerda |
| Inicialização | Peak mais à direita, sem Option codificado |
| Árvore vazia | Inválida |
| Prova | Nodes bottom-up; acumulador à direita; peaks à esquerda |
| Consistência | Sem formato congelado; inclusão não prova extensão entre checkpoints |

Não introduzir os bytes 03 ou marcadores de Option propostos no anexo: eles mudariam os vetores e exigiriam versão nova. O AGI usa domínios textuais AGI/MMR e marcadores explícitos 0/1 em seu próprio contrato; seu root vazio e seus vetores não são Arkhe-v1.

O builder de referência reconstrói a árvore em O(n). A verificação de um caminho válido é limitada pelo tamanho da palavra/peaks e tem custo O(log n); não atribuir esse custo ao builder. `verify_proof_at` também valida índice e formato do caminho. A API legada valida formato e pertencimento sem afirmar posição específica.

O checkpoint deve vir de um canal independente confiável. A inclusão isolada não prova que um mandato existia antes de uma execução.
