# Checker offline de cobertura de evidência I1–I10

Implementado invariant_evidence_checker.py e executado sobre o relatório completo dos quatro traces joint-rank. Reanalisa evidência armazenada; não executa engine, restaura estado, revalida assinaturas ou aciona kernel. 100 testes passaram, dois novos garantindo que ausência de oráculo não vire PASS e que PASS histórico não ratifique automaticamente.

## Resultado

I1 NOT_IDENTIFIABLE: sem estados internos completos identificados independentemente.
I2 NOT_EVALUATED: sem rótulos verificados de ação/animação por frame.
I3 HEURISTIC_ONLY: moda de paleta não é fundo semanticamente validado.
I4 FAIL nos quatro modelos: ls20 responde7/2481 e8/2481 no treino;vc33 zero/2452.
I5 NO_PREDICTIVE_ACCEPTANCE_EVIDENCE: nenhuma predição full-render no sufixo; além disso, dados retrospectivos reutilizados e nenhum limiar confirmatório previamente definido.
I6/I7 LOCAL_IMPLEMENTATION_EVIDENCE: vetores completos, consenso e orçamento possuem controles locais; não estabelecem correspondências semânticas nem completude do conjunto de hipóteses.
I8 HYBRID_NOT_IMPLEMENTED: seletor de footprint não é modelo de transformação/persistência da cena.
I9 HASH_CONSISTENCY_ONLY: hashes nos reports verificam consistência local, não execução autêntica ou ancoragem externa.
I10 RATIFICATION_POLICY_NOT_INTEGRATED: nenhuma política combinada foi ligada ao gate nativo. Todos os modelos NOT_ADMITTED nesta análise.

Os status I6/I7 descrevem os controles disponíveis, não uma nova auditoria formal de toda execução. Resultados de uma família não se transferem a outra nem autorizam um PASS global do Arkhe.

## Correções ao anexo

I1: determinismo de render é condicional ao estado COMPLETO, parâmetros, versão e fase de render. Uma abstração lógica pode ignorar variações visuais. Ações futuras iguais ou saídas futuras iguais num conjunto finito não identificam estado interno. Se frames diferem sob render determinística e parâmetros fixos, os inputs completos diferem; não conclui que a variável lógica de interesse difira.

I2: animações podem ter estados internos; separá-las em um harness não prova que ações seriam rejeitadas em cada frame. Isso exige semântica concreta da API/engine e observabilidade da fase.

I3: cor mais frequente define uma heurística, não um invariante do mundo. Alteração da moda não identifica transição de modo, nem moda estável valida fundo.

I4: full-render exato em todo treino é requisito escolhido neste protocolo, não necessidade universal de todo modelo útil. Distinguir replay de transições isoladas, rollout acumulado e replay com reset/restauração no ambiente.

I5: sufixo pode conter pares vistos. Acerto nele não implica generalização para estados não vistos sem a separação de consultas. Dados atuais já foram usados em desenvolvimento; não são holdout confirmatório cego. Critérios precisam declarar denominadores, abstenção, limiar e scope. Passar critérios finitos não garante desempenho futuro.

I6: vetores conjuntos preservam correlações nesta família. Outros métodos podem representar distribuições ou restrições sem enumerar matchings explicitamente. Não confundir restrição da representação atual com lei universal.

I7: consenso exige conjunto não vazio, enumeração completa ou prova equivalente e horizonte declarado; orçamento incompleto não autoriza emissão. Consenso relativo a hipóteses incorretas pode estar errado.

I8: a seção de verificação do anexo aplica persistência quando o seletor diz não muda, contrariando sua própria consequência. Label0 do seletor não autoriza essa aplicação. Full-render errado também não identifica automaticamente persistência como única causa: transformação ou composição podem falhar.

I9: WER unsigned e WormGraph em memória não provam autoria, anterioridade da previsão ou execução pelo modelo. No desenvolvimento anterior há gate nativo real para políticas específicas, não assinatura de produção ou ancoragem durável externa. Não atribuir a este novo checker integração ausente.

I10: não promover quando um gate falha é propriedade verificável do fluxo de aprovação. Zero modelos errados promovidos é garantia semântica mais forte, que gates finitos não fornecem. Também não se deve equiparar autorização de ação pelo ContainmentGate à validade científica de um modelo. Nenhuma EvidenceKind ou regra do kernel foi alterada.

## Fontes verificadas nesta rodada

https://arxiv.org/abs/2607.15439 : o resumo informa ganhos com capacidade do modelo/esforço, frequentemente maiores que diferenças entre variantes; verificação completa lidera, às vezes por pouco, com mais recursos; holdout não testado. Isso contradiz a abertura que descarta tamanho/capacidade e afirma holdout como componente robustamente demonstrado por esse estudo.

GP-250 e a frase zero false ratification não foram localizados em fonte primária nas buscas realizadas; permanecem NÃO VERIFICADOS, não refutados. Não certificam I9/I10. Nenhuma atribuição é tratada como confirmação por repetição em anexos.

Relatório: D:/arkhe/output/arc3-invariant-evidence-20261027/report.json. Sem nova ação ARC, alteração de política ou submissão.

## Adendo de fonte localizada

A fonte GP-250 foi localizada posteriormente no commit624d63c24759fa8c7c1ecde4311f9a1507c26e30. A atribuição documental de replay/holdout e BC-3 está confirmada com escopo delimitado. Ver GP250-SOURCE-VERIFICATION-v1.md; o status anterior descreve a busca daquela rodada, não o estado atual da verificação. Nenhuma garantia semântica ou integração Arkhe decorre desse adendo.
