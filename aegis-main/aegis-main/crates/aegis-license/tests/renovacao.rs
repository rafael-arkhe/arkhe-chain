//! A renovação, provada contra o **emissor de verdade**.
//!
//! 🔴 Esta suite não é um teste da forma canónica. Os fixtures são
//! **assinados pelo `aegis-cli`** (`ferramentas/gerar-fixtures.mjs`, que
//! chama `montarPedidoRenovacao` e `montarResposta` do emissor), e o Rust
//! **confere**. A única maneira de isto passar é a forma canónica ser byte a
//! byte igual à do Node.
//!
//! # O instante é congelado, e o contrato diz qual é
//!
//! `renovacao-contrato.json` traz o `agora` dos testes. Um teste que depende
//! de uma data escrita no `.rs` e de outra escrita no gerador diverge no
//! primeiro dia em que alguém mexe numa das duas — e diverge em **verde**,
//! que é a forma mais cara.
//!
//! # O que cada recusa prova
//!
//! Cada motivo tem a sua fixture, e nenhuma é a mesma resposta com a data
//! trocada. É isso que distingue "a regra existe" de "a regra existe **e esta
//! é a que disparou**".

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use aegis_license::{
    Carga, ChavePublica, ContextoRenovacao, Desfecho, ErroLicenca, Motivo, PedidoRenovacao,
    conferir_resposta,
};
use chrono::{DateTime, Utc};
use serde_json::Value;

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures")
}

fn ler(nome: &str) -> Value {
    let caminho = fixtures().join(nome);
    let texto = std::fs::read_to_string(&caminho)
        .unwrap_or_else(|e| panic!("não li {}: {e}", caminho.display()));
    serde_json::from_str(&texto).unwrap_or_else(|e| panic!("{nome} não é JSON: {e}"))
}

fn contrato() -> Value {
    ler("renovacao-contrato.json")
}

fn texto_do_contrato(campo: &str) -> String {
    contrato()
        .get(campo)
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("o contrato não diz `{campo}`"))
        .to_string()
}

fn instante(iso: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(iso)
        .unwrap_or_else(|e| panic!("instante ilegível {iso:?}: {e}"))
        .with_timezone(&Utc)
}

fn agora_do_contrato() -> DateTime<Utc> {
    instante(&texto_do_contrato("agora"))
}

fn raiz_de_teste() -> ChavePublica {
    let bruto = std::fs::read_to_string(fixtures().join("chaves/vendor-teste.pub"))
        .expect("a raiz de teste");
    ChavePublica::nova(bruto.trim()).expect("a raiz de teste é uma chave")
}

fn pedido_do_fixture() -> PedidoRenovacao {
    PedidoRenovacao::de_json(&ler("renovacao-pedido.json")).expect("o pedido do fixture")
}

/// A máquina de campo: o que está pendente, o que está no disco e que horas
/// são. 🔴 O `agora` **vem do contrato**, nunca do relógio — `Utc::now()`
/// aqui faria a suite envelhecer: daqui a uns meses as respostas do fixture
/// estariam fora da janela e o teste ficaria vermelho a medir o tempo que
/// passou, não o produto.
struct Maquina {
    raiz: ChavePublica,
    chave_oem: Value,
    pedido: Option<PedidoRenovacao>,
    licenca_atual: Option<Value>,
    fingerprint: String,
    agora: DateTime<Utc>,
}

impl Maquina {
    /// A máquina tal como está depois de instalar a licença do fixture.
    fn de_fixtures() -> Self {
        Self {
            raiz: raiz_de_teste(),
            chave_oem: ler("chave-oem.json"),
            pedido: Some(pedido_do_fixture()),
            licenca_atual: Some(ler("licenca-ok.json")),
            fingerprint: texto_do_contrato("fingerprint"),
            agora: agora_do_contrato(),
        }
    }

    fn contexto(&self) -> ContextoRenovacao<'_> {
        ContextoRenovacao {
            raiz: &self.raiz,
            chave_oem: &self.chave_oem,
            pedido: self.pedido.as_ref(),
            licenca_atual: self.licenca_atual.as_ref(),
            fingerprint: &self.fingerprint,
            agora: self.agora,
            ultimo_visto: None,
        }
    }

    /// Correr a conferência e devolver o **motivo**, que é o que se compara.
    fn motivo(&self, resposta: &str) -> Motivo {
        conferir_resposta(&ler(resposta), &self.contexto())
            .err()
            .unwrap_or_else(|| panic!("{resposta} tem de ser recusado, e foi aceite"))
            .motivo
    }
}

