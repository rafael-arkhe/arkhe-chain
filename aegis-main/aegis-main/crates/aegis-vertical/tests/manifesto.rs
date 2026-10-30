//! Testes do manifesto.
//!
//! 🔴 O vertical de teste aqui chama-se **`cadernal`**, e não `hotelaria` nem
//! nenhum outro real. Este crate não pode conhecer o slug de um vertical —
//! é a regra que o manifesto substitui um `switch` fechado. Um teste que
//! usasse um slug realaria essa regra à força bruta.

use std::path::{Path, PathBuf};

use aegis_vertical::{VerticalId, carregar, parece_vertical};

/// Vertical mínimo válido, em YAML. Os testes mexem **neste** texto, não numa
/// constante montada em código — porque é o ficheiro que o técnico escreve.
const MINIMO: &str = r#"
id: cadernal
versao: 1
titulo: Cadernal de teste
licenca:
  exige: cadernal
ontologia:
  tipos:
    - nome: anotacao
      rotulo: Anotação
      propriedade_titulo: titulo
      reforco: strict
      propriedades:
        - nome: titulo
          rotulo: Título
          tipo: texto
        - nome: corpo
          tipo: texto
    - nome: etiqueta
      propriedade_titulo: nome
      propriedades:
        - nome: nome
          tipo: texto
  links:
    - nome: etiquetada_por
      de: anotacao
      para: etiqueta
      cardinalidade: many_to_one
  acoes:
    - nome: criar_anotacao
      alvo: anotacao
      regra: criar_objeto
paginas:
  - slug: hoje
    ficheiro: paginas/hoje.json
    rotulo: Hoje
menu:
  home: hoje
  busca_placeholder: Buscar anotações…
dados:
  - { tipo: anotacao, chave: a1, propriedades: { titulo: primeira } }
  - { tipo: anotacao, chave: a2, propriedades: { titulo: segunda } }
  - { tipo: etiqueta, chave: e1, propriedades: { nome: rotulo } }
ligacoes:
  - nome: etiquetada_por
    de:  { tipo: anotacao, chave: a1 }
    para: { tipo: etiqueta, chave: e1 }
"#;

struct VerticalDeTeste {
    pasta: PathBuf,
}

impl VerticalDeTeste {
    /// Cria um vertical de teste em disco temporário.
    ///
    /// `mutar` recebe o YAML e devolve o YAML final, para cada teste mudar
    /// exatamente uma regra e provar que ela morde.
    fn novo<F>(mutar: F) -> Self
    where
        F: FnOnce(String) -> String,
    {
        let pasta = std::env::temp_dir().join(format!(
            "aegis-vertical-teste-{}-{}",
            std::process::id(),
            sufixo_unico()
        ));
        let _ = std::fs::remove_dir_all(&pasta);
        std::fs::create_dir_all(pasta.join("paginas")).expect("criar pasta de teste");
        std::fs::write(pasta.join("paginas/hoje.json"), r#"{"slug":"hoje"}"#)
            .expect("criar página de teste");
        std::fs::write(pasta.join("vertical.yaml"), mutar(MINIMO.to_string()))
            .expect("criar manifesto de teste");
        Self { pasta }
    }

    fn caminho(&self) -> &Path {
        &self.pasta
    }
}

impl Drop for VerticalDeTeste {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.pasta);
    }
}

fn sufixo_unico() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// O caminho feliz
// ---------------------------------------------------------------------------

#[test]
fn carrega_vertical_minimo() {
    let v = VerticalDeTeste::novo(|s| s);
    let m = carregar(v.caminho()).expect("o vertical mínimo tem de carregar");
    assert_eq!(m.id.as_str(), "cadernal");
    assert_eq!(m.versao_do_seed(), 1);
    assert_eq!(m.ontologia.tipos.len(), 2);
    assert_eq!(m.ontologia.links.len(), 1);
    assert_eq!(m.ontologia.acoes.len(), 1);
    assert_eq!(m.paginas.len(), 1);
    assert_eq!(m.menu.home.as_deref(), Some("hoje"));
    assert!(m.tipo("anotacao").is_some());
    assert_eq!(m.tipo("anotacao").unwrap().rotulo_ou_nome(), "Anotação");
    assert!(m.pagina("hoje").is_some());
    assert!(m.caminho_de_pagina("hoje").unwrap().is_file());
}

