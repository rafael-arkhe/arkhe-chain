//! O portão de coação.
//!
//! 🔴 **Este é o único lugar do sistema onde uma propriedade vira tipo.** A
//! lição medida do núcleo anterior: o tipo era garantido nos *handlers*
//! (`create_object`/`modify_object`) e **não** no modelo, e havia pelo menos
//! três caminhos de escrita sem coação nenhuma — `OntologyService.create_node`,
//! o conector HTTP e o `update_node`. A correção foi um portão único em todo
//! caminho de escrita.
//!
//! Aqui não há caminho alternativo: quem escreve uma instância **passa por
//! aqui**, e `contrato.rs` é o único que o chama.

use aegis_vertical::{Propriedade, Reforcamento, TipoPropriedade};
use serde_json::Value;

use crate::erro::{ErroPropriedade, descrever};

/// Modo de coação, herdado do `reforco` do tipo no manifesto.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Modo {
    /// Best-effort: coage o que dá, **nunca** levanta. O valor original passa
    /// intacto quando não dá para coagir.
    Lenient,
    /// Hard-reject: o primeiro tipo errado recusa a escrita inteira.
    Strict,
}

impl Modo {
    pub fn de(reforco: Reforcamento) -> Self {
        match reforco {
            Reforcamento::Lenient => Self::Lenient,
            Reforcamento::Strict => Self::Strict,
        }
    }
}

/// Resultado de coar uma instância, com o que aconteceu — porque "coage" e
/// "deixou como estava" são coisas diferentes e o operador precisa saber qual
/// foi.
#[derive(Debug, Clone, PartialEq)]
pub struct Coercao {
    pub valor: Value,
    /// Propriedades cujo tipo foi convertido (`"5"` → `5`).
    pub convertidas: Vec<String>,
    /// Propriedades que o contrato **não** declara, preservadas como vieram.
    pub nao_declaradas: Vec<String>,
}

impl Coercao {
    fn nova(valor: Value) -> Self {
        Self {
            valor,
            convertidas: Vec::new(),
            nao_declaradas: Vec::new(),
        }
    }
}

/// Coage `entrada` contra as propriedades declaradas de um tipo.
///
/// `entrada` tem de ser um objecto JSON. A propriedade de título é
/// obrigatória: uma instância sem rótulo humano não tem como aparecer em
/// nenhuma tela.
pub fn coagir_instancia(
    tipo_nome: &str,
    propriedades: &[Propriedade],
    propriedade_titulo: &str,
    modo: Modo,
    entrada: &Value,
) -> Result<Coercao, ErroPropriedade> {
    let resultado = coagir_objeto(tipo_nome, propriedades, modo, entrada)?;

    // O título é a única coisa realmente obrigatória — e é obrigatório **só
    // na instância de topo**. Um `struct` aninhado não tem título: impor um
    // ali seria inventar uma regra que o contrato não pediu.
    let tem_titulo = resultado
        .valor
        .get(propriedade_titulo)
        .is_some_and(|v| !v.is_null() && v.as_str().is_none_or(|s| !s.is_empty()));
    if !tem_titulo {
        return Err(ErroPropriedade {
            tipo: tipo_nome.to_string(),
            propriedade: propriedade_titulo.to_string(),
            esperado: TipoPropriedade::Texto,
            recebido: "nada (a propriedade de título é obrigatória)".into(),
        });
    }

    Ok(resultado)
}

/// Coage as propriedades declaradas, sem exigir título. É o que a recursão de
/// `struct` usa.
fn coagir_objeto(
    tipo_nome: &str,
    propriedades: &[Propriedade],
    modo: Modo,
    entrada: &Value,
) -> Result<Coercao, ErroPropriedade> {
    let objeto = match entrada {
        Value::Object(mapa) => mapa.clone(),
        _ => {
            return Err(ErroPropriedade {
                tipo: tipo_nome.to_string(),
                propriedade: String::new(),
                esperado: TipoPropriedade::Struct,
                recebido: descrever(entrada),
            });
        }
    };

    let mut saida: serde_json::Map<String, Value> = serde_json::Map::new();
    let mut resultado = Coercao::nova(Value::Object(std::mem::take(&mut saida)));

    // Propriedades declaradas que vieram.
    for declarada in propriedades {
        let Some(bruto) = objeto.get(&declarada.nome) else {
            // Ausente não é erro: quase toda propriedade é opcional, e a
            // obrigatoriedade de um campo é do ciclo de vida do vertical, não
            // do tipo.
            continue;
        };
        let valor = coagar(declarada, bruto, tipo_nome, modo)?;
        if &valor != bruto {
            resultado.convertidas.push(declarada.nome.clone());
        }
        saida.insert(declarada.nome.clone(), valor);
    }

    // Propriedades que vieram e o contrato não declara.
    let declaradas: Vec<&str> = propriedades.iter().map(|p| p.nome.as_str()).collect();
    for nome in objeto.keys().filter(|k| !declaradas.contains(&k.as_str())) {
        if modo == Modo::Strict {
            // Em `strict`, campo não declarado é o mesmo defeito de campo com
            // o tipo errado: a instância afirma um campo que o contrato não
            // conhece, e ninguém vai conseguir lê-lo.
            return Err(ErroPropriedade {
                tipo: tipo_nome.to_string(),
                propriedade: nome.clone(),
                esperado: TipoPropriedade::Struct,
                recebido: format!("campo não declarado pelo contrato ({nome})"),
            });
        }
        resultado.nao_declaradas.push(nome.clone());
        saida.insert(nome.clone(), objeto[nome].clone());
    }

    resultado.valor = Value::Object(saida);
    Ok(resultado)
}

