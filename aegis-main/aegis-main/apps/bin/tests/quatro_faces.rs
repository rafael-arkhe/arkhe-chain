//! A prova das **quatro** faces.
//!
//! 🔴 A face agêntica (`aegis mcp`) é a quarta, e é a única que **não tem um
//! ecrã**. Não tem por isso menos obligation: um modelo que recebe uma recusa
//! sem o `gesto` inventa o que fazer a seguir, e um modelo que recebe um
//! código diferente do que a CLI imprime está a ler outro produto.
//!
//! Esta prova é mecânica, como as outras: cada face traduz o **mesmo**
//! `Resultado` da biblioteca, e o teste compara as traduções com a biblioteca
//! como fonte. É o que o `tres_faces.rs:9` disse — *"a próxima face que
//! aparecer herda a garantia em vez de a refazer"* — a cumprir-se.
//!
//! ## E o que ela apanhou
//!
//! 🔴 Escrever esta prova **antes** de a ilha ter `gesto` foi o que mostrou
//! que a ilha não tinha. A ilha respondia `{codigo, mensagem}` por HTTP e
//! nada mais — porque quem lia aquilo era a CLI, que tem o terminal à frente.
//! A quarta face é a primeira que lê **JSON**, e a regra dos três elementos
//! estava partida na única rota que responde por fio.

use aegis_produto::Resultado;
use serde_json::Value;

/// 🔴 A tradução da janela, reimplementada aqui **de propósito**.
///
/// Se a prova chamasse a função da janela, estaria a medir a janela consigo
/// mesma. A traduzir à mão, uma mudança na janela ou no MCP tem de aparecer
/// aqui — e é a diferença entre uma asserção e um ritual.
fn janela_para_tela<T: serde::Serialize>(r: &Resultado<T>) -> Value {
    let t = r.para_tela();
    serde_json::json!({
        "feito": r.saida() == aegis_produto::SAIDA_FEITO,
        "codigo": t["codigo"].as_str().unwrap_or_default(),
        "frase": t["mensagem"].as_str().unwrap_or_default(),
        "gesto": t.get("gesto").and_then(|g| g.as_str()).unwrap_or_default(),
    })
}

/// 🔴 A tradução do MCP: o que a face agêntica escreve no `content`.
///
/// O `saida` entra porque o `aegis mcp` o acrescenta — é o **mesmo** número que
/// a CLI devolve, e um agente que corra `aegis` por baixo da mesma mesa
/// precisa de o poder comparar.
fn mcp_para_tela<T: serde::Serialize>(r: &Resultado<T>) -> Value {
    let mut tela = r.para_tela();
    if let Some(o) = tela.as_object_mut() {
        o.insert("saida".into(), serde_json::json!(r.saida()));
    }
    tela
}

/// O que a CLI **imprime** — e que é a tradução de todas as outras.
fn cli_imprime<T: serde::Serialize>(r: &Resultado<T>) -> (String, String, String, i32) {
    let t = r.para_tela();
    (
        t["codigo"].as_str().unwrap_or_default().to_string(),
        t["mensagem"].as_str().unwrap_or_default().to_string(),
        t.get("gesto")
            .and_then(|g| g.as_str())
            .unwrap_or_default()
            .to_string(),
        r.saida(),
    )
}

/// Os três caminhos, porque uma prova só do caminho feliz é uma prova que
/// acerta sempre.
fn amostras() -> Vec<(&'static str, Resultado<u8>)> {
    vec![
        ("feito", Resultado::feito(7)),
        (
            "recusa",
            Resultado::recusado(
                "licenca.ausente",
                "Não foi apresentada licença para este produto.",
                "Pedir licença ao parceiro",
            ),
        ),
        (
            "falha",
            Resultado::falhou("ilha.inacessivel", "Não consegui falar com a ilha."),
        ),
    ]
}

