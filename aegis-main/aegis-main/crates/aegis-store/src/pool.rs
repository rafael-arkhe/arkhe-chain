//! O pool e o contexto de tenant.
//!
//! 🔴 O isolamento é do **banco**, e isto é o que o liga.
//!
//! O GUC `aegis.tenant_id` é posto no início de cada transação e lido pela
//! política RLS de `aegis_objeto` e `aegis_aresta`. Duas consequências que a
//! camada de aplicação não pode furar:
//!
//! - **Sem o GUC, a ilha devolve zero linhas** — e `zero` não é `todas`. É a
//!   diferença entre "o tenant não tem nada" e "o filtro está errado", e é o
//!   que faz um produto parecer quebrado quando o defeito é de consulta.
//! - **O `SET LOCAL` é por transação.** Uma transação esquecida em aberto
//!   segura a conexão: no núcleo anterior um `StreamingResponse` segurava uma
//!   conexão `idle in transaction` e o pool acabava em
//!   `QueuePool limit reached`, com o login a dar 500.

use std::str::FromStr;

use sqlx::postgres::PgPoolOptions;
use sqlx::{ConnectOptions, PgPool, Postgres, Transaction};

use crate::erro::{ErroStore, Resultado};

/// Abre o pool.
///
/// 🔴 **Sem `min_connections`.** Foi medido: com `min_connections(1)` o
/// `connect()` bloqueia à espera de uma conexão de fundo e devolve erro aos
/// 10 s — enquanto a mesma URL, com o pool sem mínimo, liga em milissegundos.
/// O sintoma é "a ilha não arranca, o banco está de pé", e a causa está a
/// duas linhas daqui.
///
/// O `acquire_timeout` é de 30 s e não 10 porque, numa bancada Windows com
/// Podman, **a porta publicada custa ~2 s por conexão TCP** (é o
/// encaminhamento do `gvproxy`/WSL, e a pegadinha é conhecida). Um timeout
/// apertado transforma lentidão de rede em "banco fora".
pub async fn abrir(url: &str) -> Resultado<PgPool> {
    PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(std::time::Duration::from_secs(30))
        .connect(url)
        .await
        .map_err(|fonte| ErroStore::Ligacao {
            url: url.to_string(),
            fonte,
        })
}

/// Ligação crua, para o boot (migrações), que corre **sem** contexto de
/// tenant — migração é o dono do schema.
pub async fn ligar_dono(url: &str) -> Resultado<sqlx::PgConnection> {
    sqlx::postgres::PgConnectOptions::from_str(url)
        .map_err(|fonte| ErroStore::Banco(format!("URL de banco inválida: {fonte}")))?
        .connect()
        .await
        .map_err(|fonte| ErroStore::Ligacao {
            url: url.to_string(),
            fonte,
        })
}

/// 🔴 Abre uma transação **já com o GUC de tenant posto**.
///
/// Esta é a única forma de chegar a `aegis_objeto` e `aegis_aresta`, e ela é
/// `pub(crate)` justamente por isso. Não há como escrever uma instância por
/// fora daqui — e é essa impossibilidade que o núcleo anterior não tinha,
/// porque toda pessoa com `AsyncSession` escrevia direto.
///
/// `set_config(..., true)` é **local**: vale só até o fim da transação. Com
/// `false` seria de sessão, e o tenant do pedido anterior vazaria para o
/// seguinte pela conexão devolvida ao pool.
pub(crate) async fn abrir_tx<'a>(
    pool: &'a PgPool,
    tenant_id: &str,
) -> Resultado<Transaction<'a, Postgres>> {
    let mut tx = pool
        .begin()
        .await
        .map_err(|fonte| ErroStore::Banco(format!("não abri transação: {fonte}")))?;

    sqlx::query("select set_config('aegis.tenant_id', $1, true)")
        .bind(tenant_id)
        .execute(&mut *tx)
        .await
        .map_err(|fonte| ErroStore::Banco(format!("não pus o contexto de tenant: {fonte}")))?;

    Ok(tx)
}

/// O servidor responde?
pub async fn vivo(pool: &PgPool) -> bool {
    sqlx::query("select 1").execute(pool).await.is_ok()
}

/// O role de **runtime** — o único que a ilha usa para servir.
///
/// 🔴 Isto não é higiene, é a diferença entre multi-tenant e não-multi-tenant.
/// O dono (quem aplicou as migrações) é o papel que o `POSTGRES_USER` cria, e
/// esse papel é **superuser** — e superuser tem `BYPASSRLS`, o que faz a
/// política de RLS ser lida, estar correta, e não ser **aplicada**. Foi
/// exatamente o que a checagem `@isolamento` apanhou na primeira execução: a
/// consulta sem contexto de tenant devolvia as linhas todas.
///
/// Numa ilha de um só tenant isso é invisível. Na segunda ilha é uma fuga.
pub const ROLE_DE_APP: &str = "aegis_app";

