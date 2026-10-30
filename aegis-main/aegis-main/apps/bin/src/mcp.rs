//! **aegis mcp** — a face agêntica do mesmo produto.
//!
//! 🔴 Esta peça é uma **casca**, e a casca não decide nada. Cada ferramenta
//! chama a biblioteca e devolve o [`Resultado`] **dela** — o mesmo `codigo`,
//! a mesma frase e o mesmo gesto que a linha de comandos imprime e que a
//! janela mostra. A prova de que é a mesma coisa é
//! `apps/bin/tests/quatro_faces.rs`; a regra que a obriga é a invariante 7
//! do `aegis/CLAUDE.md`.
//!
//! ## Por que uma face e não uma ferramenta
//!
//! O motor (opencode) fala MCP. O produto fala `Resultado`. Esta peça é a
//! **única** tradução entre os dois, e é por isso que não pode ter uma segunda
//! versão: um `codigo` reescrito aqui seria um `codigo` que diverge.
//!
//! ## O stdout é o canal
//!
//! 🔴 JSON-RPC em stdio **não tolera uma linha a mais**. Um único `println!`,
//! ou um `tracing` a escrever para o stdout, parte o protocolo de uma maneira
//! que parece um defeito do cliente. Por isso o subscriber de `tracing` é
//! apontado para o stderr no `main`, e aqui não se imprime nada fora de
//! [`escrever`].
//!
//! ## O portão
//!
//! Sem licença, o processo **não arranca**. É [`aegis_produto::portao`], a
//! mesma função que `instalar` chama — e é aqui que ela importa mais, porque
//! aqui está a mão.

use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;

use aegis_produto::Resultado;
use serde::Serialize;
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

/// A versão do protocolo que este servidor fala.
pub const PROTOCOLO: &str = "2025-06-18";

/// O nome que o cliente vê. 🔴 É "aegis": o operador nunca vê o nome de uma
/// terceira parte, e a regra do `CLAUDE.md` é exactamente essa.
const NOME: &str = "aegis";

/// O que as ferramentas sabem, e que **não muda** entre chamadas.
pub struct Contexto {
    /// A pasta do vertical deste servidor. Um servidor, **um** produto: a
    /// licença que o agente tem é a deste vertical, e é por isso que ele
    /// precisa de saber qual é.
    pub pasta: PathBuf,
    /// O que o manifesto diz em `licenca.exige`, já lido no arranque.
    ///
    /// 🔴 E **não** o `id`. Os dois são iguais nos verticais de hoje e isso é
    /// coincidência, não regra: um vertical pode ter `id: portao` e
    /// `licenca.exige: portao-acesso`, e seedar pelo `id` seria pedir uma
    /// licença errada numa máquina certa.
    pub exige: String,
    pub licenca: Option<PathBuf>,
    pub chave_oem: Option<PathBuf>,
    pub machine_id: String,
}

/// O que uma ferramenta devolve.
///
/// 🔴 São **dois** vocabulários, e a confusão entre eles é o defeito mais
/// provável desta peça. O produto recusa com `codigo`/`frase`/`gesto` e isso
/// vai no **conteúdo** da chamada, com `isError`. O cliente chamar mal é um
/// erro de **protocolo**, e esse tem os números do JSON-RPC. Uma recusa do
/// produto devolvida como erro de protocolo perde o gesto — que é a única
/// parte que diz à pessoa o que fazer a seguir.
enum Falha {
    /// O **produto** recusou ou falhou.
    Resultado(Resultado<Value>),
    /// O **cliente** chamou mal.
    Chamada(i32, String),
}

type Saida = Result<Value, Falha>;
type Executar = for<'a> fn(&'a Contexto, Value) -> Pin<Box<dyn Future<Output = Saida> + Send + 'a>>;

/// Declara uma ferramenta como a tabela precisa dela: um ponteiro de função
/// que devolve o futuro **caixado**.
///
/// 🔴 A tabela é uma `const`, e um `async fn` é um `fn` que devolve um tipo
/// de futuro anónimo — que não é um ponteiro de função. Sem a caixagem, a
/// lista de ferramentas não podia ser `const` e passava a ser construída em
/// cada `tools/list`, que é o caminho para a lista e o despacho deixarem de
/// ser a mesma coisa.
macro_rules! ferramenta {
    ($nome:ident, $ctx:ident, $a:ident, $corpo:block) => {
        fn $nome($ctx: &Contexto, $a: Value) -> Pin<Box<dyn Future<Output = Saida> + Send + '_>> {
            Box::pin(async move { $corpo })
        }
    };
}

