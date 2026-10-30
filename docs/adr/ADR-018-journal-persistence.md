# ADR-018: persistência do journal por perfil

Data: 22/10/2026. Estado: documentação da implementação existente; escolha de novo backend AGI continua proposta.

## Contexto e decisão

O backlog mistura o workspace principal e `agi-coder`. O primeiro já possui journal PostgreSQL, isolamento por tenant e owner token, reserva PREPARED, marcação DISPATCHED anterior ao efeito, resposta COMPLETED e escalonamento de reconciliação. Preservar essa autoridade e as migrações publicadas. Não substituir por SQLite silenciosamente.

O `agi-coder` tem `OperationJournal` em memória e testes de transições/replay, mas não um adapter durável ligado ao pipeline. Sua migração SQL é material de projeto, não execução comprovada. Para um futuro perfil standalone, SQLite via `rusqlite` com WAL é uma opção proposta; `redb` não está adotado.

Nesta tarefa foi implementado o adapter standalone opcional `SqliteDispatchJournal` para o novo broker, com WAL/FULL, transação IMMEDIATE, owner e consumo fechado único. Isso não muda o backend do pipeline AGI nem a persistência PostgreSQL principal.

| Critério | PostgreSQL principal | SQLite/rusqlite standalone | redb |
|---|---|---|---|
| Durabilidade | Adapter existente; revalidar com DB real | Exigir transações, synchronous, WAL, reopen/crash tests | Exigir mesmo teste de recuperação |
| Concorrência | Reserva SQL e owner token | Bloqueio/transação e exclusividade entre processos | Definir single-writer e exclusividade |
| Maturidade operacional | Operação e testes já documentados | Qualificar permissões, backup e migração local | Qualificação ainda necessária |
| Supply chain | sqlx e dependências existentes | Biblioteca SQLite/C, features e atualizações explícitas | Biblioteca Rust e atualizações explícitas |
| Cross-compile/tamanho | Já integra runtime | Medir bundled/system e artefato por plataforma | Medir artefato por plataforma |

O journal faz parte da base operacional de confiança de replay/efeitos: sua perda ou adulteração pode permitir duplicação. Chamar o journal de não-TCB sem delimitar essa garantia é incorreto.

## Invariantes de aceite

Reserva atômica anterior ao side effect; mesma identidade com parâmetros distintos gera conflito; apenas o proprietário pode completar; cancelamento ou resultado incerto nunca autoriza redispatch automático; reopen preserva estado; acesso cruzado e transição inválida falham. Um reconciler registra investigação, não fabrica sucesso upstream.

O novo `DispatchJournal` do broker exige persistência antes de dispatch e não instala implementação volátil como default. Sua implementação de teste não qualifica um serviço de produção.
