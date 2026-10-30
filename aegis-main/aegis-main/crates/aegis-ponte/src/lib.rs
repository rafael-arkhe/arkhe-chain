//! **aegis-ponte** — a ponte de câmara.
//!
//! 🔴 Este crate é a **unificação** que o plano da refatoração mandou fazer: a
//! `aegis-bridge` (C#/WinForms) deixa de ser um produto ao lado e passa a ser
//! uma peça do núcleo, ao lado de `aegis-license`, `aegis-store` e
//! `aegis-island`. É o que traz a aba **Câmeras** ao GUI novo sem que ela
//! traga um produto.
//!
//! # O que este crate NÃO faz
//!
//! Não gerencia o processo do `go2rtc`, não faz HTTP e não toca no disco
//! fora do **seu** ficheiro. Quem fala com o `go2rtc` é o `aegis-ponte`;
//! quem fala com o operador é o GUI. Esta peça é o **modelo** e a
//! **normalização**, e é onde vivem as duas regras que a casa mediu na
//! máquina de campo.
//!
//! # A regra que custa mais caro: nome de stream é NOME, não URL
//!
//! 🔴 O `go2rtc` **cria** um stream com o nome que receber quando esse nome
//! não existe (`GetOrPatch` → `Patch(src, src)`). Pedir um frame ou um HLS por
//! um nome que não é stream **semeia** uma entrada nova. Foi medido a
//! 12/09/2026: um stream chamado pela própria URL — lido do JSON sem
//! desescapar, onde `&` vem `&` — virou **~25 gerações de lixo**, cada
//! pedido a criar o seguinte (`&` → `\\u0026` → …), e cada geração é uma
//! fonte **morta** que o `go2rtc` tenta abrir: CPU e rede da ponte a queimar
//! em fontes que ninguém vê.
//!
//! Por isso [`Camera::nova`] **recusa** um nome que seja uma URL, e
//! [`normaliza`] leva qualquer entrada a um nome. Um nome de stream nunca
//! contém `://`, nunca `/`, e nunca passa de 128 caracteres.

use std::fmt;
use std::path::PathBuf;

/// A porta do painel do `go2rtc`.
pub const GO2RTC_HTTP: u16 = 1984;
/// A porta RTSP que o AEGIS consome.
pub const GO2RTC_RTSP: u16 = 8554;
/// O ficheiro onde a lista vive. Uma linha por câmara: `nome|url`.
mod watchdog;

pub use watchdog::{
    Decisao as DecisaoDoWatchdog, Ronda as RondaDoWatchdog, decidir as decide_watchdog,
    frase as frase_do_watchdog, ordenar_o_reparo,
};

pub const FICHEIRO_DAS_CAMERAS: &str = "cameras.txt";
/// O ficheiro de configuracao do `go2rtc`. Vive **ao lado** da lista:
/// um `cameras.txt` que o `go2rtc` nao le e uma lista de desejos.
pub const FICHEIRO_GO2RTC: &str = "go2rtc.yaml";

/// 🔴 O motivo pelo qual [`Camera`] existe como tipo e não como `String`.
///
/// Numa URL de câmara há `://`, barras e Credenciais. Nenhuma delas pode
/// chegar a um nome de stream, e o que impede isso de acontecer é o **tipo**,
/// não a disciplina: um `String` aceita tudo, e a disciplina é a primeira
/// coisa que se perde às três da manhã.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ErroCamera {
    /// O nome não é um nome: é uma URL, ou traz caracteres que o stream não
    /// pode ter. A recusa **diz** o que era, porque o operador colou uma URL
    /// e precisa de saber que colou a coisa errada no sítio errado.
    NomeNaoENome { recebido: String },
    /// O nome é válido como nome mas tem um caractere que nenhum dos dois
    /// lados entende.
    NomeVazio,
    /// A URL não é uma URL.
    UrlInvalida { recebido: String },
    /// O nome já existe na lista, com outro endereço.
    NomeRepetido { nome: String },
    /// 🔴 Não há câmara com este nome.
    ///
    /// Este motivo **não existia** e vivia escrito à mão na casca, como
    /// `[ponte.inexistente]`. Uma recusa que só existe num `eprintln!` não
    /// entra no vocabulário, não ganha frase, não ganha gesto — e é por isso
    /// que a face do terminal mandava *"não há câmara chamada X"* e **nada
    /// mais**. Quem telefone para a câmara não fica a saber o que fazer a
    /// seguir. Passou a ser um motivo como os outros, e a casca passou a
    /// traduzir.
    Inexistente { nome: String },
    /// 🔴 A máquina não sabe onde é a sua pasta de dados.
    ///
    /// Também vivia só na casca (`[ponte.dados]`). E note-se a diferença de
    /// código: a casca devolvia `1` — *"não consegui"* — quando o certo é
    /// `3` — *"não posso"*. O pedido era legítimo; é o ambiente que não diz
    /// onde está.
    DadosDesconhecidos,
    /// O disco não deixou gravar.
    Disco(String),
}

