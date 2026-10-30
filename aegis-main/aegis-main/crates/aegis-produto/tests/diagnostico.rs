//! A conferência da máquina, e as **cinco regras** que a casa mediu.
//!
//! 🔴 O que se prova aqui não é que o diagnóstico tem linhas — é que ele
//! **não pode mentir** nas maneiras em que mentiu antes. Cada prova abaixo é
//! uma regra que já custou dinheiro a alguém, e a quinta (o D5) custou um
//! `#[expect(dead_code)]` que ninguém lia.

use aegis_produto::{
    Conserto, Diagnostico, Interpretador, LicencaDaMaquina, LinhaDeConferencia, Situacao,
    conferencia_de, palavra_da_licenca, veredicto_de,
};

/// 🔴 **REGRA 1 — a coluna *Conserto* só enche quando a linha NÃO PASSOU.**
///
/// A Bridge garante isto com um predicado escrito à mão
/// (`temConserto = !it.Passou && it.Corrige.Length > 0`). Sem ele, uma linha
/// que passou aparece com um botão de ação ao lado — e o operador clica numa
/// coisa que já está bem, que é a forma mais cara de um botão.
#[test]
fn a_linha_que_passou_nunca_tem_conserto() {
    let l =
        LinhaDeConferencia::falta_com("diag.x", "uma coisa", "não passa", Conserto::RolePreparar);
    assert_eq!(l.conserto_visivel(), Some(Conserto::RolePreparar));

    // A mesma linha, mas a situação passou: o conserto **desaparece**.
    let mut passou = l.clone();
    passou.situacao = Situacao::Ok;
    assert_eq!(
        passou.conserto_visivel(),
        None,
        "uma linha que passou não pode ter conserto visível"
    );
}

/// 🔴 **REGRA 2 — o conserto é o NOME de uma ação, nunca um comando.**
///
/// O texto da célula é o que o operador lê e o que ele pode repetir. Se fosse
/// uma linha de comando, a primeira vez que o produto o gerasse a partir de
/// um ficheiro seria uma execução arbitrária.
#[test]
fn o_conserto_e_um_nome_e_nao_uma_linha_de_comando() {
    for c in Conserto::todos() {
        let nome = c.nome();
        assert!(
            !nome.is_empty(),
            "{c:?} não tem nome — a célula ficaria vazia"
        );
        assert!(
            !nome.contains("&&")
                && !nome.contains("|")
                && !nome.contains(';')
                && !nome.contains('$'),
            "{nome:?} parece um comando. A coluna diz o que se faz, não como."
        );
        assert!(
            !c.descricao().is_empty(),
            "{c:?} não diz o que vai acontecer antes de acontecer"
        );
    }
}

/// 🔴 **REGRA 3 — a tradução é por CÓDIGO, e o desconhecido é PESSIMISTA.**
///
/// A casa mediu um `SEM-CHECK` a sair verde. Um código novo que ninguém
/// conhece tem de dar **NÃO CONFERIDO** (laranja), e nunca `OK`.
#[test]
fn um_codigo_desconhecido_da_nunca_ok() {
    assert_eq!(
        palavra_da_licenca("ok"),
        "Licença: ativa",
        "o código conhecido dá a palavra de quem sabe"
    );
    // Tudo o que não for `ok` tem de ser diferente de verde.
    for desconhecido in ["", "qualquer-coisa", "OK", "Ok", "ok ", "licenca.valida"] {
        assert_ne!(
            palavra_da_licenca(desconhecido),
            "Licença: ativa",
            "{desconhecido:?} deu a palavra de licença ativa — e o default tem \
             de ser pessimista, nunca verde"
        );
    }
    assert_eq!(
        palavra_da_licenca("qualquer-coisa"),
        "Licença: não conferida",
        "o default tem de ser a frase de quem não sabe"
    );
}

/// A situação tem **três** palavras e nenhuma delas se repete.
#[test]
fn as_situacoes_sao_tres_e_distintas() {
    let palavras: Vec<&str> = [Situacao::Ok, Situacao::Falta, Situacao::NaoConferido]
        .iter()
        .map(|s| s.palavra())
        .collect();
    assert_eq!(palavras, vec!["OK", "EM FALTA", "NÃO CONFERIDO"]);
    let unicas: std::collections::BTreeSet<&&str> = palavras.iter().collect();
    assert_eq!(
        unicas.len(),
        3,
        "duas situações com a mesma palavra é uma só"
    );
}