#[test]
fn regiao_do_manifesto_eh_a_pasta_do_vertical() {
    let v = VerticalDeTeste::novo(|s| s);
    let m = carregar(v.caminho()).unwrap();
    // O ficheiro da página resolve contra a PASTA do vertical, não contra o
    // diretório de trabalho de quem chamou. Sem isto, a ilha só acha a página
    // se o processo for lançado da pasta certa.
    assert!(
        m.caminho_de_pagina("hoje")
            .unwrap()
            .starts_with(v.caminho())
    );
}

#[test]
fn verbos_de_acao_sao_o_que_a_tela_mostra() {
    let v = VerticalDeTeste::novo(|s| s);
    let m = carregar(v.caminho()).unwrap();
    let acao = &m.ontologia.acoes[0];
    assert_eq!(acao.regra.verbo(), "Cria");
    assert_eq!(acao.rotulo_ou_nome(), "criar_anotacao");
}

// ---------------------------------------------------------------------------
// Identificadores
// ---------------------------------------------------------------------------

#[test]
fn vertical_id_aceita_e_recusa() {
    for bom in [
        "hotelaria",
        "portaria-acesso",
        "contagem-sacos",
        "ab",
        "v2-beta",
    ] {
        assert!(VerticalId::novo(bom).is_ok(), "deveria aceitar {bom:?}");
    }
    for mau in [
        "",
        "Hotelaria",
        "hotelaria ",
        "hotelaria!",
        "-hotelaria",
        "hotelaria-",
        "hotel--aria",
        "h",
        "a".repeat(41).as_str(),
    ] {
        assert!(VerticalId::novo(mau).is_err(), "deveria recusar {mau:?}");
    }
}

#[test]
fn recusa_vertical_com_id_invalido() {
    let v = VerticalDeTeste::novo(|s| s.replace("id: cadernal", "id: Cadernal"));
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.identificador-invalido");
}

// ---------------------------------------------------------------------------
// Referências pendentes — cada uma tem de morder
// ---------------------------------------------------------------------------

#[test]
fn recusa_link_para_tipo_inexistente() {
    let v = VerticalDeTeste::novo(|s| s.replace("para: etiqueta", "para: fantasma"));
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.referencia-pendente");
    assert!(e.humano().contains("fantasma"));
}

#[test]
fn recusa_acao_para_tipo_inexistente() {
    let v = VerticalDeTeste::novo(|s| s.replace("alvo: anotacao", "alvo: fantasma"));
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.referencia-pendente");
}

#[test]
fn recusa_propriedade_de_titulo_que_nao_existe() {
    let v = VerticalDeTeste::novo(|s| {
        s.replace("propriedade_titulo: titulo", "propriedade_titulo: titulao")
    });
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.titulo-ausente");
}

#[test]
fn recusa_struct_sem_subesquema() {
    // `tipo: struct` com `campos: []` é sintaxe válida e **erro de conteúdo**:
    // um struct sem esquema é um `dict` que ninguém sabe ler.
    let v = VerticalDeTeste::novo(|s| {
        s.replace(
            "        - nome: corpo\n          tipo: texto",
            "        - nome: corpo\n          tipo: struct\n          campos: []",
        )
    });
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.subesquema-ausente");
}

#[test]
fn aceita_struct_com_subesquema() {
    let v = VerticalDeTeste::novo(|s| {
        s.replace("        - nome: corpo\n          tipo: texto",
        "        - nome: endereco\n          tipo: struct\n          campos:\n            - { nome: rua, tipo: texto }\n            - { nome: numero, tipo: texto }")
    });
    let m = carregar(v.caminho()).expect("struct com campos tem de carregar");
    let corpo = m
        .tipo("anotacao")
        .unwrap()
        .propriedades
        .iter()
        .find(|p| p.nome == "endereco")
        .unwrap();
    assert_eq!(corpo.campos.len(), 2);
}

