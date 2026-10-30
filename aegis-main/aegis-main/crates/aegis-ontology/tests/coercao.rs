//! Testes do portão de coação e da cardinalidade.
//!
//! 🔴 O vertical de teste chama-se **`cadernal`**, nunca um slug real: este
//! crate não pode conhecer o slug de um vertical, e um teste que usasse um
//! real provaria o contrário.

use aegis_ontology::Contrato;
use aegis_vertical::Manifesto;
use serde_json::json;

const CADERNAIS: &str = r#"
id: cadernal
versao: 3
licenca: { exige: cadernal }
ontologia:
  tipos:
    - nome: anotacao
      propriedade_titulo: titulo
      reforco: strict
      propriedades:
        - { nome: titulo, tipo: texto }
        - { nome: corpo,  tipo: texto }
        - { nome: peso,   tipo: numero }
        - { nome: fixado, tipo: booleano }
        - nome: morada
          tipo: struct
          campos:
            - { nome: rua,    tipo: texto }
            - { nome: numero, tipo: texto }
        - nome: etiquetas
          tipo: lista
          itens: { nome: item, tipo: texto }
    - nome: etiqueta
      propriedade_titulo: nome
      reforco: lenient
      propriedades:
        - { nome: nome, tipo: texto }
  links:
    - { nome: tem, de: anotacao, para: etiqueta, cardinalidade: many_to_one }
    - { nome: sfn, de: anotacao, para: anotacao, cardinalidade: many_to_many }
  acoes:
    - { nome: criar, alvo: anotacao, regra: criar_objeto }
paginas:
  - { slug: hoje, ficheiro: paginas/hoje.json }
"#;

fn contrato() -> Contrato {
    let manifesto: Manifesto = serde_yaml::from_str(CADERNAIS).expect("manifesto de teste");
    Contrato::de(manifesto)
}

// ---------------------------------------------------------------------------
// O portão aceita o que bate
// ---------------------------------------------------------------------------

#[test]
fn coage_uma_instancia_valida() {
    let c = contrato();
    let r = c
        .coagir(
            "anotacao",
            &json!({"titulo": "primeira", "corpo": "texto", "peso": 3}),
        )
        .expect("instância válida tem de passar");
    assert_eq!(r.valor["titulo"], json!("primeira"));
    assert_eq!(r.valor["peso"], json!(3));
    assert!(r.convertidas.is_empty());
    assert!(r.nao_declaradas.is_empty());
}

#[test]
fn campo_ausente_nao_e_erro() {
    // Quase toda propriedade é opcional. Recusar a criação por um campo
    // vazio é recusar o produto.
    let c = contrato();
    c.coagir("anotacao", &json!({"titulo": "so o titulo"}))
        .expect("instância com só o título tem de passar");
}

// ---------------------------------------------------------------------------
// Coage onde dá, sem mentir
// ---------------------------------------------------------------------------

#[test]
fn lenient_coage_texto_numerico_em_numero() {
    let c = contrato();
    let r = c
        .coagir("etiqueta", &json!({"nome": "x", "peso_ignorado": 1}))
        .unwrap();
    assert!(r.nao_declaradas.contains(&"peso_ignorado".to_string()));
}

#[test]
fn lenient_coage_string_numerica_de_um_tipo_lenient() {
    // `etiqueta` é `lenient` e não tem um campo numérico: declaremos um tipo
    // leniente com número, que é onde a conversão acontece.
    let manifesto: Manifesto = serde_yaml::from_str(
        r#"
id: cadernal
versao: 1
licenca: { exige: cadernal }
ontologia:
  tipos:
    - nome: medicao
      propriedade_titulo: nome
      reforco: lenient
      propriedades:
        - { nome: nome, tipo: texto }
        - { nome: valor, tipo: numero }
paginas:
  - { slug: hoje, ficheiro: p.json }
"#,
    )
    .unwrap();
    let c = Contrato::de(manifesto);
    let r = c
        .coagir("medicao", &json!({"nome": "m", "valor": "42"}))
        .expect("lenient coage string numérica");
    assert_eq!(r.valor["valor"], json!(42));
    assert_eq!(r.convertidas, vec!["valor".to_string()]);
}