impl ErroCamera {
    /// O código. A tela traduz por este, nunca pela frase.
    pub fn codigo(&self) -> &'static str {
        match self {
            Self::NomeNaoENome { .. } => "ponte.nome-nao-e-nome",
            Self::NomeVazio => "ponte.nome-vazio",
            Self::UrlInvalida { .. } => "ponte.url-invalida",
            Self::NomeRepetido { .. } => "ponte.nome-repetido",
            Self::Inexistente { .. } => "ponte.inexistente",
            Self::DadosDesconhecidos => "ponte.dados",
            Self::Disco(_) => "ponte.disco",
        }
    }

    /// O que a tela diz.
    pub fn humano(&self) -> String {
        match self {
            Self::NomeNaoENome { recebido } => format!(
                "`{recebido}` não é um nome de câmara, é um endereço. \
                 O nome é o que se põe na lista — o endereço vai ao lado, \
                 separado por `|`."
            ),
            Self::NomeVazio => "O nome da câmara ficou vazio.".to_string(),
            Self::UrlInvalida { recebido } => {
                format!("`{recebido}` não é um endereço de câmara.")
            }
            Self::NomeRepetido { nome } => {
                format!("Já há uma câmara chamada `{nome}` na lista.")
            }
            Self::Inexistente { nome } => {
                format!("Não há câmara chamada `{nome}` nesta máquina.")
            }
            Self::DadosDesconhecidos => {
                "Não sei onde é a pasta de dados desta máquina.".to_string()
            }
            Self::Disco(detalhe) => format!("Não consegui gravar a lista: {detalhe}"),
        }
    }

    /// O que a pessoa pode fazer.
    pub fn gesto(&self) -> &'static str {
        match self {
            Self::NomeNaoENome { .. } | Self::NomeVazio => "Pôr um nome curto, sem barras",
            Self::UrlInvalida { .. } => "Corrigir o endereço da câmara",
            Self::NomeRepetido { .. } => "Usar outro nome, ou remover a que já existe",
            Self::Inexistente { .. } => "Ver a lista desta maquina: aegis camera listar",
            Self::DadosDesconhecidos => "Defina AEGIS_DADOS, ou aponte --pasta para a bancada",
            Self::Disco(_) => "Verificar se a pasta de dados é gravável",
        }
    }

    /// 🔴 Todos os motivos, para a referência gerada.
    ///
    /// Sem isto, os códigos da ponte **não entravam** em
    /// `docs/REFERENCIA.md` — que é a lista de tudo o que o produto recusa, e
    /// que uma pessoa abre para perguntar *"o que é que isto recusa, e o que é
    /// que se faz a seguir"*. Cinco recusas do `cameras.txt` estavam fora
    /// dela, e duas das cinco só existiam escritas na casca.
    pub fn todos() -> Vec<(&'static str, String, &'static str)> {
        let amostras = [
            ErroCamera::NomeNaoENome {
                recebido: "rtsp://192.168.0.5/stream".into(),
            },
            ErroCamera::NomeVazio,
            ErroCamera::UrlInvalida {
                recebido: "isto nao e um endereco".into(),
            },
            ErroCamera::NomeRepetido {
                nome: "garagem".into(),
            },
            ErroCamera::Inexistente {
                nome: "garagem".into(),
            },
            ErroCamera::DadosDesconhecidos,
            ErroCamera::Disco("acesso negado".into()),
        ];
        amostras
            .into_iter()
            .map(|a| (a.codigo(), a.humano(), a.gesto()))
            .collect()
    }
}

