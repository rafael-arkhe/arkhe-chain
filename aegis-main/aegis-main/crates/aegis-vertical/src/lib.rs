//! **aegis-vertical** — o manifesto de vertical.
//!
//! Este crate é a **única** fonte que descreve um domínio de cliente.
//!
//! # A regra
//!
//! Um vertical é **dado**, nunca código. Nenhum outro crate deste workspace
//! conhece o slug de um vertical, e nenhum vertical importa outro. Adicionar um
//! domínio = **adicionar uma pasta**.
//!
//! Isto substitui o `GateDaSeed()` do núcleo anterior — um `switch` *fechado*
//! em `AegisInstalacao.cs`, com a lista de verticais, os gates de seed e o
//! mapa vertical→gate escritos à mão e **ligados em runtime a nada**. Foi
//! ele que produziu o defeito "Declarar não implanta" (14/09/2026): o vertical
//! é aceito literalmente e o gate fica em `0`, sem nada em vermelho.
//!
//! # O que este crate NÃO faz
//!
//! Não conhece o banco, não conhece a rede, não conhece a ilha. Ele **lê e
//! valida**. Quem aplica é outro crate. A consequência é testável: um teste de
//! integração prova que o slug de um vertical não aparece em nenhum outro
//! ficheiro do workspace.

mod error;
mod load;
mod manifest;

pub use error::ManifestError;
pub use load::{carregar, listar};
pub use manifest::{
    Brand, Cardinalidade, Dado, Licenca, Ligacao, Manifesto, Menu, NOME_MANIFESTO, Ontologia,
    Pagina, Propriedade, Referencia, Reforcamento, RegraAcao, Saude, TipoAcao, TipoLink,
    TipoObjeto, TipoPropriedade, VerticalId, parece_vertical,
};
