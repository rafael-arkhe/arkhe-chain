//! O formato da página como **contrato**.
//!
//! 🔴 Isto é a peça que faz o ponto 10 do dono acontecer. O dono disse: *"nunca
//! tive o feeling de pegar e construir uma página do zero; a base é sempre o
//! seed"*. A causa não é falta de construtor — é que o **formato da página não
//! é uma coisa_first-class**: vive dentro de um `dict` seedado em Python, e
//! quem constrói tem de saber Python.
//!
//! Aqui o formato é uma estrutura, com validação e **round-trip**: o
//! Construtor produz uma [`Pagina`], grava-a, e a ilha lê a mesma. Não há
//! tradução no meio, e não há duas formas de escrever a mesma página.
//!
//! # O round-trip é a prova
//!
//! `Pagina -> JSON -> Pagina` tem de dar a mesma página. Sem isso, o
//! construtor que escreve e a ilha que lê podem divergir sem ninguém ver — e
//! uma página que abre no editor e não abre no ecrã é o sintoma que o dono
//! descreve.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::erro::ErroPagina;

/// O que uma variável traz para a página.
///
/// 🔴 Vocabulário **fechado**: `objectSet`, `agregacao` e mais nada. A
/// primeira versão aceitava texto livre no `tipo`, e um `objectset` com a
/// letra errada era uma variável que não resolvia e uma tela meio montada —
/// que é o defeito clássico de "o editor deixa fazer, o ecrã não mostra".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TipoVariavel {
    /// Um conjunto de instâncias de um tipo.
    ObjectSet,
    /// Uma contagem (ou soma) sobre outro conjunto.
    Agregacao,
}

/// A operação de uma agregação. 🔴 Fechada, e o motivo é o mesmo: `count` e
/// `soma` precisam de colunas diferentes, e uma operação livre sobre uma
/// coluna que não existe dá `null` numa tela sem dizer porquê.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Operacao {
    Count,
    Soma,
    Media,
}

/// Uma variável da página.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Variavel {
    pub id: String,
    #[serde(rename = "tipo")]
    pub tipo: TipoVariavel,
    /// O tipo de objeto, para `objectSet`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub objeto: Option<String>,
    /// A variável de origem, para `agregacao`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub de: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub op: Option<Operacao>,
}

/// Um bloco da página.
///
/// 🔴 O verbo é **fechado** e a tela conhece-o. Um `tipo: "grafico"` escrito
/// à mão numa página e não implementado no renderizador dava um bloco que
/// ocupa espaço e não mostra nada — e o sintoma é "a página ficou em branco",
/// que aponta para o dado e não para o renderizador.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "tipo", rename_all = "snake_case")]
pub enum Bloco {
    /// Um número grande, de uma agregação.
    Kpi {
        #[serde(default)]
        rotulo: Option<String>,
        /// A variável que traz o valor.
        variavel: String,
    },
    /// Uma tabela de instâncias de um tipo.
    Tabela {
        #[serde(default)]
        rotulo: Option<String>,
        objeto: String,
        #[serde(default)]
        colunas: Vec<String>,
        #[serde(default = "limite_padrao")]
        limite: i64,
    },
    /// Texto corrido. Serve para o rótulo que o Construtor não tem um widget
    /// para fazer.
    Texto {
        #[serde(default)]
        rotulo: Option<String>,
        texto: String,
    },
}

fn limite_padrao() -> i64 {
    50
}

/// A página inteira.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Pagina {
    pub slug: String,
    #[serde(default)]
    pub titulo: Option<String>,

    /// 🔴 De quantos em quantos segundos a página se reescreve sozinha.
    ///
    /// Foundo pelo teste ácido da **portaria**: a tela da guarita é de leitura
    /// de placa em tempo real, e a seed dizia 15 s. Sem este campo, converter o
    /// vertical do campo para manifesto **tirava-lhe o "ao vivo"** — e a
    /// diferença entre uma tela que mostra a entrada que acabou de acontecer e
    /// uma que mostra a de há um minuto é o produto inteiro.
    ///
    /// `None` = a página não se reescreve sozinha. E `0` é recusado: um
    /// intervalo zero é um `SKIP` que se Repete, e o sintoma é o servidor a
    /// ficar a jogar à porta do nada.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_segundos: Option<u64>,

    /// O ícone na navegação. É `dado` porque o menu é do produto — e quem
    /// instala tem de conseguir trocá-lo sem editar a página.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icone_nav: Option<String>,

    #[serde(default)]
    pub variaveis: Vec<Variavel>,
    pub blocos: Vec<Bloco>,
}

