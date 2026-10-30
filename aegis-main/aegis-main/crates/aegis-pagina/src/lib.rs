//! **aegis-pagina** — o formato da página como contrato.
//!
//! É a peça que faz o ponto 10 do dono acontecer. O dono disse que nunca pegou
//! numa página do zero porque *"a base é sempre o seed"* — e a causa não é
//! falta de editor: é que o formato da página **não era uma coisa de primeira
//! classe**. Vivia dentro de um `dict` seedado em Python, e quem queria
//! construir tinha de saber Python.
//!
//! Aqui o formato é uma estrutura com validação e **round-trip**, e a
//! [`montagem::Montagem`] **emite** o `vertical.yaml` a partir do que foi
//! montado. Não há tradução no meio e não há duas formas de escrever a mesma
//! página.
//!
//! # As três peças
//!
//! - [`modelo::Pagina`] — o formato: variáveis e blocos, vocabulário fechado.
//! - [`montagem::Montagem`] — o que o Construtor monta, e o que ele **grava**.
//! - [`ErroPagina`] — códigos fechados, para a tela traduzir sem casar texto.

mod erro;
mod modelo;
pub mod montagem;

pub use erro::{ErroMontagem, ErroPagina};
pub use modelo::{Bloco, Operacao, Pagina, TipoVariavel, Variavel};
pub use montagem::Montagem;