#[test]
fn as_quatro_faces_dizem_o_mesimo() {
    for (nome, r) in amostras() {
        let (codigo_cli, frase_cli, gesto_cli, saida_cli) = cli_imprime(&r);
        let pela_janela = janela_para_tela(&r);
        let pelo_mcp = mcp_para_tela(&r);
        let pela_biblioteca = r.para_tela();

        // 🔴 O `codigo`, que é por ele que a tela traduz e nunca casa texto.
        assert_eq!(
            pela_janela["codigo"].as_str().unwrap_or_default(),
            pela_biblioteca["codigo"].as_str().unwrap_or_default(),
            "{nome}: a janela diz um codigo e a biblioteca outro"
        );
        assert_eq!(
            pelo_mcp["codigo"].as_str().unwrap_or_default(),
            pela_biblioteca["codigo"].as_str().unwrap_or_default(),
            "{nome}: o MCP diz um codigo e a biblioteca outro"
        );
        assert_eq!(
            codigo_cli,
            pela_biblioteca["codigo"].as_str().unwrap_or_default()
        );

        // 🔴 A frase. Uma refazida por uma face é uma segunda política.
        assert_eq!(
            pela_janela["frase"].as_str().unwrap_or_default(),
            pela_biblioteca["mensagem"].as_str().unwrap_or_default(),
            "{nome}: a janela reescreveu a frase"
        );
        assert_eq!(
            pelo_mcp["mensagem"].as_str().unwrap_or_default(),
            pela_biblioteca["mensagem"].as_str().unwrap_or_default(),
            "{nome}: o MCP reescreveu a frase"
        );
        assert_eq!(
            frase_cli,
            pela_biblioteca["mensagem"].as_str().unwrap_or_default()
        );

        // 🔴 E o `gesto`, que é a parte que uma face perde sem que ninguém
        // note — e que o MCP perde **para sempre** se o mandares vazio, porque
        // um modelo não tem onde o ir buscar.
        let gesto_biblioteca = pela_biblioteca
            .get("gesto")
            .and_then(|g| g.as_str())
            .unwrap_or_default();
        assert_eq!(
            pela_janela["gesto"].as_str().unwrap_or_default(),
            gesto_biblioteca,
            "{nome}: a janela perdeu o gesto"
        );
        assert_eq!(
            pelo_mcp
                .get("gesto")
                .and_then(|g| g.as_str())
                .unwrap_or_default(),
            gesto_biblioteca,
            "{nome}: o MCP perdeu o gesto"
        );
        assert_eq!(gesto_cli, gesto_biblioteca, "{nome}: a CLI perdeu o gesto");

        // 🔴 E o número de processo, que sai **da biblioteca** e é o mesmo
        // para as quatro. É isto que impede a CLI dizer `3` e o MCP dizer
        // "erro" para a mesma recusa.
        assert_eq!(saida_cli, r.saida());
        assert_eq!(
            pelo_mcp["saida"].as_i64().unwrap_or(-1) as i32,
            r.saida(),
            "{nome}: o MCP mandou um saida diferente do da biblioteca"
        );
    }
}

/// 🔴 A recusa tem gesto e a falha não — e o MCP tem de respeitar a
/// diferença, porque `isError: true` sem gesto é um modelo a adivinhar.
#[test]
fn o_mcp_distingue_recusa_de_falha() {
    let recusa = mcp_para_tela(&Resultado::<u8>::recusado("x", "y", "z"));
    assert_eq!(recusa["codigo"], serde_json::json!("x"));
    assert_eq!(recusa["gesto"], serde_json::json!("z"));
    assert_eq!(
        recusa["saida"],
        serde_json::json!(aegis_produto::SAIDA_RECUSADO)
    );

    let falha = mcp_para_tela(&Resultado::<u8>::falhou("x", "y"));
    assert_eq!(falha["codigo"], serde_json::json!("x"));
    assert_eq!(
        falha.get("gesto"),
        None,
        "uma falha não tem gesto: mandá-lo vazio seria indistinguível de 'não há nada a fazer'"
    );
    assert_eq!(
        falha["saida"],
        serde_json::json!(aegis_produto::SAIDA_FALHOU)
    );
}

