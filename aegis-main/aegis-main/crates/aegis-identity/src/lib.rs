//! **aegis-identity** — pseudónimo, papéis e escopo.
//!
//! Regras que até aqui viviam em **quatro lugares e três linguagens**, e que o
//! `CLAUDE.md` tratava como "fonte canónica" sem nada ligar as outras. Aqui
//! são **uma**, e o teste de que são uma é [`pseudonimo::validar`] a ser a
//! única função de recusa do produto.
//!
//! O que muda com uma implementação só: um produto que **não** chame esta
//! função passa a ser um produto onde a regra não existe — e isso é visível,
//! porque o `grep` do pseudónimo passa a ter uma implementação, e não quatro.

pub mod escopo;
pub mod pseudonimo;

pub use escopo::{ErroEscopo, Escopo, Papel};
pub use pseudonimo::{Contexto, ErroPseudonimo, Pseudonimo, sem_acento};