// ===========================================================================
// O caminho feliz, e o que ele devolve
// ===========================================================================

/// A renovação que o emissor respondeu é conferida e devolve **a licença de
/// dentro** — nunca o ficheiro recebido.
#[test]
fn a_resposta_valida_renova() {
    let maquina = Maquina::de_fixtures();
    let r = conferir_resposta(&ler("renovacao-resposta.json"), &maquina.contexto())
        .expect("a resposta do emissor tem de ser aceite");

    let Desfecho::Renovada {
        licenca,
        licenca_id,
        expira_em,
    } = r
    else {
        panic!("uma resposta `renovar` tem de devolver uma licença renovada");
    };

    // 🔴 A licença devolvida é a **de dentro**, e o seu `tipo` é `licenca`.
    // Copiar o ficheiro recebido poria `tipo: resposta` no lugar da licença
    // — foi o primeiro defeito que a prova da Bridge apanhou, e a razão de
    // isto ser uma asserção e não uma nota.
    assert_eq!(
        licenca.get("tipo").and_then(Value::as_str),
        Some("licenca"),
        "o que se grava tem de ser a licença de dentro, não o envelope"
    );
    assert_eq!(licenca_id, texto_do_contrato("licenca_id"));
    // E vale **mais** do que a que estava no disco — que é o que prova que
    // isto é uma renovação e não uma leitura.
    let instalada = Carga::de(&ler("licenca-ok.json")).expect("a licença do disco");
    assert!(
        expira_em > instalada.expira_em,
        "a licença renovada tem de valer mais do que a de antes: {expira_em} vs {}",
        instalada.expira_em
    );
}

/// A licença de dentro é escrita em **canónico** — a forma que as três
/// implementações do verificador reproduzem.
#[test]
fn o_que_se_grava_e_canonico_e_a_licenca() {
    let maquina = Maquina::de_fixtures();
    let Desfecho::Renovada { licenca, .. } =
        conferir_resposta(&ler("renovacao-resposta.json"), &maquina.contexto()).expect("aceite")
    else {
        panic!("devia renovar");
    };

    let escrito = aegis_license::para_recebido(&licenca);
    assert!(
        escrito.ends_with('\n'),
        "o ficheiro gravado acaba em newline — um ficheiro sem newline é um \
         ficheiro que o próximo leitor tem de adivinhar"
    );
    let sem_espacos = escrito.trim().to_string();
    assert!(
        !sem_espacos.contains(", "),
        "o canónico não tem espaços: {sem_espacos}"
    );
    // E o que se lê de volta tem de ser o **mesmo** documento.
    let relido: Value =
        serde_json::from_str(&sem_espacos).unwrap_or_else(|e| panic!("o gravado não relê: {e}"));
    assert_eq!(
        relido, licenca,
        "o que se grava e o que se relê têm de ser o mesmo documento"
    );
}

/// A **recusa** de quem emitiu é uma resposta, não um erro: volta com o motivo
/// em palavras, e não se grava nada.
#[test]
fn a_recusa_de_quem_emitiu_volta_com_o_motivo() {
    let maquina = Maquina::de_fixtures();
    let r = conferir_resposta(&ler("renovacao-negar.json"), &maquina.contexto())
        .expect("uma recusa de quem emitiu é um desfecho, não uma falha");

    let Desfecho::Recusada { motivo } = r else {
        panic!("o fixture é uma recusa e tem de voltar como `Recusada`");
    };
    assert!(
        motivo.contains("não renovado"),
        "o motivo tem de voltar **em palavras** — um técnico que recebe um \
         código sem texto fica com um ficheiro que não instala e nada a fazer: {motivo:?}"
    );
}

// ===========================================================================
// As seis amarras, uma a uma
// ===========================================================================

/// 🔴 **O nonce (amarra 1).** Uma resposta de outro pedido não vale, mesmo
/// que seja de outro pedido para a mesma licença, da mesma máquina, do mesmo
/// parceiro e dentro da janela.
#[test]
fn a_resposta_de_outro_pedido_nao_vale() {
    assert_eq!(
        Maquina::de_fixtures().motivo("renovacao-outro-pedido.json"),
        Motivo::PedidoOutro
    );
}

