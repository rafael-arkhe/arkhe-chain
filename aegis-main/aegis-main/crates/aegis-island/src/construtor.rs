//! O Construtor — onde uma página nasce sem Python.
//!
//! 🔴 Este é o pedaço que responde ao ponto 10 do dono: *"nunca tive o feeling
//! de pegar e construir uma página do zero; a base é sempre o seed"*. A
//! resposta não é um editor bonito: é que **montar escreve o produto**.
//!
//! ## Sem JavaScript, de propósito
//!
//! São formulários HTML que gravam e voltam. Não é falta de polimento — é que
//! o construtor tem de funcionar na máquina do técnico, que é uma máquina de
//! campo com o resto fechado, e um editor que depende de um bundle de front
//! é um editor que não abre. Quando o Construtor a sério existir na web, ele
//! escreve **o mesmo formato** e chama **o mesmo** `gravar`.
//!
//! ## A gravação é a do produto
//!
//! 🔴 O editor **não tem** caminho de escrita próprio. Ele abre o vertical
//! com [`aegis_pagina::Montagem::abrir`], mexe, e grava com
//! [`aegis_pagina::Montagem::gravar`] — a mesma função que valida antes de
//! escrever. Um editor com escrita própria é a forma mais direta de o editor e
//! o produto divergirem, e ninguém vê.
//!
//! E a falha volta **no sítio**, com o motivo, em vez de um 500: quem está a
//! montar precisa de saber o que não passou, e recarregar para ver um ecrã em
//! branco obriga a adivinhar o que mudou.

use axum::extract::{Path as AxPath, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Redirect};
use serde::Deserialize;

use aegis_pagina::{Bloco, Montagem};

use crate::estado::Ilha;
use crate::render::html;

/// O formulário de acrescentar ou de tirar um bloco.
#[derive(Debug, Default, Deserialize)]
pub struct FormBloco {
    /// `tabela` | `kpi` | `texto`
    #[serde(default)]
    pub tipo: String,
    /// O tipo de objeto, para a tabela.
    #[serde(default)]
    pub objeto: String,
    /// As colunas da tabela, separadas por vírgula.
    #[serde(default)]
    pub colunas: String,
    /// A variável do KPI.
    #[serde(default)]
    pub variavel: String,
    /// A operação da contagem: `count` | `soma` | `media`.
    #[serde(default)]
    pub op: String,
    /// O slug da página nova, no pedido de criação.
    #[serde(default)]
    pub slug: String,
    /// O texto, para o bloco de texto.
    #[serde(default)]
    pub texto: String,
    /// O índice a tirar. Ausente = acrescentar.
    #[serde(default)]
    pub remover: Option<usize>,
}

pub async fn tela(
    State(ilha): State<Ilha>,
    AxPath(slug): AxPath<String>,
) -> axum::response::Response {
    let pasta = ilha.manifesto().pasta_ref().to_path_buf();
    let montagem = match Montagem::abrir(&pasta) {
        Ok(m) => m,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Html(format!(
                    r#"<!doctype html><meta charset="utf-8"><p>{}</p>"#,
                    html(e.humano())
                )),
            )
                .into_response();
        }
    };
    let Some(pagina) = montagem.paginas.iter().find(|p| p.slug == slug) else {
        return (StatusCode::NOT_FOUND, Html(TEXTO_PAGINA_NAO_EXISTE)).into_response();
    };
    (
        StatusCode::OK,
        Html(desenhar(&ilha, &montagem, pagina, None)),
    )
        .into_response()
}

const TEXTO_PAGINA_NAO_EXISTE: &str = r#"<!doctype html><meta charset="utf-8"><p>Esta página ainda não existe.</p>
<a href="/construtor">Voltar ao construtor</a>"#;

