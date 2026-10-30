//! O diagnóstico da máquina: a tabela **Situação · O que foi conferido · O que
//! foi medido · Conserto**.
//!
//! 🔴 Esta peça é a portagem da tela do `aegis-bridge` (`AegisBridgeGui.cs`,
//! aba *Sistema*, grupo *"O que esta máquina precisa (conferência)"*), e a
//! **forma** é a da casa: quatro colunas, um veredicto por linha, e a coluna
//! *Conserto* que **nomeia** uma ação em vez de a executar.
//!
//! O que muda é o **vocabulário**, e tem de mudar: aquele `doctor` media uma
//! máquina de campo com WSL, Podman, Tailscale, go2rtc e câmaras. Este mede
//! uma **ilha**: banco, produto, role de runtime, verificações, licença,
//! interpretador e porta. A forma é a mesma porque a forma é a regra.
//!
//! # As três regras que esta peça carrega da Bridge
//!
//! 1. **A coluna *Conserto* só enche quando a linha falhou E o passo tem
//!    conserto.** Uma linha que passou, ou que falhou sem reparo conhecido, tem
//!    a célula **vazia** — nunca texto, nunca comando.
//! 2. **Não existe "corrigir tudo".** O conserto é o nome de UMA ação, e quem
//!    decide executá-la é o operador. Um botão que faz tudo é um botão que
//!    faz coisas que o operador não pediu.
//! 3. **A tela traduz por CÓDIGO, nunca por texto** — [`Palavras`] é o único
//!    sítio onde se escreve a palavra que o operador lê, e o seu `default` é
//!    pessimista. Um código novo sem palavra sai **"NÃO CONFERIDO"**, que é
//!    laranja, e nunca verde.
//!
//! # E onde esta peça é mais segura do que a de onde veio
//!
//! O conserto da Bridge é um **processo**: `elevar`, `podman.instalar`,
//! `tailscale.subir` — programas executados por `Process.Start`. A regra da
//! casa é que os executáveis fiquem em **literais** e que nenhum texto de
//! manifesto chegue a um `Process::new`.
//!
//! Aqui **não há processo nenhum**. [`Conserto::executar`] é um `match` sobre
//! um enum, e cada ramo chama uma **função da biblioteca**. Não há shell, não
//! há interpretador, não há caminho pelo qual uma string de um ficheiro
//! chegue a um comando. O vocabulário fechado não é uma convenção de
//! segurança: é a **forma** do código.

use aegis_island::{Estado, Prontidao};
use chrono::{DateTime, Utc};
use serde::Serialize;

/// O veredicto de uma linha. **Três**, e não mais — como no motor antigo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Situacao {
    /// Passou.
    Ok,
    /// Não passou, ou falta.
    Falta,
    /// **Não deu para conferir** — e isso nunca é verde.
    ///
    /// 🔴 A casa mediu um `SEM-CHECK` que saía verde, e a frase ficou
    /// "não conferido" com o código de `SEM-CHECK`. Inconclusivo é a terceira
    /// palavra, e é a que impede alguém de ler "passou" onde só se confirmou
    /// que não se pôde confirmar.
    NaoConferido,
}

/// 🔴 O único sítio onde se escreve a palavra que o operador lê.
///
/// Regra da casa: *a tela traduz por `codigo()` e **nunca** por casamento de
/// texto*. Casar dentro da frase quebraria no dia em que a frase fosse
/// reescrita, e passaria a dizer outra coisa que a medição não disse.
impl Situacao {
    /// A palavra. `NaoConferido` **não** devolve "OK" nunca, por omissão.
    pub fn palavra(self) -> &'static str {
        match self {
            Self::Ok => "OK",
            Self::Falta => "EM FALTA",
            Self::NaoConferido => "NÃO CONFERIDO",
        }
    }
}