fn coagar(
    declarada: &Propriedade,
    bruto: &Value,
    tipo_nome: &str,
    modo: Modo,
) -> Result<Value, ErroPropriedade> {
    let recusar = || ErroPropriedade {
        tipo: tipo_nome.to_string(),
        propriedade: declarada.nome.clone(),
        esperado: declarada.tipo,
        recebido: descrever(bruto),
    };

    // `null` é sempre aceite e significa "não preenchido". Uma instância
    // recém-criada tem meia dúzia de campos nulos e recusar a criação por isso
    // seria recusar o produto.
    if bruto.is_null() {
        return Ok(Value::Null);
    }

    match declarada.tipo {
        TipoPropriedade::Texto => match bruto {
            Value::String(_) => Ok(bruto.clone()),
            Value::Number(n) if modo == Modo::Lenient => Ok(Value::String(n.to_string())),
            Value::Bool(b) if modo == Modo::Lenient => Ok(Value::String(b.to_string())),
            _ => match modo {
                Modo::Strict => Err(recusar()),
                Modo::Lenient => Ok(bruto.clone()),
            },
        },

        TipoPropriedade::Numero => match bruto {
            Value::Number(_) => Ok(bruto.clone()),
            // `true` não é 1: essa conversão já custou um `total` errado numa
            // tela de contagem. Coage-se string, nunca booleano.
            Value::String(s) => match s.parse::<serde_json::Number>() {
                Ok(n) => Ok(Value::Number(n)),
                Err(_) => match modo {
                    Modo::Strict => Err(recusar()),
                    Modo::Lenient => Ok(bruto.clone()),
                },
            },
            _ => match modo {
                Modo::Strict => Err(recusar()),
                Modo::Lenient => Ok(bruto.clone()),
            },
        },

        TipoPropriedade::Booleano => match bruto {
            Value::Bool(_) => Ok(bruto.clone()),
            Value::String(s) if modo == Modo::Lenient => match s.as_str() {
                "true" | "verdadeiro" | "1" | "sim" => Ok(Value::Bool(true)),
                "false" | "falso" | "0" | "nao" | "não" => Ok(Value::Bool(false)),
                _ => Ok(bruto.clone()),
            },
            _ => match modo {
                Modo::Strict => Err(recusar()),
                Modo::Lenient => Ok(bruto.clone()),
            },
        },

        TipoPropriedade::Data => match bruto {
            // A ontologia não valida formato de data: a data que o técnico
            // escreve e a data que o serviço produz têm formatos diferentes,
            // e um validador aqui seria um validador errado. O que se recusa é
            // o que não é data nem texto.
            Value::String(_) | Value::Number(_) => Ok(bruto.clone()),
            _ => match modo {
                Modo::Strict => Err(recusar()),
                Modo::Lenient => Ok(bruto.clone()),
            },
        },

        TipoPropriedade::Geoponto => match bruto {
            Value::Object(m) if m.contains_key("lat") && m.contains_key("lon") => Ok(bruto.clone()),
            _ => match modo {
                Modo::Strict => Err(recusar()),
                Modo::Lenient => Ok(bruto.clone()),
            },
        },

        TipoPropriedade::Vetor => match bruto {
            Value::Array(a) if a.iter().all(|v| v.is_number()) => Ok(bruto.clone()),
            _ => match modo {
                Modo::Strict => Err(recusar()),
                Modo::Lenient => Ok(bruto.clone()),
            },
        },

        TipoPropriedade::SerieTemporal => match bruto {
            Value::Array(a) if a.iter().all(|p| p.is_object()) => Ok(bruto.clone()),
            _ => match modo {
                Modo::Strict => Err(recusar()),
                Modo::Lenient => Ok(bruto.clone()),
            },
        },

        TipoPropriedade::Struct => {
            if !bruto.is_object() {
                return match modo {
                    Modo::Strict => Err(recusar()),
                    Modo::Lenient => Ok(bruto.clone()),
                };
            }
            let interno = coagir_objeto(tipo_nome, &declarada.campos, modo, bruto)?;
            Ok(interno.valor)
        }

        TipoPropriedade::Lista => {
            let Value::Array(itens) = bruto else {
                return match modo {
                    Modo::Strict => Err(recusar()),
                    Modo::Lenient => Ok(bruto.clone()),
                };
            };
            let Some(modelo) = &declarada.itens else {
                return match modo {
                    Modo::Strict => Err(recusar()),
                    Modo::Lenient => Ok(bruto.clone()),
                };
            };
            let mut saida = Vec::with_capacity(itens.len());
            for item in itens {
                saida.push(coagar(modelo, item, tipo_nome, modo)?);
            }
            Ok(Value::Array(saida))
        }
    }
}