/// Cria o role de runtime e dá-lhe o que precisa para servir.
///
/// Corre **uma vez**, com o dono, e é idempotente. `NOBYPASSRLS` está no
/// `create role` e não pode ser acrescentado depois: um role que já nasceu
/// com `BYPASSRLS` continua a tê-lo, e o sintoma volta sem nenhuma mensagem.
pub async fn preparar_role_de_app(url_dono: &str) -> Resultado<()> {
    let Some(senha) = senha_de(url_dono) else {
        return Err(ErroStore::Banco(
            "a URL do dono não traz senha — e o role de runtime precisa dela para ligar"
                .to_string(),
        ));
    };
    let mut conexao = ligar_dono(url_dono).await?;

    // 🔴 Trava a **mesma** chave das migrações, porque a colisão não é entre
    // dois `GRANT` — é entre o `GRANT` e a migração. A migração corre
    // `alter table … enable row level security` e o `grant` mexe no ACL da
    // MESMA tabela; as duas disputam as mesmas tuplas do catálogo, e o
    // Postgres responde *"tuple concurrently updated"*.
    //
    // A primeira versão usava uma chave própria, com o argumento de que "são
    // operações diferentes". Não são: o que faz duas operações serem o mesmo
    // objeto é a tabela, e não o nome da função. Uma em cada três corrias
    // falhava por causa disso — e uma prova que falha uma vez em três é uma
    // prova que ninguém confia.
    sqlx::query("select pg_advisory_lock($1)")
        .bind(crate::migracoes::CHAVE_MIGRACAO)
        .execute(&mut conexao)
        .await
        .map_err(|fonte| ErroStore::Banco(format!("não travei a preparação do role: {fonte}")))?;

    let resultado = preparar_role_de_app_trancado(&mut conexao, &senha).await;

    let _ = sqlx::query("select pg_advisory_unlock($1)")
        .bind(crate::migracoes::CHAVE_MIGRACAO)
        .execute(&mut conexao)
        .await;

    resultado
}

async fn preparar_role_de_app_trancado(
    conexao: &mut sqlx::PgConnection,
    senha: &str,
) -> Resultado<()> {
    // 🔴 A senha é posta **à parte de fora do `if not exists`**.
    //
    // Medido num Postgres de raiz: com o `create role` sozinho — sem senha —
    // a ilha não instala. *"password authentication failed for user
    // aegis_app"*. E na bancada funcionava só porque sobrava um role de uma
    // versão anterior da suíte, com senha. Um defeito que só aparece em
    // máquina nova é o mais caro de todos: a bancada mente.
    //
    // O `alter role` corre sempre, para que rodar a rotina siga a senha do
    // dono. O `format('%L')` é o que torna isto seguro: devolve um literal
    // já citado, e uma senha com aspas não vira SQL.
    // 🔴 **O `create role` estava em falta — e a doc jurava que não.**
    //
    // A função chamava-se "cria o role de runtime" e o comentário dizia que
    // o `NOBYPASSRLS` "está no `create role`". Não havia `create role`
    // nenhum: só o `alter role`, que **falha** se o role não existir. Numa
    // máquina com um Postgres recém-criado, `aegis ilha instalar` recusava com
    // `role "aegis_app" does not exist` — o produto inteiro, por não criar a
    // peça de que precisa.
    //
    // Na bancada nunca apareceu porque sobrava um `aegis_app` de uma versão
    // anterior da suíte, **com senha** — que é a mesma mentira que a doc
    // acima descreve uma camada acima. A bancada mente duas vezes, e as duas
    // com a mesma forma.
    //
    // Os atributos nascem no `create`, e não no `alter`: um role que já nasceu
    // com `BYPASSRLS` continua a tê-lo, e `alter role … nobypassrls` desfaz.
    // Por isso o `create` é o que importa, e o `alter` abaixo existe só para
    // a senha.
    let criar: String = sqlx::query_scalar(
        "select format(
            'create role %I with login nosuperuser nobypassrls nocreatedb nocreaterole password %L',
            $1, $2)
         where not exists (select 1 from pg_roles where rolname = $1)",
    )
    .bind(ROLE_DE_APP)
    .bind(senha)
    // 🔴 `fetch_optional`, e não `fetch_one`. O `where not exists` devolve
    // **zero linhas** quando o role já existe — que é o caso normal, a partir
    // da segunda chamada — e `fetch_one` exige uma. A primeira versão da
    // correção falhava exactamente por isso, e só na segunda corrida: um
    // `create role` que funciona uma vez e quebra à segunda é pior do que
    // não ter, porque parece instalado.
    .fetch_optional(&mut *conexao)
    .await
    .map_err(|fonte| ErroStore::Banco(format!("não montei a criação do role de runtime: {fonte}")))?
    .unwrap_or_default();
    if !criar.is_empty() {
        sqlx::raw_sql(&criar)
            .execute(&mut *conexao)
            .await
            .map_err(|fonte| ErroStore::Banco(format!("não criei o role de runtime: {fonte}")))?;
    }

    let ddl: String = sqlx::query_scalar(
        "select format(
            'alter role %I with login nosuperuser nobypassrls nocreatedb nocreaterole password %L',
            $1, $2)",
    )
    .bind(ROLE_DE_APP)
    .bind(senha)
    .fetch_one(&mut *conexao)
    .await
    .map_err(|fonte| ErroStore::Banco(format!("não montei o role de runtime: {fonte}")))?;

    sqlx::raw_sql(&ddl)
        .execute(&mut *conexao)
        .await
        .map_err(|fonte| {
            ErroStore::Banco(format!(
                "não criei nem dei senha ao role de runtime: {fonte}"
            ))
        })?;

    for tabela in [
        "aegis_tenant",
        "aegis_objeto",
        "aegis_aresta",
        "aegis_migracao",
    ] {
        sqlx::query(&format!(
            "grant select, insert, update, delete on {tabela} to {ROLE_DE_APP}"
        ))
        .execute(&mut *conexao)
        .await
        .map_err(|fonte| ErroStore::Banco(format!("não dei permissão em {tabela}: {fonte}")))?;
    }
    Ok(())
}

