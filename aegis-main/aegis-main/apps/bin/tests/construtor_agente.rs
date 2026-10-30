//! O Construtor **agêntico**: o agente escreve a página, o produto grava.
//!
//! 🔴 Isto é o D12, e é a primeira vez que a face agênica **muda alguma
//! coisa**. As onze anteriores liam: o manifesto, as câmaras, a licença, a
//! ilha, a conferência. Esta grava — e por isso a prova é a mais cuidadosa do
//! repositório, por três razões que são as três da casa:
//!
//! 1. 🔴 **Contra uma CÓPIA.** A prova mexe na coisa que prova, e um
//!    `git checkout` de limpeza já reverteu correções duas vezes. O vertical de
//!    onde a cópia sai é **lido**; a cópia é que sofre.
//! 2. 🔴 **Pelo mesmo caminho do protocolo.** A prova entra por
//!    `mcp::chamada`, que é a função que o `tools/call` despacha. Chamar a
//!    montagem directamente provaria a biblioteca, e não a ferramenta.
//! 3. 🔴 **A recusa tem de trazer `gesto`.** Um `isError: true` sem gesto
//!    obriga o modelo a inventar o que fazer a seguir — e o modelo inventa mal.

use std::path::{Path, PathBuf};

use aegis_bin::mcp::{Contexto, chamada, ferramentas};
use serde_json::{Value, json};

/// 🔴 O `cargo test` corre com o directório do crate, não a raiz do repo. Já
/// mordeu duas vezes (`um_produto.rs` e `referencia.rs`) e o sintoma é sempre o
/// mesmo: *"a prova falha e o ficheiro está certo"*.
fn raiz() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .expect("a raiz do workspace")
        .to_path_buf()
}

/// A máquina que a prova **nomeia**, e a licença que essa máquina tem.
///
/// 🔴 A licença é presa ao `machine_id`, ao sistema e à arquitectura, porque o
/// fingerprint é `sha256(arquitectura=…|machine_id=…|plataforma=…)`. Um fixture
/// emitido na bancada Windows é recusado num runner Linux — e **bem recusado**,
/// com `licenca.fingerprint`. A cura não é uma licença por máquina (são
/// infinitas, e o `node-lock` deixaria de ser uma garantia): é uma licença por
/// **(plataforma, seed)**, com uma `machine_id` fixa de teste.
const MAQUINA_DE_TESTE: &str = "aegis-maquina-de-teste";

fn plataforma_de_teste() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        panic!(
            "a prova não tem fixture para este sistema — e ela tem de dizer porquê em vez de passar"
        )
    }
}

fn fixture(nome: &str) -> PathBuf {
    raiz().join("crates/aegis-license/fixtures").join(nome)
}

/// O contexto de um servidor que fala o vertical de uma cópia.
fn contexto(pasta: &Path) -> Contexto {
    let seed = "hotelaria";
    let licenca = fixture(&format!("licenca-{seed}-{}.json", plataforma_de_teste()));
    assert!(
        licenca.is_file(),
        "{} não existe — gere-a com `node ferramentas/gerar-fixtures.mjs`",
        licenca.display()
    );
    Contexto {
        pasta: pasta.to_path_buf(),
        exige: seed.to_string(),
        licenca: Some(licenca),
        chave_oem: Some(fixture("chave-oem.json")),
        machine_id: MAQUINA_DE_TESTE.to_string(),
    }
}

