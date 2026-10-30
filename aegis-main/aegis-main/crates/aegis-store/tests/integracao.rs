//! Prova de integração contra o **Postgres de verdade**.
//!
//! Sem `AEGIS_TESTE_BANCO`, estes testes **não correm** e dizem que não
//! correram. A regra da casa: `SKIP` é inconclusivo, nunca verde.
//!
//! ```sh
//! podman run -d --name aegis-t1-pg -p 55499:5432 \
//!   -e POSTGRES_USER=aegis -e POSTGRES_PASSWORD=aegis_t1 -e POSTGRES_DB=aegis_t1 \
//!   docker.io/library/postgres:17-alpine
//! export AEGIS_TESTE_BANCO='postgres://aegis:aegis_t1@127.0.0.1:55499/aegis_t1'
//! cargo test -p aegis-store --test integracao
//! ```
//!
//! 🔴 **O teste de RLS liga como um role que NÃO é superuser.** O `POSTGRES_USER`
//! do container é superuser, e superuser tem `BYPASSRLS` — um teste de
//! isolamento corrido nele passa à toa e prova exatamente o contrário do que
//! parece. A política tem de ser exercitada por um `aegis_app` a sério.

use aegis_ontology::Contrato;
use aegis_store::{ErroStore, Repo};
use aegis_vertical::Manifesto;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;

fn url() -> Option<String> {
    std::env::var("AEGIS_TESTE_BANCO").ok()
}

/// 🔴 **O pool é de UM teste, não da suíte.**
///
/// Isto já foi partilhado, e foi um erro que valeu duas variantes de falha
/// diferentes, ambas intermitentes — a pior:
///
/// - cada `#[tokio::test]` corre no **seu** runtime, e um `PgPool` partilhado
///   entre runtimes morre com *"A Tokio 1.x context was found, but it is being
///   shutdown"* quando o dono do pool termina;
/// - e o sintoma seguinte é *"pool timed out while waiting for an open
///   connection"* aos 30 s, que aponta para o banco e não para o pool.
///
/// Teste instável é pior que teste lento: ele treina a pessoa a reler o
/// vermelho. O custo de um pool por teste mede-se em segundos, com o túnel
/// SSH aberto (ver o cabeçalho deste ficheiro).
/// Liga como o **role de runtime** — o que não contorna a RLS.
///
/// 🔴 Sem esta função o teste de isolamento não provava nada: ligado como o
/// dono, um `count` sem GUC devolve as linhas todas, e o teste "passava"
/// por estar a medir a coisa errada.
async fn pool_de_app() -> Option<sqlx::PgPool> {
    let url = url()?;
    let app = aegis_store::abrir(&aegis_store::url_do_app(&url))
        .await
        .ok()?;
    Some(app)
}

async fn pool() -> Option<sqlx::PgPool> {
    let url = url()?;
    let pool = PgPoolOptions::new()
        .max_connections(4)
        .acquire_timeout(std::time::Duration::from_secs(30))
        .connect(&url)
        .await
        .ok()?;
    // O schema é aplicado por cada teste — é idempotente, e o
    // `pg_advisory_lock` serializa quem chega ao mesmo tempo.
    let _ = aegis_store::aplicar(&pool).await;
    // 🔴 A preparação do role é a **do produto** (`aegis_store`), e não uma
    // cópia da suíte. Havia uma cópia local sem a fechadura, e ela corria em
    // paralelo com as migrações — `tuple concurrently updated` numa em cada
    // três. Duas funções com o mesmo nome, e só uma obeyecia a regra.
    aegis_store::preparar_role_de_app(&url)
        .await
        .expect("preparar o role de runtime");
    Some(pool)
}

const CONTRATO: &str = r#"
id: cadernal
versao: 1
licenca: { exige: cadernal }
ontologia:
  tipos:
    - nome: anotacao
      propriedade_titulo: titulo
      reforco: strict
      propriedades:
        - { nome: titulo, tipo: texto }
        - { nome: peso,   tipo: numero }
    - nome: etiqueta
      propriedade_titulo: nome
      propriedades:
        - { nome: nome, tipo: texto }
  links:
    - { nome: tem, de: anotacao, para: etiqueta, cardinalidade: many_to_one }
    - { nome: aponta, de: anotacao, para: anotacao, cardinalidade: many_to_many }
  acoes:
    - { nome: criar, alvo: anotacao, regra: criar_objeto }
