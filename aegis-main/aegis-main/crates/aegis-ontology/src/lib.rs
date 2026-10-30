//! **aegis-ontology** — o contrato de ontologia.
//!
//! Deriva-se de um [`aegis_vertical::Manifesto`] e nada mais. Ele **não tem**
//! banco, não tem rede e não conhece nenhum vertical — o que o torna testável
//! sozinho, sem subir nada.
//!
//! # O portão
//!
//! [`Contrato::coagir`] é o **único** lugar do sistema onde uma propriedade
//! vira tipo. A lição medida do núcleo anterior: o tipo era garantido nos
//! *handlers* e não no modelo, e havia pelo menos três caminhos de escrita sem
//! coação nenhuma. A correção foi um portão único — e é o que este crate é.
//!
//! # Cardinalidade
//!
//! [`Contrato::cabe`] é **regra pura**. O store a combina com um
//! `SELECT … FOR UPDATE` na linha de origem, e é essa combinação que fecha a
//! corrida entre duas escritas ao mesmo tempo.

mod coercao;
mod contrato;
mod erro;

pub use coercao::{Coercao, Modo, coagir_instancia};
pub use contrato::{Contrato, ErroCardinalidade};
pub use erro::ErroPropriedade;
