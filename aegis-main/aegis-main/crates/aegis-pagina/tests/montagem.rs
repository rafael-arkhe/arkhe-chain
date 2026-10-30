//! A prova de que montar **produz** o vertical.
//!
//! 🔴 Isto é o ponto 10 do dono: *"nunca tive o feeling de pegar e construir
//! uma página do zero; a base é sempre o seed"*. A resposta não é um editor —
//! é que **montar tem de escrever o ficheiro**, e o que escreve tem de
//! carregar a seguir sem edição nenhuma.

use aegis_pagina::{Bloco, Montagem, Operacao, Pagina, TipoVariavel, Variavel};
use aegis_vertical::{
    Brand, Cardinalidade, Licenca, Reforcamento, TipoAcao, TipoLink, TipoObjeto, TipoPropriedade,
    VerticalId,
};

fn pasta_de_teste(nome: &str) -> std::path::PathBuf {
    let p = std::env::temp_dir().join(format!(
        "aegis-pagina-{}-{}-{nome}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    let _ = std::fs::remove_dir_all(&p);
    std::fs::create_dir_all(&p).expect("criar pasta de teste");
    p
}

fn tipo(nome: &str, propriedades: &[&str]) -> TipoObjeto {
    TipoObjeto {
        nome: nome.to_string(),
        propriedade_titulo: propriedades[0].to_string(),
        rotulo: None,
        reforco: Reforcamento::Strict,
        propriedades: propriedades
            .iter()
            .map(|p| aegis_vertical::Propriedade {
                nome: p.to_string(),
                tipo: TipoPropriedade::Texto,
                rotulo: None,
                campos: vec![],
                itens: None,
            })
            .collect(),
    }
}

/// Uma montagem mínima que **passa**: um tipo, uma página com um KPI e uma
/// tabela.
fn montagem_valida() -> Montagem {
    Montagem::nova("cadernal", "Cadernal de Teste")
        .com_exigido_padrao()
        .com_tipo(tipo("anotacao", &["titulo", "corpo"]))
        .com_tipo(tipo("etiqueta", &["nome"]))
        .com_link(TipoLink {
            nome: "etiquetada_por".into(),
            de: "anotacao".into(),
            para: "etiqueta".into(),
            cardinalidade: Cardinalidade::ManyToOne,
            rotulo: None,
        })
        .com_acao(TipoAcao {
            nome: "criar".into(),
            alvo: "anotacao".into(),
            regra: aegis_vertical::RegraAcao::CriarObjeto,
            rotulo: None,
        })
        .com_pagina(Pagina {
            slug: "hoje".into(),
            titulo: Some("Hoje".into()),
            refresh_segundos: None,
            icone_nav: None,
            variaveis: vec![
                Variavel {
                    id: "anotacoes".into(),
                    tipo: TipoVariavel::ObjectSet,
                    objeto: Some("anotacao".into()),
                    de: None,
                    op: None,
                },
                Variavel {
                    id: "total".into(),
                    tipo: TipoVariavel::Agregacao,
                    objeto: None,
                    de: Some("anotacoes".into()),
                    op: Some(Operacao::Count),
                },
            ],
            blocos: vec![
                Bloco::Kpi {
                    rotulo: Some("Anotações".into()),
                    variavel: "total".into(),
                },
                Bloco::Tabela {
                    rotulo: None,
                    objeto: "anotacao".into(),
                    colunas: vec!["titulo".into(), "corpo".into()],
                    limite: 50,
                },
            ],
        })
}

// ===========================================================================
// O round-trip — a propriedade que faz o editor e a tela concordarem
// ===========================================================================

#[test]
fn a_pagina_sobrevive_a_uma_ida_e_volta() {
    // 🔴 Se isto falha, o Construtor escreve uma coisa e a ilha lê outra, e o
    // sintoma é uma página que abre no editor e não abre no ecrã.
    let pagina = montagem_valida().paginas[0].clone();
    let json = pagina.para_json();
    let volta = Pagina::de_json(&json).expect("a página tem de voltar inteira");
    assert_eq!(pagina, volta);

    // E o JSON tem de ser o que alguém lê: o verbo é `tipo`, e não o nome da
    // variante em Rust.
    assert_eq!(json["blocos"][0]["tipo"], "kpi");
    assert_eq!(json["blocos"][0]["variavel"], "total");
    assert_eq!(json["variaveis"][1]["tipo"], "agregacao");
    assert_eq!(json["variaveis"][1]["op"], "count");
}

// ===========================================================================
// A validação da página contra o contrato
// ===========================================================================

fn manifesto_de_teste() -> aegis_vertical::Manifesto {
    montagem_valida().para_manifesto(&std::path::PathBuf::new())
}

#[test]
fn a_pagina_valida_contra_o_contrato() {
    let m = manifesto_de_teste();
    montagem_valida().paginas[0]
        .validar(&m)
        .expect("a página da montagem tem de ser válida contra o seu vertical");
}

#[test]
fn recusa_tipo_que_o_vertical_nao_declara() {
    let m = manifesto_de_teste();
    let mut pagina = montagem_valida().paginas[0].clone();
    if let Bloco::Tabela { objeto, .. } = &mut pagina.blocos[1] {
        *objeto = "fantasma".into();
    }
    let e = pagina.validar(&m).unwrap_err();
    assert_eq!(e.codigo(), "pagina.tipo-desconhecido");
}

#[test]
fn recusa_coluna_que_o_tipo_nao_tem() {
    let m = manifesto_de_teste();
    let mut pagina = montagem_valida().paginas[0].clone();
    if let Bloco::Tabela { colunas, .. } = &mut pagina.blocos[1] {
        colunas.push("inexistente".into());
    }
    let e = pagina.validar(&m).unwrap_err();
    assert_eq!(e.codigo(), "pagina.coluna-desconhecida");
}

#[test]
fn recusa_variavel_que_nao_existe() {
    let m = manifesto_de_teste();
    let mut pagina = montagem_valida().paginas[0].clone();
    pagina.variaveis.clear();
    let e = pagina.validar(&m).unwrap_err();
    assert_eq!(e.codigo(), "pagina.variavel-pendente");
}

#[test]
fn recusa_agregacao_de_agregacao() {
    // Um KPI que conta um KPI. O sintoma é um número que não mexe, e a única
    // pista é o KPI — que aponta para a agregação e não para a fonte.
    let m = manifesto_de_teste();
    let mut pagina = montagem_valida().paginas[0].clone();
    pagina.variaveis.push(Variavel {
        id: "meta".into(),
        tipo: TipoVariavel::Agregacao,
        objeto: None,
        de: Some("total".into()),
        op: Some(Operacao::Count),
    });
    let e = pagina.validar(&m).unwrap_err();
    assert_eq!(e.codigo(), "pagina.agregacao-de-agregacao");
}

#[test]
fn recusa_duplicata_de_variavel() {
    let m = manifesto_de_teste();
    let mut pagina = montagem_valida().paginas[0].clone();
    pagina.variaveis.push(pagina.variaveis[0].clone());
    let e = pagina.validar(&m).unwrap_err();
    assert_eq!(e.codigo(), "pagina.variavel-duplicada");
}

#[test]
fn recusa_pagina_sem_blocos() {
    let m = manifesto_de_teste();
    let mut pagina = montagem_valida().paginas[0].clone();
    pagina.blocos.clear();
    let e = pagina.validar(&m).unwrap_err();
    assert_eq!(e.codigo(), "pagina.sem-blocos");
}

// ===========================================================================
// A prova: montar escreve o vertical, e ele carrega
// ===========================================================================

#[test]
fn montar_escreve_o_vertical_e_ele_carrega() {
    // 🔴 ESTA É A PROVA DO PONTO 10. Montar produz `vertical.yaml` e
    // `paginas/hoje.json`; o `carregar` do vertical lê-os **sem edição
    // nenhuma**. Se esta prova passar, existe um caminho de "do zero ao
    // vertical" que não passa por Python.
    let pasta = pasta_de_teste("montagem-ok");
    montagem_valida().gravar(&pasta).expect("gravar a montagem");

    assert!(
        pasta.join("vertical.yaml").is_file(),
        "o manifesto tem de existir"
    );
    assert!(pasta.join("paginas").join("hoje.json").is_file());

    let carregado = aegis_vertical::carregar(&pasta)
        .unwrap_or_else(|e| panic!("o vertical gerado tem de carregar: {e:?}"));

    assert_eq!(carregado.id, VerticalId::novo("cadernal").unwrap());
    assert_eq!(carregado.paginas.len(), 1);
    assert_eq!(carregado.paginas[0].slug, "hoje");
    assert_eq!(carregado.menu.home.as_deref(), Some("hoje"));
    assert_eq!(carregado.licenca.exige, "cadernal");
    // O padrão é PEDIR licença — um vertical montado não sai de graça.
    assert!(carregado.licenca.node_locked);
    // E as verificações exigidas entram sem ninguém as escrever.
    assert_eq!(carregado.saude.exigido.len(), 3);

    let _ = std::fs::remove_dir_all(&pasta);
}

#[test]
fn a_pagina_gerada_e_a_mesma_que_a_montada() {
    let pasta = pasta_de_teste("round-trip-vertical");
    let m = montagem_valida();
    m.gravar(&pasta).expect("gravar");

    let o_que_foi_escrito: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(pasta.join("paginas").join("hoje.json")).unwrap(),
    )
    .expect("a página gravada é JSON");

    let volta = Pagina::de_json(&o_que_foi_escrito).expect("a página gravada tem de voltar");
    assert_eq!(
        &volta, &m.paginas[0],
        "o que foi para o disco não é o que foi montado"
    );

    let _ = std::fs::remove_dir_all(&pasta);
}

#[test]
fn uma_montagem_ruim_nao_toca_no_disco() {
    // 🔴 Conferir ANTES de gravar. Sem isto, o botão de publicar recusa com
    // o motivo e deixa um vertical meio gerado — que é pior do que não ter
    // gerado, porque ninguém sabe o que ficou por escrever.
    let pasta = pasta_de_teste("montagem-ruim");
    let antes = pasta.join("vertical.yaml").exists();

    let mut ruim = montagem_valida();
    // Aponta a tabela para um tipo que não existe.
    if let Bloco::Tabela { objeto, .. } = &mut ruim.paginas[0].blocos[1] {
        *objeto = "fantasma".into();
    }

    let e = ruim.gravar(&pasta).unwrap_err();
    assert_eq!(e.codigo(), "montagem.pagina-invalida");
    assert!(
        !pasta.join("vertical.yaml").exists() && !antes,
        "uma montagem recusada não pode escrever o manifesto"
    );
    assert!(
        !pasta.join("paginas").join("hoje.json").exists(),
        "uma montagem recusada não pode escrever páginas"
    );

    let _ = std::fs::remove_dir_all(&pasta);
}

#[test]
fn uma_montagem_sem_licenca_e_recusada() {
    // 🔴 O padrão é pedir licença. Uma montagem que o dispense instala sem
    // licença nenhuma, e essa é a forma mais barata de o produto sair de
    // graça.
    let pasta = pasta_de_teste("sem-licenca");
    let mut m = montagem_valida();
    m.licenca_exige = "   ".into();
    let e = m.gravar(&pasta).unwrap_err();
    assert_eq!(e.codigo(), "montagem.sem-licenca");
    let _ = std::fs::remove_dir_all(&pasta);
}

#[test]
fn uma_montagem_vazia_e_recusada_com_motivo() {
    let m = Montagem::nova("cadernal", "Vazio");
    assert_eq!(m.conferir().unwrap_err().codigo(), "montagem.sem-tipos");
    assert_eq!(m.paginas.len(), 0);
    // E o id tem de servir: um `Cadernal` recusa antes de escrever.
    let mau = Montagem::nova("Cadernal", "x");
    assert_eq!(
        mau.conferir().unwrap_err().codigo(),
        "montagem.identificador"
    );
}

// ===========================================================================
// A marca
// ===========================================================================

#[test]
fn a_marca_vem_da_montagem_e_nao_e_inventada() {
    let pasta = pasta_de_teste("marca");
    let m = montagem_valida();
    m.gravar(&pasta).unwrap();
    let carregado = aegis_vertical::carregar(&pasta).unwrap();
    assert_eq!(carregado.brand.nome, "Cadernal de Teste");
    // 🔴 O placeholder da busca **não** é inventado. Texto do operador é
    // sagrado, e um texto de busca que ninguém escreveu é um texto que
    // ninguém pediu.
    assert!(
        carregado.menu.busca_placeholder.is_none(),
        "o gerador não pode inventar o texto da busca"
    );
    let _ = std::fs::remove_dir_all(&pasta);
}

#[test]
fn a_licenca_gerada_esta_ligada_ao_vertical() {
    let pasta = pasta_de_teste("licenca-ligada");
    let mut m = montagem_valida();
    m.licenca_exige = "outro-produto".into();
    m.gravar(&pasta).unwrap();
    let carregado = aegis_vertical::carregar(&pasta).unwrap();
    // A licença gerada diz o que tem de dizer — e o gate do `instalar` vai
    // comparar com `exige`. Uma montagem que muda o id e a licença juntas
    // continua a instalar o produto certo.
    assert_eq!(carregado.id.as_str(), "cadernal");
    assert_eq!(carregado.licenca.exige, "outro-produto");
    let _ = std::fs::remove_dir_all(&pasta);
}

// A `Brand` e a `Licenca` são reexportadas do vertical e usadas na montagem;
// este teste existe para que uma mudança de campo não quebre em silêncio.
const _: fn() = || {
    let _ = Brand::default();
    let _ = Licenca {
        exige: String::new(),
        node_locked: true,
    };
};

// ===========================================================================
// O construtor não pode perder o produto
// ===========================================================================

#[test]
fn abrir_e_regravar_mantem_o_vertical_inteiro() {
    // 🔴 O Construtor **reescreve** o `vertical.yaml`. Se a volta perdesse o
    // catálogo, os links ou as verificações, cada uso do editor apagava um
    // pouco do produto — e o sintoma é um vertical que deixa de instalar,
    // semanas depois, sem nada no editor que explique.
    let pasta = pasta_de_teste("ida-e-volta");
    let original = Montagem::nova("cadernal", "Cadernal de Teste")
        .com_exigido_padrao()
        .com_tipo(tipo("anotacao", &["titulo", "corpo"]))
        .com_tipo(tipo("etiqueta", &["nome"]))
        .com_link(TipoLink {
            nome: "etiquetada_por".into(),
            de: "anotacao".into(),
            para: "etiqueta".into(),
            cardinalidade: Cardinalidade::ManyToOne,
            rotulo: None,
        })
        .com_acao(TipoAcao {
            nome: "criar".into(),
            alvo: "anotacao".into(),
            regra: aegis_vertical::RegraAcao::CriarObjeto,
            rotulo: None,
        })
        .com_dado(aegis_vertical::Dado {
            tipo: "anotacao".into(),
            chave: Some("k1".into()),
            propriedades: serde_json::json!({"titulo": "a primeira"}),
        });
    original
        .com_pagina(montagem_valida().paginas[0].clone())
        .gravar(&pasta)
        .expect("gravar");

    // Abre o que está no disco, acrescenta um bloco, e grava.
    let mut aberto = Montagem::abrir(&pasta).expect("abrir o vertical escrito");
    aberto.acrescentar_bloco(
        "hoje",
        Bloco::Texto {
            rotulo: None,
            texto: "acrescentado pelo construtor".into(),
        },
    );
    aberto.gravar(&pasta).expect("regravar");

    // E o que voltou tem de ter tudo, mais o bloco novo.
    let relido = Montagem::abrir(&pasta).expect("abrir de novo");
    assert_eq!(relido.tipos.len(), 2, "os tipos sobreviveram");
    assert_eq!(relido.links.len(), 1, "os links sobreviveram");
    assert_eq!(relido.acoes.len(), 1, "as acções sobreviveram");
    assert_eq!(relido.dados.len(), 1, "o catálogo sobreviveu");
    assert_eq!(
        relido.saude.exigido.len(),
        3,
        "as verificações sobreviveram"
    );
    assert_eq!(relido.licenca_exige, "cadernal", "a licença sobreviveu");
    let pagina = &relido.paginas[0];
    assert_eq!(pagina.blocos.len(), 3, "o bloco acrescentado ficou");
    assert_eq!(pagina.variaveis.len(), 2, "as variáveis ficaram");

    let _ = std::fs::remove_dir_all(&pasta);
}

#[test]
fn o_manifesto_gerado_diz_que_e_gerado() {
    // 🔴 Um artefacto gerado que não se identifica convida a editar à mão — e
    // a edição à mão é perdida no próximo guardado, sem erro e sem aviso.
    // A primeira linha tem de dizê-lo.
    let pasta = pasta_de_teste("cabecalho");
    montagem_valida().gravar(&pasta).unwrap();
    let texto = std::fs::read_to_string(pasta.join("vertical.yaml")).unwrap();
    let primeira = texto.lines().next().unwrap_or("");
    assert!(
        primeira.contains("Gerado por"),
        "a primeira linha do manifesto tem de dizer que é gerado; é {primeira:?}"
    );
    let _ = std::fs::remove_dir_all(&pasta);
}

// ===========================================================================
// O "ao vivo" — achado pelo teste ácido da portaria
// ===========================================================================

#[test]
fn o_intervalo_de_refresh_sobrevive_ao_vaivem() {
    // 🔴 A tela da guarita é leitura de placa em tempo real, e a seed dizia 15 s.
    // Sem este campo, converter o vertical do campo para manifesto tirava-lhe
    // o "ao vivo" — e a diferença entre mostrar a entrada que acabou de
    // acontecer e mostrar a de há um minuto é o produto inteiro.
    let mut pagina = montagem_valida().paginas[0].clone();
    pagina.refresh_segundos = Some(15);
    pagina.icone_nav = Some("activity".into());

    let volta = Pagina::de_json(&pagina.para_json()).expect("a página tem de voltar");
    assert_eq!(volta.refresh_segundos, Some(15));
    assert_eq!(volta.icone_nav.as_deref(), Some("activity"));
    assert_eq!(volta, pagina);
}

#[test]
fn refresh_a_zero_e_recusado() {
    // 🔴 `0` não é "sem refresh": é repetir sem parar. A **ausência** é que
    // diz "não se reescreve", e as duas coisas precisam de dizer coisas
    // diferentes — senão um `0` esquecido vira um servidor a levar com a porta
    // do nada, e o sintoma é lentidão que ninguém atribui ao intervalo.
    let m = manifesto_de_teste();
    let mut pagina = montagem_valida().paginas[0].clone();
    pagina.refresh_segundos = Some(0);
    let e = pagina.validar(&m).unwrap_err();
    assert_eq!(e.codigo(), "pagina.refresh-invalido");
}

#[test]
fn uma_pagina_sem_refresh_e_valida() {
    // A ausência é uma escolha legítima: uma página de cadastro não se
    // reescreve sozinha.
    let m = manifesto_de_teste();
    let pagina = montagem_valida().paginas[0].clone();
    assert_eq!(pagina.refresh_segundos, None);
    pagina.validar(&m).expect("sem refresh é válido");
}

/// 🔴 Gravar a mesma página duas vezes **substitui**; não duplica.
///
/// A duplicata não dá erro em lado nenhum: o ficheiro é o mesmo, escrito duas
/// vezes. O que aparece no ecrã do cliente é o item do menu repetido, dias
/// depois, e ninguém sabe que a culpa foi de um `push` em vez de um `substitui`.
#[test]
fn definir_pagina_substitui_em_vez_de_acrescentar() {
    let mut m = montagem_valida();
    let antes = m.paginas.len();
    let slug = m.paginas[0].slug.clone();

    let mut mudada = m.paginas[0].clone();
    mudada.titulo = Some("Acessos (nova)".to_string());
    m.definir_pagina(mudada);

    assert_eq!(
        m.paginas.len(),
        antes,
        "a página foi DUPLICADA em vez de substituída"
    );
    assert_eq!(m.paginas[0].titulo.as_deref(), Some("Acessos (nova)"));
    assert_eq!(
        m.paginas.iter().filter(|p| p.slug == slug).count(),
        1,
        "ficaram duas páginas com o mesmo slug"
    );

    // 🔴 E o outro lado da mesma frase: uma página **nova** entra. Uma
    // semântica que só sabe substituir não monta nada, que é metade do
    // Construtor.
    let mut nova = m.paginas[0].clone();
    nova.slug = "outra".to_string();
    nova.titulo = Some("Outra".to_string());
    m.definir_pagina(nova);
    assert_eq!(m.paginas.len(), antes + 1);
    assert!(m.paginas.iter().any(|p| p.slug == "outra"));
}