impl Pagina {
    pub fn de_json(valor: &Value) -> Result<Self, ErroPagina> {
        serde_json::from_value(valor.clone()).map_err(|e| ErroPagina::Formato {
            detalhe: e.to_string(),
        })
    }

    pub fn para_json(&self) -> Value {
        serde_json::to_value(self).unwrap_or(Value::Null)
    }

    pub fn rotulo_ou_slug(&self) -> &str {
        self.titulo.as_deref().unwrap_or(&self.slug)
    }

    pub fn variavel(&self, id: &str) -> Option<&Variavel> {
        self.variaveis.iter().find(|v| v.id == id)
    }

    /// 🔴 Valida a página **contra o contrato do vertical**.
    ///
    /// A validação é contra os **tipos declarados**, e não contra o que
    /// existe no banco: um bloco que aponte para um tipo que o vertical não
    /// declara é uma tela que não abre, e o sintoma no ecrã é "dados a
    /// menos" — que aponta para o seed e não para a página.
    pub fn validar(&self, manifesto: &aegis_vertical::Manifesto) -> Result<(), ErroPagina> {
        if self.refresh_segundos == Some(0) {
            // 🔴 `0` não é "sem refresh" — é "repetir sem parar". A ausência é
            // que diz "não se reescreve", e as duas coisas precisam de dizer
            // coisas diferentes.
            return Err(ErroPagina::RefreshInvalido {
                slug: self.slug.clone(),
            });
        }
        if self.blocos.is_empty() {
            return Err(ErroPagina::SemBlocos {
                slug: self.slug.clone(),
            });
        }

        // Os identificadores são únicos, e não apenas distintos no texto: duas
        // variáveis chamadas `quartos` resolvem pela primeira, e a segunda
        // é um bloco que muda sozinho quando a ordem muda.
        let mut ids: BTreeSet<&str> = BTreeSet::new();
        for v in &self.variaveis {
            if !ids.insert(v.id.as_str()) {
                return Err(ErroPagina::Duplicada {
                    slug: self.slug.clone(),
                    id: v.id.clone(),
                });
            }
        }

        for v in &self.variaveis {
            match v.tipo {
                TipoVariavel::ObjectSet => {
                    let objeto =
                        v.objeto
                            .as_deref()
                            .ok_or_else(|| ErroPagina::CampoObrigatorio {
                                slug: self.slug.clone(),
                                id: v.id.clone(),
                                campo: "objeto",
                            })?;
                    if manifesto.tipo(objeto).is_none() {
                        return Err(ErroPagina::TipoDesconhecido {
                            slug: self.slug.clone(),
                            objeto: objeto.to_string(),
                        });
                    }
                }
                TipoVariavel::Agregacao => {
                    let de =
                        v.de.as_deref()
                            .ok_or_else(|| ErroPagina::CampoObrigatorio {
                                slug: self.slug.clone(),
                                id: v.id.clone(),
                                campo: "de",
                            })?;
                    let origem = self
                        .variavel(de)
                        .ok_or_else(|| ErroPagina::VariavelPendente {
                            slug: self.slug.clone(),
                            de: de.to_string(),
                        })?;
                    // 🔴 Uma agregação que aponta para outra agregação é um
                    // número a contar números. O sintoma é um KPI que não mexe
                    // e ninguém sabe porquê.
                    if origem.tipo != TipoVariavel::ObjectSet {
                        return Err(ErroPagina::AgregacaoDeAggregacao {
                            slug: self.slug.clone(),
                            de: de.to_string(),
                        });
                    }
                    if v.op.is_none() {
                        return Err(ErroPagina::CampoObrigatorio {
                            slug: self.slug.clone(),
                            id: v.id.clone(),
                            campo: "op",
                        });
                    }
                }
            }
        }

        for b in &self.blocos {
            match b {
                Bloco::Kpi { variavel, .. } => {
                    if self.variavel(variavel).is_none() {
                        return Err(ErroPagina::VariavelPendente {
                            slug: self.slug.clone(),
                            de: variavel.clone(),
                        });
                    }
                }
                Bloco::Tabela {
                    objeto, colunas, ..
                } => {
                    let tipo =
                        manifesto
                            .tipo(objeto)
                            .ok_or_else(|| ErroPagina::TipoDesconhecido {
                                slug: self.slug.clone(),
                                objeto: objeto.clone(),
                            })?;
                    for coluna in colunas {
                        if !tipo.propriedades.iter().any(|p| &p.nome == coluna) {
                            return Err(ErroPagina::ColunaDesconhecida {
                                slug: self.slug.clone(),
                                objeto: objeto.clone(),
                                coluna: coluna.clone(),
                            });
                        }
                    }
                }
                Bloco::Texto { .. } => {}
            }
        }

        Ok(())
    }
}