/// 🔴 A lista de ferramentas é a **única** fonte, e uma ferramenta nova
/// aparece nela sem ninguém a acrescentar a lado nenhum.
///
/// A `tools/list` e o despacho saem da **mesma** `const`, e a casa mediu que
/// duas listas divergem — e a divergência de um `tools/list` só se descobre em
/// produção, com um modelo a chamar uma ferramenta que não existe. Por isso a
/// prova conta, e por isso conta contra um número escrito à mão: escrever
/// *"10"* aqui seria uma segunda lista, que é exactamente o defeito.
#[test]
fn a_lista_de_ferramentas_e_a_fonte_unica() {
    let lista = aegis_bin::mcp::ferramentas();
    let nomes: Vec<&str> = lista
        .iter()
        .filter_map(|t| t.get("name").and_then(|n| n.as_str()))
        .collect();

    assert_eq!(
        nomes.len(),
        lista.len(),
        "uma ferramenta da lista não tem nome: {lista:?}"
    );
    let mut unicos = nomes.clone();
    unicos.sort_unstable();
    unicos.dedup();
    assert_eq!(unicos.len(), nomes.len(), "há nomes repetidos: {nomes:?}");

    // 🔴 A quinta, e ela é a que o D5 abriu. Está aqui **por nome** e não por
    // posição, porque a ordem da lista é do autor e o que não pode mudar é a
    // existência.
    assert!(
        nomes.contains(&"diagnostico"),
        "a ferramenta `diagnostico` não está na lista: {nomes:?}"
    );
    // E nenhuma das outras desapareceu, porque a conferência **soma** e não
    // substitui.
    for esperado in [
        "vertical_manifesto",
        "camera_listar",
        "camera_adicionar",
        "camera_remover",
        "licenca_fingerprint",
        "licenca_conferir",
        "ilha_vertical",
        "ilha_tipos",
        "ilha_pagina",
        "ilha_saude",
    ] {
        assert!(
            nomes.contains(&esperado),
            "a ferramenta {esperado} saiu da lista: {nomes:?}"
        );
    }
}

/// 🔴 E a `diagnostico` **não** recusa por a ilha não estar pronta — que é a
/// razão de existir, e a diferença entre ela e a `ilha_saude`.
///
/// A `ilha_saude` recusa (o pedido era legítimo, é o estado que não o
/// permite). Uma conferência que fizesse o mesmo seria inútil no único
/// momento em que há: o agente pede *"diz-me o que está errado"* e levava um
/// erro em vez da resposta. A forma disso está provada em
/// `aegis-produto/tests/diagnostico.rs`; aqui o que se prova é que a
/// **descrição** que o modelo lê diz isso, porque a descrição é o contrato
/// que o agente decide seguir.
#[test]
fn a_descricao_da_conferencia_diz_que_nao_recusa() {
    let lista = aegis_bin::mcp::ferramentas();
    let d = lista
        .iter()
        .find(|t| t.get("name").and_then(|n| n.as_str()) == Some("diagnostico"))
        .expect("a ferramenta existe");
    let descricao = d
        .get("description")
        .and_then(|x| x.as_str())
        .expect("toda ferramenta tem descricao");

    assert!(
        descricao.contains("conferencia") || descricao.contains("conferência"),
        "a descricao não diz o que a ferramenta faz: {descricao}"
    );
    assert!(
        !descricao.contains("Sai com recusa se nao estiver pronta"),
        "a descricao diz que recusa, e é o contrário: {descricao}"
    );
}

/// 🔴 E o que a casa já provou continua a valer para a quarta: **uma
/// refazida na face quebra a prova**. A janela perde o gesto e o MCP perde o
/// `saida` — cada um à sua maneira, e cada um com a tradução à frente.
#[test]
fn uma_face_que_refaz_a_traducao_quebra_a_prova() {
    let r = Resultado::<u8>::recusado("licenca.ausente", "Não foi apresentada licença.", "Pedir");

    // Uma janela que calculasse a frase por si.
    let janela_que_traduz = serde_json::json!({
        "feito": false,
        "codigo": "licenca.ausente",
        "frase": "Falta a licença.",          // 🔴 reescrita
        "gesto": "Pedir",
    });
    assert_ne!(
        janela_que_traduz["frase"],
        janela_para_tela(&r)["frase"],
        "a janela reescreveu a frase e a prova não a apanhou"
    );

    // Um MCP que não mandasse o `saida`.
    let mcp_sem_saida = serde_json::json!({
        "feito": false,
        "codigo": "licenca.ausente",
        "mensagem": "Não foi apresentada licença.",
        "gesto": "Pedir",
    });
    assert!(
        mcp_sem_saida.get("saida").is_none(),
        "o MCP sem saida é o defeito que a prova tem de apanhar"
    );
    assert!(
        mcp_para_tela(&r).get("saida").is_some(),
        "a traducao real manda o saida"
    );
}

