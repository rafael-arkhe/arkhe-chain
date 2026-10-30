//! A **única** autoridade de schema.
//!
//! Regra do núcleo anterior, que custou uma noite: existiam duas autoridades
//! — `create_all` construía o schema de hoje a partir dos modelos, e o
//! carimbo de `alembic_version` era gravado em HEAD. A primeira
//! `alembic upgrade head` da frota reexecutou a história inteira sobre um
//! schema completo e morreu com `DuplicateColumnError`.
//!
//! Aqui: a lista é **esta pasta**, embutida no binário. Aplica-se em ordem,
//! uma vez, sob `pg_advisory_lock`, e o **checksum** de cada migração já
//! aplicada é conferido. Alterar uma migração depois de aplicada é um **erro**
//! — não um aviso e não um "deixa como está", porque a diferença entre o banco
//! e o ficheiro é exatamente a diferença entre um sistema que se recupera e um
//! que se descobre três meses depois.

use sha2::{Digest, Sha256};
use sqlx::{Acquire, PgPool, Postgres, Row};

use crate::erro::{ErroStore, Resultado};

/// Todas as migrações, por ordem. A ordem **é** a ordem de aplicação.
const MIGRACOES: &[(u32, &str, &str)] = &[
    (
        1,
        "0001_nucleo",
        include_str!("../migracoes/0001_nucleo.sql"),
    ),
    (
        2,
        "0002_vertical_do_tenant",
        include_str!("../migracoes/0002_vertical_do_tenant.sql"),
    ),
];

/// Chave do `pg_advisory_lock` das migrações **e da preparação do role de
/// runtime**.
///
/// 🔴 São a MESMA chave, e não duas, porque as duas operações mexem nas
/// **mesmas** tuplas do catálogo: a migração faz `alter table … enable row
/// level security` e o `grant` mexe no ACL da mesma tabela. A primeira
/// versão usava chaves separadas "porque são operações diferentes" — e o
/// resultado foi `tuple concurrently updated` uma vez em três, sempre entre a
/// migração e o `grant`. Duas operações que disputam o mesmo objeto têm de
/// partilhar o cadeado, e o que faz duas operações serem o **mesmo objeto**
/// é a tabela, não o nome da função.
///
/// 🔴 O lock existe porque **dois processos** arrancam a ilha ao mesmo tempo —
/// a API e o worker chamam o boot, e os dois semeiam. No núcleo anterior isto
/// era `pg_advisory_lock(0x5EED_0001)` pelo mesmo motivo. Aqui o número é uma
/// constante nomeada, não um literal espalhado.
pub(crate) const CHAVE_MIGRACAO: i64 = 0x5EED_0001;

fn soma(conteudo: &str) -> String {
    let mut h = Sha256::new();
    h.update(conteudo.as_bytes());
    hex::encode(h.finalize())
}

/// Aplica as migrações em falta e devolve quantas rodaram.
///
/// Idempotente: rodar duas vezes seguidas não faz nada na segunda.
///
/// 🔴 **Tudo numa única conexão.** O `pg_advisory_lock` é de **SESSÃO**, não de
/// transação: pegá-lo num `execute(pool)` e soltá-lo noutro `execute(pool)`
/// pode usar duas conexões **diferentes** — e então o lock fica retido na
/// primeira, para sempre. Foi o que aconteceu na primeira versão deste ficheiro,
/// e a suíte levou **6 minutos** para 13 testes: cada teste seguinte bloqueava
/// à espera do lock de um pool já devolvido. Foi medido, não suspeitado.
pub async fn aplicar(pool: &PgPool) -> Resultado<u32> {
    let mut conexao = pool
        .acquire()
        .await
        .map_err(|fonte| ErroStore::Banco(format!("não peguei conexão para migrar: {fonte}")))?;

    sqlx::query("select pg_advisory_lock($1)")
        .bind(CHAVE_MIGRACAO)
        .execute(&mut *conexao)
        .await
        .map_err(|_| ErroStore::MigracaoOcupada)?;

    let resultado = aplicar_interno(&mut conexao).await;

    // 🔴 Destrava SEMPRE, mesmo no erro — e na MESMA conexão. Uma ilha presa em
    // migração é uma ilha que precisa de alguém para reiniciar à mão.
    let _ = sqlx::query("select pg_advisory_unlock($1)")
        .bind(CHAVE_MIGRACAO)
        .execute(&mut *conexao)
        .await;

    resultado
}