/// Uma ferramenta da lista **fechada**.
///
/// 🔴 O nome, a descrição, o esquema e o que ela executam vivem **no mesmo
/// sítio**. A primeira versão tinha um `catalogo()` e um `match` separados, e
/// eram duas listas — a casa mediu que duas listas divergem, e um
/// `tools/list` que anuncia uma coisa e faz outra é o tipo de defeito que o
/// cliente só descobre em produção.
struct Ferramenta {
    nome: &'static str,
    descricao: &'static str,
    esquema: fn() -> Value,
    executar: Executar,
}

const FERRAMENTAS: &[Ferramenta] = &[
    Ferramenta {
        nome: "vertical_manifesto",
        descricao: "O manifesto do vertical deste servidor: tipos, paginas, marca e licenca exigida.",
        esquema: sem_campos,
        executar: vertical_manifesto,
    },
    Ferramenta {
        nome: "camera_listar",
        descricao: "As cameras desta maquina, com os enderecos que o go2rtc serve.",
        esquema: com_pasta,
        executar: camera_listar,
    },
    Ferramenta {
        nome: "camera_adicionar",
        descricao: "Acrescenta uma camera, ou muda o endereco de uma que ja existe.",
        esquema: nome_e_endereco,
        executar: camera_adicionar,
    },
    Ferramenta {
        nome: "camera_remover",
        descricao: "Tira uma camera pelo nome.",
        esquema: nome_necessario,
        executar: camera_remover,
    },
    Ferramenta {
        nome: "licenca_fingerprint",
        descricao: "O fingerprint desta maquina, no formato que o emissor de licencas usa.",
        esquema: sem_campos,
        executar: licenca_fingerprint,
    },
    Ferramenta {
        nome: "licenca_conferir",
        descricao: "Confere a licenca deste vertical, sem instalar nada.",
        esquema: com_licencas,
        executar: licenca_conferir,
    },
    // 🔴 As da ilha. A **ilha** é a que responde por fio, e é por isso que
    // foi ela que denunciou a falta do gesto na resposta de erro (D3): quem lê
    // JSON não tem o terminal à frente para saber o que fazer a seguir.
    Ferramenta {
        nome: "ilha_vertical",
        descricao: "O manifesto da ilha que esta maquina fala, com os seus tipos e paginas.",
        esquema: sem_campos,
        executar: ilha_vertical,
    },
    Ferramenta {
        nome: "ilha_tipos",
        descricao: "Os tipos declarados e instanciados na ilha.",
        esquema: sem_campos,
        executar: ilha_tipos,
    },
    Ferramenta {
        nome: "ilha_pagina",
        descricao: "Uma pagina da ilha, ja desenhada com os dados resolvidos.",
        esquema: com_slug,
        executar: ilha_pagina,
    },
    Ferramenta {
        nome: "ilha_saude",
        descricao: "A saude da ilha e o que ela mediu de facto. Sai com recusa se nao estiver pronta.",
        esquema: sem_campos,
        executar: ilha_saude,
    },
    // 🔴 `diagnostico` é a quinta e a última da primeira leva. Está DEPOIS de
    // `ilha_saude` e não ao lado, e a ordem diz uma coisa: `ilha_saude` **recusa**
    // quando a ilha não está pronta (o pedido era legítimo, é o estado que não o
    // permite), e `diagnostico` é a ferramenta que existe **para** essa situação.
    // Uma conferência que só pode ser chamada quando não há problema não é uma
    // conferência.
    Ferramenta {
        nome: "diagnostico",
        descricao: "A conferencia desta maquina e da ilha: uma linha por item, com o que \
                    foi medido e o conserto quando houver. Nao recusa por a ilha \
                    estar por verificar — e diz por que.",
        esquema: sem_campos,
        executar: diagnostico,
    },
    // 🔴 A última da lista, e a **primeira que escreve**. Está no fim porque a
    // ordem é a do que o agente pode fazer: ler, medir, e só depois mudar
    // alguma coisa.
    //
    // 🔴 E é a única que **não** aceita uma pasta: escreve no vertical do
    // **contexto**, o deste servidor. Um agente a quem se dá um caminho escreve
    // onde lhe disseram — e a licença que ele tem é a deste produto, não a
    // daquele.
    Ferramenta {
        nome: "construtor.pagina_gravar",
        descricao: "Grava uma pagina do produto e regera o manifesto. Substitui a pagina \
                    do mesmo slug, ou acrescenta uma nova. Nao ha caminho: vai para o \
                    vertical deste servidor.",
        esquema: com_pagina,
        executar: construtor_pagina_gravar,
    },
];

// ---------------------------------------------------------------------------
// O portão
// ---------------------------------------------------------------------------