/// 🔴 **REGRA 4 — não existe "corrigir tudo".**
///
/// O botão *Consertar* liga a **uma** linha de cada vez. A porta de entrada é
/// `conserto_selecionavel`, e ela devolve a **primeira** linha com conserto —
/// nunca uma lista, nunca "todas".
#[test]
fn o_conserto_e_de_uma_linha_de_cada_vez() {
    let d = Diagnostico {
        linhas: vec![
            LinhaDeConferencia::falta_com("a", "primeira", "não passa", Conserto::ProdutoInstalar),
            LinhaDeConferencia::falta_com("b", "segunda", "não passa", Conserto::RolePreparar),
        ],
        veredicto: String::new(),
        ha_segundos: None,
        medido_em: None,
    };
    assert_eq!(
        d.conserto_selecionavel(),
        Some(Conserto::ProdutoInstalar),
        "com duas linhas a repor, a porta devolve a PRIMEIRA — uma de cada vez"
    );
    assert_eq!(d.faltam(), 2);

    // E uma conferência toda verde não tem conserto nenhum para executar.
    let tudo_ok = Diagnostico {
        linhas: vec![LinhaDeConferencia::ok("a", "primeira", "passou")],
        veredicto: String::new(),
        ha_segundos: None,
        medido_em: None,
    };
    assert_eq!(tudo_ok.conserto_selecionavel(), None);
}

/// O veredicto conta o que falta e o que **não deu para conferir** — e os
/// dois são palavras diferentes.
#[test]
fn o_veredicto_distingue_falta_de_inconclusivo() {
    let base = |linhas| Diagnostico {
        linhas,
        veredicto: String::new(),
        ha_segundos: None,
        medido_em: None,
    };
    let t = veredicto_de(&base(vec![
        LinhaDeConferencia::ok("a", "x", "passou"),
        LinhaDeConferencia::falta("b", "y", "falta"),
    ]));
    assert!(
        t.contains('1'),
        "a contagem tem de dizer quantas faltam: {t}"
    );

    let inc = veredicto_de(&base(vec![
        LinhaDeConferencia::ok("a", "x", "passou"),
        LinhaDeConferencia::nao_conferido("b", "y", "não deu"),
    ]));
    assert!(
        !inc.contains("Falta"),
        "não falta nada — só não deu para conferir, e a frase tem de dizer \
         isso: {inc}"
    );
    assert!(inc.contains("conferir"), "{inc}");

    let nada = veredicto_de(&base(vec![LinhaDeConferencia::ok("a", "x", "passou")]));
    assert!(nada.contains("tem tudo"), "{nada}");
}

/// A licença que a tela mostra é uma **variante**, e cada uma tem um
/// conserto diferente — é isso que impede a tela de decidir sozinha.
#[test]
fn cada_estado_da_licenca_tem_o_seu_gesto() {
    // Este teste não prova uma função: prova que o tipo é **fechado**. Um
    // `String` aqui seria um `if` no JavaScript, e o `if` no JavaScript é
    // onde as traduções divergem.
    let variantes = [
        LicencaDaMaquina::Vencida,
        LicencaDaMaquina::NaoInstalada,
        LicencaDaMaquina::Recusada {
            codigo: "licenca.expirada".into(),
            frase: "venceu".into(),
        },
        LicencaDaMaquina::NaoConferida,
    ];
    for v in variantes {
        let json = serde_json::to_string(&v).expect("serializa");
        assert!(
            json.contains("\"estado\""),
            "{v:?} não diz o estado: {json}"
        );
    }
    // E a recusa por **expirada** é a única que pede renovação; as outras
    // pedem que se instale o que se tem.
    let expirada = LicencaDaMaquina::Recusada {
        codigo: "licenca.expirada".into(),
        frase: "venceu".into(),
    };
    assert_ne!(expirada, LicencaDaMaquina::Vencida, "são o mesmo caso");
}

// ---------------------------------------------------------------------------
// O D5: a conferência ligada à face agênrica
// ---------------------------------------------------------------------------