/// A URL de **runtime**, com o role que não contorna a RLS.
///
/// Deriva da URL do dono trocando o utilizador. A senha é a mesma — e é
/// propositado: quem souber a senha do dono sabe a do runtime, e a proteção
/// aqui não é o segredo, é a **ausência de `BYPASSRLS`**. A defesa real do
/// segredo é a `NOBYPASSRLS` + a RLS; a senha está no `.env` da máquina.
pub fn url_do_app(url_dono: &str) -> String {
    // 🔴 Só `AEGIS_BANCO_APP`, e **nunca** `AEGIS_BANCO`. A versão anterior
    // chamava `aegis_ambiente::banco()`, que começa pelo `AEGIS_BANCO` — e a
    // aplicação passava a ligar com o DONO, que é superuser, que tem
    // `BYPASSRLS`. A RLS era lida e não aplicada, e a checagem
    // `@isolamento` via as dez linhas sem contexto de tenant.
    if let Some(v) = aegis_ambiente::banco_da_aplicacao()
        && !v.trim().is_empty()
    {
        return v;
    }

    let Some((esquema, resto)) = url_dono.split_once("://") else {
        return url_dono.to_string();
    };
    // O `host` lê-se do ÚLTIMO `@`: uma senha com `@` estraga a troca se se
    // ler do primeiro — e a leitura do primeiro é a natural, que é por isso
    // que é a errada.
    let Some((_, depois)) = resto.rsplit_once('@') else {
        return url_dono.to_string();
    };
    let credenciais = &resto[..resto.len() - depois.len() - 1];
    match credenciais.split_once(':') {
        // Reaproveita a senha do dono: a proteção aqui é a ausência de
        // `BYPASSRLS`, não o segredo — e um segredo diferente seria uma
        // segunda coisa para o operador gerir sem benefit nenhum.
        Some((_, senha)) => format!("{esquema}://{ROLE_DE_APP}:{senha}@{depois}"),
        None => format!("{esquema}://{ROLE_DE_APP}@{depois}"),
    }
}

/// A senha da URL do dono.
///
/// 🔴 O dono e o runtime **partilham a senha**, e isso é deliberado: o que
/// protege o tenancy não é o segredo da senha, é a ausência de
/// `BYPASSRLS`. Uma senha diferente seria uma segunda coisa para o operador
/// gerir sem dar nenhuma protecção a mais — e uma coisa que se perde é uma
/// ilha que não sobe.
fn senha_de(url: &str) -> Option<String> {
    let (_, resto) = url.split_once("://")?;
    let antes = resto.rsplit_once('@')?.0;
    let (_, senha) = antes.split_once(':')?;
    if senha.is_empty() {
        None
    } else {
        Some(senha.to_string())
    }
}