#[test]
fn booleano_nunca_vira_numero() {
    // `true` como 1 já produziu um `total` errado numa tela de contagem.
    let manifesto: Manifesto = serde_yaml::from_str(
        r#"
id: cadernal
versao: 1
licenca: { exige: cadernal }
ontologia:
  tipos:
    - nome: medicao
      propriedade_titulo: nome
      reforco: lenient
      propriedades:
        - { nome: nome,  tipo: texto }
        - { nome: valor, tipo: numero }
paginas:
  - { slug: hoje, ficheiro: p.json }
"#,
    )
    .unwrap();
    let c = Contrato::de(manifesto);
    let r = c
        .coagir("medicao", &json!({"nome": "m", "valor": true}))
        .expect("lenient não levanta");
    // Passa intacto, e continua booleano. A conversão seria o defeito.
    assert_eq!(r.valor["valor"], json!(true));
    assert!(r.convertidas.is_empty());
}

#[test]
fn strict_recusa_tipo_errado() {
    let c = contrato();
    let e = c
        .coagir("anotacao", &json!({"titulo": "x", "peso": "cinco"}))
        .unwrap_err();
    assert_eq!(e.codigo(), "ontologia.propriedade-invalida");
    assert_eq!(e.propriedade, "peso");
    assert_eq!(e.tipo, "anotacao");
    assert!(e.humano().contains("peso"));
}

#[test]
fn strict_recusa_campo_nao_declarado() {
    let c = contrato();
    let e = c
        .coagir(
            "anotacao",
            &json!({"titulo": "x", "campo_que_nao_existe": 1}),
        )
        .unwrap_err();
    assert_eq!(e.codigo(), "ontologia.propriedade-invalida");
    assert!(e.humano().contains("não declarado"));
}

#[test]
fn lenient_preserva_e_conta_o_campo_nao_declarado() {
    let manifesto: Manifesto = serde_yaml::from_str(
        r#"
id: cadernal
versao: 1
licenca: { exige: cadernal }
ontologia:
  tipos:
    - nome: medicao
      propriedade_titulo: nome
      reforco: lenient
      propriedades:
        - { nome: nome, tipo: texto }
paginas:
  - { slug: hoje, ficheiro: p.json }
"#,
    )
    .unwrap();
    let c = Contrato::de(manifesto);
    let r = c
        .coagir("medicao", &json!({"nome": "m", "extra": 7}))
        .expect("lenient não recusa campo a mais");
    assert_eq!(r.valor["extra"], json!(7));
    assert_eq!(r.nao_declaradas, vec!["extra".to_string()]);
}

// ---------------------------------------------------------------------------
// Título e tipo desconhecido — recusos nos dois modos
// ---------------------------------------------------------------------------

#[test]
fn recusa_instancia_sem_titulo_em_ambos_os_modos() {
    let c = contrato();
    // `anotacao` é strict, `etiqueta` é lenient. A ausência do título é
    // recusada nos dois: uma instância sem rótulo não aparece em tela nenhuma.
    for tipo in ["anotacao", "etiqueta"] {
        let e = c.coagir(tipo, &json!({"corpo": "sem titulo"})).unwrap_err();
        assert_eq!(e.codigo(), "ontologia.propriedade-invalida", "tipo {tipo}");
    }
}

#[test]
fn recusa_titulo_vazio() {
    let c = contrato();
    c.coagir("anotacao", &json!({"titulo": ""})).unwrap_err();
}

#[test]
fn recusa_tipo_que_o_vertical_nao_declara() {
    // Este é o sintoma "o LPR leu mas a tela não mudou": gravar num
    // `node_type` que ninguém declarou.
    let c = contrato();
    let e = c.coagir("fantasma", &json!({"titulo": "x"})).unwrap_err();
    assert_eq!(e.codigo(), "ontologia.propriedade-invalida");
    assert!(e.humano().contains("não declara"));
}

#[test]
fn recusa_instancia_que_nao_e_objecto() {
    let c = contrato();
    c.coagir("anotacao", &json!([1, 2, 3])).unwrap_err();
}

// ---------------------------------------------------------------------------
// Tipos ricos
// ---------------------------------------------------------------------------

#[test]
fn strict_propaga_para_dentro_do_struct_aninhado() {
    // `anotacao` é `strict`, e a rigidez **não** para na superfície: converter
    // `10` em `"10"` dentro de um struct aninhado seria exatamente a
    // fraqueza que a coação lenient do núcleo antigo tinha.
    let c = contrato();
    let e = c
        .coagir(
            "anotacao",
            &json!({"titulo": "x", "morada": {"rua": "A", "numero": 10}}),
        )
        .unwrap_err();
    assert_eq!(e.codigo(), "ontologia.propriedade-invalida");
    assert_eq!(e.propriedade, "numero");
    assert_eq!(e.esperado, aegis_vertical::TipoPropriedade::Texto);
}