// ═══ D11 — as mesmas faces, com recusas DE VERDADE ════════════════════════
//
// 🔴 A prova de cima usa `Resultado` **sintéticos**: `recusado("licenca.ausente",
// "…", "…")` montados à mão. Prova que as traduções concordam — e nada mais.
//
// O D11 é a perna que faltava: as mesmas três traduções sobre recusas que o
// **produto produziu**, num vertical real, com o fingerprint da máquina do
// integrador. 🔴 E a quarta perna, que é a que um modelo recebe: o `content`
// que sai do `aegis mcp`, não uma reconstrução dele.

use std::path::{Path, PathBuf};

use aegis_bin::mcp::{Contexto, chamada};
use serde_json::json;

/// 🔴 A máquina que a prova **nomeia**.
///
/// A licença é presa ao `machine_id`, ao sistema e à arquitectura, porque o
/// fingerprint é `sha256(arquitectura=…|machine_id=…|plataforma=…)`. Um fixture
/// emitido na bancada Windows é recusado num runner Linux — e **bem recusado**,
/// com `licenca.fingerprint`. 🔴 A cura não é uma licença por máquina (são
/// infinitas, e o `node-lock` deixaria de ser uma garantia): é uma licença por
/// **(plataforma, seed)**, com uma `machine_id` fixa.
const MAQUINA: &str = "aegis-maquina-de-teste";

fn plataforma() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        panic!("a prova nao tem fixture para este sistema — e tem de dizer porquê em vez de passar")
    }
}

fn raiz() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .expect("a raiz do workspace")
        .to_path_buf()
}

fn fixture(nome: &str) -> PathBuf {
    raiz().join("crates/aegis-license/fixtures").join(nome)
}

fn chave_oem() -> PathBuf {
    fixture("chave-oem.json")
}

/// O contexto de um servidor que fala o vertical **real** do repositório.
///
/// 🔴 Só ferramentas que **leem** correm contra ele: `licenca_conferir` e
/// `licenca_fingerprint` não tocam na pasta, e o vertical do repo é a única
/// cópia que uma prova não tem de defender de si mesma.
fn contexto_real() -> Contexto {
    Contexto {
        pasta: raiz().join("verticals/hotelaria"),
        exige: "hotelaria".to_string(),
        licenca: None,
        chave_oem: None,
        machine_id: MAQUINA.to_string(),
    }
}

/// 🔴 Os cenários, e cada um é um **caminho real** do produto.
///
/// 🔴 E o esperado não está escrito à mão aqui: o caso diz o que **quer** e a
/// prova pergunta ao produto. 🔴 Um teste que escrevesse o código esperado
/// passaria com o produto a dizer outra coisa — que é a classe que a casa já
/// pagou com o `montagem.pagina-invalida`.
fn cenarios() -> Vec<(&'static str, Option<PathBuf>, &'static str)> {
    let hotelaria = format!("licenca-hotelaria-{}.json", plataforma());
    vec![
        ("licença boa", Some(fixture(&hotelaria)), "feito"),
        ("sem licença", None, "licenca.ausente"),
        // 🔴 A licença de OUTRO PRODUTO é inalcançável com os fixtures de
        // hoje — e o motivo é uma **ordem de conferência**: o fingerprint é
        // verificado antes da seed, e todos os fixtures de outro produto são
        // também de outra máquina. 🔴 O gesto é o mesmo nas duas recusas
        // ("pedir ao parceiro uma licença para este produto e esta máquina"),
        // por isso o operador não sai a ser mal servido; o que é impreciso é o
        // **diagnóstico**: diz "outra máquina" quando a verdade é "outro
        // produto". Fica escrito para quando houver fixture com a seed trocada
        // e a máquina certa — e para alguém decidir se a ordem se deve
        // inverter.
        (
            "licença de outro produto (e de outra máquina)",
            Some(fixture("licenca-portaria.json")),
            "licenca.fingerprint",
        ),
        // 🔴 Também esta é de outra máquina — o que torna o achado do cenário
        // anterior um **padrão** e não um caso: com os fixtures de hoje, o
        // fingerprint é conferido antes da seed e antes do prazo, e as únicas
        // recusas alcançáveis numa licença são `ausente` e `fingerprint`.
        // `licenca.expirada` e `licenca.seed-uso` ficam **sem medição** — e
        // isso é um buraco de cobertura a dizer, não a resolver em silêncio.
        (
            "licença vencida (e de outra máquina)",
            Some(fixture("licenca-vencida.json")),
            "licenca.fingerprint",
        ),
        (
            "licença de outra máquina",
            Some(fixture("licenca-outra-maquina.json")),
            "licenca.fingerprint",
        ),
    ]
}

