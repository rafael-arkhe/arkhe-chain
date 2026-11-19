# Teste do verificador de execução por mutação

Cada linha aplica um defeito a uma cópia da execução. A verificação indicada
tem de falhar.

Os MX01 a MX18 usam a execução com plano fixo; os MX19 a MX31, a execução
com hierarquia de recuperação e permissão por estágio; os MX32 a MX38, a
execução autorizada por um gate de delegação a montante.

| ID | Defeito introduzido | Verificação | Resultado | Evidência |
| --- | --- | --- | --- | --- |
| MX01 | soma do registro divergente da captura | X1 | detectado | P01: soma do registro difere da capturada |
| MX02 | citação aponta passo que não existe | X2 | detectado | A01: cita passo inexistente P42 |
| MX03 | afirmação apoiada sem nenhuma citação | X2 | detectado | A02: apoiada sem citacao |
| MX04 | afirmação recusada sem pendência vinculada | X2 | detectado | A04: sem suporte e sem pendencia vinculada |
| MX05 | pendência encerrada sem o documento | X2 | detectado | A04: pendencia Q001 nao esta aberta |
| MX06 | afirmação apagada do registro entregue | X2 | detectado | A03: ausente de afirmacoes.md |
| MX07 | plano trocado depois da captura | X3 | detectado | plano da captura difere do sha256 registrado em meta; P02: argumentos diferentes dos planejados |
| MX08 | passo rodou com argumentos fora do plano | X3 | detectado | P02: argumentos diferentes dos planejados |
| MX09 | runner passaria a poder chamar processo externo | X3 | detectado | executar.py contem subprocess |
| MX10 | run_id não casa com a pasta da captura | X4 | detectado | R8a9fa5de-t01: run_id Rfalsific-t01 nao casa com a pasta |
| MX11 | executor sem modelo declarado | X5 | detectado | executor sem modelo |
| MX12 | autorrevisão apresentada como revisão | X5 | detectado | autorrevisao nao declarada como tal |
| MX13 | registro passa a depender de endereço externo | X6 | detectado | relatorio.md linha 31 depende de endereco externo: https:// |
| MX14 | captura crua copiada para dentro do registro | X6 | detectado | captura crua copiada para dentro do registro |
| MX15 | arquivo citado no LEIA-ME não existe | X6 | detectado | citado mas inexistente: efeitos.md |
| MX16 | credencial colada no registro | X7 | detectado | registro contem chave de API com prefixo s-k; registro contem campo de chave de API |
| MX17 | mesma chave de idempotência aplicada duas vezes | X8 | detectado | chave resumo-L002-v1 aplicada 2 vezes: R8a9fa5de-t01, R8a9fa5de-t02 |
| MX18 | chave de idempotência ausente do registro | X8 | detectado | P05: chave ausente de efeitos.md |
| MX19 | byte alterado dentro do bloco fornecido | X9 | detectado | P01/C1: bloco nas linhas 2-11 nao casa com sha256_fornecido |
| MX20 | candidato descartado sem motivo | X9 | detectado | P01/C3: descartado sem motivo declarado |
| MX21 | citação na linha de cabeçalho, fora do bloco | X9 | detectado | V01: cita a linha 12 de P01, fora de qualquer bloco fornecido |
| MX22 | descartado cujo conteúdo entrou no contexto | X9 | detectado | P01/C3: descartado mas o conteudo entrou como C1 |
| MX23 | usado_mas_suprimido com T3 permitindo | X10 | detectado | P02: T3 deveria negar e permite; P02/T3: veredicto permite nao segue do estado avaliado; P02/T3: assinatura do token nao confere |
| MX24 | exibido sem o token de T3 | X10 | detectado | P01: exibido exige token em T3; P03: exibido exige token em T3 |
| MX25 | digest de permissão que não bate com o estado | X10 | detectado | P01/T1: digest_permissao nao confere com o estado avaliado; P01/T1: assinatura do token nao confere; P02/T1: digest_permissao nao confere com o estado avaliado; P02/T1: assinatura do token nao confere; P03/T1: digest_permissao nao confere com o estado avaliado; P03/T1: assinatura do token nao confer |
| MX26 | conferido_em de T3 anterior ao de T2 | X10 | detectado | P01/T3: conferido_em retrocede; P01/T3: assinatura do token nao confere; P02/T3: conferido_em retrocede; P02/T3: assinatura do token nao confere; P03/T3: conferido_em retrocede; P03/T3: assinatura do token nao confere; P04/T3: conferido_em retrocede; P04/T3: assinatura do token nao confere |
| MX27 | evento de permissão com efeito no passado | X10 | detectado | evento retroativo 1a6213b4ce4c1f29: efetivo_em 500 e registrado_em 1000 |
| MX28 | afirmação apoiada em passo suprimido | X10 | detectado | V04: apoiada em P02 com estado usado_mas_suprimido; passo suprimido nao sustenta afirmacao |
| MX29 | registro_digest trocado | X11 | detectado | P01: digest declarado 0000000000000000… difere do recalculado 3d89efe47f515c3c…; P02: digest declarado 0000000000000000… difere do recalculado c77f27aeaa71334a…; P03: digest declarado 0000000000000000… difere do recalculado 47e5d006d80be0df…; P04: digest declarado 0000000000000000… difere do recalcu |
| MX30 | campo do registro alterado depois de assinado | X11 | detectado | P03: digest declarado e7d1e7dc45e62422… difere do recalculado a0c5188832a404a5… |
| MX31 | MAC da assinatura trocado | X11 | detectado | P01: assinatura nao confere com a chave fornecida; P02: assinatura nao confere com a chave fornecida; P03: assinatura nao confere com a chave fornecida; P04: assinatura nao confere com a chave fornecida |
| MX32 | passo com recurso fora do escopo delegado | X12 | detectado | P01: recurso cofre-financeiro fora do escopo delegado; P02: recurso cofre-financeiro fora do escopo delegado; P03: recurso cofre-financeiro fora do escopo delegado; P04: recurso cofre-financeiro fora do escopo delegado |
| MX33 | efeitos acima do limite da delegação | X12 | detectado | 1 efeitos executados acima do limite 0 da delegacao; decisao de delegacao: digest declarado 137ba7e1f3d43898… difere do recalculado 5e04243538a22852… |
| MX34 | meta cita outra delegação | X12 | detectado | meta cita delegacao del-outra-0099 e a decisao gravada e del-L002-0001 |
| MX35 | execução gravada sob decisão de recusa | X12 | detectado | execucao gravada sob decisao de delegacao recusa; decisao de delegacao: digest declarado 137ba7e1f3d43898… difere do recalculado e21da115ee7e83ae… |
| MX36 | decisão tomada após o contrato expirar | X12 | detectado | decisao tomada em 1000 apos o contrato expirar em 900; decisao de delegacao: digest declarado 137ba7e1f3d43898… difere do recalculado 6efe385af4e2a068… |
| MX37 | decisão com os limites apagados | X12 | detectado | decisao de delegacao: digest declarado 137ba7e1f3d43898… difere do recalculado bd9224b91034288c…; decisao sem limites declarados; ausencia de ancoragem e prova nao verificada precisam constar |
| MX38 | escopo ampliado depois de assinado | X12 | detectado | decisao de delegacao: digest declarado 137ba7e1f3d43898… difere do recalculado 4cf6b371ee132994… |

38 de 38 defeitos detectados. Sobreviventes: 0.

Os mutantes são escritos à mão: cobrem o defeito que alguém pensou em
escrever, e nada além disso. Nenhuma destas verificações decide se o que a
execução leu era verdade.