/// A licença, conferida **antes** de o processo ganhar mão.
pub fn portao(
    pasta: &Path,
    licenca: Option<&Path>,
    chave_oem: Option<&Path>,
    machine_id: &str,
) -> Resultado<aegis_vertical::Manifesto> {
    aegis_produto::portao(pasta, licenca, chave_oem, machine_id)
}

// ---------------------------------------------------------------------------
// O protocolo
// ---------------------------------------------------------------------------

/// Serve até o cliente fechar a entrada.
///
/// 🔴 Devolve o código de saída do produto e **nunca** chama `exit` por
/// dentro: o `main` é o único sítio onde se sai, que é o que torna
/// `Resultado::saida()` a única função que decide um número.
pub async fn servir(ctx: Contexto) -> i32 {
    let mut entrada = BufReader::new(tokio::io::stdin()).lines();
    let mut saida = tokio::io::stdout();
    loop {
        let linha = match entrada.next_line().await {
            Ok(Some(l)) => l,
            // Fim da entrada, ou stdin ilegível. Nos dois casos o servidor
            // sai como quem o mandou parar, e quem decide o número é o `main`.
            _ => return aegis_produto::SAIDA_FEITO,
        };
        if linha.trim().is_empty() {
            continue;
        }
        let resposta = match serde_json::from_str::<Value>(&linha) {
            Ok(pedido) => responder(&ctx, pedido).await,
            // 🔴 Uma linha que não é JSON é do **cliente**, e a resposta é um
            // erro de protocolo com o número do protocolo. Devolvê-la no
            // `conteúdo` de uma ferramenta seria inventar um motivo de produto
            // que não aconteceu.
            Err(e) => Some(erro_de_protocolo(-32700, &format!("pedido ilegível: {e}"))),
        };
        if let Some(r) = resposta
            && escrever(&mut saida, &r).await.is_err()
        {
            return aegis_produto::SAIDA_FALHOU;
        }
    }
}

async fn escrever(saida: &mut tokio::io::Stdout, v: &Value) -> std::io::Result<()> {
    // 🔴 Uma linha por resposta, e `flush` **sempre**: um buffer fechado no fim
    // é um servidor que parece pendurado quando o cliente já perguntou.
    saida
        .write_all(serde_json::to_string(v)?.as_bytes())
        .await?;
    saida.write_all(b"\n").await?;
    saida.flush().await
}