#[test]
fn lenient_coage_dentro_do_struct_aninhado() {
    let manifesto: Manifesto = serde_yaml::from_str(
        r#"
id: cadernal
versao: 1
licenca: { exige: cadernal }
ontologia:
  tipos:
    - nome: ficha
      propriedade_titulo: titulo
      reforco: lenient
      propriedades:
        - { nome: titulo,  tipo: texto }
        - nome: morada
          tipo: struct
          campos:
            - { nome: rua,    tipo: texto }
            - { nome: numero, tipo: texto }
paginas:
  - { slug: hoje, ficheiro: p.json }
"#,
    )
    .unwrap();
    let c = Contrato::de(manifesto);
    let r = c
        .coagir(
            "ficha",
            &json!({"titulo": "x", "morada": {"rua": "A", "numero": 10}}),
        )
        .expect("lenient coage em qualquer profundidade");
    assert_eq!(r.valor["morada"]["numero"], json!("10"));
}

#[test]
fn coage_lista_pelo_tipo_do_item() {
    let c = contrato();
    let r = c
        .coagir("anotacao", &json!({"titulo": "x", "etiquetas": ["a", "b"]}))
        .expect("lista de texto tem de passar");
    assert_eq!(r.valor["etiquetas"], json!(["a", "b"]));
}

#[test]
fn recusa_lista_com_item_do_tipo_errado_em_strict() {
    let c = contrato();
    let e = c
        .coagir(
            "anotacao",
            &json!({"titulo": "x", "etiquetas": [{"nao": "texto"}]}),
        )
        .unwrap_err();
    assert_eq!(e.codigo(), "ontologia.propriedade-invalida");
}

#[test]
fn geoponto_precisa_de_lat_e_lon() {
    let manifesto: Manifesto = serde_yaml::from_str(
        r#"
id: cadernal
versao: 1
licenca: { exige: cadernal }
ontologia:
  tipos:
    - nome: ponto
      propriedade_titulo: nome
      reforco: strict
      propriedades:
        - { nome: nome, tipo: texto }
        - { nome: onde, tipo: geoponto }
paginas:
  - { slug: hoje, ficheiro: p.json }
"#,
    )
    .unwrap();
    let c = Contrato::de(manifesto);
    c.coagir("ponto", &json!({"nome": "p", "onde": {"lat": 1, "lon": 2}}))
        .expect("geoponto com lat/lon tem de passar");
    c.coagir("ponto", &json!({"nome": "p", "onde": {"x": 1}}))
        .unwrap_err();
}

// ---------------------------------------------------------------------------
// Cardinalidade — a parte que fecha a corrida
// ---------------------------------------------------------------------------

#[test]
fn cardinalidade_many_to_one_aceita_so_uma_aresta() {
    let c = contrato();
    assert!(c.cabe("tem", "anotacao-1", 0).is_ok());
    let e = c.cabe("tem", "anotacao-1", 1).unwrap_err();
    assert_eq!(e.codigo(), "ontologia.cardinalidade-violada");
    assert_eq!(e.limite, 1);
}

#[test]
fn cardinalidade_many_to_many_nao_limita() {
    let c = contrato();
    assert!(c.cabe("sfn", "anotacao-1", 0).is_ok());
    assert!(c.cabe("sfn", "anotacao-1", 1).is_ok());
    assert!(c.cabe("sfn", "anotacao-1", 99).is_ok());
}

#[test]
fn cardinalidade_de_link_que_nao_existe_nao_recusa() {
    let c = contrato();
    assert!(c.cabe("link_que_nao_existe", "anotacao-1", 50).is_ok());
}

// ---------------------------------------------------------------------------
// A regra: o crate não conhece o slug de um vertical
// ---------------------------------------------------------------------------

#[test]
fn este_crate_nao_conhece_o_slug_de_vertical_nenhum() {
    let fonte = include_str!("../src/contrato.rs").to_string()
        + include_str!("../src/coercao.rs")
        + include_str!("../src/erro.rs");

    for slug in ["hotelaria", "contagem-sacos", "portaria-acesso", "safetag"] {
        assert!(
            !fonte.contains(slug),
            "aegis-ontology não pode conhecer o slug {slug:?}"
        );
    }
}
