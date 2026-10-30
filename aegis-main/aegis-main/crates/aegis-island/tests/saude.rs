//! Testes do gate de prontidão.
//!
//! 🔴 Este crate é onde mora a distinção `/health` vs `/health/ready`, e é o
//! que tinha **zero** provas. Um gate sem prova é um gate que nunca reprovou —
//! que é o defeito que a casa já mediu duas vezes.

use aegis_island::{Estado, Motivo, interpretador};
use aegis_store::Repo;
use aegis_vertical::Manifesto;

// ---------------------------------------------------------------------------
// O vocabulário de motivos é FECHADO
// ---------------------------------------------------------------------------

#[test]
fn cada_motivo_tem_codigo_proprio_e_frase() {
    let motivos = [
        Motivo::BancoFora,
        Motivo::TenantInexistente,
        Motivo::TenantInativo,
        Motivo::SeedDesatualizado,
        Motivo::SaudeExigidaFALHOU,
        Motivo::SaudeInconclusiva,
        Motivo::SaudeNaoConferida,
    ];

    let mut codigos: Vec<&str> = motivos.iter().map(|m| m.codigo()).collect();
    let total = codigos.len();
    codigos.sort();
    codigos.dedup();
    assert_eq!(
        codigos.len(),
        total,
        "dois motivos com o mesmo código: a tela traduziria um como o outro"
    );

    for m in motivos {
        assert!(!m.codigo().is_empty());
        assert!(!m.humano().is_empty(), "{:?} sem frase", m);
        assert!(!m.gesto().is_empty(), "{:?} sem gesto", m);
        // 🔴 O gesto é uma AÇÃO, não um diagnóstico. "Verificar o produto" e
        // "Aplicar o vertical" são coisas que o operador faz; "seed
        // desatualizado" é uma coisa que ele descobre.
        assert_ne!(
            m.gesto(),
            m.humano(),
            "{:?} repete o diagnóstico no gesto",
            m
        );
    }
}

#[test]
fn inconclusivo_nunca_diz_que_passou() {
    // 🔴 A palavra proibida é "ok". Uma tela que diz "ok, não conferido" é
    // pior do que uma tela que não diz nada.
    assert_ne!(Estado::Inconclusivo.humano(), "passou");
    assert_ne!(Estado::Inconclusivo.humano(), "ok");
    assert_eq!(Estado::Inconclusivo.humano(), "não conferido");
    assert_eq!(Estado::Falhou.humano(), "falhou");
    assert_eq!(Estado::Ok.humano(), "passou");
}

// ---------------------------------------------------------------------------
// O interpretador
// ---------------------------------------------------------------------------

#[test]
fn o_interpretador_resolve_ou_diz_que_nao_ha() {
    // Não há asserção sobre o resultado: o que interessa é que a função
    // **responde** e nunca devolve um caminho inventado. Devolver um
    // interpretador que não existe é pior que devolver `None`, porque o
    // script corre e falha com um erro que não é o dele.
    match interpretador() {
        Some(p) => assert!(
            p.is_file(),
            "devolveu um interpretador que não existe: {p:?}"
        ),
        None => { /* sem sh nesta máquina: o gate sai inconclusivo, e é o certo */ }
    }
}

#[test]
fn o_interpretador_respeita_a_valvula_de_bancada() {
    // `AEGIS_SH` apontando para um ficheiro que não existe tem de dar
    // `None`, e não o `sh` do sistema: quem aponta está a dizer "usa ISTO",
    // e um fallback silencioso transforma uma configuração explícita numa
    // configuração ignorada.
    let anterior = std::env::var("AEGIS_SH").ok();
    // SAFETY: teste único a mexer numa variável de ambiente, sem threads
    // paralelos que leiam a mesma chave.
    unsafe { std::env::set_var("AEGIS_SH", "/caminho/que/nao/existe") };
    let obtido = interpretador();
    unsafe {
        match anterior {
            Some(v) => std::env::set_var("AEGIS_SH", v),
            None => std::env::remove_var("AEGIS_SH"),
        }
    }
    assert!(
        obtido.is_none(),
        "AEGIS_SH inválido tem de dar None, e não cair no sh do sistema"
    );
}