/// O conserto: o **nome** de uma ação, e nada mais.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Conserto {
    /// Instalar o produto escolhido nesta máquina.
    ProdutoInstalar,
    /// Preparar o role de runtime (criá-lo e-lhe pôr a senha, sem
    /// `BYPASSRLS`).
    RolePreparar,
    /// Escrever o pedido de licença para enviar a quem emite.
    LicencaPedir,
    /// Aplicar a resposta de renovação que veio de quem emite.
    LicencaRenovar,
    /// Instalar a licença apresentada.
    LicencaAtivar,
}

impl Conserto {
    /// O nome, como o operador o lê. É **o** texto que vai para a célula.
    pub fn nome(self) -> &'static str {
        match self {
            Self::ProdutoInstalar => "Instalar o produto",
            Self::RolePreparar => "Preparar o papel de runtime",
            Self::LicencaPedir => "Pedir licença a quem emite",
            Self::LicencaRenovar => "Aplicar a licença nova",
            Self::LicencaAtivar => "Instalar a licença apresentada",
        }
    }

    /// O que o botão de confirmação diz antes de executar.
    ///
    /// 🔴 A confirmação **nomeia a ação**. Um botão que executa sem dizer o
    /// que faz é um botão de que o operador se engana sem querer.
    pub fn descricao(self) -> &'static str {
        match self {
            Self::ProdutoInstalar => "Vai aplicar o produto nesta máquina.",
            Self::RolePreparar => {
                "Vai criar o papel que a ilha usa para servir, sem lhe dar \
                 contorno da RLS."
            }
            Self::LicencaPedir => "Vai escrever o pedido de licença ao lado da que está instalada.",
            Self::LicencaRenovar => "Vai conferir a resposta e gravar a licença que vem dentro.",
            Self::LicencaAtivar => "Vai conferir a cadeia e instalar a licença apresentada.",
        }
    }

    /// **Todos** — para a referência gerada e para a prova de vocabulário.
    pub fn todos() -> Vec<Conserto> {
        use Conserto::*;
        vec![
            ProdutoInstalar,
            RolePreparar,
            LicencaPedir,
            LicencaRenovar,
            LicencaAtivar,
        ]
    }
}

/// Uma linha da conferência.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Linha {
    pub situacao: Situacao,
    /// O que se foi conferir. Frase humana, nunca identificador de código.
    pub conferido: String,
    /// O que foi medido — a frase que a medição traz.
    pub medido: String,
    /// 🔴 [`Conserto::nome`], ou `None` — e `None` **tem de ser a célula
    /// vazia**, nunca um traço e nunca um texto técnico.
    pub conserto: Option<Conserto>,
    /// Se esta linha é exigida. Uma linha opcional que falha é laranja, não
    /// vermelho: reprovar por uma coisa que ninguém pediu é inventar trabalho.
    pub obrigatorio: bool,
    /// O código, para o **log**. A tela não o casa — [`Situacao`] é a
    /// tradução.
    pub codigo: String,
}

impl Linha {
    /// Uma linha que passou.
    pub fn ok(codigo: &str, conferido: &str, medido: impl Into<String>) -> Linha {
        Linha {
            situacao: Situacao::Ok,
            conferido: conferido.to_string(),
            medido: medido.into(),
            conserto: None,
            obrigatorio: true,
            codigo: codigo.to_string(),
        }
    }

    /// Uma linha que **não deu para conferir**. 🔴 Nunca tem conserto: não se
    /// conserta o que não se mediu — conserta-se o que se mediu e deu mal.
    pub fn nao_conferido(codigo: &str, conferido: &str, medido: impl Into<String>) -> Linha {
        Linha {
            situacao: Situacao::NaoConferido,
            conferido: conferido.to_string(),
            medido: medido.into(),
            conserto: None,
            obrigatorio: true,
            codigo: codigo.to_string(),
        }
    }