/// A resposta a um pedido, ou `None` quando é uma notificação.
///
/// Notificações não têm `id` e **não** se respondem — e responder a uma é a
/// maneira mais rápida de fazer um cliente que cumpre a spec desistir.
async fn responder(ctx: &Contexto, pedido: Value) -> Option<Value> {
    // 🔴 Notificação primeiro: sem `id` não há resposta, seja o método
    // conhecido ou não.
    let id = pedido.get("id").cloned()?;
    let metodo = pedido
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let resposta = match metodo.as_str() {
        "initialize" => Ok(json!({
            "protocolVersion": PROTOCOLO,
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": NOME, "version": env!("CARGO_PKG_VERSION") },
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": ferramentas() })),
        "tools/call" => {
            let params = pedido.get("params").cloned().unwrap_or_else(|| json!({}));
            let nome = params
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let argumentos = params
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            Ok(chamada(ctx, &nome, argumentos).await)
        }
        _ => Err((-32601, format!("metodo desconhecido: {metodo}"))),
    };

    Some(match resposta {
        Ok(resultado) => json!({ "jsonrpc": "2.0", "id": id, "result": resultado }),
        Err((codigo, mensagem)) => {
            let mut r = erro_de_protocolo(codigo, &mensagem);
            if let Some(o) = r.as_object_mut() {
                o.insert("id".into(), id);
            }
            r
        }
    })
}

fn erro_de_protocolo(codigo: i32, mensagem: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "error": { "code": codigo, "message": mensagem },
    })
}

/// O `tools/list`, derivado da **mesma** tabela que despacha.
pub fn ferramentas() -> Vec<Value> {
    FERRAMENTAS
        .iter()
        .map(|f| {
            json!({
                "name": f.nome,
                "description": f.descricao,
                "inputSchema": (f.esquema)(),
            })
        })
        .collect()
}

/// 🔴 `pub` por um motivo só: as provas entram por **aqui**, e não por uma
/// segunda porta.
///
/// Uma ferramenta provada por um caminho que o protocolo não usa é uma
/// ferramenta provada a meio. Chamar `chamada` é chamar o produto.
pub async fn chamada(ctx: &Contexto, nome: &str, argumentos: Value) -> Value {
    let resultado = match FERRAMENTAS.iter().find(|f| f.nome == nome) {
        Some(f) => (f.executar)(ctx, argumentos).await,
        None => {
            return erro_de_protocolo(
                -32602,
                &format!("ferramenta desconhecida: {nome}. As que existem estao em `tools/list`."),
            );
        }
    };
    match resultado {
        Ok(dado) => conteudo(&dado, false),
        // 🔴 A recusa do produto vai no **conteúdo**, com `isError`. É o que a
        // casa chama *erro tem código, frase e gesto*: um `isError: true` sem
        // gesto obriga o modelo a inventar o que fazer a seguir, e o modelo
        // inventa mal.
        //
        // E o `saida` vai junto: é o mesmo número que a linha de comandos
        // devolve, e um agente que vai correr `aegis` por baixo da mesma mesa
        // precisa de o poder comparar.
        Err(Falha::Resultado(r)) => {
            let saida = r.saida();
            let mut tela = r.para_tela();
            if let Some(o) = tela.as_object_mut() {
                o.insert("saida".into(), json!(saida));
            }
            conteudo(&tela, true)
        }
        Err(Falha::Chamada(codigo, mensagem)) => erro_de_protocolo(codigo, &mensagem),
    }
}

fn conteudo(dado: &Value, is_error: bool) -> Value {
    json!({
        "content": [{
            "type": "text",
            "text": serde_json::to_string_pretty(dado).unwrap_or_else(|_| "{}".into()),
        }],
        "isError": is_error,
    })
}

// ---------------------------------------------------------------------------
// As ferramentas — cada uma é uma chamada à biblioteca, e nada mais
// ---------------------------------------------------------------------------

ferramenta!(vertical_manifesto, ctx, _a, {
    // 🔴 Sem pasta: a pasta é a do **contexto**, e não um argumento. Um agente
    // que aponte para outra pasta é um agente a falar do produto que não é o
    // dele — e a licença que ele tem é a deste.
    para(aegis_produto::ver_vertical(&ctx.pasta).map(para_json))
});

// 🔴 A PRIMEIRA ferramenta que **escreve**, e por isso a que mais coisas tem
// que dizer.
//
// O agente propõe, o produto grava: a conferência, a escrita e a regeneração do
// `vertical.yaml` são as **do Montagem::gravar**, e esta ferramenta não
// reimplementa nenhuma delas. É a regra da casa aplicada ao contrário do
// costume — em vez de pôr a lógica no produto e a casca a repetir, a casca
// chama o produto e devolve o que ele disse.
//
// 🔴 E o `vertical.yaml` é um **artefacto gerado**: quem escreve a página não
// escreve o manifesto. Escrever o manifesto à mão é perder o registo do que o
// produto aceita, e o sintoma é um `cargo test` vermelho a dizer que a página
// não carrega, a três passos de quem a escreveu.
ferramenta!(construtor_pagina_gravar, ctx, a, {
    // Sem pasta, outra vez — a página vai para o vertical **deste** servidor.
    let bruta = a
        .get("pagina")
        .cloned()
        .ok_or_else(|| Falha::Chamada(-32602, "falta o campo `pagina`".to_string()))?;

    // 🔴 O erro da página e o da montagem falam os dois `codigo`/`humano`/
    // `gesto`, e é por isso que a tradução é uma linha: o motivo vem do
    // **produto**, e a ferramenta não escreve nenhum motivo novo.
    let pagina = aegis_pagina::Pagina::de_json(&bruta)
        .map_err(|e| Falha::Resultado(Resultado::recusado(e.codigo(), e.humano(), e.gesto())))?;

    let mut montagem = aegis_pagina::Montagem::abrir(&ctx.pasta)
        .map_err(|e| Falha::Resultado(Resultado::recusado(e.codigo(), e.humano(), e.gesto())))?;

    // 🔴 A página é conferida **aqui**, contra o manifesto, e o motivo que
    // sai é o **dela**.
    //
    // Medido a 30/09/2026, e é a mesma classe que o D3 apanhou na ilha: sem
    // isto, o `gravar` recusa com `montagem.pagina-invalida` — *"uma das páginas
    // recusou o que foi montado"* — que é um motivo **verdadeiro** e um gesto
    // **correcto** (*abrir o Construtor*), e nenhum dos dois serve a quem está
    // a perguntar. O agente não abre o Construtor, e o operador que o recusa
    // fica a saber que há um problema, não qual.
    //
    // 🔴 E a conferência do `gravar` **fica**: esta é a que diz ao operador, e
    // um caminho de escrita que só se segura por uma das duas conferências é um
    // caminho de escrita sem defence in depth.
    //
    // O manifesto vem da **própria montagem** (`para_manifesto`), e não de uma
    // segunda leitura do disco: a montagem foi aberta daqui a três linhas, sabe
    // o mesmo que o leitor, e não pode falhar — que é o que torna a tradução
    // curta e sem caminho de erro a esconder.
    let manifesto = montagem.para_manifesto(&ctx.pasta);
    pagina
        .validar(&manifesto)
        .map_err(|e| Falha::Resultado(Resultado::recusado(e.codigo(), e.humano(), e.gesto())))?;

    let slug = pagina.slug.clone();
    let titulo = pagina.titulo.clone();
    let substituia = montagem.paginas.iter().any(|p| p.slug == slug);

    // `definir_pagina` substitui pelo `slug`; `gravar` é a **única** via de
    // escrita, e é ela que confere ANTES de tocar no disco.
    montagem.definir_pagina(pagina);
    montagem
        .gravar(&ctx.pasta)
        .map_err(|e| Falha::Resultado(Resultado::recusado(e.codigo(), e.humano(), e.gesto())))?;

    Ok(json!({
        "grava": true,
        "pagina": slug,
        "titulo": titulo,
        "accao": if substituia { "substituida" } else { "acrescentada" },
        "paginas": montagem.paginas.len(),
        "manifesto": "vertical.yaml regerado — e um artefacto gerado, nao se escreve a mao",
    }))
});

ferramenta!(camera_listar, _ctx, a, {
    let pasta = caminho(&a);
    para(aegis_produto::listar_cameras(pasta.as_deref()).map(para_json))
});

ferramenta!(camera_adicionar, _ctx, a, {
    let nome = texto(&a, "nome")?;
    let endereco = texto(&a, "endereco")?;
    let pasta = caminho(&a);
    para(aegis_produto::adicionar_camera(&nome, &endereco, pasta.as_deref()).map(para_json))
});

ferramenta!(camera_remover, _ctx, a, {
    let nome = texto(&a, "nome")?;
    let pasta = caminho(&a);
    para(aegis_produto::remover_camera(&nome, pasta.as_deref()).map(para_json))
});

ferramenta!(licenca_fingerprint, ctx, _a, {
    let (id, plataforma, arquitetura) = aegis_produto::partes_da_maquina(&ctx.machine_id);
    Ok(json!({
        "fingerprint": aegis_produto::fingerprint_de(&id, &plataforma, &arquitetura),
        "machine_id": id,
        "plataforma": plataforma,
        "arquitetura": arquitetura,
        "licenca_exigida": ctx.exige,
    }))
});

ferramenta!(licenca_conferir, ctx, a, {
    // 🔴 Um vertical que não exige licença não é uma licença válida: é uma
    // **escolha escrita no manifesto**. Devolver uma recusa aqui seria
    // inventar um motivo para um produto que não tem licença nenhuma para ter.
    if ctx.exige.trim().is_empty() {
        return Ok(json!({
            "confere": true,
            "licenca_exigida": "",
            "nota": "este vertical nao exige licenca",
        }));
    }
    let licenca = opcion(&a, "licenca")
        .map(PathBuf::from)
        .or(ctx.licenca.clone());
    let chave_oem = opcion(&a, "chave_oem")
        .map(PathBuf::from)
        .or(ctx.chave_oem.clone());
    match aegis_produto::conferir_licenca(
        &ctx.exige,
        licenca.as_deref(),
        chave_oem.as_deref(),
        &ctx.machine_id,
    ) {
        Ok(()) => Ok(json!({ "confere": true, "licenca_exigida": ctx.exige })),
        Err(e) => {
            let frase = e.humano();
            Err(Falha::Resultado(Resultado::recusado(
                e.codigo(),
                frase,
                e.gesto(),
            )))
        }
    }
});

ferramenta!(ilha_vertical, _ctx, _a, {
    // 🔴 A recusa da ilha entra pelo mesmo `para` de sempre, com o `codigo`,
    // a frase e o gesto **que ela mandou**. É a coisa que o D3 conserta: a
    // ilha respondia com dois campos e quem lia por HTTP ficava a saber o
    // que aconteceu sem saber o que fazer.
    para(aegis_produto::vertical_da_ilha().await.map(para_json))
});

ferramenta!(ilha_tipos, _ctx, _a, {
    para(aegis_produto::tipos_da_ilha().await.map(para_json))
});

ferramenta!(ilha_pagina, _ctx, a, {
    let slug = texto(&a, "slug")?;
    para(aegis_produto::pagina_da_ilha(&slug).await.map(para_json))
});

ferramenta!(ilha_saude, _ctx, _a, {
    // 🔴 `saude` **não** apanha a não-prontidão como falha: a ilha responde
    // `503` com o motivo, e um `503` é uma **recusa** — o pedido era
    // legítimo e o estado é que não o permite. Tratar como "falhou" puniria o
    // agente por um defeito da plataforma, que é a mesma distinção que o
    // `instalar` faz com `pronto.saude`.
    para(aegis_produto::saude_da_ilha().await.map(para_json))
});

ferramenta!(diagnostico, _ctx, _a, {
    // 🔴 `saude` **recusa** quando a ilha não está pronta — e é a esse `saude`
    // que a conferência pede o dado, porque é a única leitura que traz
    // `banco`, `tenant_ativo`, os dois números do seed e a lista de
    // verificações. Mas a conferência **não pode propagar** essa recusa: ela
    // existe para explicar a não-prontidão, e uma ferramenta que só responde
    // quando não há nada a explicar é inútil no único momento em que há.
    //
    // Daí virarem `None`: **não medido** em vez de *falhou*. E a linha que
    // resulta é `NaoConferido`, que é a terceira situação — nem verde nem
    // vermelho. Um `falhou` aqui puniria o agente por um defeito da plataforma
    // que ele está a tentar diagnosticar.
    let (prontidao, sem_prontidao) = match aegis_produto::prontidao_da_ilha().await {
        Resultado::Feito(p) => (Some(p), None),
        Resultado::Recusado {
            codigo,
            o_que_dizer,
            ..
        } => (None, Some((codigo, o_que_dizer))),
        // 🔴 Um `Falhou` aqui é *"não consegui falar com a ilha"*, e uma
        // **falha não é uma linha da conferência**: uma conferência com uma
        // linha a dizer que não conseguiu medir-se a si mesma é uma
        // conferência que finge ter medido. Por isso o par volta, e a chave
        // `ilha` da resposta diz o que aconteceu — em vez de a conferência o
        // embrulhar num `diag.*` que ninguém sabe ler.
        Resultado::Falhou { o_que_dizer, .. } => {
            (None, Some(("ilha.indisponivel".to_string(), o_que_dizer)))
        }
    };

    // 🔴 E o `ctx` **não** entra, por uma razão que é a regra da casa: a
    // conferência mede a **ilha** e a **máquina do integrador**, e a pasta do
    // vertical do servidor não é nenhum das duas. Um `--vertical` que
    // conseguisse cambiar o que a conferência diz seria um vertical a mudar a
    // máquina — e um vertical é **dado**, nunca código que decide.
    //
    // 🔴 A licença é `NaoConferida`, e **não** `Vigente`, apesar de o portão
    // só deixar arrancar com licença válida. A diferença é quem mede: esta peça
    // não leu o arquivo, e uma linha que diz *"vale até"* sem ter lido nada é
    // uma linha que mente. `NaoConferida` diz a verdade — e a licença
    // **confere** na ferramenta `licenca_conferir`, que a lê a sério.
    let d = aegis_produto::conferencia_de(
        prontidao.as_ref(),
        prontidao.as_ref().is_some_and(|p| p.banco),
        prontidao.as_ref().is_some_and(|p| p.tenant_ativo),
        prontidao.as_ref().map_or(0, |p| p.seed_no_banco),
        prontidao.as_ref().map_or(0, |p| p.seed_esperado),
        // 🔴 `NaoObservado`, e não `Ausente`: quem pergunta está na máquina do
        // integrador e não tem `sh` para medir. A linha sai `NaoConferido`.
        aegis_produto::Interpretador::NaoObservado,
        aegis_produto::LicencaDaMaquina::NaoConferida,
    );

    // 🔴 A **recusa** que o `saude` traz entra no diagnóstico como uma linha, e
    // não como um erro: o `codigo` e a frase que a ilha mandou são o que o
    // operador precisa, e perdê-los por não os conseguir serializar seria
    // repetir o defeito do D3 dois passos depois.
    let json = serde_json::to_value(&d).unwrap_or(Value::Null);
    let mut saida = json.as_object().cloned().unwrap_or_default();
    if let Some((codigo, frase)) = sem_prontidao {
        saida.insert(
            "ilha".to_string(),
            json!({ "codigo": codigo, "frase": frase }),
        );
    }
    Ok(Value::Object(saida))
});

// ---------------------------------------------------------------------------
// Os esquemas
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Os esquemas
// ---------------------------------------------------------------------------

fn sem_campos() -> Value {
    json!({ "type": "object", "properties": {} })
}

fn com_slug() -> Value {
    json!({
        "type": "object",
        "properties": {
            "slug": { "type": "string", "description": "O identificador da pagina, tal como esta no menu." }
        },
        "required": ["slug"],
    })
}

/// 🔴 A página vem como **object**, e não como texto a desserializar.
///
/// O esquema é o que o modelo lê antes de decidir. Se o `pagina` fosse uma
/// string, o modelo teria de escrever JSON dentro de JSON, e o erro de sintaxe
/// apareceria como uma página inválida — uma recusa do **produto** a dizer
/// "esta página não tem o formato esperado" quando o que está mal foi a
/// transportation. Passar o objecto é o que deixa o erro ser do sitio certo.
fn com_pagina() -> Value {
    json!({
        "type": "object",
        "properties": {
            "pagina": {
                "type": "object",
                "description": "A pagina completa, no mesmo formato de paginas/<slug>.json. O \
                                slug decide se substitui uma pagina que ja existe ou se acrescenta \
                                uma nova.",
            }
        },
        "required": ["pagina"],
    })
}

fn com_pasta() -> Value {
    json!({
        "type": "object",
        "properties": {
            "pasta": {
                "type": "string",
                "description": "Onde vive a lista. Omitir para a pasta de dados desta maquina.",
            }
        },
    })
}

fn nome_necessario() -> Value {
    json!({
        "type": "object",
        "properties": {
            "nome": { "type": "string", "description": "O nome como o operador escreve. Nunca um endereco." },
            "pasta": { "type": "string" },
        },
        "required": ["nome"],
    })
}

fn nome_e_endereco() -> Value {
    json!({
        "type": "object",
        "properties": {
            "nome": { "type": "string", "description": "O nome como o operador escreve. Nunca um endereco." },
            "endereco": { "type": "string", "description": "O endereco: rtsp://…, http://…" },
            "pasta": { "type": "string" },
        },
        "required": ["nome", "endereco"],
    })
}

fn com_licencas() -> Value {
    json!({
        "type": "object",
        "properties": {
            "licenca": { "type": "string", "description": "O caminho da licenca. Omitir para a do arranque." },
            "chave_oem": { "type": "string", "description": "O caminho da Chave OEM. Omitir para a do arranque." },
        },
    })
}

// ---------------------------------------------------------------------------
// Os argumentos
// ---------------------------------------------------------------------------

/// Um campo obrigatório.
///
/// 🔴 Falta um campo obrigatório é **o cliente a chamar mal**, e por isso
/// devolve um erro de protocolo e não uma recusa de produto: inventar um
/// `codigo` de produto para um erro de sintaxe seria alargar o vocabulário
/// fechado com coisas que não são do produto.
/// Um campo obrigatório.
///
/// 🔴 Falta um campo obrigatório é **o cliente a chamar mal**, e por isso
/// devolve um erro de protocolo e não uma recusa de produto: inventar um
/// `codigo` de produto para um erro de sintaxe seria alargar o vocabulário
/// fechado com coisas que não são do produto.
///
/// 🔴 E a distinção é do **cliente da ilha**, não desta camada: a mensagem
/// *"falta o campo `slug`"* diz que o pedido chegou a ser lido e não era
/// completo. Uma falha de rede é outra coisa — a ilha não chegou a ser
/// chamada, e por isso não tem `codigo`, não tem frase e **não tem
/// gesto**, porque não há situação a resolver: há uma ilha que não responde.
fn texto(a: &Value, chave: &str) -> Result<String, Falha> {
    a.get(chave)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| Falha::Chamada(-32602, format!("falta o campo `{chave}`")))
}