// ---------------------------------------------------------------------------
// A ilha e o veredicto — o que precisa de banco
// ---------------------------------------------------------------------------

fn url() -> Option<String> {
    std::env::var("AEGIS_TESTE_BANCO").ok()
}

/// Monta uma ilha cujo tenant **existe** e cujo **seed está na versão**.
///
/// 🔴 Não é Deletes: é o que permite exercitar a saúde isoladamente. O gate
/// pergunta o seed ANTES da saúde de propósito — para o operador ver a causa
/// raiz e não a consequência — e um teste que montasse a ilha pela metade
/// estaria a medir a ordem das perguntas em vez da pergunta.
async fn ilha_de_teste(manifesto: &str) -> Option<aegis_island::Ilha> {
    let url = url()?;
    let pool = aegis_store::abrir(&url).await.ok()?;
    let _ = aegis_store::aplicar(&pool).await;
    let m: Manifesto = serde_yaml::from_str(manifesto).expect("manifesto de teste");

    let repo = Repo::new(pool);
    let slug = m.id.as_str().to_string();
    let tenant = repo
        .tenant(&slug, &slug, &slug)
        .await
        .expect("criar o tenant do teste");
    repo.definir_seed(&tenant.id, m.versao_do_seed() as i32)
        .await
        .expect("marcar o seed do teste");

    Some(aegis_island::Ilha::de_manifesto(m, repo))
}

const BASE: &str = r#"
id: cadernal
versao: 1
licenca: { exige: cadernal }
ontologia:
  tipos:
    - nome: anotacao
      propriedade_titulo: titulo
      propriedades:
        - { nome: titulo, tipo: texto }
paginas:
  - { slug: hoje, ficheiro: paginas/hoje.json }
saude:
  exigido:
    - "@banco"
dados:
  - { tipo: anotacao, chave: a1, propriedades: { titulo: primeira } }
"#;

#[tokio::test]
async fn antes_de_conferir_a_ilha_nao_fica_pronta() {
    // 🔴 Este é o teste mais importante do ficheiro. Uma ilha que acabou de
    // arrancar e ainda NÃO correu as verificações tem de dizer "não sei", e
    // não "está bem". Sem isto, o `/health/ready` mente desde o primeiro
    // instante em que responde.
    let Some(ilha) = ilha_de_teste(BASE).await else {
        eprintln!("SKIP: AEGIS_TESTE_BANCO não definido — este teste NÃO RODOU");
        return;
    };
    assert!(ilha.veredito().is_none(), "não devia ter veredicto ainda");
    let p = aegis_island::medir(&ilha).await;
    assert!(!p.pronto, "sem veredicto a ilha não pode estar pronta");
    assert_eq!(p.motivo, Some(Motivo::SaudeNaoConferida));
}

#[tokio::test]
async fn checagem_embutida_desconhecida_e_inconclusiva() {
    // 🔴 O vertical pediu uma verificação e a plataforma não a implementou.
    // A resposta honesta é "não conferido". A primeira versão desta regra
    // aceitava `@qualquer` como verde, que é o pior resultado possível:
    // um `@typo` no manifesto desligava a verificação em silêncio.
    let Some(ilha) = ilha_de_teste(&BASE.replace("\"@banco\"", "\"@nao-existe\"")).await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let v = ilha.medir_saude().await;
    assert_eq!(v.todas.len(), 1);
    assert_eq!(v.todas[0].estado, Estado::Inconclusivo);
    assert!(v.falha.is_some(), "inconclusivo tem de travar a ilha");

    let p = aegis_island::medir(&ilha).await;
    assert!(!p.pronto);
    assert_eq!(p.motivo, Some(Motivo::SaudeInconclusiva));
}