impl fmt::Display for ErroCamera {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.codigo(), self.humano())
    }
}

impl std::error::Error for ErroCamera {}

/// 🔴 O nome normalizado de uma câmara. **Só** isto é nome de stream.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Nome(String);

impl Nome {
    /// Normaliza e **confirma** que o resultado é um nome.
    ///
    /// A regra é a do C# que a casa mediu (`AegisBridge.Slug`): minúsculas,
    /// fora tudo o que não for `a-z`, `0-9` ou `_`, e sem `_` nas pontas.
    /// Vazio é `camera` — porque o `go2rtc` com nome vazio é pior do que
    /// `go2rtc` com um nome parvo, e um nome parvo ainda se lê.
    pub fn novo(bruto: &str) -> Result<Nome, ErroCamera> {
        let t = bruto.trim();
        if t.is_empty() {
            return Err(ErroCamera::NomeVazio);
        }
        // 🔴 A recusa vem **antes** da normalização, e é ela que impede o
        // desastre medido: um endereço normalizado daria `rtsp_192_168_0_5`,
        // que é um nome *válido* e portanto passaria em todas as validações
        // seguintes — e continuaria a ser uma URL disfarçada de nome.
        if parece_url(t) {
            return Err(ErroCamera::NomeNaoENome {
                recebido: t.to_string(),
            });
        }
        // 🔴 O acento é removido **antes** da normalização, e a tabela é a
        // da casa (`aegis_identity::sem_acento`). A primeira versão só
        // normalizava, e `Portão da Garagem` dava `port_o_da_garagem` — o
        // operador escrevia "Portão" e lia "port_o". A casa já pagou por
        // exactamente isto no pseudónimo: *"o acento era o buraco, e era um
        // buraco de um caractere"*.
        //
        // E os caracteres seguidos **colapsam num só** `_`, como a regra da
        // casa (`[^a-z0-9_]+`): `a//b` dá `a_b` e não `a__b`. A primeira
        // versão fazia um `_` por caractere, e o mesmo nome de câmara com
        // uma barra a mais ficava com **outro** nome — o que faz a câmara que
        // o operador tinha guardado desaparecer da lista. A prova apanhou.
        let mut s = String::new();
        for c in t
            .chars()
            .map(aegis_identity::sem_acento)
            .collect::<String>()
            .to_lowercase()
            .chars()
        {
            let c = if c.is_ascii_alphanumeric() || c == '_' {
                c
            } else {
                '_'
            };
            if c == '_' && s.ends_with('_') {
                continue;
            }
            s.push(c);
        }
        while s.starts_with('_') {
            s.remove(0);
        }
        while s.ends_with('_') {
            s.pop();
        }
        if s.is_empty() {
            s = "camera".to_string();
        }
        if s.len() > 128 {
            s.truncate(128);
            while s.ends_with('_') {
                s.pop();
            }
        }
        Ok(Nome(s))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Nome {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// Um endereço parece uma URL — e portanto **não** pode ser um nome.
///
/// 🔴 A lista é o que **muda de sentido** quando é escapado, e não o que tem
/// pontuação. O dano medido (`&` → `&` → `&` → …) vem de
/// caracteres que o *encoding* reescreve, e cada geração é uma fonte
/// diferente que o `go2rtc` vai tentar abrir.
///
/// Uma `/` a mais e um espaço são **erros de dedo**, não ataques: o operador
/// escreve "entrada//trás" e o produto tem de normalizar para
/// `entrada_tras`. Recusar por excesso treina o operador a escolher nomes
/// esquisitos, e um nome esquisito é um nome que ele não vai escrever.
///
/// E a recusa tem de vir **antes** da normalização: `rtsp_192_168_0_5_stream`
/// é um nome *válido* que passaria em tudo o que vier a seguir — e continua a
/// ser uma URL disfarçada.
/// 🔴 Tem **esquema** — isto é, é um endereço colado, e não um nome
/// esquisito.
fn tem_esquema(t: &str) -> bool {
    t.contains("://")
}

fn parece_url(t: &str) -> bool {
    t.contains("://")
        || t.contains('\\')
        || t.contains('?')
        || t.contains('&')
        || t.contains('=')
        || t.contains('@')
}

/// Uma câmara: **nome** e **endereço**, e a regra é que não se trocam.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Camera {
    pub nome: Nome,
    pub endereco: String,
}

impl Camera {
    /// Aceita o que o operador colou e separa.
    ///
    /// 🔴 O operador cola uma coisa e espera que o produto perceba. Ele
    /// escreve `Nome` numa caixa e o endereço noutra; e cola um endereço
    /// **inteiro** numa caixa de URL. Esta função aceita `nome` e
    /// `endereço` separados, e aceita também o caso em que colaram a coisa
    /// toda num sítio só — porque recusar isso é recusar o utilizador
    /// por um erro de dedo que se desfaz num segundo.
    pub fn nova(nome: &str, endereco: &str) -> Result<Camera, ErroCamera> {
        let e = endereco.trim();
        if e.is_empty() {
            return Err(ErroCamera::UrlInvalida {
                recebido: endereco.to_string(),
            });
        }
        // 🔴 "Perceber a cola" dispara só com um **esquema** (`://`), e não
        // com qualquer caractere de URL. A primeira versão usava a mesma
        // regra da recusa, e um nome escrito `cam?a=1&b=2` era tomado por um
        // endereço: o produto renomeava a câmara para a última coisa do
        // endereço — e o nome que o operador escreveu desaparecia sem dizer
        // nada. Um nome esquisado é recusado **com o motivo**; um endereço
        // colado é percebido. São dois gestos diferentes e precisam de duas
        // regras.
        let (nome, endereco) = if tem_esquema(nome) {
            (partes_do_endereco(e).0, e.to_string())
        } else {
            (nome.to_string(), e.to_string())
        };
        if !parece_url(&endereco) {
            return Err(ErroCamera::UrlInvalida { recebido: endereco });
        }
        Ok(Camera {
            nome: Nome::novo(&nome)?,
            endereco,
        })
    }

    /// 🔴 Os **dois** endereços que o operador usa, derivados do nome.
    ///
    /// A casa mediu que o HLS tem de levar o nome **escapado**:
    /// `&` dentro de um parâmetro de query sem escapar muda o sentido da
    /// linha. `go2rtc` recebe o nome já normalizado, e o que vai na URL é
    /// percent-encoded.
    pub fn links(&self, alvo: &str) -> Links {
        Links {
            rtsp: format!("rtsp://{alvo}:{GO2RTC_RTSP}/{}", self.nome),
            hls: format!(
                "http://{alvo}:{GO2RTC_HTTP}/api/stream.m3u8?src={}",
                self.nome
            ),
            painel: format!("http://{alvo}:{GO2RTC_HTTP}"),
        }
    }
}

/// Os endereços de uma câmara. Campos separados porque **cada um é copiado
/// por um botão diferente**, e um `String` com os três seria três `split` no
/// JavaScript e três lugares para divergir.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Links {
    /// O que o AEGIS consome.
    pub rtsp: String,
    /// O que o navegador toca.
    pub hls: String,
    /// O painel do go2rtc, onde se adicionam e se veem câmaras.
    pub painel: String,
}

/// Tira o esquema e o trailing slash de um endereço, deixando o nome sugerido.
fn partes_do_endereco(endereco: &str) -> (String, String) {
    let sem_esquema = endereco
        .split("://")
        .nth(1)
        .unwrap_or(endereco)
        .trim_end_matches('/');
    let ultimo = sem_esquema.rsplit('/').next().unwrap_or(sem_esquema);
    (ultimo.to_string(), sem_esquema.to_string())
}

/// A lista de câmaras, e o ficheiro onde vive.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Lista {
    cameras: Vec<Camera>,
    pasta: PathBuf,
}

