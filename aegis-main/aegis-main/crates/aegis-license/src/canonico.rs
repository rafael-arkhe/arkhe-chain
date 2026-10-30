//! A forma canónica — o que está assinado.
//!
//! 🔴 Isto tem de ser **byte a byte** o que o emissor (`aegis-cli`) produz.
//! Não é "quase igual": um byte de diferença e a Ed25519 não confere, e o
//! sintoma é "a licença não instala" num ficheiro que o emissor acabou de
//! assinar. A implementação é tradução literal de `canonico()` em
//! `aegis-cli/src/licenca.js`:
//!
//! ```js
//! export function canonico(valor) {
//!   if (valor === null || typeof valor !== "object") return JSON.stringify(valor);
//!   if (Array.isArray(valor)) return "[" + valor.map(canonico).join(",") + "]";
//!   return "{" + Object.keys(valor).sort()
//!           .map((k) => `${JSON.stringify(k)}:${canonico(valor[k])}`).join(",") + "}";
//! }
//! ```
//!
//! # Porque `serde_json::Value` e não a estrutura
//!
//! 🔴 O emissor assina o **documento tal como foi lido**, e o
//! `undefined` do JavaScript simplesmente não existe na chave. Se este
//! crate desserializasse para uma `struct` com campos `Option`, um campo
//! ausente e um campo `null` seriam indistinguíveis — e dariam hashes
//! diferentes para documentos que são o mesmo. É por isso que o portão é o
//! `Value`, e o resto do crate o consome já normalizado.

use serde_json::Value;

/// Serializa na forma canónica do emissor.
pub fn canonico(valor: &Value) -> String {
    match valor {
        // `null` e os escalares são `JSON.stringify` do próprio valor.
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => numero_js(n),
        Value::String(s) => string_json(s),
        // 🔴 A ordem do array é a ordem do documento. Um array de strings
        // ordenado muda o que está assinado, e o emissor NÃO ordena arrays —
        // ordenar aqui seria um segundo tipo de divergência, invisível.
        Value::Array(a) => {
            let partes: Vec<String> = a.iter().map(canonico).collect();
            format!("[{}]", partes.join(","))
        }
        Value::Object(o) => {
            let mut chaves: Vec<&String> = o.keys().collect();
            chaves.sort();
            let partes: Vec<String> = chaves
                .iter()
                .map(|k| format!("{}:{}", string_json(k), canonico(&o[*k])))
                .collect();
            format!("{{{}}}", partes.join(","))
        }
    }
}

/// 🔴 O número tem de sair como o JavaScript o escreve.
///
/// `JSON.stringify(1e21)` dá `1e+21` e o Rust dá `1000000000000000000000`; e
/// um inteiro grande sai igual nos dois, mas um `1.0` sai `1` no JS e `1.0`
/// no Rust. Os payloads de licença não têm vírgula flutuante — e é por isso
/// que isto é uma comparação com **aviso**: se algum dia aparecer um
/// `float`, este é o sítio onde a divergência aparece primeiro.
fn numero_js(n: &serde_json::Number) -> String {
    match n.as_i64() {
        Some(i) => i.to_string(),
        None => match n.as_u64() {
            Some(u) => u.to_string(),
            None => n.to_string(),
        },
    }
}

/// `JSON.stringify` de uma string.
fn string_json(s: &str) -> String {
    // O `serde_json` escapa exatamente como o `JSON.stringify`: sem `/`
    // escapado, com os mesmos atalhos de controlo, e com caracteres acima de
    // U+007F saídos crus.
    serde_json::to_string(&Value::String(s.to_string())).unwrap_or_else(|_| "\"\"".to_string())
}

/// O que está assinado: o envelope **sem** o campo `assinatura`.
///
/// 🔴 Não é o documento inteiro. Se a assinatura fosse verificada contra o
/// documento com a própria assinatura dentro, ninguém conseguria verificar
/// nada — é o mesmo anel que se quer provar.
pub fn conteudo_assinado(envelope: &Value) -> String {
    let mut copia = envelope.clone();
    if let Value::Object(o) = &mut copia {
        o.remove("assinatura");
    }
    canonico(&copia)
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    #[test]
    fn chaves_ordenadas_e_sem_espacos() {
        // A mesma coisa escrita por ordem diferente é o **mesmo** documento.
        let a = json!({"b": 1, "a": 2});
        let b = json!({"a": 2, "b": 1});
        assert_eq!(canonico(&a), canonico(&b));
        assert_eq!(canonico(&a), r#"{"a":2,"b":1}"#);
    }

    #[test]
    fn arrays_mantem_a_ordem() {
        // 🔴 Ordenar um array seria uma divergência silenciosa: os `seeds` da
        // Chave OEM são um array, e trocar a ordem muda a assinatura.
        let a = json!(["b", "a"]);
        let b = json!(["a", "b"]);
        assert_ne!(canonico(&a), canonico(&b));
        assert_eq!(canonico(&a), r#"["b","a"]"#);
    }

    #[test]
    fn aninhados_sao_recursivos() {
        let v = json!({"z": {"y": [1, {"x": true}]}, "a": null});
        assert_eq!(canonico(&v), r#"{"a":null,"z":{"y":[1,{"x":true}]}}"#);
    }

    #[test]
    fn null_e_string_distinguem_se() {
        // É a razão de o portão ser `Value` e não `struct`: um campo ausente
        // não é `null`.
        assert_eq!(canonico(&json!({"a": null})), r#"{"a":null}"#);
        assert_eq!(canonico(&json!({"a": "null"})), r#"{"a":"null"}"#);
    }

    #[test]
    fn a_assinatura_nao_e_assinada() {
        let env = json!({
            "aegis": "aegis/licenca/1",
            "tipo": "licenca",
            "payload": {"a": 1},
            "assinatura": {"valor": "x"}
        });
        assert_eq!(
            conteudo_assinado(&env),
            r#"{"aegis":"aegis/licenca/1","payload":{"a":1},"tipo":"licenca"}"#
        );
    }
}