    /// Uma linha que falta, **com** o conserto que a repara.
    pub fn falta_com(
        codigo: &str,
        conferido: &str,
        medido: impl Into<String>,
        conserto: Conserto,
    ) -> Linha {
        Linha {
            situacao: Situacao::Falta,
            conferido: conferido.to_string(),
            medido: medido.into(),
            conserto: Some(conserto),
            obrigatorio: true,
            codigo: codigo.to_string(),
        }
    }

    /// Uma linha que falta, **sem** conserto conhecido.
    ///
    /// 🔴 A célula fica vazia. Um produto que não sabe reparar não escreve
    /// "não há reparo" — escreve nada, e o operador vê que é preciso ajuda.
    pub fn falta(codigo: &str, conferido: &str, medido: impl Into<String>) -> Linha {
        Linha {
            situacao: Situacao::Falta,
            conferido: conferido.to_string(),
            medido: medido.into(),
            conserto: None,
            obrigatorio: true,
            codigo: codigo.to_string(),
        }
    }

    /// A linha como a célula *Conserto* a mostra: o nome, ou nada.
    ///
    /// 🔴 A predicado é o da Bridge escrito à mão, e é o que garante que a
    /// coluna não vira um segundo lugar de comandos: **só há conserto quando
    /// a linha não passou**. Uma linha que passou com conserto é uma linha que
    /// está a pedir para mexer em algo que já está bem.
    pub fn conserto_visivel(&self) -> Option<Conserto> {
        match self.situacao {
            Situacao::Falta => self.conserto,
            _ => None,
        }
    }
}

/// A conferência inteira, mais o veredicto.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Diagnostico {
    /// Uma linha por item conferido.
    pub linhas: Vec<Linha>,
    /// O veredicto em **palavras**, montado aqui e não na tela.
    pub veredicto: String,
    /// A idade do veredicto, em segundos. Uma conferência velha é declarada
    /// velha.
    pub ha_segundos: Option<u64>,
    /// Quando foi medido.
    pub medido_em: Option<DateTime<Utc>>,
}

impl Diagnostico {
    /// A linha que tem o conserto, se alguma. É a que o botão *Consertar*
    /// liga — e **só uma de cada vez**.
    pub fn conserto_selecionavel(&self) -> Option<Conserto> {
        self.linhas.iter().find_map(|l| l.conserto_visivel())
    }

    /// Quantas linhas faltam. É o que o veredicto diz.
    pub fn faltam(&self) -> usize {
        self.linhas
            .iter()
            .filter(|l| l.situacao == Situacao::Falta)
            .count()
    }
}

/// O veredicto, montado **aqui**.
pub fn veredicto(d: &Diagnostico) -> String {
    let faltam = d.faltam();
    let nao_conf = d
        .linhas
        .iter()
        .filter(|l| l.situacao == Situacao::NaoConferido)
        .count();
    match (faltam, nao_conf) {
        (0, 0) => "Esta máquina tem tudo o que a ilha precisa.".to_string(),
        (0, n) => format!(
            "Nada falta, mas {n} verificação(ões) não deu para conferir. \
             Inconclusivo não é passar."
        ),
        (f, 0) => format!("Falta {f} coisa(s) para esta máquina ter a ilha."),
        (f, n) => format!("Falta {f} coisa(s) e {n} verificação(ões) não deu para conferir."),
    }
}

/// 🔴 O veredicto de **prontidão** em palavras de licence.
///
/// A Chain de códigos é a da casa, e o `default` é deliberadamente
/// **pessimista**: um código que ninguém conhece dá *"não conferida"* e
/// laranja, nunca verde. A licença é a primeira coisa que o técnico e o
/// cliente precisam de ver, e uma faixa verde que ninguém sabe porque está
/// verde é a pior coisa que se pode mostrar.
pub fn palavra_da_licenca(codigo: &str) -> &'static str {
    match codigo {
        "ok" => "Licença: ativa",
        "sem-licenca" => "Licença: não instalada",
        "sem-raiz" => "Licença: não conferida",
        "recusada" => "Licença: recusada",
        "ilegivel" => "Licença: arquivo danificado",
        "sem-fingerprint" => "Licença: de outro PC",
        "vencida" => "Licença: vencida",
        _ => "Licença: não conferida",
    }
}

