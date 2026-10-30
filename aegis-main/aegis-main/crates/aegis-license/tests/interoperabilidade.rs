//! A prova de interoperabilidade.
//!
//! 🔴 **Estes fixtures foram emitidos pelo `aegis-cli`** (o emissor de
//! verdade), não escritos à mão. Um fixture escrito à mão provaria só que o
//! verificador concorda consigo mesmo — que é o modo de "compatível" que
//! produz o dia em que a licença real não instala.
//!
//! A prova é direta e não admiteInterpretation: o Node assinou, o Rust
//! confere. Se a forma canónica divergir num byte, a Ed25519 **não** bate e
//! esta prova fica vermelha — e o vermelho aponta para a linha da canonico.
use aegis_license::{
    ChavePublica, EstadoValidade, FORMATO, Motivo, Pedido, TIPO_LICENCA, TIPO_OEM, verificar,
};
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::path::{Path, PathBuf};

fn raiz() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures")
}

fn ler(nome: &str) -> Value {
    let caminho = raiz().join(nome);
    let texto = std::fs::read_to_string(&caminho)
        .unwrap_or_else(|e| panic!("não li {}: {e}", caminho.display()));
    serde_json::from_str(&texto).unwrap_or_else(|e| panic!("{} não é JSON: {e}", caminho.display()))
}

fn chave_raiz_de_teste() -> ChavePublica {
    let caminho = raiz().join("chaves").join("vendor-teste.pub");
    let texto = std::fs::read_to_string(&caminho).expect("ler a raiz de teste");
    ChavePublica::nova(texto.trim()).expect("a raiz de teste tem de ser uma chave válida")
}

/// O instante do julgamento, **injetado**.
///
/// 🔴 Nunca lido do relógio de dentro. Uma prova que lê o relógio fica
/// vermelha sozinha quando o fixture vence, e o vermelho aponta para o
/// produto — que é a forma mais cara de um teste envelhecer.
const AGORA: &str = "2026-10-01T12:00:00Z";
const FP_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

fn agora() -> DateTime<Utc> {
    AGORA.parse().expect("instante de teste")
}

fn pedir<'a>(
    raiz: &'a ChavePublica,
    oem: Option<&'a Value>,
    fingerprint: Option<&'a str>,
    seed: Option<&'a str>,
) -> Pedido<'a> {
    Pedido {
        raiz,
        chave_oem: oem,
        fingerprint,
        seed,
        agora: agora(),
        ultimo_visto: None,
    }
}

// ===========================================================================
// A prova
// ===========================================================================

#[test]
fn a_forma_canonica_reproduz_a_do_emissor() {
    // 🔴 ESTA É A PROVA. A assinatura foi feita pelo `aegis-cli`; se a
    // canonico daqui divergir num byte, a Ed25519 não bate. Não há
    // interpretações: ou o Node e o Rust concordam byte a byte, ou não são
    // compatíveis.
    let raiz = chave_raiz_de_teste();
    let oem = ler("chave-oem.json");
    assert!(
        aegis_license::assinatura_confere(&oem, &raiz),
        "a Chave OEM assinada pelo emissor não confere: a forma canónica diverge"
    );
    assert_eq!(oem["aegis"], FORMATO);
    assert_eq!(oem["tipo"], TIPO_OEM);
}

#[test]
fn a_cadeia_inteira_confere() {
    let raiz = chave_raiz_de_teste();
    let oem = ler("chave-oem.json");
    let licenca = ler("licenca-ok.json");

    let v = verificar(
        &licenca,
        &pedir(&raiz, Some(&oem), Some(FP_A), Some("hotelaria")),
    )
    .unwrap_or_else(|e| panic!("a licença válida tem de verificar: {e:?}"));

    assert_eq!(v.parceiro, "Parceiro de Teste");
    assert_eq!(v.seed, "hotelaria");
    assert_eq!(v.estado, EstadoValidade::Valida);
    assert_eq!(
        v.licenca_id.as_deref(),
        Some("11111111-2222-3333-4444-555555555555")
    );
    assert_eq!(licenca["tipo"], TIPO_LICENCA);
}

// ===========================================================================
// As recusas — cada uma tem motivo NOME
// ===========================================================================

#[test]
fn outra_maquina_e_recusada_com_motivo() {
    let raiz = chave_raiz_de_teste();
    let oem = ler("chave-oem.json");
    let licenca = ler("licenca-outra-maquina.json");

    let e = verificar(
        &licenca,
        &pedir(&raiz, Some(&oem), Some(FP_A), Some("hotelaria")),
    )
    .unwrap_err();
    assert_eq!(e.codigo(), "licenca.fingerprint");
    assert_eq!(e.motivo, Motivo::Fingerprint);
}

