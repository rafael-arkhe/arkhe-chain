//! O vocabulário de recusa, fechado.
//!
//! 🔴 O que se prova aqui não é que a lista tem as entradas certas — isso o
//! compilador não deixa saber, e está dito na doc do módulo. O que se prova é
//! o que **é** verificável e o que mais dói quando falha.
//!
//! # Por que isto importa mais do que parece
//!
//! A tela traduz por **código**, nunca por texto. Isso obriga a que cada
//! recusa tenha um código **único** e **estável**. Duas recusas com o mesmo
//! código são a mesma recusa na tela — e a casa já mediu o que acontece
//! quando uma tela diz uma coisa e a medição disse outra: quem lê fica com
//! confiança falsa, e a confiança falsa é mais cara do que a confusão.

use std::collections::HashMap;

use aegis_produto::vocabulario_de_recusa;

#[test]
fn nenhum_codigo_se_repete() {
    let linhas = vocabulario_de_recusa();
    let mut onde: HashMap<&str, Vec<&str>> = HashMap::new();
    for l in &linhas {
        onde.entry(l.codigo).or_default().push(l.familia);
    }
    let repetidos: Vec<(&str, Vec<&str>)> = onde.into_iter().filter(|(_, v)| v.len() > 1).collect();

    assert!(
        repetidos.is_empty(),
        "a tela traduz por código, e um código repetido é uma recusa traduzida \
         a troco do que a medição disse:\n  {:#?}",
        repetidos
    );
}

#[test]
fn nenhuma_frase_ou_gesto_vem_vazio() {
    // 🔴 O **gesto** é o que separa a recusa da falha. Quem recebe *"falhou"*
    // sem gesto não sabe o que fazer a seguir — e a casa já pagou por um erro
    // que mandava "Renovar a licença" para um gesto que não existia. Aqui a
    // falta é a ação em si.
    let sem_gesto: Vec<&str> = vocabulario_de_recusa()
        .iter()
        .filter(|l| l.gesto.trim().is_empty())
        .map(|l| l.codigo)
        .collect();
    assert!(
        sem_gesto.is_empty(),
        "estas recusas não dizem o que fazer — e a tela não pode inventar: \
         {sem_gesto:?}"
    );

    let sem_frase: Vec<&str> = vocabulario_de_recusa()
        .iter()
        .filter(|l| l.frase.trim().is_empty())
        .map(|l| l.codigo)
        .collect();
    assert!(
        sem_frase.is_empty(),
        "estas recusas não têm frase — e uma tela sem frase mostra o código: \
         {sem_frase:?}"
    );
}

/// 🔴 A **forma** do código. É o que a tela faz `split('.')` para saber de
/// onde vem, e o que o log do operador lê em voz alta.
#[test]
fn o_codigo_tem_a_forma_da_casa() {
    for l in vocabulario_de_recusa() {
        assert!(
            l.codigo.contains('.'),
            "{}: o código é da família `{}` e tem de trazer o nome dela antes \
             do ponto",
            l.codigo,
            l.familia
        );
        assert_eq!(
            l.codigo,
            l.codigo.trim().to_lowercase(),
            "{}: os códigos são minúsculos e sem espaços, porque vão para log \
             e para a boca do operador",
            l.codigo
        );
        assert!(
            !l.codigo.contains(' '),
            "{}: código com espaço dentro",
            l.codigo
        );
    }
}

/// O guardião de que a lista **não está vazia**. Uma lista de recusas vazia
/// é o estado de um produto que recusa tudo com "erro" — e passa em todas as
/// provas acima, porque um `for` sobre um vector vazio não falha.
#[test]
fn a_lista_nao_esta_vazia() {
    let linhas = vocabulario_de_recusa();
    assert!(
        linhas.len() >= 40,
        "a lista do vocabulário tem {} motivos. Ela **deve** estar perto de \
         meio-centúria, e um número muito menor significa que um `todos()` \
         voltou a ser uma lista curta em vez de uma lista completa.",
        linhas.len()
    );
    // E as quatro famílias têm de estar lá todas. Uma família que desaparece
    // é a lista de um crate que ficou de fora — e é a falha que o nome do
    // módulo promete não deixar acontecer.
    let familias: std::collections::BTreeSet<&str> = linhas.iter().map(|l| l.familia).collect();
    for esperada in [
        "Licença",
        "Prontidão da ilha",
        "Página",
        "Montagem (Construtor)",
    ] {
        assert!(
            familias.contains(esperada),
            "a família {esperada:?} desapareceu do vocabulário. As que há: {familias:?}"
        );
    }
}