/// Constrói a linha de uma verificação do produto.
///
/// 🔴 Uma verificação **opcional** que falha é `NaoConferido`, nunca `Falta`:
/// reprovar por uma coisa que ninguém pediu é inventar trabalho, e a casa
/// mediu essa confusão quando uma lista de opcionaisaparece na tela sem dizer
/// que não travava nada.
pub fn linha_de_verificacao(
    nome: &str,
    estado: Estado,
    detalhe: Option<&str>,
    obrigatorio: bool,
    codigo: &str,
) -> Linha {
    let medido = detalhe.unwrap_or("").trim();
    let conferido = nome.trim_start_matches('@').to_string();
    match (estado, obrigatorio) {
        (Estado::Ok, _) => Linha::ok(codigo, &conferido, pick(medido, "passou")),
        (Estado::Falhou, true) => Linha::falta(codigo, &conferido, pick(medido, "não passou")),
        (Estado::Falhou, false) => Linha {
            situacao: Situacao::NaoConferido,
            conferido,
            medido: pick(medido, "falhou, e é opcional"),
            conserto: None,
            obrigatorio: false,
            codigo: codigo.to_string(),
        },
        (Estado::Inconclusivo, _) => Linha {
            situacao: Situacao::NaoConferido,
            conferido,
            medido: pick(medido, "não deu para conferir"),
            conserto: None,
            obrigatorio,
            codigo: codigo.to_string(),
        },
    }
}

fn pick(detalhe: &str, quando_vazio: &str) -> String {
    if detalhe.is_empty() {
        quando_vazio.to_string()
    } else {
        detalhe.to_string()
    }
}

/// 🔴 O que se sabe do `sh` que corre as verificações do produto.
///
/// O enum em vez de `Option<&str>` porque a casa mediu que **`None` é
/// ambíguo**: a mesma linha pode querer dizer *"não há `sh`"* (um defeito
/// medido) ou *"perguntei a quem não pode responder"* (nada medido), e as duas
/// produzem frases opostas na tela. Com `None` a conferência dizia *"não há
/// `sh` nesta máquina"* a um operador que estava a ver a **ilha** — e ele ia
/// instalar um interpretador para resolver um problema que não tinha.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Interpretador {
    /// Está lá, e a casa diz onde.
    Apresente(String),
    /// Não há `sh` nesta máquina. **Defeito medido.**
    Ausente,
    /// 🔴 Quem perguntou está **de fora** da máquina — é o caso da face
    /// agêntica, que fala com a ilha por HTTP. Não medido, e por isso
    /// `NaoConferido`: inconclusivo nunca é verde.
    NaoObservado,
}

