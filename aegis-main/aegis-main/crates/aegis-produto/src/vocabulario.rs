//! O vocabulário de recusa do produto, **num sítio**.
//!
//! 🔴 Existiam **treze** `codigo()` espalhados por sete crates, e nenhuma
//! vista que as juntasse. A queixa do dono em segundo lugar — *"documentação
//! densa, mal atualizada"* — tem aqui a sua forma mais concreta: ninguém
//! conseguia responder a *"o que é que este produto recusa, e o que é que se
//! faz a seguir"* sem abrir sete ficheiros.
//!
//! Esta peça é a lista. E a lista é **derivada** dos enums, não escrita ao
//! lado deles — porque uma segunda lista seria uma segunda versão da regra, e
//! as duas divergem no primeiro caso de borda, que é sempre o motivo que
//! ninguém se lembrava.
//!
//! # O que entra, e o que não
//!
//! Só os enums de **variante unitária**. Os que carregam dados —
//! `ErroStore::Ligacao { url, fonte }` — não se enumeram sem inventar a
//! carga, e um catálogo de erros inventados é pior do que nenhum: parece
//! exaustivo e não é.
//!
//! # A fraqueza, dita
//!
//! Cada enum ganha um `todos()`/`catalogo()` escrito à mão ao lado de si, e
//! **o compilador não o liga ao enum**. Um motivo novo entra no `match` e
//! fica de fora da lista.
//!
//! A cura disponível é parcial e é melhor dizê-lo do que escondê-lo: as
//! guardas deste ficheiro apanham o que é apanhável — códigos repetidos,
//! frases vazias, gestos vazios. O que elas **não** apanham é um motivo
//! ausente da lista, e o que apanha esse é a pessoa que abre a referência à
//! procura dele. A cura a sério — um derive, ou um macro que obrigue a
//! listagem — é trabalho para quando o ficheiro apertar.

/// Uma recusa, como a tela e a linha de comandos a veem.
///
/// 🔴 A frase é `String` e não `&'static str` porque nem toda a recusa é
/// estática: `ErroCamera` formata o nome e o endereço que o operador colou no
/// sítio errado. Antes isto era `&'static str` e a ponte **ficou de fora da
/// lista** por causa disso — cinco recusas ausentes de
/// `docs/REFERENCIA.md` foi o preço de uma string a menos.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Linha {
    /// De que família vem — o que a pessoa está a ler.
    pub familia: &'static str,
    /// 🔴 O **código**. É por ele que a tela traduz, e nunca por texto.
    pub codigo: &'static str,
    /// O que a tela diz.
    pub frase: String,
    /// 🔴 O que a pessoa pode fazer. Vazio é um defeito: quem recebe
    /// *"falhou"* sem gesto não sabe o que fazer a seguir.
    pub gesto: &'static str,
}

/// Todas as recusas do produto, dos vocabulários que a tela traduz por
/// código.
pub fn todos() -> Vec<Linha> {
    let mut saida = Vec::new();

    for m in aegis_license::Motivo::todos() {
        saida.push(Linha {
            familia: "Licença",
            codigo: m.codigo(),
            frase: m.humano().to_string(),
            gesto: m.gesto(),
        });
    }
    for m in aegis_island::Motivo::todos() {
        saida.push(Linha {
            familia: "Prontidão da ilha",
            codigo: m.codigo(),
            frase: m.humano().to_string(),
            gesto: m.gesto(),
        });
    }
    for e in aegis_pagina::ErroPagina::catalogo() {
        saida.push(Linha {
            familia: "Página",
            codigo: e.codigo(),
            frase: e.humano().to_string(),
            gesto: e.gesto(),
        });
    }
    for e in aegis_pagina::ErroMontagem::catalogo() {
        saida.push(Linha {
            familia: "Montagem (Construtor)",
            codigo: e.codigo(),
            frase: e.humano().to_string(),
            gesto: e.gesto(),
        });
    }
    // 🔴 A ponte entrou na lista com o D1, e entrou porque duas das recusas
    // dela **só existiam escritas na casca**: um código num `eprintln!` não
    // entra no vocabulário, e um motivo que não entra no vocabulário não tem
    // frase nem gesto. Uma pessoa que abre a referência para perguntar *"o que
    // é que isto recusa, e o que é que se faz a seguir"* não tinha resposta
    // para a lista de câmaras.
    for (codigo, frase, gesto) in aegis_ponte::ErroCamera::todos() {
        saida.push(Linha {
            familia: "Ponte (câmaras)",
            codigo,
            frase,
            gesto,
        });
    }
    saida
}
