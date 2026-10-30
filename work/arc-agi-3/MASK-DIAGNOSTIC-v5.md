# v5: patch executado e limites preservados

O original recebido está em references/user-mask-diagnostic-v5/original.py. Seu selftest foi executado e falhou com KeyError: test em run_kfold. A versão mask_diagnostic_v5.py contém o patch mínimo: guarda tallies reais por dobra, usa-os em test_per_fold, verifica ausência de dobras válidas e restaura o marcador degenerate em single.

60 testes passaram, incluindo três regressões novas: selftest completo, reconciliação das cinco contagens por dobra com o total OOF em K-fold com dois grupos de teste por dobra e exibição de degeneração no single. Os três controles foram executados em single e LOO. Resultados em D:/arkhe/output/arc3-mask-diagnostic-v5-20261027/.

## Precisões sobre os anexos

- narrow_sprite agora tem HUD constante. Contudo, a v4 já passava seu selftest mesmo com HUD móvel: confirmado na rodada anterior. A correção melhora o isolamento do mecanismo; não corrige uma falha observada daquele selftest.
- O bug de N3 foi reproduzido. Se o campo test fosse acrescentado isoladamente, passar um dicionário counts ao boot atual causaria erro de indexação (ele espera listas numéricas), antes de produzir qualquer intervalo. Replicar contagens agregadas convertidas em listas entre grupos poderia então produzir intervalos artificiais; não é o comportamento diretamente executável do original.
- O try/except ValueError no main não captura KeyError nem erros ocorridos no load, que é chamado fora desse try. Reportar status também não produz código de saída não zero. Não é um contrato completo de falhas para automação.
- gkey(level) continua (episódio, nível). ls20 com um nível, mas vários episódios, pode ter grupos suficientes: não se pode prometer INSUFFICIENT_OR_INVALID_SPLIT por ter apenas um nível global.
- Permanecem as limitações da auditoria v4: namespace entre arquivos, IDs textuais, falta de política no agrupamento, ausência de adaptador dos snapshots do Arkhe, nomes issued/answered divergentes do restante do projeto e intervalos individuais sem contraste pareado.
- Núcleo estático de 60 linhas não é o alvo de 56 linhas da v2 integrada. Não misturar seus resultados. O alvo completo mantém relevância para alegações de previsão do estado inteiro.
- Bootstrap por grupo preserva agrupamento, mas isso não basta para garantir validade inferencial; modelos OOF compartilham treino. Em LOO, cada dobra tem somente um grupo de teste: seu bootstrap não estima variação entre grupos. Para decisões, manter contrastes pareados e custos explícitos da v3, com limites declarados.
- Ligar frames consecutivos não mede replay determinism. Determinismo do estado interno não implica que uma observação parcial ou mascarada determine o próximo frame. Lookup não se torna modelo generalizador por assumir determinismo. Não foi medido replay determinism 1.00.
- BLAKE2b produz digest determinístico para bytes iguais; a canonicalização vem da serialização. Não valida equivalência semântica de estados. fragmentation_rate permanece indefinida, sem rótulos independentes.

Não se efetuou nova pesquisa externa: as alegações bibliográficas dos anexos não foram certificadas nesta execução. O trabalho verificou código e controles locais.

A v5 é uma referência corrigida para entradas diretas; não substitui a avaliação arquivada v2/v3. Nenhuma nova ação ARC, promoção de máscara ou submissão Kaggle.
