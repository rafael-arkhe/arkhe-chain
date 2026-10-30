//! As rotas da ilha.
//!
//! 🔴 **Nenhuma delas escreve SQL.** Todas passam pelo [`aegis_store::Repo`].
//! É esta a costura que o núcleo anterior não tinha: aqui um router que
//! precisasse de uma consulta nova não teria onde pôr a mão, teria de pedir um
//! método no repositório — e a leitura da política RLS, do hash e da
//! cardinalidade fica num lugar só.

use axum::extract::{Path as AxPath, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::estado::Ilha;
use crate::saude::{Prontidao, Vida, medir};

/// As rotas da ilha, já com o estado.
///
/// O estado entra **por construção**, e não por um `Arc` lido de dentro dos
/// handlers: não há rota capaz de falar com um repo diferente do que a ilha
/// abriu, porque não existe caminho para saber qual é.
pub fn rotas(ilha: Ilha) -> Router {
    Router::new()
        .route("/health", get(vida))
        .route("/health/ready", get(prontidao))
        .route("/api/v1/vertical", get(vertical))
        .route("/api/v1/ontologia/tipos", get(tipos))
        .route(
            "/api/v1/ontologia/objetos/{tipo}",
            get(instancias).post(gravar),
        )
        .route("/", get(painel))
        .route("/p/{slug}", get(pagina_html))
        .route("/api/v1/paginas/{slug}", get(pagina_json))
        .route("/construtor", get(crate::construtor::indice))
        .route("/construtor/nova", post(crate::construtor::nova))
        .route(
            "/construtor/{slug}",
            get(crate::construtor::tela).post(crate::construtor::gravar),
        )
        .with_state(ilha)
}

/// Carrega a página **do manifesto** — o ficheiro que a montagem gravou.
///
/// 🔴 A página não é inventionada pela ilha: ela é lida de
/// `paginas/<slug>.json`, que é o mesmo ficheiro que o Construtor escreve. É
/// por isso que a tela e o editor não podem divergir — não há duas fontes.
async fn carregar_pagina(ilha: &Ilha, slug: &str) -> Option<aegis_pagina::Pagina> {
    // 🔴 Do **disco**, e não do manifesto que a ilha carregou no arranque. É
    // a diferença entre "guardei e a tela muda" e "guardei e tenho de
    // reiniciar a ilha" — e a segunda é a que faz um construtor parecer
    // estar partido.
    let caminho = ilha
        .contrato_do_disco()
        .ok()?
        .manifesto()
        .caminho_de_pagina(slug)?;
    let texto = tokio::fs::read_to_string(caminho).await.ok()?;
    let valor: Value = serde_json::from_str(&texto).ok()?;
    aegis_pagina::Pagina::de_json(&valor).ok()
}

async fn pagina_html(State(ilha): State<Ilha>, AxPath(slug): AxPath<String>) -> impl IntoResponse {
    match pagina_comum(&ilha, &slug).await {
        Ok(p) => (
            StatusCode::OK,
            [(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")],
            p.html(),
        )
            .into_response(),
        Err(r) => r.into_response(),
    }
}

async fn pagina_json(
    State(ilha): State<Ilha>,
    AxPath(slug): AxPath<String>,
) -> Result<Json<Value>, ErroHttp> {
    let p = pagina_comum(&ilha, &slug)
        .await
        .map_err(ErroHttp::de_render)?;
    Ok(Json(crate::render::desenhar_json(&p.pagina, &p.resolvidas)))
}

/// O que uma página resolve: o HTML, o JSON e o que foi usado para os desenhar.
struct PaginaPronta {
    pagina: aegis_pagina::Pagina,
    resolvidas: Vec<(String, crate::render::Resolvida)>,
}

impl PaginaPronta {
    fn html(&self) -> String {
        format!(
            r#"<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{titulo}</title><style>{folha}</style></head><body>{corpo}</body></html>"#,
            titulo = crate::render::html(self.pagina.rotulo_ou_slug()),
            folha = FOLHA_DE_ESTILO,
            corpo = crate::render::desenhar(&self.pagina, &self.resolvidas),
        )
    }
}

async fn pagina_comum(ilha: &Ilha, slug: &str) -> Result<PaginaPronta, ErroRender> {
    let pagina = carregar_pagina(ilha, slug)
        .await
        .ok_or_else(|| ErroRender::Pagina {
            slug: slug.to_string(),
        })?;
    // 🔴 A página é validada **contra o contrato** antes de desenhar. Uma
    // página que aponta para um tipo que o vertical não declara desenha uma
    // tela vazia — e uma tela vazia sem erro é o sintoma que o dono descreve
    // como "o construtor não faz nada".
    // 🔴 O contrato vem do **disco**, não do que a ilha carregou no arranque:
    // quem acabou de gravar pelo Construtor é o mesmo processo, e servir o
    // contrato velho é mostrar uma página a menos sem dizer porquê.
    let contrato = ilha.contrato_do_disco().map_err(|e| ErroRender::Contrato {
        slug: slug.to_string(),
        codigo: e.codigo(),
        frase: "o vertical não carrega do disco",
    })?;
    pagina
        .validar(contrato.manifesto())
        .map_err(|e| ErroRender::Contrato {
            slug: slug.to_string(),
            codigo: e.codigo(),
            frase: e.humano(),
        })?;

    let tenant = ilha
        .tenant_padrao()
        .await
        .ok()
        .flatten()
        .ok_or_else(|| ErroRender::Pagina {
            slug: slug.to_string(),
        })?;

    let resolvidas = crate::render::resolver(&pagina, &contrato, ilha.repo(), &tenant.id).await;
    Ok(PaginaPronta { pagina, resolvidas })
}

async fn vida() -> Json<Vida> {
    Json(Vida { vivo: true })
}

/// 🔴 O gate oficial. Devolve **503** quando não está pronto — e quem decide
/// o que é "pronto" é [`medir`], que exige banco **e** tenant ativo **e**
/// seed na versão. O `/health` acima responde `200` sempre.
async fn prontidao(State(ilha): State<Ilha>) -> impl IntoResponse {
    let p: Prontidao = medir(&ilha).await;
    let status = if p.pronto {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (status, Json(p))
}

async fn vertical(State(ilha): State<Ilha>) -> Json<Value> {
    let m = ilha.manifesto();
    Json(json!({
        "id": m.id.as_str(),
        "versao": m.versao,
        "titulo": m.titulo,
        "licenca": { "exige": m.licenca.exige, "node_locked": m.licenca.node_locked },
        "paginas": m.paginas.iter().map(|p| json!({
            "slug": p.slug,
            "rotulo": p.rotulo,
            "ficheiro": p.ficheiro,
        })).collect::<Vec<_>>(),
        "menu": {
            "home": m.menu.home,
            "busca_placeholder": m.menu.busca_placeholder,
        },
        "saude": {
            "exigido": m.saude.exigido,
            "opcional": m.saude.opcional,
        },
    }))
}

/// O catálogo de tipos: **declarados ∪ instanciados**.
///
/// 🔴 Um tipo com **zero** instâncias tem de aparecer. O oposto disso foi
/// medido: a bancada de homologação mostrou o dropdown de "tipo alvo" com
/// 191 tipos reais, e o operador viu o menu incompleto — porque o catálogo
/// vinha só do banco e ignorava o contrato.
async fn tipos(State(ilha): State<Ilha>) -> Json<Value> {
    let tenant = match ilha.tenant_padrao().await.unwrap_or(None) {
        Some(t) => t,
        None => return Json(json!({ "tipos": [] })),
    };
    let contagens = ilha
        .repo()
        .tipos_com_conta(&tenant.id)
        .await
        .unwrap_or_default();
    let por_tipo: std::collections::BTreeMap<&str, i64> =
        contagens.iter().map(|(t, n)| (t.as_str(), *n)).collect();

    let declarados: Vec<Value> = ilha
        .contrato()
        .tipos()
        .map(|t| {
            json!({
                "nome": t.nome,
                "rotulo": t.rotulo_ou_nome(),
                "propriedade_titulo": t.propriedade_titulo,
                "reforco": t.reforco,
                "propriedades": t.propriedades.iter().map(|p| json!({
                    "nome": p.nome,
                    "rotulo": p.rotulo_ou_nome(),
                    "tipo": p.tipo,
                })).collect::<Vec<_>>(),
                "instancias": por_tipo.get(t.nome.as_str()).copied().unwrap_or(0),
            })
        })
        .collect();

    let links: Vec<Value> = ilha
        .contrato()
        .links()
        .map(|l| {
            json!({
                "nome": l.nome,
                "rotulo": l.rotulo_ou_nome(),
                "de": l.de,
                "para": l.para,
                "cardinalidade": l.cardinalidade,
            })
        })
        .collect();

    let acoes: Vec<Value> = ilha
        .contrato()
        .acoes()
        .map(|a| {
            json!({
                "nome": a.nome,
                "rotulo": a.rotulo_ou_nome(),
                "alvo": a.alvo,
                "verbo": a.regra.verbo(),
            })
        })
        .collect();

    Json(json!({ "tipos": declarados, "links": links, "acoes": acoes }))
}

async fn instancias(
    State(ilha): State<Ilha>,
    AxPath(tipo): AxPath<String>,
) -> Result<Json<Value>, ErroHttp> {
    let Some(tenant) = ilha.tenant_padrao().await.unwrap_or(None) else {
        return Err(ErroHttp::store(
            &aegis_store::ErroStore::TenantInexistente {
                slug: ilha.slug_do_tenant().to_string(),
            },
        ));
    };
    // 🔴 Tipo que o vertical não declara é RECUSA, não lista vazia. A lista
    // vazia é o sintoma "o LPR leu e a tela não mudou": a leitura grava num
    // `node_type` que ninguém conhece, e a tela devolve `[]` sem dizer porquê.
    if ilha.contrato().tipo(&tipo).is_none() {
        return Err(ErroHttp::store(&aegis_store::ErroStore::TipoDesconhecido {
            tipo: tipo.clone(),
        }));
    }
    let linhas = ilha
        .repo()
        .listar(&tenant.id, &tipo, 200)
        .await
        .map_err(|e| ErroHttp::store(&e))?;
    let total = ilha.repo().contar(&tenant.id, &tipo).await.unwrap_or(0);
    Ok(Json(
        json!({ "tipo": tipo, "total": total, "objetos": linhas }),
    ))
}

#[derive(Deserialize)]
struct CorpoGravar {
    /// A identidade canônica. `null` = instância sem chave própria.
    #[serde(default)]
    chave: Option<String>,
    #[serde(default)]
    propriedades: Value,
}

async fn gravar(
    State(ilha): State<Ilha>,
    AxPath(tipo): AxPath<String>,
    Json(corpo): Json<CorpoGravar>,
) -> Result<(StatusCode, Json<Value>), ErroHttp> {
    let Some(tenant) = ilha.tenant_padrao().await.unwrap_or(None) else {
        return Err(ErroHttp::store(
            &aegis_store::ErroStore::TenantInexistente {
                slug: ilha.slug_do_tenant().to_string(),
            },
        ));
    };
    let objeto = ilha
        .repo()
        .gravar(
            ilha.contrato(),
            &tenant.id,
            &tipo,
            corpo.chave.as_deref(),
            &corpo.propriedades,
        )
        .await
        .map_err(|e| ErroHttp::store(&e))?;
    Ok((StatusCode::CREATED, Json(json!(objeto))))
}

// ---------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------

/// A tela do tijolo 1.
///
/// Não é o Workshop e **não finge ser**: é a prova de que o vertical chega ao
/// operador com os seus dados. O Construtor que escreve a página é o tijolo 3
/// — e quando existir, ele escreve o mesmo JSON, sem que esta rota mude de
/// forma.
async fn painel(State(ilha): State<Ilha>) -> Html<String> {
    let m = ilha.manifesto();
    let titulo = html(&m.titulo.clone().unwrap_or_else(|| m.id.as_str().into()));
    let pronto = medir(&ilha).await;
    let tenant = ilha.tenant_padrao().await.unwrap_or(None);

    let primeiro_slug = m.paginas.first().map(|p| html(&p.slug)).unwrap_or_default();

    let estado = if pronto.pronto {
        "<span class=ok>pronta</span>".to_string()
    } else {
        format!(
            "<span class=nao>{}</span>",
            html(
                &pronto
                    .o_que_dizer
                    .clone()
                    .unwrap_or_else(|| "não pronta".into())
            )
        )
    };

    // 🔴 Cada página é um **endereço**, não um rótulo. A casa já mediu o
    // sintoma de uma página que existe no menu e não abre: é o item que
    // aponta para um slug que ninguém written. Aqui o link é o mesmo slug que
    // o manifesto declara e que o `carregar` valida.
    let paginas = m
        .paginas
        .iter()
        .map(|p| {
            let slug = html(&p.slug);
            format!(
                r#"<li><a href="/p/{slug}"><b>{}</b></a><span class=n>{slug}</span></li>"#,
                html(p.rotulo.as_deref().unwrap_or(p.slug.as_str())),
            )
        })
        .collect::<Vec<_>>()
        .join("");

    // Cada tipo com as suas primeiras instâncias. É a prova de que o catálogo
    // do vertical **chegou ao banco e é legível** — que é o que o tijolo 1
    // tem de mostrar.
    let mut blocos = String::new();
    for tipo in ilha.contrato().tipos() {
        let linhas = match &tenant {
            Some(t) => ilha
                .repo()
                .listar(&t.id, &tipo.nome, 5)
                .await
                .unwrap_or_default(),
            None => Vec::new(),
        };
        let corpo = if linhas.is_empty() {
            "<li class=vazio>nenhuma instância</li>".to_string()
        } else {
            linhas
                .iter()
                .map(|o| {
                    let titulo_inst = o
                        .propriedades
                        .get(&tipo.propriedade_titulo)
                        .and_then(|v| v.as_str())
                        .map(html)
                        .unwrap_or_else(|| o.id.chars().take(8).collect());
                    let chave = o
                        .chave_canonica
                        .as_deref()
                        .map(|c| format!("<span class=n>{}</span>", html(c)))
                        .unwrap_or_default();
                    format!("<li><b>{titulo_inst}</b>{chave}</li>")
                })
                .collect()
        };
        blocos.push_str(&format!(
            "<section><h2>{} <span class=n>{} · {} inst.</span></h2><ul>{corpo}</ul></section>",
            html(tipo.rotulo_ou_nome()),
            html(&tipo.nome),
            linhas.len()
        ));
    }

    Html(format!(
        r#"<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{titulo}</title>
<style>
 body{{font:15px/1.5 system-ui,-apple-system,sans-serif;margin:0;background:#f6f7f9;color:#111}}
 header{{background:#16202b;color:#fff;padding:14px 24px;display:flex;justify-content:space-between;align-items:baseline;gap:16px}}
 h1{{font-size:18px;margin:0;font-weight:600}}
 main{{max-width:960px;margin:24px auto;padding:0 20px;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}}
 section{{background:#fff;border:1px solid #d9dde3;padding:16px}}
 h2{{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#5a6472;margin:0 0 10px;display:flex;justify-content:space-between}}
 ul{{list-style:none;margin:0;padding:0}}
 li{{padding:6px 0;border-bottom:1px solid #eef0f3;display:flex;justify-content:space-between;gap:10px}}
 li:last-child{{border-bottom:0}} .vazio{{color:#9aa3af;font-style:italic}}
 .n{{font:12px ui-monospace,Consolas,monospace;color:#7a8494}}
 .ok{{color:#4ade80}} .nao{{color:#fb923c}}
</style></head><body>
<header><h1>{titulo}</h1><span>ilha &middot; {estado}</span></header>
<main><section><h2>Páginas</h2><ul>{paginas}</ul>
  <p class="n">O <a href="/construtor/{primeiro_slug}">construtor</a> reescreve
  o <code>vertical.yaml</code> a partir do que for montado aqui.</p>
 </section>{blocos}</main>
</body></html>"#
    ))
}

/// Escapa o texto que vem do manifesto.
///
/// 🔴 O `vertical.yaml` é escrito por um técnico e o HTML sai direto para o
/// navegador. Sem escape, um rótulo com `<` quebra a tela — e o sintoma é
/// "a página do cliente não abre", a kilometers da causa.
fn html(texto: &str) -> String {
    texto
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

// ---------------------------------------------------------------------------
// Erro → HTTP
// ---------------------------------------------------------------------------

/// 🔴 A resposta de erro carrega **código fechado**, frase e **gesto**. A tela
/// traduz pelo código; a frase é para o log e para quem lê a resposta crua.
/// Casar texto dentro da resposta quebraria no dia em que a frase fosse
/// reescrita.
///
/// 🔴 E o `gesto` entrou com a quarta face. Sem ele, quem lia isto por HTTP —
/// que era a CLI e mais nada — tinha a causa e nenhuma acção; a partir do
/// `aegis mcp` deixou de ser verdade, porque um modelo que recebe uma recusa
/// sem gesto inventa o que fazer a seguir. A regra dos três elementos vale
/// para o fio como vale para a janela.
pub struct ErroHttp {
    status: StatusCode,
    corpo: Value,
}

impl ErroHttp {
    pub fn store(e: &aegis_store::ErroStore) -> Self {
        use aegis_store::ErroStore;
        let status = match e {
            ErroStore::TenantInexistente { .. } | ErroStore::TipoDesconhecido { .. } => {
                StatusCode::NOT_FOUND
            }
            ErroStore::ChaveDuplicada { .. }
            | ErroStore::Contrato(_)
            | ErroStore::Cardinalidade(_) => StatusCode::CONFLICT,
            ErroStore::ObjetoInvisivel { .. } => StatusCode::NOT_FOUND,
            ErroStore::Ligacao { .. } | ErroStore::Banco(_) => StatusCode::SERVICE_UNAVAILABLE,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        Self {
            status,
            corpo: json!({
                "codigo": e.codigo(),
                "mensagem": e.humano(),
                "gesto": e.gesto(),
            }),
        }
    }
}

impl IntoResponse for ErroHttp {
    fn into_response(self) -> axum::response::Response {
        (self.status, Json(self.corpo)).into_response()
    }
}

// ---------------------------------------------------------------------------
// Erro de render
// ---------------------------------------------------------------------------

/// Falha ao desenhar uma página. 🔴 Tem **código** como as outras: uma tela que
/// não abre é o sintoma que o operador reporta, e a diferença entre "a página
/// não existe" e "a página aponta para um tipo que o produto não tem" pede
/// gestos diferentes.
#[derive(Debug, Clone, PartialEq)]
pub enum ErroRender {
    Pagina {
        slug: String,
    },
    Contrato {
        slug: String,
        codigo: &'static str,
        frase: &'static str,
    },
}

impl ErroRender {
    pub fn codigo(&self) -> &'static str {
        match self {
            Self::Pagina { .. } => "pagina.inexistente",
            Self::Contrato { codigo, .. } => codigo,
        }
    }

    pub fn humano(&self) -> &'static str {
        match self {
            Self::Pagina { .. } => "Esta página não existe neste produto.",
            Self::Contrato { frase, .. } => frase,
        }
    }

    /// 🔴 O que a pessoa pode fazer — e que faltava, como no `ErroStore`.
    /// A face agêntica lê isto por HTTP, e um recusa sem gesto é uma recusa
    /// que obriga o modelo a inventar a resposta.
    pub fn gesto(&self) -> &'static str {
        match self {
            Self::Pagina { .. } => "Ver as páginas deste produto: aegis vertical ver <pasta>",
            Self::Contrato { .. } => "O tipo que a página usa não bate com o manifesto",
        }
    }
}

impl IntoResponse for ErroRender {
    fn into_response(self) -> axum::response::Response {
        ErroHttp::de_render(self).into_response()
    }
}

impl ErroHttp {
    pub fn de_render(e: ErroRender) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            corpo: serde_json::json!({
                "codigo": e.codigo(),
                "mensagem": e.humano(),
                "gesto": e.gesto(),
            }),
        }
    }
}

/// A folha de estilo da ilha.
///
/// 🔴 Sem arredondamento e sem cor decorativa: o `DESIGN.md` da casa proíbe
/// `rounded-*` e `Sparkles`, e a regra vale tanto para o `security-app` como
/// para o que a ilha desenha sozinha.
pub const FOLHA_DE_ESTILO: &str = r#"
*{box-sizing:border-box}
body{margin:0;background:#f6f7f9;color:#111;
  font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header{background:#16202b;color:#fff;padding:14px 24px;display:flex;
  justify-content:space-between;align-items:baseline;gap:16px}
h1{font-size:18px;margin:0;font-weight:600}
main{max-width:960px;margin:24px auto;padding:0 20px;display:grid;gap:16px;
  grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.pagina .blocos{display:grid;gap:16px;
  grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
section{background:#fff;border:1px solid #d9dde3;padding:16px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#5a6472;
  margin:0 0 10px}
.kpi p.n{font:32px/1.2 ui-monospace,Consolas,monospace;margin:0;color:#2D77BE}
ul{list-style:none;margin:0;padding:0}
li{padding:6px 0;border-bottom:1px solid #eef0f3;display:flex;justify-content:space-between}
li:last-child{border-bottom:0}.vazio{color:#9aa3af;font-style:italic}
table{width:100%;border-collapse:collapse;font:14px/1.4 ui-monospace,Consolas,monospace}
th{text-align:left;font:12px system-ui;color:#5a6472;border-bottom:1px solid #d9dde3;padding:6px 8px}
td{padding:6px 8px;border-bottom:1px solid #eef0f3}
.n{font:12px ui-monospace,Consolas,monospace;color:#7a8494}
.ok{color:#4ade80}.nao{color:#fb923c}
a{color:#2D77BE}
"#;
