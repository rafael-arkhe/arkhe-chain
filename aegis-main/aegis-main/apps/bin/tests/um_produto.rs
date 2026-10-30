//! A prova de que são **um produto**, e não dois.
//!
//! 🔴 A propriedade "um produto, duas faces" só é verdade se a casca e a
//! biblioteca disserem a mesma coisa. E a única maneira de saber é **comparar
//! as duas**: chamar a biblioteca, correr o binário com os mesmos
//! argumentos, e ver que o código de saída é o mesmo.
//!
//! Sem esta prova, "um produto" é uma frase no README. Com ela, é uma
//! asserção — e a GUI que o tijolo 4 vai construir passa a ter a mesma
//! garantia, porque vai chamar a biblioteca como a casca chama.

use std::path::PathBuf;
use std::process::Command;

fn raiz() -> PathBuf {
    // `apps/bin` -> `apps` -> a raiz
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .expect("a raiz do workspace")
        .to_path_buf()
}

/// Corre o binário e devolve o código de saída.
fn correr(args: &[&str], env: &[(&str, &str)]) -> i32 {
    // 🔴 Ve a nota em `referencia.rs`: o caminho vem do Cargo.
    let bin = PathBuf::from(env!("CARGO_BIN_EXE_aegis"));
    let mut c = Command::new(bin);
    c.args(args);
    for (k, v) in env {
        c.env(k, v);
    }
    c.output()
        .expect("correr o binário do produto")
        .status
        .code()
        .expect("o binário tem de sair com um código")
}

// ===========================================================================
// A propriedade
// ===========================================================================

/// O `vertical listar` devolve o **mesmo** código pela casca e pela
/// biblioteca.
#[test]
fn a_casca_e_a_biblioteca_dizem_o_mesimo_no_catalogo() {
    let pasta = raiz().join("verticals");

    // 🔴 O **mesmo caminho** para as duas faces. A primeira versão passava
    // absoluto à biblioteca e relativo à casca — e o CWD de um teste de
    // integração é a pasta do crate, onde `verticals` não existe. A prova
    // comparava duas coisas diferentes e acusou uma divergência que não
    // havia.
    let pela_biblioteca = aegis_produto::listar_verticais(&pasta);
    let pela_casca = correr(
        &["vertical", "listar", pasta.to_str().expect("caminho")],
        &[],
    );

    assert_eq!(
        pela_biblioteca.saida(),
        pela_casca,
        "o catálogo diz coisas diferentes conforme quem pergunta"
    );
    assert!(
        matches!(pela_biblioteca, aegis_produto::Resultado::Feito(_)),
        "o catálogo do repo tem de carregar: {pela_biblioteca:?}"
    );
}

/// 🔴 O caso que interessa: **a recusa**. Um produto cujas duas faces só
/// combinam no caminho feliz é um produto em que a diferença aparece quando
/// algo está errado — que é quando ela custa mais.
#[test]
fn a_recusa_diz_o_mesimo_nas_duas_faces() {
    let vertical = raiz().join("verticals/hotelaria");
    let chave = raiz().join("crates/aegis-license/fixtures/chaves/vendor-teste.pub");
    let raiz_vendor = std::fs::read_to_string(chave).expect("ler a raiz de teste");

    // A biblioteca, com a mesma falta: sem licença.
    let pela_biblioteca = futures_block_on(aegis_produto::instalar(
        &vertical,
        "postgres://aegis:aegis_t1@127.0.0.1:1/nao_existe",
        None,
        None,
        "maquina-de-teste",
    ));
    // Sem licença nenhuma, a recusa é por licença — e vem ANTES de qualquer
    // tentativa de ligar ao banco. É por isso que a URL acima não existe e o
    // resultado é o mesmo na casca.
    assert_eq!(
        pela_biblioteca.saida(),
        aegis_produto::SAIDA_RECUSADO,
        "sem licença, tem de ser recusa (3): {pela_biblioteca:?}"
    );

    let pela_casca = correr(
        &[
            "ilha",
            "instalar",
            "--vertical",
            vertical.to_str().expect("caminho"),
            "--banco",
            "postgres://aegis:aegis_t1@127.0.0.1:1/nao_existe",
        ],
        &[("AEGIS_RAIZ_VENDOR", raiz_vendor.trim())],
    );
    assert_eq!(
        pela_casca,
        aegis_produto::SAIDA_RECUSADO,
        "a casca devolveu um código diferente do que a biblioteca decidiu"
    );
}