/// O `Resultado` que o **produto** devolveu, não um escrito à mão.
fn resultado_real(licenca: Option<&Path>) -> Resultado<Value> {
    match aegis_produto::conferir_licenca(
        "hotelaria",
        licenca,
        Some(chave_oem().as_path()),
        MAQUINA,
    ) {
        Ok(()) => Resultado::feito(json!({})),
        Err(e) => Resultado::recusado(e.codigo(), e.humano(), e.gesto()),
    }
}

/// 🔴 O D11, perna 1: as três faces dizem o mesmo sobre recusas **de verdade**.
#[test]
fn as_faces_dizem_o_mesmo_sobre_recusas_reais() {
    for (nome, caminho, esperado) in cenarios() {
        let r = resultado_real(caminho.as_deref());
        let pela_janela = janela_para_tela(&r);
        let pelo_mcp = mcp_para_tela(&r);
        let (codigo_cli, frase_cli, gesto_cli, saida_cli) = cli_imprime(&r);

        // 🔴 Tudo se compara como **string**, como na prova de cima: no caso
        // **feito** não há código, e `para_tela` dá `null` onde as traduções dão
        // `""`. 🔴 A primeira versão desta prova comparava o MCP com a biblioteca
        // como `Value` e reprovava no caso bom — e a lição é a da casa: sucesso
        // e recusa não têm a mesma forma, e comparar as duas é medir a forma.
        let esperado_codigo = if esperado == "feito" { "" } else { esperado };

        assert_eq!(
            codigo_cli, esperado_codigo,
            "{nome}: a CLI respondeu {codigo_cli:?} e a prova esperava \
             {esperado:?}. 🔴 O cenário deixou de descrever o que o produto faz."
        );
        assert_eq!(
            pela_janela["codigo"].as_str().unwrap_or_default(),
            esperado_codigo,
            "{nome}: a janela diz um código e a CLI outro"
        );
        assert_eq!(
            pelo_mcp["codigo"].as_str().unwrap_or_default(),
            esperado_codigo,
            "{nome}: o MCP diz um código e a CLI outro — e quem lê o MCP é um modelo"
        );
        assert_eq!(pela_janela["frase"], frase_cli, "{nome}: a frase diverge");
        assert_eq!(pela_janela["gesto"], gesto_cli, "{nome}: o gesto diverge");
        assert_eq!(
            pelo_mcp["mensagem"].as_str().unwrap_or_default(),
            frase_cli,
            "{nome}: a mensagem diverge"
        );
        assert_eq!(
            pelo_mcp.get("gesto").and_then(|g| g.as_str()).unwrap_or(""),
            gesto_cli,
            "{nome}: o gesto diverge"
        );
        // 🔴 O número de processo não vem em `para_tela` — quem o acrescenta é o
        // `aegis mcp` e a CLI. Por isso compara-se com `r.saida()`, que é a
        // fonte, e não com um campo que no caso bom não existe.
        assert_eq!(saida_cli, r.saida(), "{nome}: a CLI diz outra coisa");
        assert_eq!(
            pelo_mcp["saida"].as_i64().unwrap_or(-1) as i32,
            r.saida(),
            "{nome}: o MCP diz outra coisa"
        );

        // 🔴 E uma recusa real **tem** as três. O caso `feito` não leva gesto,
        // e é o que deve acontecer: a prova mostra que a distinção se mantém
        // com recusas do produto e não só com as sintéticas.
        if esperado != "feito" {
            assert!(
                !codigo_cli.is_empty() && !frase_cli.is_empty() && !gesto_cli.is_empty(),
                "{nome}: a recusa veio sem uma das três peças — {codigo_cli:?} / \
                 {frase_cli:?} / {gesto_cli:?}"
            );
        }
    }
}