/// A conferência a partir da prontidão e do que a biblioteca sabe da máquina.
///
/// 🔴 Os itens que dependem do **ambiente** (o interpretador) e os que
/// dependem da **licença** entram aqui pelo `Contexto`, e não são medidos
/// dentro desta função: quem os mede é quem tem o dado, e esta função só o
/// **organiza**. Uma função que mede tudo é uma função que sabe demais.
///
/// # 🔴 A que mede a ILHA, e o interpretador não se vê daqui
///
/// Esta função vinha com o `#[expect(dead_code)]` do port do Bridge, e o
/// `expect` — ao contrário do `allow` — **parte a build no dia em que alguém o
/// usar**. O dia em que alguém o usa é o D5, e ele é a ferramenta
/// `diagnostico` da face agêntica, que corre na máquina do integrador e fala
/// com a ilha por HTTP.
///
/// 🔴 **O que muda ao mudar de sítio, e não é pouco:** quem liga a conferência
/// é um processo que **não está dentro da ilha**, e por isso não tem `sh`
/// para medir. A primeira versão passava `interpretador: None`, que produz
/// `Linha::falta("não há `sh` nesta máquina")` — uma linha a **declarar um
/// defeito que ninguém mediu**, e a ser mostrada a um operador que ia passar
/// a instalar um interpretador numa máquina onde o problema é outro.
///
/// Por isso o `interpretador` deixou de ser `Option<&str>` e passou a ser um
/// enum com o **três** estados, e o terceiro é o que o D5 usa:
///
/// | caso | linha | quem produz |
/// |---|---|---|
/// | [`Interpretador::Apresente`] | `Ok` | quem está **dentro** da máquina |
/// | [`Interpretador::Ausente`] | `Falta` | quem está **dentro** da máquina |
/// | [`Interpretador::NaoObservado`] | `NaoConferido` | quem está **de fora** — a face agêntica |
///
/// 🔴 E a regra de cima aplicada a este caso: **inconclusivo nunca é verde**.
pub fn a_partir_de(
    prontidao: Option<&Prontidao>,
    banco_responde: bool,
    tenant_ativo: bool,
    seed_no_banco: i32,
    seed_esperado: i32,
    interpretador: Interpretador,
    licenca: Licenca,
) -> Diagnostico {
    let mut linhas = Vec::new();

    // 🔴 O banco é o **único** item que depende de `prontidao`, e por isso é
    // o único que se pode medir sem ela. A primeira versão da face agêntica
    // passava `banco_responde: false` quando não houve `Prontidao` nenhuma — e
    // a linha saía `FALTA`, a dizer *"o banco não responde"*.
    //
    // 🔴 **Isso é a mentira que a casa mediu duas vezes.** A ilha estava
    // simplesmente inacessível, o que é *"não deu para conferir"*, e a linha
    // vermelha mandava o operador à procura de um Postgres que ninguém mediu.
    // O sintoma disto é o pior de todos: um diagnóstico **vermelho** que
    // aponta para a coisa errada, e aponta com a confiança de quem mediu.
    //
    // 🔴 E é por isso que a regra é: **sem `Prontidao` não há medição nenhuma.**
    // A mesma regra que vale para o interpretador — quem não olha não mede, e
    // quem não mede não diz "falta".
    linhas.push(match (prontidao, banco_responde) {
        (None, _) => Linha::nao_conferido(
            "diag.banco",
            "O banco de dados",
            "não deu para conferir: ninguém perguntou à ilha",
        ),
        // 🔴 Sem conserto, e é de propósito: o produto não sabe ligar um
        // Postgres. Escrever um conserto aqui seria um botão que não faz
        // nada, e a casa pagou por isso ("ver a verificação que falhou", com
        // a verificação fora do ecrã).
        (Some(_), false) => Linha::falta("diag.banco", "O banco de dados", "não responde"),
        (Some(_), true) => Linha::ok("diag.banco", "O banco de dados", "responde"),
    });

    linhas.push(match &prontidao {
        None => Linha::nao_conferido(
            "diag.produto",
            "O produto instalado",
            "ainda não conferido nesta máquina",
        ),
        Some(p) if p.pronto => Linha::ok(
            "diag.produto",
            "O produto instalado",
            format!("pronto, conteúdo na versão {seed_esperado}"),
        ),
        Some(p) => {
            let frase = p.o_que_dizer.clone().unwrap_or_default();
            if tenant_ativo && seed_no_banco == seed_esperado {
                Linha::falta_com(
                    "diag.produto",
                    "O produto instalado",
                    pick(&frase, "as verificações do produto não passaram"),
                    Conserto::ProdutoInstalar,
                )
            } else {
                Linha::falta(
                    "diag.produto",
                    "O produto instalado",
                    pick(&frase, "não está pronto"),
                )
            }
        }
    });

    linhas.push(match &licenca {
        Licenca::Vigente { expira, parceiro } => Linha::ok(
            "diag.licenca",
            "A licença desta máquina",
            format!("{parceiro}, vale até {}", expira.as_str()),
        ),
        Licenca::Vencida => Linha::falta_com(
            "diag.licenca",
            "A licença desta máquina",
            "venceu",
            Conserto::LicencaPedir,
        ),
        Licenca::NaoInstalada => Linha::falta_com(
            "diag.licenca",
            "A licença desta máquina",
            "não está instalada",
            Conserto::LicencaPedir,
        ),
        Licenca::Recusada { codigo, frase } => Linha::falta_com(
            "diag.licenca",
            "A licença desta máquina",
            frase.clone(),
            if codigo == "licenca.expirada" {
                Conserto::LicencaPedir
            } else {
                Conserto::LicencaAtivar
            },
        ),
        Licenca::NaoConferida => Linha::nao_conferido(
            "diag.licenca",
            "A licença desta máquina",
            "não deu para conferir",
        ),
    });

    // O interpretador: sem ele, as verificações de script não correm, e
    // inconclusivo em massa é pior do que uma linha vermelha.
    //
    // 🔴 E o terceiro caso é o que o D5 usa. Quem pergunta **de fora** não
    // pode ver o `sh` da ilha, e dizer "não há `sh`" seria medir mal: a linha
    // ficaria vermelha, o veredicto contaria um conserto que não existe, e o
    // operador ia instalar um interpretador para um problema que não é dele.
    linhas.push(match interpretador {
        Interpretador::Apresente(p) => {
            Linha::ok("diag.interpretador", "O interpretador das verificações", p)
        }
        Interpretador::Ausente => Linha::falta(
            "diag.interpretador",
            "O interpretador das verificações",
            "não há `sh` nesta máquina",
        ),
        // 🔴 **Nunca vermelho e nunca verde.** O `codigo` diz
        // `nao-conferido` e o conserto fica vazio: não se conserta o que não
        // se mediu, e esta linha só existe para o operador saber que aqui
        // ninguém olhou.
        Interpretador::NaoObservado => Linha::nao_conferido(
            "diag.interpretador",
            "O interpretador das verificações",
            "conferido de dentro da ilha, não daqui",
        ),
    });

    // As verificações do produto, uma linha cada. A primeira que reprova é a
    // que o operador vê, e as outras continuam a dizer o que dizem.
    if let Some(p) = prontidao {
        for c in &p.saude {
            linhas.push(linha_de_verificacao(
                &c.nome,
                c.estado,
                c.detalhe.as_deref(),
                true,
                &format!("saude.{}", c.estado.codigo().replace("saude.", "")),
            ));
        }
        for c in &p.saude_opcional {
            linhas.push(linha_de_verificacao(
                &c.nome,
                c.estado,
                c.detalhe.as_deref(),
                false,
                "saude.opcional",
            ));
        }
    }

    let d = Diagnostico {
        veredicto: String::new(),
        linhas,
        ha_segundos: prontidao.and_then(|p| p.saude_ha),
        medido_em: None,
    };
    let mut d = d;
    d.veredicto = veredicto(&d);
    d
}

/// O que se sabe da licença desta máquina.
///
/// 🔴 É um **enum**, e não uma `String`. O ecrã não decide o que fazer com uma
/// licença: recebe o motivo, e o motivo é um dos casos. Um `String` seria um
/// `if` no JavaScript, e o `if` no JavaScript é onde as traduções divergem.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "estado", rename_all = "kebab-case")]
pub enum Licenca {
    #[serde(rename = "vigente")]
    Vigente {
        #[serde(rename = "expira")]
        expira: String,
        #[serde(rename = "parceiro")]
        parceiro: String,
    },
    #[serde(rename = "vencida")]
    Vencida,
    #[serde(rename = "nao-instalada")]
    NaoInstalada,
    #[serde(rename = "recusada")]
    Recusada { codigo: String, frase: String },
    #[serde(rename = "nao-conferida")]
    NaoConferida,
}
