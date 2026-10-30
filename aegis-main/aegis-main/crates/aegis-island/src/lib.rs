//! **aegis-island** — a ilha.
//!
//! Carrega um vertical, sobe HTTP e serve a API do produto instalado.
//!
//! # O que esta camada NÃO faz
//!
//! Ela **não conhece o slug de nenhum vertical**. Recebe a pasta, o
//! [`Manifesto`](aegis_vertical::Manifesto) sai de lá, e todo o resto —
//! tenant, tipos, páginas, menu — é derivado. Não existe `match vertical` em
//! lugar nenhum deste crate, e é essa a propriedade que o tijolo 1 tem de
//! provar.
//!
//! # `/health` não é o gate
//!
//! [`saude::medir`] é o gate, e exige banco **e** tenant ativo **e** seed na
//! versão que o manifesto pede. O `/health` responde `200` com o processo de
//! pé e nada mais — foi medido no núcleo anterior que essa distinção é o que
//! separa "a ilha subiu" de "o produto está pronto".

mod api;
pub mod construtor;
mod estado;
pub mod render;
mod saude;
pub mod saude_exec;

pub use api::{ErroHttp, rotas};
pub use construtor::{FormBloco, gravar as gravar_pagina, tela as tela_do_construtor};
pub use estado::{Ilha, Veredito};
pub use render::{Resolvida, desenhar, desenhar_json, resolver};
pub use saude::{Motivo, Prontidao, Vida, medir};
pub use saude_exec::{Checagem, Estado, interpretador};
