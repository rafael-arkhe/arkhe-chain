//! A janela do AEGIS.
//!
//! 🔴 Cada comando desta janela chama [`aegis_produto`] — **a mesma
//! biblioteca** que a casca da CLI chama. Não há regra nesta janela, e é essa
//! a garantia: uma janela com regras próprias é uma segunda CLI, e as duas
//! divergem no dia em que alguém instala um cliente pela que está errada.
//!
//! O que a janela acrescenta à CLI é o que a CLI não pode ter: **o motivo** e
//! o **gesto**, lado a lado, sem código de processo pelo meio. E é por isso
//! que [`aegis_produto::Resultado`] traz os dois em vez de uma frase só.

use aegis_produto::Resultado;
use serde::Serialize;

/// O que a janela mostra ao operador.
///
/// 🔴 `codigo`, `frase` e `gesto` vêm do **mesmo** `Resultado` que a CLI
/// imprime. Se esta struct calculasse a frase, haveria duas traduções — e a
/// da janela ficaria para trás.
#[derive(Debug, Clone, Serialize)]
pub struct Resposta {
    pub feito: bool,
    pub codigo: String,
    pub frase: String,
    /// O que a pessoa pode fazer. Vazio quando não há nada a fazer.
    pub gesto: String,
}

/// A janela a partir de um `Resultado`. 🔴 Função e **não** `impl From`
/// genérico: um `impl<T: Serialize> From<&Resultado<T>>` dentro de um
/// comando assíncrono faz o compilador falhar com *"implementation of
/// `std::marker::Send` is not general enough"* — e a mensagem aponta para o
/// `Send`, quando a causa é o impl genérico.
fn tela_de<T: Serialize>(r: &Resultado<T>) -> Resposta {
    let t = r.para_tela();
    Resposta {
        feito: r.saida() == aegis_produto::SAIDA_FEITO,
        codigo: t["codigo"].as_str().unwrap_or_default().to_string(),
        frase: t["mensagem"].as_str().unwrap_or_default().to_string(),
        gesto: t
            .get("gesto")
            .and_then(|g| g.as_str())
            .unwrap_or_default()
            .to_string(),
    }
}

/// O catálogo de verticais, como a janela o mostra.
#[derive(Debug, Clone, Serialize)]
pub struct VerticalNaTela {
    pub id: String,
    pub versao: u32,
    pub titulo: String,
    pub tipos: usize,
    pub acoes: usize,
    pub paginas: usize,
    pub dados: usize,
    pub licenca_exige: String,
}

// ---------------------------------------------------------------------------
// Os comandos
// ---------------------------------------------------------------------------

/// Lista os verticais de uma pasta.
#[tauri::command]
fn listar_verticais(pasta: String) -> Result<Vec<VerticalNaTela>, Resposta> {
    let r = aegis_produto::listar_verticais(std::path::Path::new(&pasta));
    match r {
        Resultado::Feito(lista) => Ok(lista
            .into_iter()
            .map(|v| VerticalNaTela {
                id: v.id,
                versao: v.versao,
                titulo: v.titulo.unwrap_or_default(),
                tipos: v.tipos,
                acoes: v.acoes,
                paginas: v.paginas,
                dados: v.dados,
                licenca_exige: v.licenca_exige,
            })
            .collect()),
        outro => Err(tela_de(&outro)),
    }
}