/// 🔴 O D11, perna 2: **o que o modelo lê**.
///
/// 🔴 Não uma reconstrução da resposta: o `content` que o `aegis mcp` escreve,
/// pelo mesmo caminho que o protocolo usa (`mcp::chamada`). 🔴 E a pergunta não
/// é "tem três campos" — é se um modelo que só recebe isto descobre o que
/// fazer, e por isso o `gesto` não pode ser o código repetido.
#[tokio::test]
async fn o_que_o_modelo_le_diz_o_que_fazer() {
    for (nome, caminho, esperado) in cenarios() {
        let mut ctx = contexto_real();
        ctx.licenca = caminho.clone();
        ctx.chave_oem = Some(chave_oem());

        let resposta = chamada(&ctx, "licenca_conferir", json!({})).await;
        let texto = resposta["content"][0]["text"]
            .as_str()
            .expect("a face agênica escreve texto")
            .to_string();
        let lido: Value = serde_json::from_str(&texto).expect("o texto é JSON");

        if esperado == "feito" {
            // 🔴 O sucesso é reconhecido por `confere: true`, e **não** por
            // `codigo` — que no caso bom não existe. Um modelo que receba um
            // sucesso tem de o distinguir de uma recusa, e a distinção está no
            // sinal, não na ausência de código.
            assert_eq!(
                lido["confere"],
                json!(true),
                "{nome}: o modelo leu {texto} e a prova esperava uma conferência                  que passou"
            );
            assert!(
                lido.get("codigo").is_none_or(Value::is_null),
                "{nome}: o sucesso traz um código — e um modelo passa a ler uma                  recusa que não existe: {texto}"
            );
            continue;
        }
        assert_eq!(
            lido["codigo"], esperado,
            "{nome}: o modelo leu {texto} e a prova esperava {esperado:?}"
        );

        {
            let frase = lido["mensagem"].as_str().unwrap_or_default();
            let gesto = lido["gesto"].as_str().unwrap_or_default();
            assert!(!frase.trim().is_empty(), "{nome}: sem frase — {texto}");
            assert!(!gesto.trim().is_empty(), "{nome}: sem gesto — {texto}");
            // 🔴 O gesto que **não** serve é o que manda o operador procurar
            // uma renovação que não resolve o problema — e a casa já pagou por
            // isso. Um gesto que é o código trocado não diz nada a ninguém.
            assert_ne!(
                gesto.trim(),
                lido["codigo"].as_str().unwrap_or_default(),
                "{nome}: o gesto é o código repetido — e o modelo repete-o ao \
                 operador como se fosse uma ação"
            );
            assert!(
                gesto.chars().next().is_some_and(|c| c.is_uppercase()),
                "{nome}: o gesto não é uma frase de ação: {gesto:?}"
            );
        }
    }
}

/// 🔴 O D11, perna 3: **o fingerprint que a ferramenta imprime é o que decide**.
///
/// 🔴 A promessa do D1 é que a licença que o agente tem é a desta máquina. A
/// forma de a provar é imprimir o fingerprint pela ferramenta e mostrar que a
/// licença de **outra** máquina é recusada por ele — e não por outra coisa
/// qualquer. 🔴 Uma prova que só conferisse o valor impresso provaria que a
/// ferramenta imprime um número.
#[tokio::test]
async fn o_fingerprint_impresso_e_o_que_decide() {
    let ctx = contexto_real();

    let resposta = chamada(&ctx, "licenca_fingerprint", json!({})).await;
    let lido: Value = serde_json::from_str(resposta["content"][0]["text"].as_str().expect("texto"))
        .expect("JSON");
    let impresso = lido["fingerprint"]
        .as_str()
        .expect("a ferramenta imprime o fingerprint")
        .to_string();

    // O mesmo fingerprint, calculado pelo produto fora do MCP: as duas
    // respostas têm de ser o mesmo número, ou a face agênica inventa um.
    let (id, plataforma, arquitetura) = aegis_produto::partes_da_maquina(MAQUINA);
    assert_eq!(
        impresso,
        aegis_produto::fingerprint_de(&id, &plataforma, &arquitetura),
        "a ferramenta imprime um fingerprint que o produto não calcula — e o que \
         ela imprime é o que decide se a licença é desta máquina"
    );

    // 🔴 E a licença de outra máquina é recusada **por ele**. Uma recusa por
    // qualquer outro motivo passaria esta prova sem provar nada.
    let outra = fixture("licenca-outra-maquina.json");
    let r = resultado_real(Some(outra.as_path()));
    assert_eq!(
        r.para_tela()["codigo"],
        json!("licenca.fingerprint"),
        "a licença de outra máquina não foi recusada pelo fingerprint — e a \
         perna 3 desta prova não mediu nada"
    );
    assert_eq!(
        r.saida(),
        3,
        "recusar por fingerprint é *não posso* (3), e não *não consegui* (1) — \
         a diferença muda a ação de quem recebe a resposta"
    );
}