/// Sem pedido pendente, não se aplica nada — e é por isso que o pedido
/// **não** é apagado depois de aplicado.
#[test]
fn sem_pedido_pendente_nada_e_aplicado() {
    let mut maquina = Maquina::de_fixtures();
    maquina.pedido = None;
    assert_eq!(maquina.motivo("renovacao-resposta.json"), Motivo::SemPedido);
}

/// 🔴 **A janela (amarra 2).** Vencida, a resposta não revive — mesmo com a
/// licença de dentro perfeitamente válida e o pedido certo.
#[test]
fn a_resposta_fora_da_janela_nao_revive() {
    assert_eq!(
        Maquina::de_fixtures().motivo("renovacao-vencida.json"),
        Motivo::RespostaVencida
    );
}

/// 🔴 **O node-lock do envelope (amarra 3).** A resposta é recusada ANTES de
/// olhar a licença de dentro.
#[test]
fn a_resposta_de_outra_maquina_e_recusada() {
    let mut maquina = Maquina::de_fixtures();
    maquina.fingerprint = "b".repeat(64);
    assert_eq!(
        maquina.motivo("renovacao-resposta.json"),
        Motivo::Fingerprint
    );
}

/// 🔴 **O `licenca_id` inalterado (amarra 5), contra o documento no disco.**
/// A resposta é perfeita para o pedido pendente — e a licença **instalada** é
/// outra. Aplicá-la trocaria o documento desta caixa por um que não é dela, e
/// o ledger passaria a contar outra instalação.
#[test]
fn a_renovacao_de_outra_licenca_nao_troca_a_da_maquina() {
    let mut maquina = Maquina::de_fixtures();
    maquina.licenca_atual = Some(ler("licenca-outra-maquina.json"));
    assert_eq!(
        maquina.motivo("renovacao-resposta.json"),
        Motivo::LicencaOutra
    );
}

/// 🔴 **O não-encurta (amarra 6).** A resposta é legítima à luz do pedido que
/// responde, e ainda assim é um downgrade contra o que está no disco.
#[test]
fn a_renovacao_que_encurta_e_recusada() {
    assert_eq!(
        Maquina::de_fixtures().motivo("renovacao-encurta.json"),
        Motivo::Encurta
    );
}

// ===========================================================================
// A segunda barreira: o que o emissor recusa montar, e mesmo assim
// ===========================================================================

/// 🔴 `negar` sem motivo é recusado — **mesmo com assinatura válida**.
///
/// O fixture é assinado pela chave do parceiro de verdade, por
/// `montarEnvelope`, que é a função de assinatura do próprio emissor. Não é
/// "um ficheiro qualquer": é o que prova que a segunda barreira é alcançável
/// por quem tem a chave e não passa pelo `montarResposta`.
#[test]
fn uma_recusa_sem_motivo_e_recusada() {
    assert_eq!(
        Maquina::de_fixtures().motivo("renovacao-sem-motivo.json"),
        Motivo::SemMotivo
    );
}

/// `renovar` sem licença dentro é recusado. A decisão sozinha não renova nada.
#[test]
fn um_renovar_sem_licenca_dentro_e_recusado() {
    assert_eq!(
        Maquina::de_fixtures().motivo("renovacao-sem-licenca.json"),
        Motivo::SemLicencaNaResposta
    );
}

/// A decisão é vocabulário **fechado**. Um campo de texto livre aqui seria um
/// ramo que ninguém escreveu e que ninguém testou.
#[test]
fn uma_decisao_fora_do_vocabulario_e_recusada() {
    assert_eq!(
        Maquina::de_fixtures().motivo("renovacao-decisao-fora.json"),
        Motivo::DecisaoFora
    );
}

/// 🔴 A recusa de uma assinatura que não confere é `licenca.assinatura`, e
/// **não** um dos motivos da renovação. A ordem das conferências é a defesa:
/// sem isto, um envelope forjado apareceria como "renovação sem motivo", e o
/// técnico ia culpar o emissor por um ficheiro que alguém fabricou.
#[test]
fn um_envelope_forjado_e_recusado_pela_assinatura() {
    let mut forjada = ler("renovacao-resposta.json");
    forjada["payload"]["licenca"]["payload"]["expira_em"] =
        Value::String("2099-01-01T00:00:00.000Z".to_string());

    let maquina = Maquina::de_fixtures();
    let e: ErroLicenca = conferir_resposta(&forjada, &maquina.contexto())
        .expect_err("um envelope alterado não pode passar");
    assert_eq!(e.motivo, Motivo::Assinatura);
}