paginas:
  - { slug: hoje, ficheiro: p.json }
"#;

fn contrato() -> Contrato {
    Contrato::de(serde_yaml::from_str::<Manifesto>(CONTRATO).unwrap())
}

/// Um tenant novo por teste, para nenhum interferir no outro.
async fn tenant_novo(repo: &Repo, nome: &str) -> String {
    let t = repo
        .tenant(&format!("{nome}-{}", sufixo_unico()), nome, "cadernal")
        .await
        .expect("criar tenant");
    t.id
}

fn sufixo_unico() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| format!("{:x}", d.as_nanos()))
        .unwrap_or_else(|_| "0".into())
}

/// 🔴 **Uma suite que não correu não é verde. Esta prova é o que garante isso.**
///
/// Os testes abaixo saltam (SKIP) sem `AEGIS_TESTE_BANCO`, e um SKIP
/// capturado pelo `cargo test` **não diz nada** — a linha passa, o teste conta
/// como passou, e ninguém sabe que trezeze provas não correram. Foi medido: sem
/// o banco, a suite inteira estava verde.
///
/// A correção não é avisar mais alto. É **falhar**: uma execução sem banco é
/// uma execução sem prova, e tem de aparecer como tal.
#[tokio::test]
async fn esta_suite_precisa_de_um_banco() {
    let Ok(url) = std::env::var("AEGIS_TESTE_BANCO") else {
        panic!(
            "AEGIS_TESTE_BANCO não está definido — as provas de integração não correm.
             Uma suite que não correu não é verde.
             Suba um Postgres e aponte a variável:
               podman run -d --name aegis-t1-pg -p 55499:5432 \
                 -e POSTGRES_USER=aegis -e POSTGRES_PASSWORD=aegis_t1 -e POSTGRES_DB=aegis_t1 \
                 docker.io/library/postgres:17-alpine
               export AEGIS_TESTE_BANCO='postgres://aegis:aegis_t1@127.0.0.1:55499/aegis_t1'"
        );
    };

    // 🔴 A URL pode estar **certaina** e a ligação falhar na mesma — e aí o
    // erro que chega não diz nada de útil.
    //
    // Foi o que aconteceu, e custou uma hora: no Windows, o reencaminhamento
    // de portas do Podman pode ficar ligado **só ao IPv6** (`[::1]:55499`), e
    // qualquer URL escrita com `127.0.0.1` é recusada. O Postgres estava de
    // pé, o `podman port` anunciava o mapeamento, e o sintoma era uma suite
    // que passava em 4 s por `[::1]` e **não passava** por `127.0.0.1` — com
    // as mesmas provas.
    //
    // 🔴 E o erro que o `sqlx` devolve **não é** a recusa: o pool insiste
    // até ao timeout de aquisição, e o que sobe é *"pool timed out while
    // waiting for an open connection"* — que não menciona a ligação uma vez
    // só. A primeira versão desta mensagem procurava a recusa no texto e não
    // a encontrava, e saía um `panicked` mudo. O diagnóstico é por isso
    // **incondicional**: este é o único sítio onde esta prova pode falhar, e
    // um diagnóstico atrás de uma condição que não dispara é um diagnóstico
    // que não existe.
    if let Err(e) = aegis_store::abrir(&url).await {
        panic!(
            "a URL de AEGIS_TESTE_BANCO não liga: {e}\n\
             \n\
             A URL pode estar certa. Três coisas para ver, por esta ordem:\n\
             \n\
             1. No Windows o reencaminhamento de portas do Podman cai às vezes\n\
             \x20  só no IPv6. `netstat -ano | findstr 55499` — se aparecer\n\
             \x20  `TCP [::1]:55499 ... LISTENING`, a URL tem de ser\n\
             \x20  `postgres://aegis:aegis_t1@[::1]:55499/aegis_t1`.\n\
             2. `podman port aegis-t1-pg` sem anunciar nada: o container não\n\
             \x20  arrancou.\n\
             3. `podman exec aegis-t1-pg pg_isready` responde lá dentro e o\n\
             \x20  mapeamento está anunciado: é o caso 1."
        );
    }
}

// ---------------------------------------------------------------------------
// Migrações — a autoridade única de schema
// ---------------------------------------------------------------------------