async fn aplicar_interno(conexao: &mut sqlx::pool::PoolConnection<Postgres>) -> Resultado<u32> {
    // A tabela do ledger é a primeira coisa: sem ela não há como saber o que
    // já rodou. Ela é criada fora do sistema de migrações **de propósito** —
    // é o único SQL que o runner executa sem registro.
    sqlx::query(
        "create table if not exists aegis_migracao (
             versao     integer primary key,
             aplicada_em timestamptz not null default now(),
             checksum   text not null,
             nome       text not null
         )",
    )
    .execute(&mut **conexao)
    .await
    .map_err(|fonte| ErroStore::Banco(format!("não criei o ledger de migrações: {fonte}")))?;

    let aplicadas = sqlx::query("select versao, nome, checksum from aegis_migracao")
        .fetch_all(&mut **conexao)
        .await
        .map_err(|fonte| ErroStore::Banco(format!("não li o ledger: {fonte}")))?;

    let mut rodadas = 0u32;

    for (versao, nome, sql) in MIGRACOES {
        let esperado = soma(sql);

        if let Some(existente) = aplicadas.iter().find(|l| {
            let v: i32 = l.get("versao");
            v == *versao as i32
        }) {
            let guardado: &str = existente.get("checksum");
            if guardado != esperado {
                // 🔴 Este é o ponto do desenho. Uma migração aplicada não pode
                // mudar. A alternativa — "deixa como está" — é o que produz
                // um banco que não corresponde a nenhuma versão do ficheiro, e
                // ninguém descobre até uma consulta que devolve uma coluna a
                // menos.
                return Err(ErroStore::MigracaoAlterada { versao: *versao });
            }
            continue;
        }

        // 🔴 A transação nasce DA MESMA conexão que tem o lock. Se viesse do
        // pool, o lock ficaria numa sessão e as escritas noutra — e o
        // `unlock` a seguir soltaria um lock que não é o que seguramos.
        let mut tx = conexao
            .begin()
            .await
            .map_err(|fonte| ErroStore::MigracaoFalhou {
                versao: *versao,
                nome: nome.to_string(),
                fonte,
            })?;

        // Uma migração é transação sua: se ela falha pela metade, ela
        // inteira desfaz. Não há migração "meio aplicada".
        sqlx::raw_sql(sql)
            .execute(&mut *tx)
            .await
            .map_err(|fonte| ErroStore::MigracaoFalhou {
                versao: *versao,
                nome: nome.to_string(),
                fonte,
            })?;

        sqlx::query("insert into aegis_migracao (versao, nome, checksum) values ($1, $2, $3)")
            .bind(*versao as i32)
            .bind(*nome)
            .bind(&esperado)
            .execute(&mut *tx)
            .await
            .map_err(|fonte| ErroStore::MigracaoFalhou {
                versao: *versao,
                nome: nome.to_string(),
                fonte,
            })?;

        tx.commit()
            .await
            .map_err(|fonte| ErroStore::MigracaoFalhou {
                versao: *versao,
                nome: nome.to_string(),
                fonte,
            })?;

        tracing::info!(versao, nome, "migração aplicada");
        rodadas += 1;
    }

    Ok(rodadas)
}

/// Versão do schema no banco — a maior aplicada.
pub async fn versao_do_schema(pool: &PgPool) -> Resultado<i32> {
    let linha = sqlx::query("select coalesce(max(versao), 0) as v from aegis_migracao")
        .fetch_one(pool)
        .await
        .map_err(|fonte| ErroStore::Banco(format!("não li a versão do schema: {fonte}")))?;
    Ok(linha.get::<i32, _>("v"))
}