impl Lista {
    /// A lista que vive em `pasta`.
    pub fn em(pasta: impl Into<PathBuf>) -> Lista {
        Lista {
            cameras: Vec::new(),
            pasta: pasta.into(),
        }
    }

    pub fn cameras(&self) -> &[Camera] {
        &self.cameras
    }

    pub fn esta_vazia(&self) -> bool {
        self.cameras.is_empty()
    }

    /// 🔴 Acrescenta, ou **atualiza** a que já existe com o mesmo nome.
    ///
    /// O C# fazia o mesmo (`BridgeAdd`): acrescentar uma câmara cujo nome já
    /// está na lista **muda** o endereço. Duas entradas com o mesmo nome são
    /// duas entradas que o go2rtc não distingue — e o operador fica sem saber
    /// qual das duas está a ser servida.
    pub fn acrescentar(&mut self, camera: Camera) -> Result<(), ErroCamera> {
        match self.cameras.iter_mut().find(|c| c.nome == camera.nome) {
            Some(existente) => *existente = camera,
            None => self.cameras.push(camera),
        }
        Ok(())
    }

    /// 🔴 Tira a câmara pelo nome. Recusa se não havia nenhuma.
    ///
    /// Antes devolvia `bool`, e quem decidia o que fazer com um `false` era a
    /// **casca** — que é como a recusa `ponte.inexistente` nasceu escrita à
    /// mão num `eprintln!`, sem frase e sem gesto. Um `bool` não sabe dizer
    /// *"não há câmara chamada `garagem`"*; um motivo sabe, e sabe o que fazer
    /// a seguir.
    pub fn remover(&mut self, nome: &Nome) -> Result<(), ErroCamera> {
        let antes = self.cameras.len();
        self.cameras.retain(|c| &c.nome != nome);
        if self.cameras.len() == antes {
            return Err(ErroCamera::Inexistente {
                nome: nome.to_string(),
            });
        }
        Ok(())
    }