fn opcion(a: &Value, chave: &str) -> Option<String> {
    a.get(chave)
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .map(str::to_string)
}

fn caminho(a: &Value) -> Option<PathBuf> {
    opcion(a, "pasta").map(PathBuf::from)
}

/// Um `Resultado` do produto, mesmo `Feito`, numa resposta de ferramenta.
fn para(r: Resultado<Value>) -> Saida {
    match r {
        Resultado::Feito(v) => Ok(v),
        Resultado::Recusado {
            codigo,
            o_que_dizer,
            o_que_fazer,
        } => Err(Falha::Resultado(Resultado::Recusado {
            codigo,
            o_que_dizer,
            o_que_fazer,
        })),
        Resultado::Falhou {
            codigo,
            o_que_dizer,
        } => Err(Falha::Resultado(Resultado::Falhou {
            codigo,
            o_que_dizer,
        })),
    }
}

fn para_json<T: Serialize>(v: T) -> Value {
    // 🔴 Um `falhou` **sem gesto** é o defeito que a regra dos três elementos
    // apanha — e aqui não há gesto possível: não há pessoa a quem dar, é uma
    // falha interna de serialização. O código diz isso, em vez de fingir ser
    // uma recusa de produto.
    serde_json::to_value(v).unwrap_or_else(|e| {
        json!({
            "feito": false,
            "codigo": "mcp.nao-serializavel",
            "mensagem": format!("o resultado desta ferramenta nao e JSON: {e}"),
        })
    })
}