/// Aplica um vertical. É a **mesma** função que `aegis ilha instalar` chama.
#[tauri::command]
async fn instalar(
    vertical: String,
    banco: String,
    licenca: Option<String>,
    chave_oem: Option<String>,
    machine_id: Option<String>,
) -> Result<Resposta, Resposta> {
    // 🔴 As três referências vivem em **variáveis**, e não em expressões.
    //
    // `&machine_id.unwrap_or_else(..)` cria um temporário que morre no fim da
    // declaração — e o `.await` seguinte continua a segurá-lo. O compilador
    // traduz isso para *"implementation of `Send` is not general enough"*,
    // com uma nota sobre `&str` que não tem nada a ver com a causa. A
    // mensagem aponta para o `Send`; o defeito é um `&` para nada.
    // 🔴 Os caminhos são **possuídos** (`PathBuf`), e não emprestados
    // (`&Path`). O fecho que vai para a thread é `move` e precisa de
    // `'static`, e um `&Path` que aponta para o argumento da função não é.
    // Compilar aqui é o que impede a mesma referência de reaparecer mais
    // tarde, na fila, sem ninguém ligar as duas coisas.
    let machine = machine_id.unwrap_or_else(aegis_produto::machine_id_padrao);
    let pasta_licenca = licenca.map(std::path::PathBuf::from);
    let pasta_chave = chave_oem.map(std::path::PathBuf::from);

    // 🔴 `Box::pin` não é enfeite. O `#[tauri::command]` gera código que
    // exige `Send` do futuro **concreto**, e o futuro de `instalar` leva
    // referências (`&Contrato`, `&Tenant`) que atravessam `await`. O
    // compilador não consegue generalizar isso e falha com *"implementation
    // of `Send` is not general enough"`. O `Box::pin` apaga o tipo concreto e
    // transforma a verificação em nominal.
    //
    // A mensagem aponta para o `Send` e sugere `&str`; nenhuma das duas coisas
    // é a causa.
    // 🔴 O trabalho vai para uma **thread dedicada**, e o comando espera o
    // resultado. A instalação leva segundos; fazê-la no thread da interface
    // congelava a janela exatamente quando a pessoa está a olhar para ela.
    //
    // E o comando volta a ser `async` — mas a `spawn_blocking` devolve um
    // **valor**, e um valor não tem futuro para generalizar. Era esse o
    // defeito original: um `#[tauri::command]` assíncrono exige `Send` do
    // futuro **concreto** de `aegis_produto::instalar`, e esse futuro leva
    // referências que atravessam `await`. O compilador falhava com
    // *"implementation of `Send` is not general enough"* e sugeria `&str`,
    // que não tem nada a ver com a causa.
    let r = tauri::async_runtime::spawn_blocking(move || {
        // O `block_on` está numa **thread dedicada**, e é aí que ele pertence:
        // esta thread existe precisamente para poder bloquear. O que não pode
        // é o `block_on` na thread da interface.
        tauri::async_runtime::block_on(aegis_produto::instalar(
            std::path::Path::new(&vertical),
            &banco,
            pasta_licenca.as_deref(),
            pasta_chave.as_deref(),
            &machine,
        ))
    })
    .await
    .unwrap_or_else(|e| {
        // A thread de trabalho morreu. É uma **falha** e não uma recusa: o
        // pedido era legítimo e a plataforma não o conseguiu atender.
        eprintln!("[produto.falha] a instalação não pode ser atendida: {e}");
        Resultado::falhou("produto.falha", "A instalação não pode ser atendida.")
    });
    let resposta = tela_de(&r);
    if resposta.feito {
        Ok(resposta)
    } else {
        Err(resposta)
    }
}

/// O estado da ilha, e o que falta se não estiver pronta.
#[tauri::command]
async fn estado(vertical: String, banco: String) -> Result<serde_json::Value, Resposta> {
    match tauri::async_runtime::spawn_blocking(move || {
        tauri::async_runtime::block_on(aegis_produto::estado(
            std::path::Path::new(&vertical),
            &banco,
        ))
    })
    .await
    .unwrap_or_else(|e| {
        eprintln!("[produto.falha] o estado não pode ser consultado: {e}");
        Resultado::falhou("produto.falha", "O estado não pode ser consultado.")
    }) {
        Resultado::Feito(p) => Ok(serde_json::to_value(p).unwrap_or_default()),
        outro => Err(tela_de(&outro)),
    }
}

/// 🔴 A renovação, em **dois tempos** — e a janela é a **mesma** biblioteca
/// que a CLI chama, sem uma linha de regra.
///
/// O motivo de a renovação aparecer na janela e a instalação também não: a
/// recusa de licença vencida diz ao operador *"Renovar a licença"*, e um
/// gesto que o software não tem é pior do que uma recusa feia. É o buraco
/// que a CLI e a GUI tinham em comum — e são as duas faces da mesma coisa.
#[tauri::command]
async fn pedir_renovacao(
    licenca: String,
    machine_id: Option<String>,
) -> Result<Resposta, Resposta> {
    let machine = machine_id.unwrap_or_else(aegis_produto::machine_id_padrao);
    let caminho = std::path::PathBuf::from(licenca);
    // 🔴 Vai para uma thread dedicada como tudo o que toca no disco. Uma
    // escrita de licença por baixo da pessoa a olhar para a janela é a forma
    // mais rápida de ela achar que a janela parou.
    let r = tauri::async_runtime::spawn_blocking(move || {
        aegis_produto::pedir_renovacao(&caminho, &machine)
    })
    .await
    .unwrap_or_else(|e| {
        eprintln!("[produto.falha] o pedido não pode ser tirado: {e}");
        Resultado::falhou(
            "produto.falha",
            "O pedido de renovação não pode ser tirado.",
        )
    });

    let resposta = tela_de(&r);
    if resposta.feito {
        Ok(resposta)
    } else {
        Err(resposta)
    }
}