#[test]
fn recusa_lista_sem_tipo_de_item() {
    let v = VerticalDeTeste::novo(|s| {
        s.replace(
            "        - nome: corpo\n          tipo: texto",
            "        - nome: etiquetas\n          tipo: lista",
        )
    });
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.subesquema-ausente");
}

#[test]
fn recusa_home_que_nao_e_pagina() {
    let v = VerticalDeTeste::novo(|s| s.replace("home: hoje", "home: inexistente"));
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.home-inexistente");
}

#[test]
fn recusa_versao_zero() {
    let v = VerticalDeTeste::novo(|s| s.replace("versao: 1", "versao: 0"));
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.campo-obrigatorio");
}

#[test]
fn recusa_licenca_vazia() {
    let v = VerticalDeTeste::novo(|s| s.replace("  exige: cadernal", "  exige: '  '"));
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.campo-obrigatorio");
}

#[test]
fn recusa_vertical_sem_tipos() {
    let v = VerticalDeTeste::novo(|s| {
        s.split("ontologia:").next().unwrap().to_string()
            + r#"paginas:
  - slug: hoje
    ficheiro: paginas/hoje.json
"#
    });
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.campo-obrigatorio");
}

#[test]
fn recusa_vertical_sem_paginas() {
    let v = VerticalDeTeste::novo(|s| s.split("paginas:").next().unwrap().to_string());
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.campo-obrigatorio");
}

#[test]
fn recusa_ficheiro_de_pagina_ausente_no_disco() {
    let v = VerticalDeTeste::novo(|s| s.replace("paginas/hoje.json", "paginas/fantasma.json"));
    let e = carregar(v.caminho()).unwrap_err();
    // A referência interna é válida (o slug existe); o que falta é o ficheiro.
    // Um vertical assim instala e depois mostra menu morto — por isso é erro.
    assert_eq!(e.codigo(), "manifesto.ficheiro-ausente");
}

#[test]
fn recusa_duplicado_de_tipo() {
    let v = VerticalDeTeste::novo(|s| s.replace("    - nome: etiqueta", "    - nome: anotacao"));
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.duplicado");
}

#[test]
fn recusa_manifesto_inexistente() {
    let pasta = std::env::temp_dir().join(format!("aegis-vazio-{}", sufixo_unico()));
    std::fs::create_dir_all(&pasta).unwrap();
    let e = carregar(&pasta).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.nao-e-vertical");
    assert!(!parece_vertical(&pasta));
    let _ = std::fs::remove_dir_all(&pasta);
}

#[test]
fn recusa_yaml_quebrado() {
    let v = VerticalDeTeste::novo(|s| s.replace("id: cadernal", "id: [isto nao fecha"));
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.invalido");
}

// ---------------------------------------------------------------------------
// A regra que dá sentido ao crate
// ---------------------------------------------------------------------------

#[test]
fn este_crate_nao_conhece_o_slug_de_vertical_nenhum() {
    // Se alguém adicionar `if v == "hotelaria"` aqui dentro, este teste
    // fica vermelho. É a versão testável de "nenhum outro crate conhece o slug".
    let fonte = include_str!("../src/manifest.rs").to_string()
        + include_str!("../src/load.rs")
        + include_str!("../src/error.rs");

    for slug in [
        "hotelaria",
        "contagem-sacos",
        "portaria-acesso",
        "safetag",
        "carnaval",
    ] {
        assert!(
            !fonte.contains(slug),
            "o crate aegis-vertical não pode conhecer o slug {slug:?} — \
             um vertical é dado, e o manifesto é a única fonte"
        );
    }
}

// ---------------------------------------------------------------------------
// O catálogo: dados e ligações
// ---------------------------------------------------------------------------