#[test]
fn outro_vertical_e_recusado_com_motivo() {
    // 🔴 A regra que liga a licença ao PRODUTO. Uma licença de hotelaria não
    // instala contagem — é o que impede um vertical novo de ser instalado por
    // uma licença que não o contrata.
    let raiz = chave_raiz_de_teste();
    let oem = ler("chave-oem.json");
    let licenca = ler("licenca-outro-vertical.json");

    let e = verificar(
        &licenca,
        &pedir(&raiz, Some(&oem), Some(FP_A), Some("hotelaria")),
    )
    .unwrap_err();
    // A licença é de `safetag`, que não está na cota da Chave OEM: recusa de
    // **cota**, não de uso. São motivos diferentes e dão gestos diferentes.
    assert_eq!(e.codigo(), "licenca.seed");
}

#[test]
fn usar_a_licenca_em_outro_vertical_e_recusado() {
    // A licença é boa, mas o operador pediu outro produto. A recusa é de
    // **uso**, e não de cota: a licença cobre o que pede, não o que se
    // instala.
    let raiz = chave_raiz_de_teste();
    let oem = ler("chave-oem.json");
    let licenca = ler("licenca-ok.json");

    let e = verificar(
        &licenca,
        &pedir(&raiz, Some(&oem), Some(FP_A), Some("contagem-sacos")),
    )
    .unwrap_err();
    assert_eq!(e.codigo(), "licenca.seed-uso");
}

#[test]
fn licenca_vencida_e_recusada() {
    let raiz = chave_raiz_de_teste();
    let oem = ler("chave-oem.json");
    let licenca = ler("licenca-vencida.json");

    let e = verificar(
        &licenca,
        &pedir(&raiz, Some(&oem), Some(FP_A), Some("hotelaria")),
    )
    .unwrap_err();
    assert_eq!(e.codigo(), "licenca.expirada");
}

#[test]
fn uma_chave_que_nao_assinou_nada_reprova() {
    // Sem isto, um verificador com a chave errada em vez nenhuma devolvia
    // "não verificável" e o chamador tratava isso como "pode ser que esteja
    // bom". Uma assinatura tem de reprovar contra a chave que não a fez.
    // Uma SPKI válida (o prefixo certo) mas que não assinou nada.
    let spki_vazia = format!("MCowBQYDK2VwAyEA{}", "A".repeat(43));
    let outra = ChavePublica::nova(&spki_vazia).expect("SPKI bem formada");
    assert!(!aegis_license::assinatura_confere(
        &ler("licenca-ok.json"),
        &outra
    ));
    assert!(!aegis_license::assinatura_confere(
        &ler("chave-oem.json"),
        &outra
    ));
}

#[test]
fn a_raiz_de_teste_nao_é_a_de_producao() {
    // 🔴 A razão de os fixtures usarem uma raiz própria: um fixture
    // assinado pela raiz de PRODUÇÃO seria uma licença válida na máquina de
    // um cliente — a raiz de produção é a que vai embutida no binário, e o
    // que ela assina vale em todo o lado. Esta prova diz que a raiz de teste
    // é mesmo outra.
    let raiz = chave_raiz_de_teste();
    let da_bancada = std::path::Path::new(
        &std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_default(),
    )
    .join(".aegis")
    .join("chaves")
    .join("vendor.pub");

    if !da_bancada.is_file() {
        eprintln!("SKIP: não há vendor.pub da bancada neste runner");
        return;
    }
    let publica_bancada = std::fs::read_to_string(&da_bancada).expect("ler a raiz da bancada");
    assert_ne!(
        raiz.como_texto(),
        publica_bancada.trim(),
        "a raiz de teste é a de produção — os fixtures deste repo seriam \
         licenças válidas em máquina de cliente"
    );
}

/// 🔴 **Uma chave que está num fixture tem de ser uma chave de verdade.**
///
/// Isto nasceu de um defeito que **ninguém apanhou** — nem o `cargo test`,
/// nem a leitura, nem o `clippy`.
///
/// O gerador passou a reutilizar o par do parceiro, e reutilizou-o com
/// `publicaDe(ficheiro)`, que devolve um `KeyObject` do Node. O `String()` de
/// um `KeyObject` é `"[object KeyObject]"` — que é uma string **válida**, que
/// assina, que viaja no documento, e que a conferência toda aceita, porque a
/// conferência usa a `pub_parceiro` do **próprio documento**. Ou seja: a chave
/// errada verificava a assinatura errada com a chave errada, e tudo era
/// coerente.
///
/// Só apareceu quando alguém leu um `git diff`. A prova de que a chave do
/// documento é a chave **do ficheiro** é o que transforma "alguém leu o diff"
/// em "a suite disse".
#[test]
fn a_chave_de_cada_fixture_e_a_chave_do_ficheiro() {
    let publica = std::fs::read_to_string(raiz().join("chaves/parceiro-teste.pub"))
        .expect("a pública do parceiro de teste")
        .trim()
        .to_string();

    // 1. A pública do ficheiro tem de ser uma SPKI Ed25519. `ChavePublica::nova`
    //    valida o formato — e recusa `[object KeyObject]` como recusa
    //    qualquer outra coisa.
    ChavePublica::nova(&publica).unwrap_or_else(|e| {
        panic!(
            "a pública do parceiro de teste não é uma chave: {e}\n\
             É o sintoma de uma chave serializada como `String(KeyObject)` — \
             `publicaDe()` devolve um `KeyObject`, não a base64url."
        )
    });

    // 2. E a que viaja no documento tem de ser **a mesma**.
    for nome in ["chave-oem.json", "chave-oem-portaria.json"] {
        let carga = aegis_license::CargaOem::de(&ler(nome))
            .unwrap_or_else(|| panic!("{nome}: a carga não se lê"));
        assert_eq!(
            carga.pub_parceiro, publica,
            "{nome} declara uma pub_parceiro que não é a do ficheiro de chaves.\n\
             A assinatura confere na mesma — porque é a chave do próprio \
             documento que a confere — e o fixture vale por uma chave que não \
             existe em lado nenhum."
        );
    }
}

