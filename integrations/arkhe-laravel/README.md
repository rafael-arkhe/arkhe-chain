# Arkhe — relatórios de execução do scheduler Laravel

Faz com que um `schedule:run` que deixou de correr fique registado como evidência,
em vez de passar despercebido. Tem três partes:

1. **Este pacote (Laravel).** Quando uma tarefa nomeada termina com código 0, envia
   `POST /v1/runs` ao `arkhe-runtime`. O runtime constrói o `WorkerExecutionRecord`
   e guarda-o. A hora que conta é a hora de admissão na base de dados, não a do Laravel.
2. **`arkhe-runtime audit-expectation`.** Compara as janelas já fechadas de uma
   `ExecutionExpectation` com os WERs admitidos. Para cada janela vazia grava um
   envelope `AbsenceRecord` no WormGraph.
3. **`arkhe-verify verify-absence`.** Confirma offline que um `record_hash` gravado
   é o registo de ausência daquela expectativa e daquela janela.

Uma tarefa que falha, é ignorada pelo scheduler ou nunca chega a arrancar não envia
nada. O mesmo acontece se o cron do `schedule:run` morrer ou se o runtime estiver
inacessível. Em todos estes casos, a janela acaba registada como ausência.

> **Estado:** o PHP deste pacote não foi executado nem testado (não havia PHP na
> máquina onde foi escrito). A parte em Rust tem testes.

## Instalação

```bash
composer require arkhe/laravel-run-reports
php artisan vendor:publish --tag=arkhe-config
```

`.env`:

```
ARKHE_URL=https://arkhe.internal:8788
ARKHE_API_TOKEN=...            # o mesmo ARKHE_API_TOKEN do runtime
ARKHE_MODULE_VERSION=a1b2c3d   # SHA ou tag da release
```

Dá nome à tarefa e lista-a em `config/arkhe.php`:

```php
// routes/console.php
Schedule::command('billing:charge')->hourly()->name('billing-cron');

// config/arkhe.php
'report_tasks' => ['billing-cron'],
```

O nome passa a ser o `module_id` do WER. Tem de coincidir com o `module_id` da
expectativa e só pode ter letras, dígitos e `._@+-/:` (máximo de 128 bytes).

## Expectativa e auditoria

Define a cadência num ficheiro como [`examples/billing-cron.expectation.json`](examples/billing-cron.expectation.json):

| Campo | Significado |
| :--- | :--- |
| `anchor_unix` | Início da janela 0 (segundos Unix). |
| `period_secs` | Duração de cada janela. |
| `grace_secs` | Atraso tolerado depois do fim da janela. Tem de ser menor que `period_secs`. |
| `policy_digest` | Digest (hex) da política que declara esta expectativa. |

Corre a auditoria com um agendador **independente do Laravel** (systemd timer,
outro host). Se fosse o próprio scheduler a corrê-la, a falha que se quer detetar
apagaria também o detetor:

```bash
DATABASE_URL=... ARKHE_TENANT_ID=... arkhe-runtime audit-expectation billing-cron.expectation.json 0
```

O resultado traz `next_window` e o `record_hash` de cada ausência. Guarda o
`next_window` para a passagem seguinte. Repetir janelas já auditadas não estraga
nada: produz os mesmos registos, e o WormGraph aceita-os sem os duplicar.

Verificação offline de uma ausência:

```bash
arkhe-verify verify-absence billing-cron.expectation.json 7 <record_hash> --now <unix>
```

## Limites

- Um relatório só prova que alguém com o token disse que a execução correu bem.
  Não prova o que a tarefa fez.
- A hora de admissão é a hora a que o relatório chega, ou seja, o **fim** da
  execução. Uma tarefa que demore mais do que `grace_secs` para lá do fim da janela
  conta para a janela seguinte.
- Quando há ambiguidade (uma execução atrasada da janela k e nenhuma outra em k+1),
  cada execução conta para uma janela no máximo. A ausência pode então ser
  atribuída à janela seguinte. O número total de ausências fica sempre certo.
- O `verify-absence` confirma que o registo corresponde à expectativa e à janela.
  Não volta a provar que a janela esteve vazia: isso depende do registo de admissões
  que o auditor leu.
- Quem vigia o auditor? Declara também uma expectativa para ele e audita-a a
  partir de outro host.