#[test]
fn o_catalogo_traz_dados_e_ligacoes() {
    let v = VerticalDeTeste::novo(|s| s);
    let m = carregar(v.caminho()).expect("catálogo tem de carregar");
    assert_eq!(m.dados.len(), 3);
    assert_eq!(m.ligacoes.len(), 1);
    assert_eq!(m.ligacoes[0].nome, "etiquetada_por");
    assert_eq!(m.ligacoes[0].de.tipo, "anotacao");
    assert_eq!(m.ligacoes[0].de.chave, "a1");
}

#[test]
fn recusa_dado_de_tipo_que_o_vertical_nao_declara() {
    let v = VerticalDeTeste::novo(|s| {
        s.replace(
            "  - { tipo: anotacao, chave: a1,",
            "  - { tipo: fantasma, chave: a1,",
        )
    });
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.referencia-pendente");
}

#[test]
fn recusa_chave_de_dado_repetida() {
    // A chave canônica é a identidade: duas linhas com a mesma chave são a
    // mesma linha, e a segunda sobrescreve a primeira em silêncio.
    let v = VerticalDeTeste::novo(|s| {
        s.replace(
            "  - { tipo: anotacao, chave: a2, propriedades: { titulo: segunda } }",
            "  - { tipo: anotacao, chave: a1, propriedades: { titulo: outra } }",
        )
    });
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.duplicado");
}

#[test]
fn recusa_ligacao_com_tipo_de_link_que_nao_existe() {
    // 🔴 A âncora inclui o `ligacoes:` de propósito. `str::replace` é GLOBAL, e
    // uma âncora só com o nome da ligação também é substring da que está em
    // `ontologia.links` — a versão anterior renomeava o link E a ligação, e
    // continuavam a casar. **A mutação de um teste tem de ser única**, senão o
    // teste passa a provar outra coisa sem nunca dizer qual.
    let v = VerticalDeTeste::novo(|s| {
        s.replace(
            "ligacoes:\n  - nome: etiquetada_por",
            "ligacoes:\n  - nome: inexistente",
        )
    });
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.referencia-pendente");
}

#[test]
fn recusa_ligacao_que_aponta_para_dado_inexistente() {
    // 🔴 Esta é a que fecha a lacuna: um link declarado e uma aresta que
    // aponta para o vazio descreveriam um grafo que o banco não tem.
    let v = VerticalDeTeste::novo(|s| s.replace("chave: a1 }", "chave: a9 }"));
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.referencia-pendente");
    assert!(e.humano().contains("dados"));
}

#[test]
fn recusa_ligacao_com_pontas_de_tipo_errado() {
    // `tem` é `de: anotacao, para: etiqueta`. Usada de `etiqueta` para
    // `anotacao` grava a aresta e produz um grafo ilegível — e o sintoma
    // aparece na tela do operador, sem nada em vermelho no banco.
    let v = VerticalDeTeste::novo(|s| {
        s.replace(
            "    de:  { tipo: anotacao, chave: a1 }
    para: { tipo: etiqueta, chave: e1 }",
            "    de:  { tipo: etiqueta, chave: e1 }
    para: { tipo: anotacao, chave: a1 }",
        )
    });
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.ligacao-incompativel");
    assert!(e.humano().contains("anotacao"));
}

#[test]
fn vertical_sem_dados_e_um_vertical_valido() {
    // Nem todo vertical tem catálogo. A hotelaria tem; um vertical de
    // consulta pode não ter. O que não pode é ter MEIO: uma ligação sem o
    // dado que ela aponta.
    let v = VerticalDeTeste::novo(|s| s.split("dados:").next().unwrap().to_string());
    let m = carregar(v.caminho()).expect("sem catálogo é válido");
    assert!(m.dados.is_empty());
    assert!(m.ligacoes.is_empty());
}

#[test]
fn ligacao_sozinha_sem_dados_e_recusada() {
    let v = VerticalDeTeste::novo(|s| {
        let corte = s.split("dados:").next().unwrap().to_string();
        corte
            + r#"ligacoes:
  - nome: etiquetada_por
    de:  { tipo: anotacao, chave: a1 }
    para: { tipo: etiqueta, chave: e1 }
"#
    });
    let e = carregar(v.caminho()).unwrap_err();
    assert_eq!(e.codigo(), "manifesto.referencia-pendente");
}