/// A gravação.
pub async fn gravar(
    State(ilha): State<Ilha>,
    AxPath(slug): AxPath<String>,
    axum::extract::Form(form): axum::extract::Form<FormBloco>,
) -> axum::response::Response {
    let pasta = ilha.manifesto().pasta_ref().to_path_buf();
    let mut montagem = match Montagem::abrir(&pasta) {
        Ok(m) => m,
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, Html(html(e.humano()))).into_response();
        }
    };

    let Some(atual) = montagem.paginas.iter().find(|p| p.slug == slug).cloned() else {
        return (StatusCode::NOT_FOUND, Html(TEXTO_PAGINA_NAO_EXISTE)).into_response();
    };

    // Tirar um bloco.
    if let Some(indice) = form.remover {
        if !montagem.remover_bloco(&slug, indice) {
            return recusa(&ilha, &montagem, &atual, "esse bloco já não existe");
        }
        return salvar(ilha, &pasta, montagem, slug);
    }

    let objeto = form.objeto.trim().to_string();
    let variavel = form.variavel.trim().to_string();
    let texto = form.texto.trim().to_string();

    let bloco = match form.tipo.as_str() {
        "tabela" => {
            // 🔴 O valor vem como `tipo.coluna`, e a regra de "uma tabela é
            // de um tipo" mora num sítio só — [`tipo_e_colunas`], o mesmo que
            // a página nova usa.
            let (objeto, colunas) = match tipo_e_colunas(&form.colunas) {
                Ok(x) => x,
                Err(motivo) => return recusa(&ilha, &montagem, &atual, motivo),
            };
            // 🔴 A tabela declara o conjunto **se ainda não existir**. Sem
            // isto, a página tem uma tabela que o renderizador resolve pelo
            // tipo e o editor mostra um bloco que ninguém declararia do mesmo
            // modo — duas maneiras de dizer a mesma coisa.
            let ja_existe = atual.variaveis.iter().any(|v| v.id == objeto);
            if !ja_existe {
                montagem.acrescentar_conjunto(&slug, &objeto, &objeto);
            }
            Bloco::Tabela {
                rotulo: None,
                objeto,
                colunas,
                limite: 50,
            }
        }
        "kpi" => {
            if variavel.is_empty() {
                return recusa(
                    &ilha,
                    &montagem,
                    &atual,
                    "a contagem precisa de uma variável",
                );
            }
            // Uma contagem nova declara o conjunto e a agregação, porque uma
            // variável que ninguém declarou é uma variável que o `/p` resolve
            // para `NaN` — e um KPI com "—" e sem motivo.
            // O conjunto tem de existir para a contagem ter o que contar. E
            // o formulário da contagem traz o tipo: sem ele, a variável fica
            // órfã e o KPI sai "—" sem motivo.
            if !objeto.is_empty() && !atual.variaveis.iter().any(|v| v.id == objeto) {
                montagem.acrescentar_conjunto(&slug, &objeto, &objeto);
            }
            // 🔴 A operação é **escolhida**, e não adivinhada. Uma agregação
            // `count` que soma é um KPI que mente; uma `soma` que conta dá 7
            // quartos. E a coluna vem do **último pedaço** do nome da variável
            // (`total_precos` dá `precos`), que é o que o editor mostra.
            let op = match form.op.as_str() {
                "" | "count" => aegis_pagina::Operacao::Count,
                "soma" => aegis_pagina::Operacao::Soma,
                "media" => aegis_pagina::Operacao::Media,
                outro => {
                    return recusa(
                        &ilha,
                        &montagem,
                        &atual,
                        &format!("não sei contar {outro:?}"),
                    );
                }
            };
            if !atual.variaveis.iter().any(|v| v.id == variavel) {
                let de = objeto.clone();
                if !de.is_empty() {
                    montagem.acrescentar_agregacao(&slug, &variavel, &de, op);
                }
            }
            Bloco::Kpi {
                rotulo: None,
                variavel,
            }
        }
        "texto" => Bloco::Texto {
            rotulo: None,
            texto,
        },
        outro => {
            return recusa(
                &ilha,
                &montagem,
                &atual,
                &format!("não sei montar um bloco {outro:?}"),
            );
        }
    };

    montagem.acrescentar_bloco(&slug, bloco);
    salvar(ilha, &pasta, montagem, slug)
}