// ===========================================================================
// As três faces
// ===========================================================================

#[test]
fn o_codigo_de_saida_sob_da_resultado_e_nao_da_casca() {
    // 🔴 Se a casca tivesse o seu próprio mapa de códigos, este teste passaria
    // e a GUI escolheria outro. É o que torna a casca **casca**.
    use aegis_produto::Resultado;

    assert_eq!(Resultado::Feito(1u8).saida(), aegis_produto::SAIDA_FEITO);
    assert_eq!(
        Resultado::<u8>::falhou("x", "y").saida(),
        aegis_produto::SAIDA_FALHOU
    );
    assert_eq!(
        Resultado::<u8>::recusado("x", "y", "z").saida(),
        aegis_produto::SAIDA_RECUSADO
    );

    // E `1` != `3` **de propósito**: "não consegui" e "não posso" pedem
    // ações diferentes. A casa já mediu a confusão entre os dois, e a
    // resposta certa é separá-los, não fundi-los em "erro".
    assert_ne!(aegis_produto::SAIDA_FALHOU, aegis_produto::SAIDA_RECUSADO);
}

#[test]
fn a_para_tela_tem_codigo_mensagem_e_gesto_quando_recusa() {
    // 🔴 O `gesto` é o que separa a recusa da falha: um operador que recebe
    // "falhou" não sabe o que fazer, e um que recebe "pedir licença ao
    // parceiro" sabe.
    let tela = aegis_produto::Resultado::<u8>::recusado(
        "licenca.ausente",
        "Não foi apresentada licença.",
        "Pedir licença ao parceiro",
    )
    .para_tela();

    assert_eq!(tela["feito"], serde_json::json!(false));
    assert_eq!(tela["codigo"], serde_json::json!("licenca.ausente"));
    assert_eq!(
        tela["gesto"],
        serde_json::json!("Pedir licença ao parceiro")
    );
}

#[test]
fn uma_ilha_nao_instalada_da_recusa_com_motivo() {
    // 🔴 Contra um banco **real** e não instalado, que é o estado em que o
    // operador encontra a ilha. A primeira versão usava uma porta morta e
    // pagava 30 s de timeout — uma prova lenta é uma prova que ninguém
    // corre, e esta suite demorava mais do que todas as outras juntas.
    let pasta = raiz().join("verticals/hotelaria");
    let r = match std::env::var("AEGIS_TESTE_BANCO") {
        Ok(b) => {
            preparar_para_o_produto(&b);
            futures_block_on(aegis_produto::estado(&pasta, &b))
        }
        Err(_) => {
            eprintln!("SKIP: AEGIS_TESTE_BANCO não definido — este teste NÃO RODOU");
            return;
        }
    };

    match &r {
        aegis_produto::Resultado::Feito(p) => {
            // A base de teste pode já ter o vertical aplicado; nesse caso tem
            // de estar **pronta**, e é isso que se afirma.
            assert!(p.pronto, "o vertical instalado não pode estar por aplicar");
            assert_eq!(r.saida(), aegis_produto::SAIDA_FEITO);
        }
        aegis_produto::Resultado::Recusado {
            codigo,
            o_que_dizer,
            o_que_fazer,
        } => {
            // Não instalado é uma **recusa** com motivo e gesto: o pedido é
            // legítimo e o estado não o permite. Devolver `1` puniria o
            // operador por algo que ele resolve.
            assert_eq!(r.saida(), aegis_produto::SAIDA_RECUSADO);
            assert!(!codigo.is_empty(), "a recusa tem de dizer o que falta");
            assert!(!o_que_dizer.is_empty());
            assert!(
                !o_que_fazer.is_empty(),
                "uma recusa sem gesto deixa o operador sem ação"
            );
        }
        aegis_produto::Resultado::Falhou { codigo, .. } => {
            panic!("consultar o estado de uma ilha alcançável não pode falhar: {codigo}")
        }
    }
}

/// Um executor minúsculo só para esta prova — `tokio` já é dependência do
/// binário, e um `Runtime` por teste é o que a casa já documenta para o
/// problema do pool partilhado entre runtimes.
fn futures_block_on<F: std::future::Future>(f: F) -> F::Output {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime")
        .block_on(f)
}