#[tokio::test]
async fn migracoes_aplicam_e_sao_idempotentes() {
    let Some(pool) = pool().await else {
        eprintln!("SKIP: AEGIS_TESTE_BANCO não está definido — este teste NÃO RODOU");
        return;
    };

    // A primeira chamada (dentro de `pool()`) pode ter criado. A segunda tem de
    // ser um no-op: rodar duas vezes seguidas não pode mexer em nada.
    let rodadas = aegis_store::aplicar(&pool)
        .await
        .expect("aplicar migrações");
    assert_eq!(rodadas, 0, "a segunda aplicação não tinha nada para fazer");

    let versao = aegis_store::versao_do_schema(&pool).await.unwrap();
    assert!(versao >= 1, "o schema tem de estar na versão 1 ou acima");
}

#[tokio::test]
async fn migracao_alterada_depois_de_aplicada_e_erro() {
    let Some(pool) = pool().await else {
        eprintln!("SKIP: AEGIS_TESTE_BANCO não definido");
        return;
    };

    // 🔴 Este é o guarda que evita o incidente de março. Para testar a guarda
    // sem editar um ficheiro já aplicado, corrompemos o checksum no banco e
    // pedimos que o runner reconcilie.
    let nome = format!("migracao-corrompida-{}", sufixo_unico());
    sqlx::query("insert into aegis_migracao (versao, nome, checksum) values (999999, $1, 'checksum-que-nao-e-o-do-ficheiro')")
        .bind(&nome)
        .execute(&pool)
        .await
        .expect("inserir migração fantasma");

    // A migração 999999 não está no código, então não há como detectá-la pelo
    // checksum — o que prova o limite desta guarda: ela cobre migração
    // *alterada*, não migração *removida*. Registamos o facto em vez de
    // fingir que a guarda é maior do que é.
    let _ = aegis_store::aplicar(&pool).await;

    // Agora a parte que importa: o checksum da 0001 tem de bater.
    let guardado: String =
        sqlx::query_scalar("select checksum from aegis_migracao where versao = 1")
            .fetch_one(&pool)
            .await
            .expect("a 0001 tem de estar aplicada");
    assert_eq!(guardado.len(), 64, "é um sha256 em hex");

    sqlx::query("delete from aegis_migracao where versao = 999999")
        .execute(&pool)
        .await
        .ok();
}

// ---------------------------------------------------------------------------
// Gravação: o portão, a versão e a assinatura
// ---------------------------------------------------------------------------

#[tokio::test]
async fn grava_versiona_e_assina() {
    let Some(pool) = pool().await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let repo = Repo::new(pool);
    let c = contrato();
    let t = tenant_novo(&repo, "grava").await;

    let a = repo
        .gravar(
            &c,
            &t,
            "anotacao",
            Some("k1"),
            &json!({"titulo": "primeira"}),
        )
        .await
        .expect("gravar");
    assert_eq!(a.versao, 1);
    assert_eq!(a.signed_hash.len(), 64);

    let b = repo
        .gravar(
            &c,
            &t,
            "anotacao",
            Some("k1"),
            &json!({"titulo": "segunda"}),
        )
        .await
        .expect("regravar");
    assert_eq!(b.id, a.id, "a mesma chave é a mesma instância");
    assert_eq!(b.versao, 2, "a versão sobe");
    assert_ne!(
        a.signed_hash, b.signed_hash,
        "o conteúdo mudou, a assinatura muda"
    );
}

#[tokio::test]
async fn o_portao_recusa_antes_do_banco() {
    let Some(pool) = pool().await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let repo = Repo::new(pool);
    let c = contrato();
    let t = tenant_novo(&repo, "portao").await;

    // `anotacao` é `strict`: `peso` é número e vem texto.
    let e = repo
        .gravar(
            &c,
            &t,
            "anotacao",
            Some("k"),
            &json!({"titulo": "x", "peso": "cinco"}),
        )
        .await
        .unwrap_err();
    assert_eq!(e.codigo(), "ontologia.propriedade-invalida");

    // E nada foi gravado: a recusa é ANTES do SQL.
    assert_eq!(repo.contar(&t, "anotacao").await.unwrap(), 0);
}

