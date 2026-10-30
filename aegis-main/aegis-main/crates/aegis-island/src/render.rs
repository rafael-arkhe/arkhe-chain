//! Renderizar uma página contra o contrato.
//!
//! 🔴 É aqui que o formato deixa de ser um ficheiro e passa a ser uma tela.
//! E é por isso que o formato era **primeiro** e o renderizador **depois**: ao
//! contrário, a página nasce como HTML e ninguém consegue mais gerar um
//! manifesto a partir dela — que é o caminho que o dono nunca viu fechado.
//!
//! O renderizador resolve **variáveis** e **desenha blocos**, e não faz mais
//! nada. Não há JavaScript, não há estado, não há interatividade: uma página
//! é uma leitura do ontology, e o que ela mostra não pode divergir do que o
//! contrato declara.

use aegis_ontology::Contrato;
use aegis_pagina::{Bloco, Operacao, Pagina, TipoVariavel, Variavel};
use aegis_store::Repo;
use serde_json::{Value, json};

/// O valor de uma variável, já resolvida.
#[derive(Debug, Clone)]
pub enum Resolvida {
    /// As instâncias de um conjunto.
    Conjunto(Vec<Value>),
    /// Um número de uma agregação.
    Numero(f64),
}

/// Resolve as variáveis de uma página, por ordem.
///
/// 🔴 A ordem é a da página, e uma agregação só resolve depois do conjunto de
/// que vem antes. Resolver por DependencySorter dava o mesmo resultado e
/// uma dependência a mais; manter a ordem do ficheiro mantém a página
/// legível por quem a escreve, que é a meio caminho de a arrumar.
pub async fn resolver(
    pagina: &Pagina,
    contrato: &Contrato,
    repo: &Repo,
    tenant_id: &str,
) -> Vec<(String, Resolvida)> {
    let mut saida: Vec<(String, Resolvida)> = Vec::with_capacity(pagina.variaveis.len());

    for variavel in &pagina.variaveis {
        let valor = match variavel.tipo {
            TipoVariavel::ObjectSet => {
                let objeto = variavel.objeto.as_deref().unwrap_or("");
                // O tipo é conferido na **validação** da página. Aqui um tipo
                // desconhecido é uma lista vazia, e não um erro: a página já
                // não passa da validação, e um renderizador que também
                // recusasse teria dois lugares a dizer a mesma coisa.
                if contrato.tipo(objeto).is_none() {
                    Resolvida::Conjunto(Vec::new())
                } else {
                    match repo.listar(tenant_id, objeto, 500).await {
                        Ok(linhas) => Resolvida::Conjunto(
                            linhas.into_iter().map(|o| o.propriedades).collect(),
                        ),
                        Err(_) => Resolvida::Conjunto(Vec::new()),
                    }
                }
            }
            TipoVariavel::Agregacao => {
                let de = variavel.de.as_deref().unwrap_or("");
                match saida.iter().find(|(id, _)| id == de).map(|(_, v)| v) {
                    Some(Resolvida::Conjunto(itens)) => Resolvida::Numero(agregar(itens, variavel)),
                    // Uma agregação cuja origem não resolveu dá `NaN` — e um
                    // KPI com `NaN` é o pior resultado possível, porque
                    // mostra um número que não é número sem dizer nada.
                    _ => Resolvida::Numero(f64::NAN),
                }
            }
        };
        saida.push((variavel.id.clone(), valor));
    }

    // 🔴 As tabelas resolvem **pelo tipo**, e não por uma variável com o
    // mesmo nome: o nome da variável é livre, e procurar `quarto` entre
    // variáveis chamadas `quartos` e `total_quartos` é o tipo de casamento
    // por nome que parte no primeiro-block renomeado.
    //
    // Uma tabela que **tiver** variável com o mesmo nome do tipo usa-a; as
    // restantes carregam o tipo. E o desenho continua **puro**: quem carrega
    // é este passo, e o `desenhar` só recebe valores.
    for bloco in &pagina.blocos {
        let Bloco::Tabela { objeto, .. } = bloco else {
            continue;
        };
        if saida.iter().any(|(id, _)| id == objeto) {
            continue;
        }
        if contrato.tipo(objeto).is_none() {
            continue;
        }
        let linhas = match repo.listar(tenant_id, objeto, 500).await {
            Ok(l) => Resolvida::Conjunto(l.into_iter().map(|o| o.propriedades).collect()),
            Err(_) => Resolvida::Conjunto(Vec::new()),
        };
        saida.push((objeto.clone(), linhas));
    }

    saida
}

fn agregar(itens: &[Value], variavel: &Variavel) -> f64 {
    match variavel.op.unwrap_or(Operacao::Count) {
        Operacao::Count => itens.len() as f64,
        Operacao::Soma | Operacao::Media => {
            // A coluna vem do **id** da variável: `total_preco` soma `preco`.
            // É o que o editor mostra à pessoa, e o que ela escreve. Derivar
            // o nome da coluna com `id` riscado seria obligá-la a saber uma
            // regra que não está em lado nenhum.
            let coluna = variavel
                .id
                .rsplit_once('_')
                .map(|(_, c)| c)
                .unwrap_or(&variavel.id);
            let numeros: Vec<f64> = itens
                .iter()
                .filter_map(|i| i.get(coluna))
                .filter_map(Value::as_f64)
                .collect();
            if numeros.is_empty() {
                return f64::NAN;
            }
            let soma: f64 = numeros.iter().sum();
            if variavel.op == Some(Operacao::Media) {
                soma / numeros.len() as f64
            } else {
                soma
            }
        }
    }
}