#[cfg(test)]
mod testes {
    use super::*;

    /// 🔴 A lista e o despacho são **um** sítio. Este teste é o que impede que
    /// voltem a ser dois: sem ele, um `tools/list` que anuncia
    /// `camera_remover` e um despacho que não a conhece fica verde durante
    /// meses.
    #[test]
    fn a_lista_anunciada_existe_todas() {
        for t in ferramentas() {
            let nome = t["name"].as_str().unwrap_or_default();
            assert!(
                FERRAMENTAS.iter().any(|f| f.nome == nome),
                "a lista anuncia `{nome}`, que a tabela nao tem"
            );
        }
        let nomes: Vec<&str> = FERRAMENTAS.iter().map(|f| f.nome).collect();
        let unicos: std::collections::BTreeSet<&&str> = nomes.iter().collect();
        assert_eq!(nomes.len(), unicos.len(), "ha ferramentas com o mesmo nome");
    }

    /// O nome que o operador vê é "aegis". A regra do `CLAUDE.md` é que o
    /// runtime nunca aparece com o nome de uma terceira parte — e o nome do
    /// **servidor** é o que o cliente mostra na lista de ferramentas.
    #[test]
    fn o_servidor_nao_se_anuncia_com_o_nome_de_um_terceiro() {
        assert_eq!(NOME, "aegis");
    }