    /// A linha de `cameras.txt` — `nome|url`, uma por linha.
    pub fn conteudo(&self) -> String {
        let mut s = String::new();
        for c in &self.cameras {
            s.push_str(c.nome.as_str());
            s.push('|');
            s.push_str(&c.endereco);
            s.push('\n');
        }
        s
    }

    /// 🔴 Lê o ficheiro. Uma linha má **não** derruba a lista toda: é
    /// ignorada, e quem chamou diz isso.
    ///
    /// A C# fazia o mesmo. Uma linha estragada
    /// num ficheiro de texto, num produto que o operador edita à mão, é
    /// segura de ignorar — desde que a ignorada seja **dita**.
    pub fn ler(&mut self) -> (usize, Vec<String>) {
        let caminho = self.caminho();
        let (Ok(texto),) = (std::fs::read_to_string(&caminho),) else {
            return (0, Vec::new());
        };
        let (mut boas, mut maus) = (Vec::new(), Vec::new());
        for linha in texto.lines() {
            let t = linha.trim();
            if t.is_empty() || t.starts_with('#') {
                // 🔴 `#` é comentário. A C# contava uma linha sem `|` como
                // lixo e saltava-a sem dizer nada — e um ficheiro que a pessoa
                // edita à mão tem comentários. Ignorar é certo; ignorar
                // **calado** é o que não pode ser.
                continue;
            }
            let Some((nome, endereco)) = t.split_once('|') else {
                maus.push(t.to_string());
                continue;
            };
            match Camera::nova(nome, endereco) {
                Ok(c) => boas.push(c),
                Err(_) => maus.push(t.to_string()),
            }
        }
        self.cameras = boas;
        (self.cameras.len(), maus)
    }