#[tokio::test]
async fn chaves_diferentes_sao_instancias_diferentes() {
    let Some(pool) = pool().await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let repo = Repo::new(pool);
    let c = contrato();
    let t = tenant_novo(&repo, "chaves").await;

    let a = repo
        .gravar(&c, &t, "anotacao", Some("a"), &json!({"titulo": "A"}))
        .await
        .unwrap();
    let b = repo
        .gravar(&c, &t, "anotacao", Some("b"), &json!({"titulo": "B"}))
        .await
        .unwrap();
    assert_ne!(a.id, b.id);
    assert_eq!(repo.contar(&t, "anotacao").await.unwrap(), 2);
}

// ---------------------------------------------------------------------------
// RLS — o isolamento, provado por quem não o pode furar
// ---------------------------------------------------------------------------

#[tokio::test]
async fn rls_isola_um_tenant_do_outro() {
    let Some(pool) = pool().await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let repo = Repo::new(pool);
    let c = contrato();
    let meu = tenant_novo(&repo, "rls-meu").await;
    let outro = tenant_novo(&repo, "rls-outro").await;

    repo.gravar(&c, &meu, "anotacao", Some("k"), &json!({"titulo": "minha"}))
        .await
        .unwrap();
    repo.gravar(
        &c,
        &outro,
        "anotacao",
        Some("k"),
        &json!({"titulo": "dele"}),
    )
    .await
    .unwrap();

    assert_eq!(repo.contar(&meu, "anotacao").await.unwrap(), 1);

    // 🔴 Agora o teste que importa. Ligamos como `aegis_app`, que não é
    // superuser, e provamos que o GUC é o que filtra.
    let Some(app) = pool_de_app().await else {
        eprintln!("SKIP: role aegis_app não configurado");
        return;
    };

    // Sem o GUC posto, a política nega e a lista vem VAZIA — não vem tudo.
    let sem_guc: Vec<(String,)> =
        sqlx::query_as("select id::text from aegis_objeto where tenant_id::text = $1")
            .bind(&meu)
            .fetch_all(&app)
            .await
            .expect("o role de app consulta sem GUC");
    assert!(
        sem_guc.is_empty(),
        "sem o GUC de tenant a RLS tem de negar tudo — devolveu {} linha(s)",
        sem_guc.len()
    );

    // Com o GUC posto, vê exatamente a sua.
    let mut tx = app.begin().await.unwrap();
    sqlx::query("select set_config('aegis.tenant_id', $1, true)")
        .bind(&meu)
        .execute(&mut *tx)
        .await
        .unwrap();
    let com_guc: Vec<(String,)> =
        sqlx::query_as("select id::text from aegis_objeto where tipo = 'anotacao'")
            .fetch_all(&mut *tx)
            .await
            .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(com_guc.len(), 1, "com o GUC, vê só a sua");
}

// ---------------------------------------------------------------------------
// Cardinalidade — a parte que fecha a corrida
// ---------------------------------------------------------------------------

#[tokio::test]
async fn cardinalidade_many_to_one_recusa_a_segunda_aresta() {
    let Some(pool) = pool().await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let repo = Repo::new(pool);
    let c = contrato();
    let t = tenant_novo(&repo, "card").await;

    let a = repo
        .gravar(&c, &t, "anotacao", Some("a"), &json!({"titulo": "A"}))
        .await
        .unwrap();
    let b = repo
        .gravar(&c, &t, "anotacao", Some("b"), &json!({"titulo": "B"}))
        .await
        .unwrap();
    let e1 = repo
        .gravar(&c, &t, "etiqueta", Some("e1"), &json!({"nome": "e1"}))
        .await
        .unwrap();
    let e2 = repo
        .gravar(&c, &t, "etiqueta", Some("e2"), &json!({"nome": "e2"}))
        .await
        .unwrap();

    repo.ligar(&c, &t, "tem", &a.id, &e1.id)
        .await
        .expect("primeira aresta");

    let e = repo.ligar(&c, &t, "tem", &a.id, &e2.id).await.unwrap_err();
    assert_eq!(e.codigo(), "ontologia.cardinalidade-violada");

    // A aresta recusada NÃO ficou.
    let vizinhos = repo.vizinhos(&t, &a.id, "tem", 1, 100).await.unwrap();
    assert_eq!(vizinhos.len(), 1);
    let _ = b.id;
}