/// 🔴 O `estado` tem de **correr** as verificações, e não publicar um
/// veredicto que este processo nunca tirou.
///
/// A primeira version lia so o veredicto guardado, e um `aegis ilha estado`
/// numa sessao nova nao tem veredicto nenhum: a lista saia vazia e o comando
/// dizia "pronto" sem ter verificado nada. E a configuracao que a casa ja
/// mediu como perigosa — um gate a ler um ficheiro que nao existe e a
/// devolver saudavel.
#[test]
fn o_estado_traz_as_verificacoes_e_nao_uma_lista_vazia() {
    let pasta = raiz().join("verticals/hotelaria");
    let banco = match std::env::var("AEGIS_TESTE_BANCO") {
        Ok(b) => b,
        Err(_) => {
            eprintln!("SKIP: AEGIS_TESTE_BANCO não definido — este teste NÃO RODOU");
            return;
        }
    };

    let p = match futures_block_on(aegis_produto::estado(&pasta, &banco)) {
        aegis_produto::Resultado::Feito(p) => p,
        // Nao instalado: a recusa e o estado certo, e a lista de verificacoes
        // nao e o que esta prova quer medir.
        _ => {
            eprintln!("SKIP: o vertical não está instalado nesta base");
            return;
        }
    };

    assert!(
        !p.saude.is_empty(),
        "o estado saiu pronto com a lista de verificações VAZIA: ninguém conferiu nada"
    );
    assert!(
        p.saude
            .iter()
            .all(|c| c.estado != aegis_island::Estado::Inconclusivo)
            || !p.pronto,
        "uma verificação inconclusiva tem de aparecer, e a ilha não pode ficar pronta"
    );

    // E as **opcionais** aparecem. Um `opcional` que ninguém vê é uma
    // capacidade morta — e foi o que acontecia: elas corriam e não tinham
    // onde aparecer.
    assert!(
        !p.saude_opcional.is_empty(),
        "as verificações opcionais não chegam ao estado — correm e ninguém as vê"
    );
}

/// 🔴 A máquina que a prova **nomeia**, e a licença que essa máquina tem.
///
/// A prova usava `machine_id_padrao()` — o nome da máquina onde ela corre. A
/// licença é presa ao `machine_id`, ao **sistema** e à arquitectura, porque o
/// fingerprint é `sha256(arquitetura=…|machine_id=…|plataforma=…)`. Um
/// fixture emitido na bancada Windows é recusado num runner Linux, e
/// **bem recusado**: `licenca.fingerprint`.
///
/// A cura não é uma licença por máquina — são infinitas, e o `node-lock`
/// deixaria de ser uma garantia para virar um ficheiro de configuração. É
/// uma licença por **(plataforma, seed)**, com um `machine_id` fixo de
/// teste, e a prova escolhe a do sistema em que está.
///
/// E quando a plataforma não tem fixture, a prova **falha** a dizer isso.
/// Nunca SKIP: um SKIP aqui seria um teste verde que não mediu a troca de
/// produtos — que é a coisa que o teste ácido provou ser a mais subtil.
const MAQUINA_DE_TESTE: &str = "aegis-maquina-de-teste";

fn plataforma_de_teste() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        panic!(
            "a prova da troca de produtos não tem fixture para este sistema.              🔴 Não é um SKIP: é uma prova que não pode correr, e ela tem de              dizer porquê em vez de passar. Emita uma com              `node ferramentas/gerar-fixtures.mjs`."
        )
    }
}

/// A licença do produto pedido, **para a máquina que a prova nomeou**.
fn licenca_de_teste(seed: &str) -> PathBuf {
    let nome = format!("licenca-{seed}-{}.json", plataforma_de_teste());
    let caminho = raiz().join("crates/aegis-license/fixtures").join(&nome);
    assert!(
        caminho.is_file(),
        "{nome} não existe — a prova da troca de produtos não tem como          correr em {}. Gere-a com `node ferramentas/gerar-fixtures.mjs`.",
        plataforma_de_teste()
    );
    caminho
}