    /// Uma ferramenta que exige um campo diz isso no esquema, porque o esquema
    /// é a **documentação** da ferramenta — e uma ferramenta com campo
    /// obrigatório escondido é uma ferramenta que o modelo preenche a
    /// adivinhar.
    #[test]
    fn os_campos_obrigatorios_estao_declarados() {
        for f in FERRAMENTAS {
            let esquema = (f.esquema)();
            let exigidos: Vec<&str> = esquema["required"]
                .as_array()
                .map(|a| a.iter().filter_map(Value::as_str).collect())
                .unwrap_or_default();
            for campo in exigidos {
                assert!(
                    esquema["properties"].get(campo).is_some(),
                    "{} exige `{campo}` e nao o declara no esquema",
                    f.nome
                );
            }
        }
    }

    /// 🔴 A recusa do produto vai no **conteúdo** e nunca como erro de
    /// protocolo: é o que leva o `gesto` e o `codigo` até ao modelo.
    #[tokio::test]
    async fn uma_recusa_via_no_conteudo_e_nao_como_erro_de_protocolo() {
        let pasta = pasta_de_bancada();
        let r = chamada(
            &ctx(),
            "camera_remover",
            json!({ "nome": "nao-existe-mesmo", "pasta": pasta }),
        )
        .await;
        assert!(r.get("error").is_none(), "recusa nao e erro de protocolo");
        assert_eq!(r["isError"], json!(true));
        let texto = r["content"][0]["text"].as_str().unwrap_or_default();
        let d: Value = serde_json::from_str(texto).expect("o conteudo e JSON");
        assert_eq!(d["codigo"], json!("ponte.inexistente"));
        assert!(
            !d["gesto"].as_str().unwrap_or("").is_empty(),
            "recusa sem gesto: e o defeito que a regra dos tres elementos apanha"
        );
        assert_eq!(d["saida"], json!(aegis_produto::SAIDA_RECUSADO));
    }

    /// E o contrário: uma ferramenta **desconhecida** é erro de protocolo, com
    /// o número do protocolo — e não uma recusa de produto inventada.
    #[tokio::test]
    async fn uma_ferramenta_desconhecida_e_erro_de_protocolo() {
        let r = chamada(&ctx(), "abrir_o_portao_do_cliente", json!({})).await;
        assert_eq!(r["error"]["code"], json!(-32602));
    }

    fn ctx() -> Contexto {
        Contexto {
            pasta: PathBuf::from("verticals/qualquer"),
            exige: "qualquer".into(),
            licenca: None,
            chave_oem: None,
            machine_id: "maquina-de-teste".into(),
        }
    }

    /// A bancada de uma prova: uma pasta que existe e **não é** a pasta de
    /// dados de ninguém. 🔴 Uma prova que escreve na pasta de dados da máquina
    /// que a corre é uma prova que muda a máquina.
    fn pasta_de_bancada() -> String {
        let p = std::env::temp_dir().join("aegis-mcp-prova");
        std::fs::create_dir_all(&p).expect("cria a pasta de bancada");
        p.display().to_string()
    }
}