/// Grava, e em caso de recusa volta **ao editor com o motivo**.
///
/// 🔴 O `gravar` confere ANTES de escrever, então quando falha o disco está
/// exatamente como estava — e a montagem que volta ao ecrã é a que se tentou
/// gravar, que é o que o operador precisa de ver para corrigir.
fn salvar(
    ilha: Ilha,
    pasta: &std::path::Path,
    montagem: Montagem,
    slug: String,
) -> axum::response::Response {
    let pagina = montagem.paginas.iter().find(|p| p.slug == slug).cloned();
    match montagem.gravar(pasta) {
        Ok(()) => Redirect::to(&format!("/construtor/{slug}")).into_response(),
        Err(e) => match pagina {
            Some(p) => (
                StatusCode::OK,
                Html(desenhar(&ilha, &montagem, &p, Some(e.humano()))),
            )
                .into_response(),
            None => (StatusCode::INTERNAL_SERVER_ERROR, Html(html(e.humano()))).into_response(),
        },
    }
}

fn recusa(
    ilha: &Ilha,
    montagem: &Montagem,
    pagina: &aegis_pagina::Pagina,
    erro: &str,
) -> axum::response::Response {
    (
        StatusCode::OK,
        Html(desenhar(ilha, montagem, pagina, Some(erro))),
    )
        .into_response()
}