/// 🔴 **REGRA 5 — quem pergunta DE FORA não pode medir o `sh`.**
///
/// Esta é a regra que o `#[expect(dead_code)]` estava a proteger sem ninguém
/// ver, e é a razão de o `interpretador` ser um enum e não um
/// `Option<&str>`.
///
/// A primeira versão da ferramenta `diagnostico` passava `interpretador: None`
/// — porque o processo do agente corre na máquina do integrador e não tem
/// `sh` para medir. Com um `Option`, isso produzia
/// `Linha::falta("não há `sh` nesta máquina")`: uma linha **vermelha** a
/// declarar um defeito que ninguém mediu, com um conserto que não existe, e um
/// operador a ser mandado instalar um interpretador numa máquina onde o
/// problema é outro.
///
/// `NaoObservado` dá `NaoConferido` — nem verde nem vermelho.
#[test]
fn quem_pergunta_de_fora_diz_nao_conferido_e_nao_falta() {
    let d = conferencia_de(
        None,
        false,
        false,
        0,
        0,
        Interpretador::NaoObservado,
        LicencaDaMaquina::NaoConferida,
    );
    let linha = d
        .linhas
        .iter()
        .find(|l| l.codigo == "diag.interpretador")
        .expect("a linha do interpretador existe sempre");

    assert_eq!(
        linha.situacao,
        Situacao::NaoConferido,
        "quem está de fora deu um veredicto sobre o `sh` da ilha: {linha:?}"
    );
    assert_eq!(
        linha.conserto_visivel(),
        None,
        "um conserto para o que não se mediu: {linha:?}"
    );
    assert!(
        !linha.medido.contains("não há `sh`"),
        "a linha afirma um defeito que ninguém mediu: {}",
        linha.medido
    );
}

/// 🔴 E o mesmo `interpretador` visto de **dentro** dá as duas outras
/// respostas — o que prova que a mudança é do *observador*, e não do estado
/// da máquina. `NaoObservado` não é um terceiro estado do `sh`: é a ausência
/// de quem olha.
#[test]
fn o_mesmo_sh_da_respostas_diferentes_conforme_quem_olha() {
    let com_sh = conferencia_de(
        None,
        false,
        false,
        0,
        0,
        Interpretador::Apresente("/bin/sh".into()),
        LicencaDaMaquina::NaoConferida,
    );
    let sem_sh = conferencia_de(
        None,
        false,
        false,
        0,
        0,
        Interpretador::Ausente,
        LicencaDaMaquina::NaoConferida,
    );
    let fora = conferencia_de(
        None,
        false,
        false,
        0,
        0,
        Interpretador::NaoObservado,
        LicencaDaMaquina::NaoConferida,
    );

    let de = |d: &Diagnostico| {
        d.linhas
            .iter()
            .find(|l| l.codigo == "diag.interpretador")
            .expect("a linha existe")
            .situacao
    };
    assert_eq!(de(&com_sh), Situacao::Ok);
    assert_eq!(de(&sem_sh), Situacao::Falta);
    assert_eq!(de(&fora), Situacao::NaoConferido);

    // 🔴 E o que a conferência **conta** é o que o operador lê. O `faltam` é o
    // número que o veredicto mostra, e por isso a comparação tem de ser sobre
    // **linhas do interpretador** e não sobre o total: com `prontidao: None`
    // o banco também falta, e essa diferença é o que os números de cima
    // medem.
    //
    // A versão anterior deste teste comparava `faltam()` no total e falhava
    // com `1 != 0` — e a falha era do **teste**, não do produto: o banco falta
    // em todos os três casos. Um teste que reprova por medir a coisa errada
    // ensina a distrustar do número certo, que é pior do que não ter prova.
    let faltas_do_interpretador = |d: &Diagnostico| {
        d.linhas
            .iter()
            .filter(|l| l.codigo == "diag.interpretador" && l.situacao == Situacao::Falta)
            .count()
    };
    assert_eq!(faltas_do_interpretador(&com_sh), 0);
    assert_eq!(faltas_do_interpretador(&sem_sh), 1);
    assert_eq!(
        faltas_do_interpretador(&fora),
        0,
        "uma linha que ninguém mediu contou como falta"
    );

    // E o veredicto **diz** que houve uma coisa não conferida, e diz por
    // palavras — porque o `faltam()` sozinho é um número que ninguém lê.
    let fora_v = veredicto_de(&fora);
    assert!(
        fora_v.contains("não deu para conferir"),
        "o veredicto de uma linha não medida não o diz: {fora_v}"
    );
}