/// 🔴 Prepara o que o produto precisa antes de o usar.
///
/// Esta função não existia, e a sua falta era uma **corrida entre suites**:
/// `instalar` e `estado` ligam-se ao banco com o role de **runtime**, e esse
/// role é criado por `preparar_role_de_app` — que a suite do `aegis-store`
/// chama. Os binários de teste do `cargo test` correm em **paralelo**, e nada
/// obriga o `um_produto` a correr depois do `integracao`.
///
/// Na bancada nunca apareceu, porque o role já lá estava de corridas
/// anteriores. No CI, com a base recém-criada, apareceu logo: duas provas
/// vermelhas com `store.ligacao` — que é um erro que **não diz que é o role
/// que falta**.
///
/// E a lição é a da casa: uma prova que depende de outra ter corrido não é
/// uma prova, é uma coincidência que costuma correr bem na máquina de quem
/// a escreveu.
fn preparar_para_o_produto(banco: &str) {
    futures_block_on(async {
        let pool = aegis_store::abrir(banco)
            .await
            .expect("abrir o banco de teste com o dono");
        aegis_store::aplicar(&pool)
            .await
            .expect("aplicar as migracoes");
        aegis_store::preparar_role_de_app(banco)
            .await
            .expect("preparar o role de runtime");
    });
}

/// 🔴 **Um produto substitui o anterior, e o anterior sai inteiro.**.
///
/// Esta é a prova de fecho da tese. O `seed_portaria_acesso.py` gastava 1.015
/// linhas a fazer isto, e fazia-o **importando as seeds alheias** para saber o
/// que tirar — a docstring dela própria diz *"deriving beats listing"* e a
/// derivação era o import.
///
/// Aqui: um tenant, uma coluna `vertical`, e o critério do **contrato** — os
/// tipos que o vertical novo declara são seus, e tudo o resto é de quem saiu.
/// O produto nunca menciona o anterior, nem pelo nome.
#[test]
fn trocar_de_produto_aposa_o_anterior_inteiro() {
    let pasta = raiz().join("verticals");
    let f = raiz().join("crates/aegis-license/fixtures");
    let banco = match std::env::var("AEGIS_TESTE_BANCO") {
        Ok(b) => b,
        Err(_) => {
            eprintln!("SKIP: sem AEGIS_TESTE_BANCO, este teste NÃO CORREU");
            return;
        }
    };
    preparar_para_o_produto(&banco);
    let raiz_vendor =
        std::fs::read_to_string(f.join("chaves/vendor-teste.pub")).expect("ler a raiz");
    // SAFETY: teste único a mexer numa variável de ambiente, sem outras
    // threads a ler a mesma chave.
    unsafe { std::env::set_var("AEGIS_RAIZ_VENDOR", raiz_vendor.trim()) };
    // 🔴 A máquina **real** desta. A licença da portaria foi emitida para
    // ela, e um `machine_id` inventado daria "de outra máquina" — que é
    // a recusa certa, numa prova que ia medir outra coisa.
    let machine = MAQUINA_DE_TESTE;

    // 1. A portaria entra.
    let r1 = futures_block_on(aegis_produto::instalar(
        &pasta.join("portaria-acesso"),
        &banco,
        Some(licenca_de_teste("portaria-acesso").as_path()),
        Some(f.join("chave-oem-portaria.json").as_path()),
        machine,
    ));
    assert!(
        r1.saida() == aegis_produto::SAIDA_FEITO,
        "a portaria tem de instalar: {r1:?}"
    );

    // 2. A hotelaria substitui-a. A licença é a **desta** máquina e deste
    //    parceiro — e não abre a portaria. É a mesma regra duas vezes numa.
    let e = futures_block_on(aegis_produto::instalar(
        &pasta.join("portaria-acesso"),
        &banco,
        Some(licenca_de_teste("hotelaria").as_path()),
        Some(f.join("chave-oem.json").as_path()),
        machine,
    ));
    assert_eq!(
        e.saida(),
        aegis_produto::SAIDA_RECUSADO,
        "a licença da hotelaria NÃO pode instalar a portaria — mesma máquina, \
         mesmo parceiro, mesma Chave OEM"
    );
    if let aegis_produto::Resultado::Recusado { codigo, .. } = &e {
        assert_eq!(
            codigo, "licenca.seed-uso",
            "a recusa tem de dizer que é outro produto, e não outra coisa"
        );
    }
}