fn desenhar(
    ilha: &Ilha,
    montagem: &Montagem,
    pagina: &aegis_pagina::Pagina,
    erro: Option<&str>,
) -> String {
    let slug = html(&pagina.slug);

    // 🔴 As colunas oferecidas são as **que os tipos têm**, todas juntas, e
    // escolhidas em múltiplo. Um editor que deixa escrever o nome da coluna à
    // mão é um editor que produz `coluna.inexistente` e recusa a gravar — e o
    // operador vê "não gravou" sem saber porquê.
    //
    // O valor é `tipo.coluna` e o tipo sai da primeira escolhida: uma tabela é
    // de UM tipo, e escolher colunas de dois tipos é recusado com o motivo.
    // Uma gama por tipo era mais bonito e não funciona sem JavaScript.
    let colunas: String = montagem
        .tipos
        .iter()
        .flat_map(|t| {
            t.propriedades.iter().map(move |p| {
                format!(
                    "<option value=\"{}.{}\">{} · {}</option>",
                    html(&t.nome),
                    html(&p.nome),
                    html(t.rotulo_ou_nome()),
                    html(p.rotulo_ou_nome())
                )
            })
        })
        .collect();

    let existentes: String = pagina
        .blocos
        .iter()
        .enumerate()
        .map(|(i, b)| {
            let descricao = match b {
                Bloco::Kpi { variavel, .. } => format!("Contagem · {variavel}"),
                Bloco::Tabela {
                    objeto, colunas, ..
                } => {
                    format!("Tabela · {objeto} · {}", colunas.join(", "))
                }
                Bloco::Texto { texto, .. } => format!("Texto · {texto}"),
            };
            format!(
                r#"<li><b>{}</b><form method="post" action="/construtor/{slug}">
<input type="hidden" name="remover" value="{i}"><button>Tirar</button></form></li>"#,
                html(&descricao)
            )
        })
        .collect();

    let variaveis: String = pagina
        .variaveis
        .iter()
        .map(|v| {
            let detalhe = match (&v.objeto, v.op) {
                (Some(o), _) => format!("conjunto de {o}"),
                (None, Some(op)) => {
                    format!("{op:?} de {}", v.de.clone().unwrap_or_default()).to_lowercase()
                }
                (None, None) => String::new(),
            };
            format!(
                "<li>{} <span class=n>{}</span></li>",
                html(&v.id),
                html(&detalhe)
            )
        })
        .collect();

    let aviso = erro.map(|e| format!(r#"<p class="recusa">{}</p>"#, html(e)));
    let aviso = aviso.unwrap_or_default();

    format!(
        r#"<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Construtor · {titulo}</title><style>{folha}</style></head><body>
<header><h1>Construtor</h1><a href="/">Voltar</a></header>
<main>
 {aviso}
 <section><h2>{titulo}</h2>
  <p class=n>vertical {vertical} · página {slug}</p>
  <h3>Blocos montados</h3>
  <ul>{existentes}</ul>
  <h3>Variáveis</h3>
  <ul>{variaveis}</ul>
 </section>
 <section><h2>Acrescentar</h2>
  <form method="post" action="/construtor/{slug}">
   <fieldset><legend>Tabela</legend>
    <select name="colunas" multiple size="6" required>{colunas}</select>
    <input type="hidden" name="tipo" value="tabela">
    <button>Acrescentar</button>
   </fieldset>
   <fieldset><legend>Contagem</legend>
    <input name="variavel" placeholder="total_quartos" required>
    <select name="op">
      <option value="count">Quantos</option>
      <option value="soma">Somar</option>
      <option value="media">Média</option>
    </select>
    <input type="hidden" name="tipo" value="kpi">
    <button>Acrescentar</button>
   </fieldset>
   <fieldset><legend>Texto</legend>
    <input name="texto" placeholder="O que este bloco diz" required>
    <input type="hidden" name="tipo" value="texto">
    <button>Acrescentar</button>
   </fieldset>
  </form>
  <p class=n>Uma tabela mostra <b>um</b> tipo: escolhe as colunas todas desse
  tipo (Ctrl+clique para mais do que uma). Uma contagem conta um conjunto. O que
  não passar na gravação não é escrito.</p>
  <p class="aviso"><b>Este editor reescreve o <code>vertical.yaml</code>.</b>
  As explicações do produto vivem no <code>LEIA-ME.md</code> ao lado — um
  ficheiro gerado não guarda comentários, e perder a regra a cada guardado
  tornava o ficheiro pior a cada uso.</p>
 </section>
</main></body></html>"#,
        titulo = html(pagina.rotulo_ou_slug()),
        vertical = html(ilha.contrato().id().as_str()),
        folha = crate::api::FOLHA_DE_ESTILO,
        aviso = aviso,
        existentes = existentes,
        variaveis = variaveis,
        colunas = colunas,
    )
}

// ---------------------------------------------------------------------------
// O índice e a página nova — o "do zero" do dono
// ---------------------------------------------------------------------------

/// O índice do construtor: as páginas do vertical, e o caminho para criar uma.
///
/// 🔴 Sem esta rota, o aviso de "página não existe" apontava para um
/// `/construtor` que não existia — um link quebrado dentro do produto, do tipo
/// que a casa já mediu como *"a página existe no menu e não abre"*, com a
/// causa a três cliques de distância.
pub async fn indice(State(ilha): State<Ilha>) -> axum::response::Response {
    let pasta = ilha.manifesto().pasta_ref().to_path_buf();
    let montagem = match Montagem::abrir(&pasta) {
        Ok(m) => m,
        Err(e) => {
            return erro_simples(e.humano());
        }
    };

    let linhas: String = montagem
        .paginas
        .iter()
        .map(|p| {
            let slug = html(&p.slug);
            format!(
                r#"<li><a href="/construtor/{slug}"><b>{}</b></a>
<span class=n>{slug} &middot; {} bloco(s)</span></li>"#,
                html(p.rotulo_ou_slug()),
                p.blocos.len()
            )
        })
        .collect();

    // As colunas que uma página nova pode mostrar, de **todos** os tipos.
    let colunas = colunas_de_todos(&montagem);

    let corpo = format!(
        r#"<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Construtor</title><style>{folha}</style></head><body>
<header><h1>Construtor</h1><a href="/">Voltar</a></header>
<main>
 <section><h2>Páginas</h2>
  <ul>{linhas}</ul>
  <p class=n>Cada página é um ficheiro. Acrescentar uma escreve o ficheiro
  <em>e</em> regenera o <code>vertical.yaml</code>.</p>
 </section>
 <section><h2>Página nova</h2>
  <form method="post" action="/construtor/nova">
   <fieldset><legend>Do zero</legend>
    <input name="slug" placeholder="reservas-do-dia" required>
    <select name="colunas" multiple size="5" required>{colunas}</select>
    <button>Criar a página</button>
   </fieldset>
  </form>
  <p class=aviso>O slug fica no URL e no ficheiro: minúsculas, números e
  hífen. Uma tabela mostra <b>um</b> tipo — as colunas escolhidas têm de ser
  todas desse tipo.</p>
 </section>
</main></body></html>"#,
        folha = crate::api::FOLHA_DE_ESTILO,
        linhas = linhas,
        colunas = colunas,
    );
    (StatusCode::OK, Html(corpo)).into_response()
}

/// 🔴 **Criar uma página do zero** — o caminho que o dono nunca viu fechado.
///
/// Abre o vertical, acrescenta o primeiro bloco à página nova, e grava pela
/// **mesma** [`Montagem::gravar`]. Não há caminho de escrita paralelo, e por
/// isso não há como o editor e o produto divergirem.
pub async fn nova(
    State(ilha): State<Ilha>,
    axum::extract::Form(form): axum::extract::Form<FormBloco>,
) -> axum::response::Response {
    let pasta = ilha.manifesto().pasta_ref().to_path_buf();
    let mut montagem = match Montagem::abrir(&pasta) {
        Ok(m) => m,
        Err(e) => return erro_simples(e.humano()),
    };

    let slug = form.slug.trim().to_string();
    if aegis_vertical::VerticalId::novo(&slug).is_err() {
        return erro_simples("O slug da página tem de ser minúsculas, números e hífen.");
    }
    if montagem.paginas.iter().any(|p| p.slug == slug) {
        return erro_simples("Já existe uma página com esse slug.");
    }

    let (objeto, colunas) = match tipo_e_colunas(&form.colunas) {
        Ok(x) => x,
        Err(motivo) => return erro_simples(motivo),
    };

    montagem.acrescentar_conjunto(&slug, &objeto, &objeto);
    montagem.acrescentar_bloco(
        &slug,
        Bloco::Tabela {
            rotulo: None,
            objeto,
            colunas,
            limite: 50,
        },
    );

    match montagem.gravar(&pasta) {
        Ok(()) => Redirect::to(&format!("/construtor/{slug}")).into_response(),
        Err(e) => erro_simples(e.humano()),
    }
}

/// As colunas de um `<select multiple>`, com o valor `tipo.coluna`.
///
/// 🔴 Uma tabela é de **um** tipo. Escolher colunas de dois tipos daria um
/// bloco que não valida — e o motivo é dito aqui, e não pelo validador três
/// camadas depois, que é onde a casa já mediu o sintoma aparecer.
fn tipo_e_colunas(escolhidas: &str) -> Result<(String, Vec<String>), &'static str> {
    let bruto: Vec<&str> = escolhidas
        .split(',')
        .map(str::trim)
        .filter(|c| !c.is_empty())
        .collect();
    if bruto.is_empty() {
        return Err("a tabela precisa de pelo menos uma coluna");
    }
    let tipos: Vec<&str> = bruto
        .iter()
        .filter_map(|c| c.split_once('.').map(|(t, _)| t))
        .collect();
    if tipos.len() != bruto.len() {
        return Err("uma coluna escolhida não tem tipo");
    }
    let objeto = tipos[0].to_string();
    if tipos.iter().any(|t| *t != objeto) {
        return Err("uma tabela mostra um tipo só — as colunas são de tipos diferentes");
    }
    let colunas = bruto
        .iter()
        .filter_map(|c| c.split_once('.').map(|(_, p)| p.to_string()))
        .collect();
    Ok((objeto, colunas))
}

/// Todas as colunas de todos os tipos, para os dois formulários.
fn colunas_de_todos(montagem: &Montagem) -> String {
    montagem
        .tipos
        .iter()
        .flat_map(|t| {
            t.propriedades.iter().map(move |p| {
                format!(
                    "<option value=\"{}.{}\">{} &middot; {}</option>",
                    html(&t.nome),
                    html(&p.nome),
                    html(t.rotulo_ou_nome()),
                    html(p.rotulo_ou_nome())
                )
            })
        })
        .collect()
}

fn erro_simples(texto: &str) -> axum::response::Response {
    (
        StatusCode::OK,
        Html(format!(
            r#"<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Construtor</title><style>{folha}</style></head><body>
<header><h1>Construtor</h1><a href="/construtor">Voltar</a></header>
<main><section><p class=recusa>{texto}</p></section></main></body></html>"#,
            folha = crate::api::FOLHA_DE_ESTILO,
            texto = html(texto)
        )),
    )
        .into_response()
}
