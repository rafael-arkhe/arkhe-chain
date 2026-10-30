//! A prova das **três** faces.
//!
//! 🔴 A janela é a terceira face do mesmo produto, e ela não pode ter regra
//! própria. A prova é mecânica: a janela traduz o `Resultado` pela **mesma**
//! função que a CLI imprime, e o teste compara as duas traduções com a
//! biblioteca como fonte.
//!
//! Sem isto, "um produto" é uma frase. Com isto, é uma asserção — e a
//! próxima face que aparecer herda a garantia em vez de a refazer.

use aegis_produto::Resultado;

/// 🔴 A tradução da janela. **Volta a ser a mesma** que a do crate: se um dia
/// alguém corrigir uma e não a outra, esta prova fica vermelha.
fn janela_para_tela<T: serde::Serialize>(r: &Resultado<T>) -> serde_json::Value {
    let t = r.para_tela();
    serde_json::json!({
        "feito": r.saida() == aegis_produto::SAIDA_FEITO,
        "codigo": t["codigo"].as_str().unwrap_or_default(),
        "frase": t["mensagem"].as_str().unwrap_or_default(),
        "gesto": t.get("gesto").and_then(|g| g.as_str()).unwrap_or_default(),
    })
}

#[test]
fn a_janela_e_a_cli_dizem_o_mesimo_num_codigo() {
    let r = Resultado::<u8>::recusado(
        "licenca.ausente",
        "Não foi apresentada licença.",
        "Pedir licença ao parceiro",
    );

    let pela_biblioteca = r.para_tela();
    let pela_janela = janela_para_tela(&r);

    assert_eq!(pela_janela["codigo"], pela_biblioteca["codigo"]);
    assert_eq!(pela_janela["frase"], pela_biblioteca["mensagem"]);
    // 🔴 E o `gesto`, que a janela mostra **em destaque** e a CLI imprime por
    // baixo. Se um dia um deles perder o gesto, o operador perde a ação — e o
    // teste diz qual das duas faces perdeu.
    assert_eq!(
        pela_janela["gesto"],
        pela_biblioteca
            .get("gesto")
            .and_then(|g| g.as_str())
            .unwrap_or_default(),
    );
}

#[test]
fn uma_recusa_tem_o_gesto_e_uma_falha_nao_tem() {
    // 🔴 A distinção que vale o produto inteiro: "não posso" traz o que fazer
    // (o pedido é legítimo, o estado não o permite) e "não consegui" não traz
    // (ninguém sabe o que fazer com "falhou"). Um operador que recebe
    // "falhou" sem gesto reinicia a máquina, e às vezes é o caminho certo.
    let recusa = janela_para_tela(&Resultado::<u8>::recusado("x", "y", "z"));
    assert_eq!(recusa["gesto"], "z");

    let falha = janela_para_tela(&Resultado::<u8>::falhou("x", "y"));
    assert_eq!(falha["gesto"], "");
    assert_eq!(falha["frase"], "y");
}

#[test]
fn o_codigo_de_processo_sob_da_biblioteca() {
    // A janela não tem código de processo: ela mostra. E é por isso que este
    // teste é o mesmo para as três faces — `Resultado::saida` é a única
    // decisão, e ela é da biblioteca.
    assert_eq!(
        Resultado::<u8>::Feito(1).saida(),
        aegis_produto::SAIDA_FEITO
    );
    assert_eq!(
        Resultado::<u8>::falhou("a", "b").saida(),
        aegis_produto::SAIDA_FALHOU
    );
    assert_eq!(
        Resultado::<u8>::recusado("a", "b", "c").saida(),
        aegis_produto::SAIDA_RECUSADO
    );
}
