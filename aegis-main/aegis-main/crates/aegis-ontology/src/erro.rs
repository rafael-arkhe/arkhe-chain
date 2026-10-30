//! Erros de contrato.
//!
//! 🔴 `strict` é **hard-reject**: uma escrita cujo tipo não bate é recusada
//! com o caminho exato da propriedade. `lenient` é best-effort e **nunca**
//! levanta — a lição medida do núcleo anterior, onde a coação "enforce" no
//! handler era o único portão e metade dos caminhos de escrita passavam por
//! fora dele.

use aegis_vertical::TipoPropriedade;

/// Erro de uma propriedade contra o tipo declarado.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct ErroPropriedade {
    /// Tipo de objeto em que a propriedade foi recusada.
    pub tipo: String,
    /// Caminho dentro da instância, em notação de ponto.
    pub propriedade: String,
    /// Tipo que o contrato declara.
    pub esperado: TipoPropriedade,
    /// O que veio, já descrito.
    pub recebido: String,
}

impl ErroPropriedade {
    /// Código fechado, para a tela traduzir por ele — nunca por texto.
    pub fn codigo(&self) -> &'static str {
        "ontologia.propriedade-invalida"
    }

    pub fn humano(&self) -> String {
        format!(
            "{}: a propriedade {:?} de {:?} esperava {} e recebeu {}",
            self.propriedade, self.propriedade, self.tipo, self.esperado, self.recebido
        )
    }
}

impl std::fmt::Display for ErroPropriedade {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.humano())
    }
}

impl std::error::Error for ErroPropriedade {}

/// Descreve um `serde_json::Value` em palavras, para a mensagem de recusa.
pub(crate) fn descrever(valor: &serde_json::Value) -> String {
    match valor {
        serde_json::Value::Null => "nada".into(),
        serde_json::Value::Bool(b) => format!("booleano ({b})"),
        serde_json::Value::Number(n) => {
            if n.is_f64() {
                format!("número decimal ({n})")
            } else {
                format!("número inteiro ({n})")
            }
        }
        serde_json::Value::String(s) => format!("texto ({} caracteres)", s.chars().count()),
        serde_json::Value::Array(a) => format!("lista de {} itens", a.len()),
        serde_json::Value::Object(o) => format!("objecto com {} campos", o.len()),
    }
}
