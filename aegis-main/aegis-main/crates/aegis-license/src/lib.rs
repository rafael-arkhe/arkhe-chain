//! **aegis-license** — o verificador de licença.
//!
//! Uma implementação, do formato que o `aegis-cli` emite **hoje**. É a
//! decisão que fecha o tijolo 2: um formato novo daria quatro verificadores
//! durante a transição em vez de um, e há licenças já emitidas na cadeia que
//! um formato novo não leria.
//!
//! # O que este crate NÃO faz
//!
//! - **Não assina.** Nenhuma chave privada entra no núcleo, no contentor nem
//!   no banco. A casa mediu essa regra e ela não se negocia.
//! - **Não fiscaliza cota.** `max_instancias` não é contável numa máquina que
//!   o parceiro controla; o que a criptografia garante é que a licença é *do
//!   parceiro*, *para os seeds dele*, *até à data dele*.
//! - **Não decide renovação.** O ledger decide `renovar`/`negar`; este crate
//!   só confere o que veio assinado — mas confere, e era esse o buraco: a
//!   recusa de licença vencida mandava o operador "renovar" para um gesto que
//!   não existia. Ver [`renovacao`].
//!
//! # A prova
//!
//! Os fixtures em `fixtures/` são **emitidos pelo `aegis-cli`** (ver
//! `ferramentas/gerar-fixtures.mjs`). A prova de interoperabilidade não é um
//! teste de forma canónica: é o Node ter assinado e o Rust **conferir** — o
//! que só acontece se a forma canónica for byte a byte igual.

mod canonico;
mod carga;
mod erro;
mod renovacao;
mod verificador;

pub use canonico::{canonico, conteudo_assinado};
pub use carga::{Carga, CargaOem};
pub use erro::{ErroLicenca, Motivo};
pub use renovacao::{
    Contexto as ContextoRenovacao, DECISOES, Desfecho, FORMATO_PEDIDO, PedidoRenovacao,
    TIPO_RESPOSTA, conferir_resposta, nonce, para_recebido,
};
pub use verificador::{
    ChavePublica, ErroChave, EstadoValidade, FORMATO, Pedido, TIPO_LICENCA, TIPO_OEM, Veredito,
    assinatura_confere, avaliar_validade, conferir_chave_oem, normalizar_fingerprint, verificar,
};