// ===========================================================================
// O pedido
// ===========================================================================

/// O pedido sai da licença **instalada** — nunca de valores escritos à mão.
#[test]
fn o_pedido_tem_o_que_a_licenca_diz() {
    let licenca = ler("licenca-ok.json");
    let carga = Carga::de(&licenca).expect("a licença do disco");
    let p = PedidoRenovacao::da_licenca(
        &licenca,
        "pc-do-teste",
        &texto_do_contrato("fingerprint"),
        agora_do_contrato(),
    )
    .expect("uma licença com id dá pedido");

    assert_eq!(p.aegis, aegis_license::FORMATO_PEDIDO);
    assert_eq!(p.licenca_id, carga.licenca_id.expect("o id está lá"));
    assert_eq!(p.expira_em_atual, carga.expira_em.to_rfc3339());
    assert_eq!(p.seed, carga.seed);
    assert_eq!(p.parceiro, carga.parceiro);
    assert!(!p.pedido_id.is_empty(), "sem nonce não há o que amarrar");
}

/// E o **formato** tem de bater com o do fixture emitido pelo `aegis-cli` —
/// campo a mais ou a menos é um pedido que o emissor não lê.
#[test]
fn o_pedido_em_rust_tem_os_campos_do_emissor() {
    let licenca = ler("licenca-ok.json");
    let meu = PedidoRenovacao::da_licenca(
        &licenca,
        "pc-do-teste",
        &texto_do_contrato("fingerprint"),
        agora_do_contrato(),
    )
    .expect("pedido")
    .para_json();
    let emitido = ler("renovacao-pedido.json");

    let campos = |v: &Value| -> Vec<String> {
        let mut c: Vec<String> = v
            .as_object()
            .expect("o pedido é um objeto")
            .keys()
            .cloned()
            .collect();
        c.sort();
        c
    };
    assert_eq!(
        campos(&emitido),
        campos(&meu),
        "o pedido em Rust e o do emissor têm de ter os mesmos campos"
    );
}

/// Uma licença **sem** `licenca_id` não tem o que renovar. Sem id, a amarra
/// nº 5 não tem contra o que medir, e a renovação passa a ser "qualquer
/// licença deste parceiro" — que é stock.
#[test]
fn uma_licenca_sem_id_nao_da_pedido() {
    let mut licenca = ler("licenca-ok.json");
    licenca["payload"]
        .as_object_mut()
        .expect("payload")
        .remove("licenca_id");
    let e = PedidoRenovacao::da_licenca(
        &licenca,
        "pc-do-teste",
        &texto_do_contrato("fingerprint"),
        agora_do_contrato(),
    )
    .expect_err("sem `licenca_id` não há o que renovar");
    assert_eq!(e.motivo, Motivo::Formato);
}

// ===========================================================================
// O nonce
// ===========================================================================

/// O nonce é **diferente** em cada pedido. Um nonce repetido é um nonce que
/// amarra a nada, e um id derivado do relógio repete-se assim que dois pedidos
/// saem no mesmo tique.
#[test]
fn o_nonce_nunca_repete() {
    let mut vistos = HashSet::new();
    for _ in 0..1_000 {
        assert!(
            vistos.insert(aegis_license::nonce()),
            "o nonce repetiu-se em 1000 pedidos"
        );
    }
}

/// E tem a **forma** que o `aegis-cli` e o C# esperam: um UUID versão 4.
#[test]
fn o_nonce_tem_a_forma_de_uuid_v4() {
    let n = aegis_license::nonce();
    assert_eq!(n.len(), 36, "um UUID tem 36 caracteres: {n}");

    let grupos: Vec<&str> = n.split('-').collect();
    assert_eq!(
        grupos.iter().map(|g| g.len()).collect::<Vec<_>>(),
        vec![8, 4, 4, 4, 12],
        "um UUID tem grupos 8-4-4-4-12: {n}"
    );
    assert!(
        grupos
            .iter()
            .all(|g| g.chars().all(|c| c.is_ascii_hexdigit())),
        "o nonce é hexadecimal: {n}"
    );
    assert!(grupos[2].starts_with('4'), "a versão tem de ser 4: {n}");
    let variante = grupos[3].chars().next().expect("grupo vazio");
    assert!(
        matches!(variante, '8' | '9' | 'a' | 'b'),
        "a variante tem de ser RFC 4122: {n}"
    );
}