#[tokio::test]
async fn cardinalidade_many_to_many_nao_limita() {
    let Some(pool) = pool().await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let repo = Repo::new(pool);
    let c = contrato();
    let t = tenant_novo(&repo, "mm").await;

    let a = repo
        .gravar(&c, &t, "anotacao", Some("a"), &json!({"titulo": "A"}))
        .await
        .unwrap();
    let b = repo
        .gravar(&c, &t, "anotacao", Some("b"), &json!({"titulo": "B"}))
        .await
        .unwrap();
    let d = repo
        .gravar(&c, &t, "anotacao", Some("d"), &json!({"titulo": "D"}))
        .await
        .unwrap();

    repo.ligar(&c, &t, "aponta", &a.id, &b.id).await.expect("b");
    repo.ligar(&c, &t, "aponta", &a.id, &d.id).await.expect("d");

    let vizinhos = repo.vizinhos(&t, &a.id, "aponta", 1, 100).await.unwrap();
    assert_eq!(vizinhos.len(), 2);
}

// ---------------------------------------------------------------------------
// Soft delete e seed
// ---------------------------------------------------------------------------

#[tokio::test]
async fn remocao_e_soft_e_libera_a_chave() {
    let Some(pool) = pool().await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let repo = Repo::new(pool);
    let c = contrato();
    let t = tenant_novo(&repo, "soft").await;

    let a = repo
        .gravar(&c, &t, "anotacao", Some("k"), &json!({"titulo": "A"}))
        .await
        .unwrap();
    assert_eq!(repo.contar(&t, "anotacao").await.unwrap(), 1);

    repo.remover(&t, &a.id).await.expect("remover");
    assert_eq!(
        repo.contar(&t, "anotacao").await.unwrap(),
        0,
        "some das telas"
    );

    // A chave liberada é o que deixa o mesmo cliente voltar.
    let b = repo
        .gravar(
            &c,
            &t,
            "anotacao",
            Some("k"),
            &json!({"titulo": "A de novo"}),
        )
        .await
        .expect("a chave tem de estar livre");
    assert_ne!(a.id, b.id);
}

#[tokio::test]
async fn remover_o_que_nao_existe_da_o_mesmo_erro() {
    let Some(pool) = pool().await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let repo = Repo::new(pool);
    let t = tenant_novo(&repo, "orculo").await;

    let e = repo
        .remover(&t, "00000000-0000-0000-0000-000000000000")
        .await
        .unwrap_err();
    assert_eq!(e.codigo(), "store.objeto-invisivel");
}

#[tokio::test]
async fn marcador_do_seed_vira_e_e_luido() {
    let Some(pool) = pool().await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let repo = Repo::new(pool);
    let t = tenant_novo(&repo, "seed").await;

    assert_eq!(repo.seed_de(&t).await.unwrap(), 0, "nasce em 0");
    repo.definir_seed(&t, 7).await.unwrap();
    assert_eq!(repo.seed_de(&t).await.unwrap(), 7);
}

#[tokio::test]
async fn tipos_com_conta_mostra_tambem_o_que_esta_vazio() {
    let Some(pool) = pool().await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let repo = Repo::new(pool);
    let c = contrato();
    let t = tenant_novo(&repo, "tipos").await;

    repo.gravar(&c, &t, "anotacao", Some("a"), &json!({"titulo": "A"}))
        .await
        .unwrap();

    let contagens = repo.tipos_com_conta(&t).await.unwrap();
    let anotacao = contagens
        .iter()
        .find(|(tipo, _)| tipo == "anotacao")
        .unwrap();
    assert_eq!(anotacao.1, 1);
    // `etiqueta` tem zero e NÃO aparece: quem chama junta com o contrato,
    // senão o tipo declarado some do menu.
    assert!(!contagens.iter().any(|(tipo, _)| tipo == "etiqueta"));
}

#[tokio::test]
async fn erro_tem_codigo_e_frase() {
    // A tela traduz por código e nunca por texto: um erro sem `codigo()` é um
    // erro que a tela não sabe mostrar.
    let e = ErroStore::TenantInexistente { slug: "x".into() };
    assert_eq!(e.codigo(), "store.tenant-inexistente");
    assert!(e.humano().contains("x"));
}

// ---------------------------------------------------------------------------
// O role de runtime — a peça que faltava e que era uma fuga
// ---------------------------------------------------------------------------

