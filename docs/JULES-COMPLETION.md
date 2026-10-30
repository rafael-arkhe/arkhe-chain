# Conversão de conclusão Jules

Implementação no workspace AGI, com contrato separado do principal. `JulesWorkerRecord::from_session` exige OperationId pré-dispatch e constrói WER sem assinatura. O host precisa autenticar a observação e executar testes independentes antes de assinar/admitir.

`completed_at` vem de `createTime` RFC3339 da atividade `sessionCompleted` da mesma sessão. Não vem de updateTime, relógio local, mensagem ou teste declarado pelo provider. Conclusão ausente/ambígua, de outra sessão, com hora inválida ou estado incompatível é rejeitada. Apenas artifacts gitPatch documentados geram diff.

`create_recorded` chama o recorder logo após receber o nome, antes de retornar para polling. O caller deve já ter reservado a operação. `OperationJournal::record_session` valida admissão, estado e nome; permanece uma referência volátil. O host live deve persistir o callback. Falha conserva o nome para reconciliação sem repetir create; erro de rede também pode significar sessão criada e não autoriza retry automático.

Testes: `cargo test --manifest-path agi-coder/Cargo.toml --locked -p agi-coder-tests --test jules_completion --test e2e_mock_jules`. Nenhuma sessão real criada.

Fontes oficiais consultadas em 22/10/2026: [Activities](https://jules.google/docs/api/reference/activities/) e [Sessions](https://jules.google/docs/api/reference/sessions/). Evento do provider não é prova independente de execução correta.
