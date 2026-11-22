# Laboratório nativo de controles Arkhe (portado para o monorepo `arkhe`)

Port do `arkhe-native-control-lab` (originalmente executado contra `rafael-arkhe/arkhe-chain@f953e812`)
para o workspace unificado `arkhe` (commit base `aded159d`), vinculando diretamente os crates reais:

* `kernel/arkhe-core`
* `governance/arkhe-governance`
* `kernel/arkhe-kernel` (`features = ["sqlite-broker"]`)
* `verification/crates/arkhe-verify-core`

## Compilar e executar

```powershell
cargo build -p arkhe-native-lab
python verification/arkhe-native-control-lab/test_native.py --binary target/debug/arkhe-native-lab.exe
python verification/arkhe-native-control-lab/run_native.py --binary target/debug/arkhe-native-lab.exe --repository . --output verification/arkhe-native-control-lab/runs/local-run
```

Em Linux, substitua `target/debug/arkhe-native-lab.exe` por `target/debug/arkhe-native-lab`.

## Verificar entrega offline

```powershell
python verification/arkhe-native-control-lab/verify.py <DIRETORIO_RUN> --trusted-key-base64 <CHAVE_PUBLICA_BASE64>
```

## Portabilidade Linux vs Windows (transparência metodológica)

* **Núcleo Rust (`src/main.rs`) e testes nativos (`test_native.py`)**: 100% nativos em Windows e Linux contra o `CapabilityBroker`, `ContainmentGate`, `SqliteDispatchJournal`, verificação Ed25519 e inclusão MMR reais.
* **Observador de sistema de arquivos (`observation.py`)**:
  * Em **Linux**: usa `inotify` do kernel via `ctypes` (comportamento idêntico ao laboratório original).
  * Em **Windows**: usa `ReadDirectoryChangesW` (notificações de diretório do kernel NT via `ctypes.WinDLL("kernel32")`) em processo filho independente, sem ler o SQLite.
* **Probe de namespaces OS no Caso 2 (`isolated_actor.py`)**:
  * Em **Linux**: executa `unshare -Urmpf --mount-proc` + bind-mount RO + `setpriv` e classifica como `ATENDEU`.
  * Em **Windows**: **não** simula isolamento Linux; registra explicitamente `os_isolation_probe: "NOT_EXECUTED_ON_WIN32"` e classifica o Caso 2 como `ATENDEU_SEM_PROBE_NAMESPACE_LINUX`.
* **Transparência adicional no Caso 2 (`V-AGI-07`)**: `evidence.json` inclui `sub_journals` para evidenciar que `missing` e `altered_intent` não criam reservas, enquanto `altered` e `altered_destination` falham no `Writer` após reserva (`UNCERTAIN`, exigindo reconciliação manual).
* **Camada L1 — Separação de Processos / UIDs / Sockets Unix (`src/l1.rs`, `run_l1_linux.py`)**:
  * Daemon `arkhe-native-lab serve-l1` com **dois sockets Unix separados**:
    * `request.sock` (`0660`, `executor:agent`): agente autorizado conecta, envia `PublicRequest` delimitado (`<= 64 KiB`); conectar **não** concede autorização. A identidade do solicitante vem do kernel (`SO_PEERCRED` -> `peer.uid`) e não pode ser substituída por `requested_by` no JSON (`peer_identity_mismatch`). Terceiro UID não autorizado recebe `EACCES`.
    * `admin.sock` (`0660`, `executor:operator`): restrito ao operador por permissão do SO (`EACCES` para o agente) **e** checagem `SO_PEERCRED` (`peer.uid == operator_uid`). `AdminRequest` usa `deny_unknown_fields` sem campo `operator`; a identidade administrativa é derivada estritamente da fronteira do SO (`os-uid:<uid>:pid:<pid>`).
  * **Inicialização conservadora parada (`SqliteDispatchJournal::open_halted`)**: o daemon inicia com `engaged = 1` (`initial_conservative_halt`) e recusa qualquer despacho até ativação autenticada pelo operador em `admin.sock`.
  * **Execução multi-UID em Linux**:
    ```sh
    cargo build -p arkhe-native-lab
    sudo python3 verification/arkhe-native-control-lab/run_l1_linux.py \
      --binary target/debug/arkhe-native-lab \
      --repository . \
      --output verification/arkhe-native-control-lab/runs/l1-linux
    ```
* **Camada L2 — Paragem Global Persistida (`V-AGI-02`, Caso 9)**:
  * Tabela singleton `broker_global_kill_switch` (`id = 1 CHECK(id = 1)`) + log append-only `broker_kill_switch_audit` em `SqliteDispatchJournal` (`kernel/arkhe-kernel/src/broker_sqlite.rs`).
  * Verificada *fail-closed* antes da admissão no `CapabilityBroker` **e** atomicamente dentro de `BEGIN IMMEDIATE` em `reserve_inner` e `transact_authenticated` (sem janela TOCTOU).
  * Reabrir um banco adulterado cuja linha singleton foi apagada **não** recria `engaged = 0`; falha fechado com `kill_switch_state_unavailable`.
  * Caso 9 (`global_kill_switch_v_agi_02`) valida entre processos independentes: operação já admitida em voo conclui, próximo processo é bloqueado em `< 1s` com `kill_switch_engaged`, e `disengage` restaura despacho controlado com trilha de auditoria.
  * **Limite explícito (τ)**: L2 prova persistência cross-process e bloqueio `< 1s`; impedir que um processo hostil no mesmo UID escreva diretamente no arquivo SQLite exige a camada **L1** (separação de UID / socket com `SO_PEERCRED`).

## Diferenças encontradas entre `f953e812` e `aded159d`

* `broker.rs`, `broker_sqlite.rs`, `action_proof.rs` e `work.rs`: idênticos funcionalmente entre `f953e812` e `aded159d` antes da adição da L2 (`GlobalKillSwitch`) neste trabalho.
* `kernel/arkhe-kernel`: além de remover checagem redundante de `review_routing_required` em `authorize()` (mantida em `authorize_admitted`), o monorepo inclui `activation_sqlite` e `governed_execution` (`--features sqlite-activation`) e resolve o erro de compilação do exemplo `budget_pco.rs` porque `arkhe-agent` está presente em `[dev-dependencies]`.
* `emergency_stop` (Caso 6) permanece um campo em memória por instância; a paragem global persistida entre processos passa a ser provida por `broker_global_kill_switch` (Caso 9 / `V-AGI-02`).