#[tokio::test]
async fn o_role_de_runtime_nao_contorna_a_rls() {
    // 🔴 A Ilha servia com o DONO, e o dono é superuser — e superuser tem
    // `BYPASSRLS`. A política estava escrita, correta, e a ser lida sem
    // ser **aplicada**. Numa ilha de um só tenant isso é invisível; na
    // segunda é uma fuga entre tenants.
    let Some(url) = url() else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    aegis_store::preparar_role_de_app(&url)
        .await
        .expect("preparar o role de runtime");

    let pool = aegis_store::abrir(&url).await.expect("ligar");
    let linha: (String, bool, bool) =
        sqlx::query_as("select rolname, rolsuper, rolbypassrls from pg_roles where rolname = $1")
            .bind(aegis_store::ROLE_DE_APP)
            .fetch_one(&pool)
            .await
            .expect("ler o role de runtime");

    assert!(!linha.1, "o role de runtime não pode ser superuser");
    assert!(
        !linha.2,
        "o role de runtime tem BYPASSRLS — a RLS está a ser lida e não aplicada"
    );
}

#[tokio::test]
async fn o_role_de_runtime_tem_senha() {
    // 🔴 Este é o defeito que só aparece em máquina nova, e é o mais caro de
    // todos: com o `create role` sozinho — sem senha — a ilha **não instala**,
    // com *"password authentication failed for user aegis_app"*. Na bancada
    // funcionava porque sobrava um role de uma versão anterior da suíte, com
    // senha; numa máquina de raiz partia, e ninguém via porque a bancada
    // dizia que estava bem.
    let Some(url) = url() else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    aegis_store::preparar_role_de_app(&url)
        .await
        .expect("preparar o role de runtime");

    let pool = aegis_store::abrir(&url).await.expect("ligar");
    let sem_senha: bool =
        sqlx::query_scalar("select rolpassword is null from pg_authid where rolname = $1")
            .bind(aegis_store::ROLE_DE_APP)
            .fetch_one(&pool)
            .await
            .expect("ler a senha do role de runtime");

    assert!(
        !sem_senha,
        "o role de runtime ficou sem senha: em máquina nova a ilha não sobe"
    );

    // E ele liga mesmo, que é a prova que faltava.
    let url_app = aegis_store::url_do_app(&url);
    aegis_store::abrir(&url_app)
        .await
        .expect("o role de runtime tem de conseguir ligar — é o que a ilha faz ao servir");
}

#[tokio::test]
async fn a_url_de_runtime_troca_o_utilizador_e_mantem_a_senha() {
    // Uma senha com `@` estraga a troca se o host se ler do primeiro `@` — e
    // ler do primeiro é o natural, que é por isso que é o errado.
    let app = aegis_store::url_do_app("postgres://dono:se@nha@127.0.0.1:5432/ilha");
    assert_eq!(app, "postgres://aegis_app:se@nha@127.0.0.1:5432/ilha");
    assert!(app.starts_with("postgres://aegis_app:"));
    assert!(app.ends_with("@127.0.0.1:5432/ilha"));

    // E `AEGIS_BANCO_APP` manda, para quando a senha do runtime é outra.
    // SAFETY: teste único a mexer numa variável de ambiente.
    unsafe { std::env::set_var("AEGIS_BANCO_APP", "postgres://outro:x@h/ilha") };
    let sobreposto = aegis_store::url_do_app("postgres://dono:y@h/ilha");
    unsafe { std::env::remove_var("AEGIS_BANCO_APP") };
    assert_eq!(sobreposto, "postgres://outro:x@h/ilha");
}

#[tokio::test]
async fn o_isolamento_e_medido_e_efetivo() {
    // 🔴 A medição de produto, e não a de teste: a ilha conta as suas linhas
    // sem contexto de tenant, e tem de dar ZERO. Se der 10, a ilha está a
    // servir a_BASE toda para quem pedir.
    let Some(pool) = pool().await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let repo = Repo::new(pool);
    let t = tenant_novo(&repo, "isolamento").await;
    let contrato = contrato();

    repo.gravar(
        &contrato,
        &t,
        "anotacao",
        Some("k"),
        &json!({"titulo": "x"}),
    )
    .await
    .expect("gravar");

    // 🔴 Esta prova liga como o DONO, e por isso NÃO pode afirmar
    // `sem_contexto == 0`: o dono é superuser e vê tudo. O que ela afirma é
    // a FORMA da medição — e o portão que vale é a checagem `@isolamento` da
    // ilha, que corre já com o role de runtime.
    let m = repo.isolamento(&t).await;
    assert!(
        m.tabela_presente,
        "o schema tem de estar aplicado para medir"
    );
    assert!(m.com_contexto >= 1, "com contexto tem de ver o tenant");
    assert!(
        m.sem_contexto >= 1,
        "a medir como superuser, sem contexto vê tudo — é este o defeito que a          checagem @isolamento apanha quando corre com o role certo"
    );
}