/// Desenha a página em HTML.
pub fn desenhar(pagina: &Pagina, resolvidas: &[(String, Resolvida)]) -> String {
    let mut corpo = String::new();

    for bloco in &pagina.blocos {
        match bloco {
            Bloco::Kpi { rotulo, variavel } => {
                let valor = match valor_de(resolvidas, variavel) {
                    Some(Resolvida::Numero(n)) if n.is_finite() => numero(n),
                    // 🔴 Um `NaN` desenha "—", e não "NaN". Um KPI com
                    // "NaN" na tela é um bug que o operador reporta como
                    // "o número está errado", e a causa está duas camadas
                    // atrás.
                    Some(Resolvida::Numero(_)) => "—".to_string(),
                    _ => "—".to_string(),
                };
                corpo.push_str(&format!(
                    r#"<section class="kpi"><h2>{}</h2><p class="n">{}</p></section>"#,
                    html(rotulo.as_deref().unwrap_or(variavel)),
                    valor
                ));
            }

            Bloco::Tabela {
                rotulo,
                objeto,
                colunas,
                limite,
            } => {
                // Já vem resolvido em `resolver`, pelo tipo. Aqui só se lê.
                let linhas = match valor_de(resolvidas, objeto) {
                    Some(Resolvida::Conjunto(v)) => v,
                    _ => Vec::new(),
                };
                let cabecalho: String = colunas
                    .iter()
                    .map(|c| format!("<th>{}</th>", html(c)))
                    .collect();
                let corpo_linhas: String = linhas
                    .iter()
                    .take(*limite as usize)
                    .map(|linha| {
                        let celulas: String = colunas
                            .iter()
                            .map(|c| {
                                let v = linha.get(c).cloned().unwrap_or(Value::Null);
                                format!("<td>{}</td>", html(&texto_de(&v)))
                            })
                            .collect();
                        format!("<tr>{celulas}</tr>")
                    })
                    .collect();
                let titulo = rotulo
                    .as_deref()
                    .map(|r| format!("<h2>{}</h2>", html(r)))
                    .unwrap_or_default();
                corpo.push_str(&format!(
                    r#"<section class="tabela">{titulo}<table><thead><tr>{cabecalho}</tr></thead><tbody>{corpo_linhas}</tbody></table></section>"#
                ));
            }

            Bloco::Texto { rotulo, texto } => {
                corpo.push_str(&format!(
                    r#"<section class="texto"><h2>{}</h2><p>{}</p></section>"#,
                    html(rotulo.as_deref().unwrap_or("")),
                    html(texto)
                ));
            }
        }
    }

    format!(
        r#"<article class="pagina"><h1>{}</h1><div class="blocos">{corpo}</div></article>"#,
        html(pagina.rotulo_ou_slug())
    )
}

/// O JSON da página, para quem quiser os dados em vez do HTML.
///
/// 🔴 A mesma página em dois formatos, com **a mesma fonte**. Um `GET` que
/// devolve HTML e um `/api` que devolve os dados contados de forma separada
/// divergem no primeiro bug de arredondamento.
pub fn desenhar_json(pagina: &Pagina, resolvidas: &[(String, Resolvida)]) -> Value {
    let mut blocos = Vec::new();
    for bloco in &pagina.blocos {
        let v = match bloco {
            Bloco::Kpi { rotulo, variavel } => json!({
                "tipo": "kpi",
                "rotulo": rotulo,
                // 🔴 O JSON diz o mesmo que o HTML. Um KPI que o HTML
                // escreve "4" e o JSON escreve "4.0" são duas páginas
                // diferentes para quem consome um e para quem lê o outro, e
                // a divergência aparece no primeiro gráfico que arredonda.
                "valor": match valor_de(resolvidas, variavel) {
                    Some(Resolvida::Numero(n)) if n.is_finite() => numero_json(n),
                    _ => Value::Null,
                },
            }),
            Bloco::Tabela {
                rotulo,
                objeto,
                colunas,
                limite,
            } => {
                let linhas = match valor_de(resolvidas, objeto) {
                    Some(Resolvida::Conjunto(v)) => v,
                    _ => Vec::new(),
                };
                json!({
                    "tipo": "tabela",
                    "rotulo": rotulo,
                    "objeto": objeto,
                    "colunas": colunas,
                    "total": linhas.len(),
                    "linhas": linhas
                        .iter()
                        .take(*limite as usize)
                        .map(|l| colunas.iter().map(|c| l.get(c).cloned().unwrap_or(Value::Null)).collect::<Vec<_>>())
                        .collect::<Vec<_>>(),
                })
            }
            Bloco::Texto { rotulo, texto } => json!({
                "tipo": "texto", "rotulo": rotulo, "texto": texto,
            }),
        };
        blocos.push(v);
    }
    json!({ "slug": pagina.slug, "titulo": pagina.titulo, "blocos": blocos })
}

fn valor_de(resolvidas: &[(String, Resolvida)], id: &str) -> Option<Resolvida> {
    resolvidas
        .iter()
        .find(|(k, _)| k == id)
        .map(|(_, v)| v.clone())
}

/// O número em JSON, inteiro quando é inteiro.
fn numero_json(n: f64) -> Value {
    if n.fract() == 0.0 && n.abs() < 9.0e15 {
        json!(n as i64)
    } else {
        json!(n)
    }
}

fn numero(n: f64) -> String {
    if n.fract() == 0.0 {
        format!("{}", n as i64)
    } else {
        // Uma casa decimal é o que um operador lê sem calculadora. Duas
        // casas é o que o faz desconfiar do número.
        format!("{n:.1}")
    }
}

fn texto_de(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        outro => outro.to_string(),
    }
}

/// 🔴 Escapa o que vem do dado.
///
/// O dado é do operador e o HTML sai direto para o navegador: um rótulo com
/// `<` quebre a página, e o sintoma é "a página do cliente não abre" — a
/// quilômetros da causa.
pub fn html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