/// A base temporária, com uma pasta por prova: duas provas que partilham o
/// mesmo sítio é a classe de defeito que a casa já mediu (`set_var` é global ao
/// processo e o `cargo test` corre em fios).
fn base(nome: &str) -> PathBuf {
    let b = std::env::temp_dir().join(format!("aegis-agente-{nome}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&b);
    std::fs::create_dir_all(&b).expect("criar a base temporaria");
    b
}

/// O `cp -r` do Rust: não há `copy_dir_recursive` na biblioteca padrão.
fn copiar(origem: &Path, destino: &Path) {
    std::fs::create_dir_all(destino).expect("criar o destino");
    for entrada in std::fs::read_dir(origem).expect("ler a origem") {
        let entrada = entrada.expect("ler uma entrada");
        let p = entrada.path();
        let d = destino.join(entrada.file_name());
        if p.is_dir() {
            copiar(&p, &d);
        } else {
            std::fs::copy(&p, &d).expect("copiar o ficheiro");
        }
    }
}

/// Uma cópia do vertical, e a pasta onde ela vive.
fn vertical_de_prova(nome: &str) -> (PathBuf, PathBuf) {
    let base = base(nome);
    let pasta = base.join("vertical");
    copiar(&raiz().join("verticals/hotelaria"), &pasta);
    (base, pasta)
}

/// O que a ferramenta **devolveu**.
///
/// 🔴 A resposta MCP traz os dados como **texto** dentro de `content`, e não
/// num `structuredContent` que o opencode e o resto do mundo understands igual.
/// Uma prova que assumisse o formato errado passaria a checar o sitio errado —
/// e passaria.
fn devolveu(resposta: &Value) -> Value {
    assert_eq!(
        resposta["isError"],
        json!(false),
        "o produto recusou: {resposta}"
    );
    serde_json::from_str(resposta["content"][0]["text"].as_str().expect("o texto"))
        .expect("o conteúdo da resposta é JSON")
}

/// O que a **recusa** trouxe: o `codigo`, e a frase e o gesto.
fn recusa(resposta: &Value) -> Value {
    assert_eq!(
        resposta["isError"],
        json!(true),
        "esperava uma recusa e veio um sucesso: {resposta}"
    );
    assert!(
        resposta.get("error").is_none_or(Value::is_null),
        "a recusa do produto veio como erro de PROTOCOLO — o que diria que a \
         ferramenta não existe, que é outra coisa: {resposta}"
    );
    serde_json::from_str(resposta["content"][0]["text"].as_str().expect("o texto"))
        .expect("o conteúdo da recusa é JSON")
}

/// O que o **manifesto** declara — que é a pergunta que a ilha faz.
fn paginas_declaradas(pasta: &Path) -> Vec<String> {
    let manifesto = aegis_vertical::carregar(pasta).expect("o vertical tem de carregar");
    manifesto.paginas.iter().map(|p| p.slug.clone()).collect()
}

/// Uma página do vertical, como o agente a receberia.
fn pagina_do_vertical(pasta: &Path) -> Value {
    let ficheiros = std::fs::read_dir(pasta.join("paginas")).expect("o vertical tem paginas");
    let primeiro = ficheiros
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .find(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .expect("o vertical tem pelo menos uma pagina");
    serde_json::from_str(&std::fs::read_to_string(primeiro).expect("ler a pagina"))
        .expect("a pagina e JSON")
}

// ===========================================================================
// A lista é a do despacho
// ===========================================================================

/// 🔴 A ferramenta que escreve está no `tools/list`, e o `tools/list` **é** a
/// tabela que despacha. Duas listas divergem, e a divergência de um
/// `tools/list` só se descobre em produção.
#[test]
fn a_ferramenta_que_escreve_esta_na_lista_com_o_seu_esquema() {
    let lista = ferramentas();
    let achada = lista
        .iter()
        .find(|t| t["name"] == "construtor.pagina_gravar")
        .unwrap_or_else(|| {
            panic!(
                "a ferramenta que escreve não está no `tools/list`. A lista tem: {:?}",
                lista.iter().map(|t| &t["name"]).collect::<Vec<_>>()
            )
        });

    assert_eq!(achada["inputSchema"]["required"][0], "pagina");
    assert_eq!(
        achada["inputSchema"]["properties"]["pagina"]["type"],
        json!("object")
    );
    // 🔴 E **não** há `pasta`: o vertical é o do contexto, e um esquema que
    // aceita um caminho é um esquema que aceita escrever noutro produto.
    assert!(
        achada["inputSchema"]["properties"].get("pasta").is_none(),
        "a ferramenta que escreve não pode aceitar um caminho"
    );
}

// ===========================================================================
// Gravar
// ===========================================================================

/// 🔴 A página vai para o disco e o `vertical.yaml` **regenera-se**.
#[tokio::test]
async fn o_agente_escreve_a_pagina_e_o_manifesto_e_regerado() {
    let (base, pasta) = vertical_de_prova("gravar");
    let antes = paginas_declaradas(&pasta).len();

    let mut pagina = pagina_do_vertical(&pasta);
    pagina["slug"] = json!("agente-escreveu");
    pagina["titulo"] = json!("A página que o agente escreveu");

    let resposta = chamada(
        &contexto(&pasta),
        "construtor.pagina_gravar",
        json!({ "pagina": pagina }),
    )
    .await;
    let devolvido = devolveu(&resposta);
    assert_eq!(devolvido["accao"], json!("acrescentada"));

    // O ficheiro existe e é a que o agente mandou.
    let escrita: Value = serde_json::from_str(
        &std::fs::read_to_string(pasta.join("paginas").join("agente-escreveu.json"))
            .expect("a página foi escrita"),
    )
    .expect("a página escrita é JSON");
    assert_eq!(escrita["titulo"], json!("A página que o agente escreveu"));

    // 🔴 E o manifesto **regenerou** com a página nova. É esta afirmação que
    // diz que o manifesto é um artefacto gerado — e sem ela o agente escrevia
    // uma página que a ilha nunca abriria, sem nenhum erro em lado nenhum.
    let declaradas = paginas_declaradas(&pasta);
    assert!(
        declaradas.iter().any(|s| s == "agente-escreveu"),
        "o manifesto não lista a página escrita, e a ilha só abre o que o \
         manifesto lista: {declaradas:?}"
    );
    assert_eq!(declaradas.len(), antes + 1);

    let _ = std::fs::remove_dir_all(&base);
}

/// 🔴 Gravar **duas vezes** a mesma página substitui. Duplicar não dá erro em
/// lado nenhum — o ficheiro é o mesmo, escrito duas vezes. O que aparece é o
/// item do menu repetido, no cliente, dias depois.
#[tokio::test]
async fn gravar_a_mesma_pagina_duas_vezes_substitui_e_nao_duplica() {
    let (base, pasta) = vertical_de_prova("substituir");
    let ctx = contexto(&pasta);

    let mut pagina = pagina_do_vertical(&pasta);
    pagina["slug"] = json!("a-mesma");
    pagina["titulo"] = json!("Primeira versão");

    chamada(
        &ctx,
        "construtor.pagina_gravar",
        json!({ "pagina": pagina.clone() }),
    )
    .await;
    pagina["titulo"] = json!("Segunda versão");
    let segunda = chamada(
        &ctx,
        "construtor.pagina_gravar",
        json!({ "pagina": pagina }),
    )
    .await;
    let devolvido = devolveu(&segunda);

    assert_eq!(devolvido["accao"], json!("substituida"));
    let declaradas = paginas_declaradas(&pasta);
    assert_eq!(
        declaradas.iter().filter(|s| *s == "a-mesma").count(),
        1,
        "o manifesto ficou com a mesma página duas vezes: {declaradas:?}"
    );
    assert_eq!(
        devolvido["paginas"],
        json!(declaradas.len()),
        "a montagem conta um número de páginas que o manifesto não tem"
    );

    let escrita: Value = serde_json::from_str(
        &std::fs::read_to_string(pasta.join("paginas").join("a-mesma.json")).expect("ler"),
    )
    .expect("json");
    assert_eq!(escrita["titulo"], json!("Segunda versão"));

    let _ = std::fs::remove_dir_all(&base);
}

/// 🔴 Uma página que não carrega é **recusa do produto**, com `codigo`, `frase`
/// e `gesto` — e nada foi escrito.
///
/// Este é o teste que vale mais dos três: a casa já pagou por um erro sem
/// `gesto`, e por um `gesto` que mandava o operador fazer uma coisa que não
/// existia. E uma recusa que deixa o disco meio montado é pior do que uma
/// recusa.
#[tokio::test]
async fn uma_pagina_invalida_recusa_com_motivo_e_nao_escreve_nada() {
    let (base, pasta) = vertical_de_prova("recusa");
    let antes = paginas_declaradas(&pasta).len();

    // 🔴 Uma página **válida** que aponta para uma variável que não existe —
    // e não uma página malformada. São recusas diferentes (`pagina.formato`
    // contra `pagina.variavel-pendente`) e a que importa aqui é a segunda: é a
    // que diz que a página não diz o que a ilha vai mostrar.
    let mut pagina = pagina_do_vertical(&pasta);
    pagina["slug"] = json!("partida");
    let blocos = pagina["blocos"]
        .as_array()
        .expect("a página tem blocos")
        .clone();
    assert!(!blocos.is_empty(), "a página do vertical não tem blocos");
    let mut blocos = blocos;
    blocos[0]["variavel"] = json!("que_nao_existe");
    pagina["blocos"] = Value::Array(blocos);

    let resposta = chamada(
        &contexto(&pasta),
        "construtor.pagina_gravar",
        json!({ "pagina": pagina }),
    )
    .await;
    let recusado = recusa(&resposta);

    // 🔴 As três peças do contrato, e as três **por nome**.
    assert_eq!(
        recusado["codigo"],
        json!("pagina.variavel-pendente"),
        "a recusa veio com outro código: {recusado}"
    );
    // 🔴 E o campo no fio é `mensagem`, não `frase`: a casa chama-lhe frase,
    // e o que viaja é o nome que a CLI e a janela já usavam. Uma prova que
    // verificasse `frase` estaria a verificar um campo que não existe — e
    // passaria a dizer que o contrato está partido quando está inteiro.
    for campo in ["mensagem", "gesto"] {
        assert!(
            !recusado[campo]
                .as_str()
                .unwrap_or_default()
                .trim()
                .is_empty(),
            "a recusa veio sem `{campo}`, e sem ele o modelo inventa o que \
             fazer a seguir: {recusado}"
        );
    }

    // 🔴 E **nada** foi escrito: nem a página, nem o manifesto.
    assert!(
        !pasta.join("paginas").join("partida.json").exists(),
        "a página recusada ficou escrita no disco"
    );
    assert_eq!(
        paginas_declaradas(&pasta).len(),
        antes,
        "a recusa mudou o vertical"
    );

    let _ = std::fs::remove_dir_all(&base);
}
