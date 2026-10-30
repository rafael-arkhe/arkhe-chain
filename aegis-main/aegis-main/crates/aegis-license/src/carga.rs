//! A leitura do payload.
//!
//! 🔴 **A divisão entre assinar e ler é deliberada.** A assinatura é
//! conferida sobre o `Value` cru, porque é esse o byte que o emissor
//! assinou; o payload é *lido* para uma estrutura, porque é assim que as
//! regras se escrevem. Se a leitura fosse a mesma coisa que a assinatura, um
//! campo a mais no tipo Rust passaria a entrar no que é assinado e a
//! assinatura deixaria de bater — sem nenhum aviso, só "a licença não
//! instala".
//!
//! E o inverso também: se o payload fosse lido **para a assinatura**, um
//! campo `null` e um campo ausente seriam o mesmo documento, que não são.

use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;

/// A carga de uma **Chave OEM**.
#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct CargaOem {
    pub parceiro: String,
    #[serde(default)]
    pub documento: String,
    /// Os verticais que esta chave autoriza. 🔴 Vazio é **recusa**, e a casa
    /// registou a lição: uma Chave OEM sem `seeds` não licencia nada, e o
    /// sintoma é um vertical que ninguém consegue instalar.
    #[serde(default)]
    pub seeds: Vec<String>,
    pub max_instancias: i64,
    pub emitida_em: DateTime<Utc>,
    pub expira_em: DateTime<Utc>,
    pub prazo: String,
    #[serde(default = "grace_padrao")]
    pub grace_horas: i64,
    #[serde(default = "politica_padrao")]
    pub politica_expiracao: String,
    /// A chave do parceiro, que é quem assina a licença em nome dele.
    pub pub_parceiro: String,
}

fn grace_padrao() -> i64 {
    72
}
fn politica_padrao() -> String {
    "degrada".to_string()
}

impl CargaOem {
    pub fn de(value: &Value) -> Option<Self> {
        serde_json::from_value(value.get("payload")?.clone()).ok()
    }
}

/// A carga de uma **licença**.
#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Carga {
    #[serde(default)]
    pub licenca_id: Option<String>,
    pub parceiro: String,
    /// 🔴 O vertical que esta licença autoriza. É o campo que liga a licença
    /// ao produto — e é por ele que um vertical novo não é instalável por uma
    /// licença que não o contrata.
    pub seed: String,
    #[serde(default)]
    pub host: String,
    pub fingerprint: String,
    pub emitida_em: DateTime<Utc>,
    pub expira_em: DateTime<Utc>,
    pub prazo: String,
    #[serde(default = "grace_padrao")]
    pub grace_horas: i64,
    #[serde(default = "politica_padrao")]
    pub politica_expiracao: String,
}

impl Carga {
    pub fn de(value: &Value) -> Option<Self> {
        serde_json::from_value(value.get("payload")?.clone()).ok()
    }
}