    /// 🔴 Grava por **temporário e cópia**, como o resto do produto.
    ///
    /// Uma lista de câmaras cortada a meio pelo disco cheio deixa a ponte sem
    /// câmaras e sem o ficheiro que as explicava — e a ponte a recuperar é a
    /// pior coisa que pode acontecer a quem está a olhar para as câmaras.
    pub fn gravar(&self) -> Result<(), ErroCamera> {
        let caminho = self.caminho();
        if let Some(pasta) = caminho.parent()
            && !pasta.as_os_str().is_empty()
        {
            std::fs::create_dir_all(pasta)
                .map_err(|e| ErroCamera::Disco(format!("não criei {}: {e}", pasta.display())))?;
        }
        let temporario = caminho.with_extension("txt.novo");
        std::fs::write(&temporario, self.conteudo())
            .map_err(|e| ErroCamera::Disco(format!("não escrevi {}: {e}", temporario.display())))?;
        std::fs::copy(&temporario, &caminho)
            .map_err(|e| ErroCamera::Disco(format!("não gravei {}: {e}", caminho.display())))?;
        let _ = std::fs::remove_file(&temporario);
        Ok(())
    }

    pub fn caminho(&self) -> PathBuf {
        self.pasta.join(FICHEIRO_DAS_CAMERAS)
    }
}

// ===========================================================================
// O go2rtc
// ===========================================================================

/// 🔴 O `go2rtc.yaml` que a casa mediu, escrito de novo.
///
/// A linha que **não** se mexe é a do `h264lr`, e o motivo está no ficheiro
/// de onde vem: o *template* padrão do `go2rtc` (superfast, CRF ilimitado,
/// 1080p30) mediu ~5 Mbps e **deixou cair 17,9 M de pacotes RTP** num link
/// caseiro — o sender descartava 2,4× o que entregava, o upload saturava, o
/// H264 chegava corrompido e o vídeo via-se "travando absurdamente"
/// (12/09/2026). O `h264lr` é 720p15 a 1,2 Mbps CBR: cabe no link com folga
/// e sobra para a contagem, que corre a 8 Hz.
///
/// Um ficheiro de configuração não se reescreve por ser mais bonito: reescreve-se
/// porque alguém **mediu** que a linha anterior não aguentava.
pub fn go2rtc_yaml(cameras: &[Camera]) -> String {
    let mut s = String::new();
    s.push_str("log:\n  level: info\n");
    s.push_str(&format!("api:\n  listen: \":{GO2RTC_HTTP}\"\n"));
    s.push_str(&format!("rtsp:\n  listen: \":{GO2RTC_RTSP}\"\n"));
    s.push_str(&format!("webrtc:\n  listen: \":{GO2RTC_WEBRTC}\"\n"));
    s.push_str(concat!(
        "ffmpeg:\n",
        "  h264lr: \"-codec:v libx264 -r 15 -b:v 1200k -maxrate 1200k -bufsize 2400k ",
        "-g:v 30 -preset:v veryfast -tune:v zerolatency -pix_fmt:v yuv420p ",
        "-profile:v main -level:v 3.1\"\n"
    ));
    if cameras.is_empty() {
        s.push_str("streams: {}\n");
    } else {
        s.push_str("streams:\n");
        for c in cameras {
            s.push_str(&format!("  {}: {}\n", c.nome, c.endereco));
        }
    }
    s
}

/// A barra invertida, por nome. 🔴 Escrever `\` dentro de um literal de
/// caractere Rust, num ficheiro que passa por `sed`, `python` e `git`, e que
/// a casa edita com as tres -- e o resultado é sempre um literal partido.
const REVERSA: char = 92 as char;

/// A porta WebRTC, que o `go2rtc` ouve e a casa não expõe — fica escrita por
/// causa do ficheiro de configuração, e um número solto no meio do código é
/// um número que ninguém sabe porque é aquele.
pub const GO2RTC_WEBRTC: u16 = 8555;