/// 🔴 **A conferência não recusa por a ilha não estar pronta.** É a razão de
/// existir: `ilha_saude` recusa (o pedido era legítimo, é o estado que não o
/// permite), e a conferência é a ferramenta feita para essa situação.
///
/// Uma conferência que só pode ser chamada quando não há nada a explicar é
/// uma conferência inútil — e o sintoma seria um agente a receber um erro de
/// HTTP quando pede *"diz-me o que está errado"*.
#[test]
fn a_conferencia_nao_recusa_por_a_ilha_nao_estar_pronta() {
    // `prontidao: None` é o pior caso: a ilha não respondeu, ou respondeu uma
    // coisa que não é Prontidão. A conferência tem de responder na mesma.
    let d = conferencia_de(
        None,
        false,
        false,
        0,
        0,
        Interpretador::NaoObservado,
        LicencaDaMaquina::NaoConferida,
    );
    assert!(
        !d.linhas.is_empty(),
        "a conferência sem ilha devia ainda ter linhas, e não tem nenhuma"
    );
    // E o produto aparece como `NaoConferido`, porque **ninguém o mediu** — o
    // que é diferente de "o produto não está instalado".
    let produto = d
        .linhas
        .iter()
        .find(|l| l.codigo == "diag.produto")
        .expect("a linha do produto existe");
    assert_eq!(
        produto.situacao,
        Situacao::NaoConferido,
        "sem Prontidão, o produto foi declarado em falta: {produto:?}"
    );

    // 🔴 E o **banco**, que é a segunda linha que dependia de `prontidao`.
    //
    // 🔴 Esta foi a mentira que a prova **ao vivo** apanhou (30/09/2026): com a
    // ilha inacessível, a face agêntica passava `banco_responde: false` e a
    // linha saía `FALTA` — *"o banco não responde"*. A ilha não estava lá, e o
    // vermelho mandava o operador à procura de um Postgres que ninguém mediu.
    //
    // 🔴 É o pior tipo de defeito de um diagnóstico: **vermelho**, e a
    // apontar para a coisa errada, com a confiança de quem mediu. Daí a regra
    // escrita acima — sem `Prontidao` não há medição nenhuma.
    let banco = d
        .linhas
        .iter()
        .find(|l| l.codigo == "diag.banco")
        .expect("a linha do banco existe");
    assert_eq!(
        banco.situacao,
        Situacao::NaoConferido,
        "sem Prontidao, o banco foi declarado em falta: {banco:?}"
    );
    assert!(
        !banco.medido.contains("não responde"),
        "a linha afirma que o banco não respondeu, e ninguém perguntou: {}",
        banco.medido
    );

    // 🔴 E o veredicto **conta** o que não se mediu como inconclusivo. Com o
    // banco vermelho a mais, diria "falta 2" a um operador que não tem nada de
    // falta — e a conferência que existe para explicar o problema passava a
    // fabricar um.
    assert_eq!(
        d.faltam(),
        0,
        "sem Prontidao, alguma coisa foi dita em falta"
    );
    assert!(
        veredicto_de(&d).contains("não deu para conferir"),
        "o veredicto: {}",
        veredicto_de(&d)
    );
}

/// 🔴 E o **contrapartida**, porque uma guarda que só sabe reprovar também
/// está errada: com `Prontidao` a dizer que o banco **não** respondeu, a linha
/// tem de ser `Falta` — e é falta de verdade, não inconclusivo para se recusar
/// de medir.
#[test]
fn com_prontidao_a_dizer_que_o_banco_falhou_a_linha_e_falta() {
    // 🔴 Um `Prontidao::default()` tem `banco: false` — que é o que a ilha
    // manda quando o banco não respondeu. A linha **tem** de ser `Falta`, e o
    // teste morde se alguém voltar a tratar `false` como "não medido".
    let p = aegis_island::Prontidao {
        banco: false,
        pronto: false,
        ..Default::default()
    };
    let d = conferencia_de(
        Some(&p),
        p.banco,
        p.tenant_ativo,
        p.seed_no_banco,
        p.seed_esperado,
        Interpretador::NaoObservado,
        LicencaDaMaquina::NaoConferida,
    );
    let banco = d
        .linhas
        .iter()
        .find(|l| l.codigo == "diag.banco")
        .expect("a linha do banco existe");
    assert_eq!(
        banco.situacao,
        Situacao::Falta,
        "a ilha disse que o banco nao respondeu, e a linha nao e de falta: {banco:?}"
    );
    assert_eq!(banco.medido, "não responde");

    // 🔴 E `faltam()` conta **duas**: o banco e o produto. Com
    // `Prontidao::default()` o `pronto` é `false` sem `motivo` nenhum, e a
    // linha do produto entra como `falta` sem conserto — porque aqui **houve**
    // quem mediu e o produto não está pronto. É o que distingue esta prova da
    // anterior: lá não se mediu nada (tudo inconclusivo), aqui mediu-se e
    // reprovou-se.
    //
    // A primeira versão deste teste esperava `1` e falhou com `2`. A falha era
    // do **teste**, não do produto: contar só o banco ignorava a linha do
    // produto que a própria linha de cima descreve. Um teste que mede a coisa
    // errada é pior do que nenhum — porque reprova o produto certo.
    assert_eq!(
        d.faltam(),
        2,
        "faltam o banco e o produto: {:?}",
        d.linhas
            .iter()
            .filter(|l| l.situacao == Situacao::Falta)
            .map(|l| l.codigo.clone())
            .collect::<Vec<_>>()
    );
}