#[tokio::test]
async fn lista_de_verificacoes_vazia_e_inconclusiva() {
    // A lista vazia é o caso perigoso, não o seguro: foi ela que fez o gate
    // do núcleo anterior devolver "saudável" incondicionalmente, porque lia
    // um ficheiro de configuração que não existia em ilha nenhuma.
    let sem_saude = BASE.replace("saude:\n  exigido:\n    - \"@banco\"\n", "");
    let Some(ilha) = ilha_de_teste(&sem_saude).await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let v = ilha.medir_saude().await;
    assert_eq!(
        v.todas.len(),
        1,
        "a falta de checagens tem de ser declarada"
    );
    assert_eq!(v.todas[0].estado, Estado::Inconclusivo);
    assert!(!aegis_island::medir(&ilha).await.pronto);
}

#[tokio::test]
async fn o_veredicto_e_partilhado_entre_clones() {
    // 🔴 A ilha é clonada para cada handler do axum. Se cada clone tivesse o
    // seu veredicto, o `/health/ready` e o `estado` poderiam responder coisas
    // diferentes no mesmo segundo — e dois verdadeiros que discordam são
    // piores que um falso, porque ninguém sabe qual consultar.
    let Some(ilha) = ilha_de_teste(BASE).await else {
        eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU — inconclusivo, nunca verde");
        return;
    };
    let clonada = ilha.clone();
    assert!(ilha.veredito().is_none());

    clonada.medir_saude().await;

    let v = ilha
        .veredito()
        .expect("o veredicto escrito por um clone tem de ser visto pelos outros");
    assert!(!v.todas.is_empty());
    assert!(
        v.falha.is_none(),
        "com o tenant existente e o seed na versão, @banco passa: {:?}",
        v.falha
    );

    let p = aegis_island::medir(&ilha).await;
    // 🔴 E o caminho **verde** também é uma prova. Um gate só testado na
    // falha treina a pessoa a achar que verde é o estado normal; é preciso
    // provar que, com tudo em ordem, a ilha fica pronta.
    assert!(p.pronto, "tudo em ordem tem de dar pronto: {p:?}");
    assert_eq!(p.motivo, None);
    assert!(p.saude_ha.is_some(), "o veredicto tem de trazer a idade");
}

// ---------------------------------------------------------------------------
// A Prontidão lida do outro lado (o D5)
// ---------------------------------------------------------------------------

/// 🔴 **O que a ilha escreve é o que o cliente lê.** A peça ganhou
/// `Deserialize` quando o `diagnostico` da face agênrica precisou de a ler, e
/// a forma de investigação seria dizer *"não deu para conferir"* quando o
/// produto está bem.
#[test]
fn a_prontidao_que_a_ilha_escreve_e_a_que_o_cliente_le() {
    let original = serde_json::json!({
        "pronto": false,
        "banco": true,
        "tenant_ativo": false,
        "seed_esperado": 16,
        "seed_no_banco": 14,
        "saude": [{ "nome": "@banco", "estado": "ok", "detalhe": "respondeu" }],
        "saude_opcional": [{ "nome": "@extra", "estado": "falhou", "detalhe": "ausente" }],
        "saude_ha": 7,
        "motivo": "tenant-inativo",
        "o_que_dizer": "O tenant deste produto esta inativo."
    });
    let p = aegis_island::Prontidao::de_json(&original)
        .expect("o corpo que a ilha escreve tem de ser legivel");

    assert!(!p.pronto, "pronto:false tem de ler-se como false");
    assert!(p.banco, "o banco respondeu");
    assert!(!p.tenant_ativo, "o tenant esta inativo");
    assert_eq!(p.seed_esperado, 16);
    assert_eq!(p.seed_no_banco, 14);
    assert_eq!(p.saude.len(), 1);
    assert_eq!(p.saude[0].estado, Estado::Ok);
    // 🔴 E a **opcional** que falhou continua a ser lida como falhou, e não
    // descartada: uma opcional que ninguem ve e uma capacidade que morre
    // sem ninguem decidir.
    assert_eq!(p.saude_opcional.len(), 1);
    assert_eq!(p.saude_opcional[0].estado, Estado::Falhou);
    assert_eq!(p.saude_ha, Some(7));
    assert_eq!(p.motivo, Some(Motivo::TenantInativo));
    assert_eq!(
        p.o_que_dizer.as_deref(),
        Some("O tenant deste produto esta inativo.")
    );
}