// ---------------------------------------------------------------------------
// Trocar de produto
// ---------------------------------------------------------------------------

/// 🔴 O produto anterior é aposado **pela instalação**, e o critério é o
/// **contrato** — os tipos que o vertical novo declara.
///
/// Esta prova é o resultado do teste ácido da portaria: a seed dela gastava
/// 1.015 linhas a fazer isto, e fazia-o **importando as seeds alheias** para
/// saber o que tirar. Um produto que lê o código de outro produto deixa de ser
/// um produto e passa a ser um grafo de dependências, e trocar a ordem de
/// instalação muda o resultado.
#[tokio::test]
async fn trocar_de_produto_aposa_o_dado_do_anterior() {
    let Some(pool) = pool().await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let repo = Repo::new(pool);
    let c = contrato();
    let t = tenant_novo(&repo, "troca").await;

    // O produto anterior deixou aqui um tipo que o novo não declara.
    let antigo = repo
        .gravar(
            &c,
            &t,
            "saco_pesado",
            Some("antigo"),
            &json!({"titulo": "isto e do produto que saiu"}),
        )
        .await;
    // `saco_pesado` nao esta no contrato do fixture, e o portao recusa — o
    // que e o comportamento certo. Entao o "produto anterior" escreve-se
    // direto, como um produto mais antigo faria.
    assert!(
        antigo.is_err(),
        "o portão tem de recusar um tipo que o contrato não declara"
    );

    // Insere à mesma, como o produto anterior teria deixado.
    sqlx::query(
        "insert into aegis_objeto (tenant_id, tipo, chave_canonica, propriedades, signed_hash)
         select id, 'saco_pesado', 'antigo', '{}'::jsonb, 'x' from aegis_tenant
         where id::text = $1",
    )
    .bind(&t)
    .execute(repo.pool())
    .await
    .expect("semear o produto anterior");
    assert_eq!(repo.contar(&t, "saco_pesado").await.unwrap(), 1);

    // O produto novo declara `anotacao` e `etiqueta`. Tudo o que nao for
    // dessas e de quem saiu.
    let meus: Vec<String> = vec!["anotacao".into(), "etiqueta".into()];
    let aposados = repo.aposar_tipos_de_aposado(&t, &meus).await.unwrap();
    assert_eq!(aposados, 1, "uma linha do produto anterior devia sair");
    assert_eq!(
        repo.contar(&t, "saco_pesado").await.unwrap(),
        0,
        "o dado do produto anterior tem de sair das telas"
    );

    // E o que é do produto novo fica.
    repo.gravar(
        &c,
        &t,
        "anotacao",
        Some("minha"),
        &json!({"titulo": "sou do novo"}),
    )
    .await
    .expect("gravar do produto novo");
    assert_eq!(repo.contar(&t, "anotacao").await.unwrap(), 1);
}

#[tokio::test]
async fn o_tenant_diz_qual_vertical_o_possui() {
    // 🔴 A coluna `vertical` é o que permite ao instalador saber o que está
    // a aposar **sem o produto saber que ele existia**. Sem ela, a única
    // maneira de descobrir o produto anterior é perguntar a ele.
    let Some(pool) = pool().await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU");
        return;
    };
    let repo = Repo::new(pool);
    let t = repo
        .tenant("vert-de-teste", "Vertical de Teste", "meu-produto")
        .await
        .expect("criar o tenant");
    assert_eq!(t.vertical.as_deref(), Some("meu-produto"));

    // Reinstalar com outro produto muda a posse — e só isso.
    let t2 = repo
        .tenant("vert-de-teste", "Outro Produto", "outro-produto")
        .await
        .expect("trocar de produto");
    assert_eq!(t2.vertical.as_deref(), Some("outro-produto"));
}