/// O segundo tempo: conferir a resposta e gravar a licença de dentro.
#[tauri::command]
async fn aplicar_renovacao(
    resposta: String,
    licenca: String,
    chave_oem: Option<String>,
    machine_id: Option<String>,
) -> Result<Resposta, Resposta> {
    let machine = machine_id.unwrap_or_else(aegis_produto::machine_id_padrao);
    let caminho_resposta = std::path::PathBuf::from(resposta);
    let caminho_licenca = std::path::PathBuf::from(licenca);
    let caminho_oem = chave_oem.map(std::path::PathBuf::from);

    let r = tauri::async_runtime::spawn_blocking(move || {
        aegis_produto::aplicar_renovacao(
            &caminho_resposta,
            &caminho_licenca,
            caminho_oem.as_deref(),
            &machine,
        )
    })
    .await
    .unwrap_or_else(|e| {
        eprintln!("[produto.falha] a renovação não pode ser aplicada: {e}");
        Resultado::falhou("produto.falha", "A renovação não pode ser aplicada.")
    });

    let resposta = tela_de(&r);
    if resposta.feito {
        Ok(resposta)
    } else {
        Err(resposta)
    }
}

/// 🔴 A conferência da máquina, para a tabela **Situação · O que foi
/// conferido · O que foi medido · Conserto**.
///
/// É a **mesma** peça que a tela do `aegis-bridge` mostra na aba *Sistema*,
/// com o vocabulário desta ilha em vez do campo. A regra que a faz ser
/// honesta — *a coluna Conserto só enche quando a linha não passou, e o
/// conserto é o nome de UMA ação* — vem de `aegis_produto::diagnostico`, e a
/// janela **não a repete**: ela recebe a tabela pronta.
///
/// 🔴 A medição corre numa **thread dedicada** e devolve; a casa mediu um
/// `doctor` que fazia a medição na thread da interface, e o sintoma era a
/// janela a não responder durante 65 s.
#[tauri::command]
async fn diagnostico(vertical: String, banco: String) -> Result<serde_json::Value, Resposta> {
    match tauri::async_runtime::spawn_blocking(move || {
        tauri::async_runtime::block_on(aegis_produto::estado(
            std::path::Path::new(&vertical),
            &banco,
        ))
    })
    .await
    .unwrap_or_else(|e| {
        eprintln!("[produto.falha] a conferência não pode ser feita: {e}");
        Resultado::falhou("produto.falha", "A conferência não pode ser feita.")
    }) {
        Resultado::Feito(p) => {
            let json = serde_json::to_value(&p).unwrap_or_default();
            Ok(json)
        }
        // 🔴 Uma conferência que **não** pôde ser feita não é um erro de ecrã:
        // é a resposta mais honesta, e a tela mostra-a como tal. Um `Err` aqui
        // seria a tela a dizer "falhou" quando o que houve foi "não sei" — e
        // essa confusão é a que a casa já mediu num `SEM-CHECK` a sair verde.
        outro => {
            eprintln!(
                "[produto.aviso] a ilha ainda não está conferível: {:?}",
                outro
            );
            Ok(serde_json::json!({ "pronto": false }))
        }
    }
}

/// O fingerprint desta máquina — para o operador pedir a licença.
#[tauri::command]
async fn fingerprint(machine_id: Option<String>) -> serde_json::Value {
    let m = machine_id.unwrap_or_else(aegis_produto::machine_id_padrao);
    let (id, plataforma, arquitetura) = aegis_produto::partes_da_maquina(&m);
    serde_json::json!({
        "fingerprint": aegis_produto::fingerprint_de(&id, &plataforma, &arquitetura),
        "maquina": id,
        "plataforma": plataforma,
        "arquitetura": arquitetura,
    })
}

/// O que esta janela é, dito à pessoa que a abre.
#[tauri::command]
fn sobre() -> serde_json::Value {
    serde_json::json!({
        "produto": "AEGIS",
        "versao": env!("CARGO_PKG_VERSION"),
        // 🔴 Dizer é melhor do que esconder. A janela e a CLI são a mesma
        // biblioteca; quem abrir isto tem o direito de saber.
        "nota": "Esta janela e a linha de comandos são a mesma biblioteca. \
                 Nenhuma das duas decide sozinha.",
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "aegis=info,warn".into()),
        )
        .init();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            listar_verticais,
            instalar,
            estado,
            diagnostico,
            pedir_renovacao,
            aplicar_renovacao,
            fingerprint,
            sobre
        ])
        .run(tauri::generate_context!())
        .expect("a janela do AEGIS tem de abrir");
}