/// 🔴 Uma ilha **mais velha** que não mande um campo tem de ser lida — e o
/// que falta tem de virar *não conferido*, nunca um valor inventado.
///
/// O caso perigoso é o `pronto`: um `default` nele transformava "a ilha não
/// disse" numa ilha **não pronta**, e essa leitura errada é silenciosa. A razão
/// de a peça aceitar uma Prontidão incompleta é a idade; a razão de não poder
/// é que um `503` sem `pronto` não é uma ilha por verificar, é outra coisa a
/// responder neste endereço.
#[test]
fn uma_ilha_mais_velha_e_lida_sem_inventar_o_que_falta() {
    let velho = serde_json::json!({ "pronto": true, "banco": true });
    let p = aegis_island::Prontidao::de_json(&velho)
        .expect("uma Prontidao incompleta ainda e Prontidao");

    assert!(p.pronto, "o que a ilha disse foi lido");
    assert!(p.banco);
    // 🔴 E o resto não foi inventado: `false` para `tenant_ativo` é o
    // `Default` do `bool`, e o `diagnostico` tem de o ler como *nao
    // conferido* — não como um tenant que se confirmou inativo. E é por isso
    // que a conferência usa `Prontidao` **com** o `saude` e não a inferir: a
    // distinção entre "nao mandou" e "mandou falso" nao existe no JSON, e a
    // unica forma honesta e a linha sair inconclusiva.
    assert!(p.saude.is_empty());
    assert!(p.saude_opcional.is_empty());
    assert_eq!(p.saude_ha, None);
    assert_eq!(p.motivo, None);
}

/// 🔴 E o **negativo**: um corpo que não é Prontidão tem de ser recusado, e
/// não lido como uma ilha em que está tudo a zero.
///
/// Este é o teste que impede o `serde(default)` de virar um *"está tudo bem"*:
/// um `from_value` sem critério devolveria um `Prontidao` com `pronto: false`
/// para **qualquer** corpo JSON, e a conferência diria *"o produto não está
/// instalado"* a quem mandou `{detail: "Bad Gateway"}`.
#[test]
fn um_corpo_que_nao_e_prontidao_e_recusado() {
    // Uma recusa comum das outras rotas: tem `codigo`, e o `pronto` falta.
    assert!(
        aegis_island::Prontidao::de_json(&serde_json::json!({
            "codigo": "pagina.inexistente",
            "mensagem": "Esta pagina nao existe neste produto."
        }))
        .is_none(),
        "uma recusa comum foi lida como Prontidao"
    );
    // Um proxy.
    assert!(
        aegis_island::Prontidao::de_json(&serde_json::json!({ "detail": "Bad Gateway" })).is_none(),
        "um 502 de proxy foi lido como Prontidao"
    );
    // 🔴 E o caso que o `serde(default)` sozinho **não** apanha: `pronto`
    // presente mas do **tipo errado**. Uma ilha que manda `"pronto": "sim"`
    // não é uma ilha, etratá-la como não pronta seria inventar um veredicto.
    assert!(
        aegis_island::Prontidao::de_json(&serde_json::json!({ "pronto": "sim" })).is_none(),
        "um pronto que nao e booleano foi lido como Prontidao"
    );
}