// ===========================================================================
// As propriedades do verificador
// ===========================================================================

#[test]
fn cada_motivo_tem_codigo_frase_e_gesto() {
    let motivos = [
        Motivo::Formato,
        Motivo::AssinaturaOem,
        Motivo::SemSeeds,
        Motivo::SemRaiz,
        Motivo::SemChaveOem,
        Motivo::AssinaturaParceiro,
        Motivo::Assinatura,
        Motivo::Parceiro,
        Motivo::Seed,
        Motivo::Prazo,
        Motivo::Fingerprint,
        Motivo::SeedUso,
        Motivo::Expirada,
    ];
    let mut codigos: Vec<&str> = motivos.iter().map(|m| m.codigo()).collect();
    let total = codigos.len();
    codigos.sort();
    codigos.dedup();
    assert_eq!(codigos.len(), total, "dois motivos com o mesmo código");

    for m in motivos {
        assert!(!m.humano().is_empty());
        assert!(!m.gesto().is_empty());
        assert_ne!(m.gesto(), m.humano(), "{m:?} repete o diagnóstico no gesto");
    }
}

#[test]
fn a_chave_nunca_e_impressa_inteira() {
    // 🔴 Uma tela ou um log que despeja a chave transforma a auditoria numa
    // recolha de chaves. A casa mediu isso com a Chave OEM que viajava em
    // todo o exe entregue ao parceiro.
    let r = chave_raiz_de_teste();
    let texto = r.to_string();
    assert!(texto.contains('…'), "a chave tem de sair truncada: {texto}");
    assert!(
        texto.len() < r.como_texto().len(),
        "o Display está a mostrar tanto como a chave"
    );
}

#[test]
fn a_chave_malformada_e_recusada_antes_de_a_verificacao() {
    // Uma chave que não é chave tem de dar `None` na construção, e não uma
    // recusa de "assinatura inválida" — que é um motivo FALSO para o que
    // aconteceu.
    assert!(ChavePublica::nova("isto-nao-e-chave").is_err());
    assert!(ChavePublica::nova("").is_err());
    // 43 caracteres é a chave CRUA de 32 bytes — e o emissor não manda a
    // chave crua: manda SPKI, 59 caracteres. Uma chave de 32 bytes crua é
    // recusada de propósito, porque aceitar as duas é aceitar uma chave que
    // ninguém assinou.
    assert!(ChavePublica::nova(&"A".repeat(43)).is_err());
    assert!(ChavePublica::nova(&"A".repeat(44)).is_err());
    assert!(
        ChavePublica::nova(&"A".repeat(59)).is_err(),
        "SPKI sem o prefixo certo"
    );
    // E a boa: a do fixture.
    assert!(ChavePublica::nova(chave_raiz_de_teste().como_texto()).is_ok());
}

#[test]
fn o_fingerprint_aceita_as_duas_formas() {
    let com_prefixo = format!("sha256:{}", FP_A.to_uppercase());
    assert_eq!(
        aegis_license::normalizar_fingerprint(&com_prefixo).unwrap(),
        FP_A
    );
    assert_eq!(aegis_license::normalizar_fingerprint(FP_A).unwrap(), FP_A);
    // Recusa por maiúscula é o tipo de rigor que não protege nada e atrapalha
    // em campo.
    assert!(aegis_license::normalizar_fingerprint("curto").is_err());
    assert!(aegis_license::normalizar_fingerprint(&"z".repeat(64)).is_err());
}

#[test]
fn o_relogio_para_tras_nao_ressuscita_licenca() {
    // 🔴 A casa já mediu um verificador que ressuscitava licença com o
    // `ultimoVisto` a andar. A data do último visto só anda para a frente, e
    // aqui a regra é testada diretamente.
    let raiz = chave_raiz_de_teste();
    let oem = ler("chave-oem.json");
    let licenca = ler("licenca-vencida.json");

    let mut p = pedir(&raiz, Some(&oem), Some(FP_A), Some("hotelaria"));
    p.agora = "2026-01-05T00:00:00Z".parse().unwrap();
    // A licença está vencida e o "último visto" é de depois — o relógio
    // andou para trás e a validade NÃO volta.
    p.ultimo_visto = Some("2026-09-01T00:00:00Z".parse().unwrap());

    let e = verificar(&licenca, &p).unwrap_err();
    assert_eq!(e.codigo(), "licenca.expirada");
}