/// 🔴 **Este nome é lixo?**
///
/// É a medição do defeito que a [`Nome`] previne: o `go2rtc` cria um stream
/// com o nome que receber, e um nome que é um endereço cria uma entrada nova
/// a cada pedido. Esta função é o **doutor** da ponte — o que diz "a ponte tem
/// lixo" em vez de o operador o descobrir quando o vídeo começa a arrastar.
///
/// A regra é a da casa, e é a mesma que [`parece_url`]: `://`, `\`, `?` e os
/// esquemas que o `go2rtc` conhece. Um nome que **começa** por `rtsp` não é
/// lixo — `rtsp_entrada` é uma câmara que se chama isso, e apagá-la porque o
/// nome começa por uma letra seria perder a câmara de alguém.
pub fn stream_e_lixo(nome_cru: &str) -> bool {
    if nome_cru.is_empty() {
        return false;
    }
    // 🔴 O nome vem do JSON do `go2rtc`, e o `encoding/json` do Go **escapa**
    // `&`, `<` e `>`: uma geração de lixo aparece como `&` e a seguinte
    // como `\u0026`. É por isso que a desescapagem acontece **antes** do
    // juízo — e é a mesma coisa que fez nascer as ~25 gerações.
    let n = desescapa(nome_cru);
    if n.contains("://") || n.contains(REVERSA) || n.contains('?') {
        return true;
    }
    const ESQUEMAS: [&str; 8] = [
        "ffmpeg:", "onvif:", "rtsp:", "rtsps:", "http:", "https:", "dshow:", "exec:",
    ];
    let l = n.to_lowercase();
    ESQUEMAS.iter().any(|e| l.starts_with(e))
}

/// O `\uXXXX` que o `encoding/json` do Go escreve.
fn desescapa(s: &str) -> String {
    if !s.contains(REVERSA) {
        return s.to_string();
    }
    let mut fora = String::new();
    let mut dentro = false;
    let mut uv: Vec<u32> = Vec::new();
    for c in s.chars() {
        match c {
            c if c == REVERSA && !dentro => dentro = true,
            'u' if dentro => {}
            '0'..='9' | 'a'..='f' | 'A'..='F' if dentro => {
                uv.push(c.to_digit(16).unwrap_or(0));
                if uv.len() == 4 {
                    let ch = char::from_u32(
                        u32::from_str_radix(
                            &uv.iter().map(|d| format!("{d:x}")).collect::<String>(),
                            16,
                        )
                        .unwrap_or(0xFFFD),
                    )
                    .unwrap_or('\u{FFFD}');
                    fora.push(ch);
                    uv.clear();
                    dentro = false;
                }
            }
            _ => {
                if dentro {
                    fora.push(REVERSA);
                    dentro = false;
                }
                fora.push(c);
            }
        }
    }
    if dentro {
        fora.push(REVERSA);
    }
    fora
}

impl Lista {
    /// 🔴 Escreve o `go2rtc.yaml` a partir da lista.
    ///
    /// A lista **é** a configuração: um `cameras.txt` que o `go2rtc` não lê é
    /// uma lista de desejos. E escrevê-lo junto com a lista é o que garante
    /// que os dois nunca divergem — que é o que a casa chamaria "duas
    /// verdadeiras sobre o mesmo facto".
    pub fn gravar_go2rtc(&self) -> Result<(), ErroCamera> {
        let caminho = self.pasta.join(FICHEIRO_GO2RTC);
        if let Some(pasta) = caminho.parent()
            && !pasta.as_os_str().is_empty()
        {
            std::fs::create_dir_all(pasta)
                .map_err(|e| ErroCamera::Disco(format!("não criei {}: {e}", pasta.display())))?;
        }
        let temporario = caminho.with_extension("yaml.novo");
        std::fs::write(&temporario, go2rtc_yaml(&self.cameras))
            .map_err(|e| ErroCamera::Disco(format!("não escrevi {}: {e}", temporario.display())))?;
        std::fs::copy(&temporario, &caminho)
            .map_err(|e| ErroCamera::Disco(format!("não gravei {}: {e}", caminho.display())))?;
        let _ = std::fs::remove_file(&temporario);
        Ok(())
    }
}
