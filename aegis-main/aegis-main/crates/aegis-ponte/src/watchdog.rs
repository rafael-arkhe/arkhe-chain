//! A decisão do watchdog: **pura**, e por isso provável.
//!
//! 🔴 O watchdog da `aegis-bridge` (C#) é a peça mais cara que a casa teve
//! no campo, e quase nada do que ela faz é o que parece. O que parece é
//! *"reiniciar o servidor quando as câmaras caem"*. O que é: **decidir, com
//! cuidado, quando NÃO se deve reiniciar**.
//!
//! # As três confusões que ela pagou
//!
//! 1. **Fonte morta não é servidor zumbi.** O `404` de "câmera sem fonte" é
//!    idêntico ao `404` de um servidor zumbi. Sem separar os dois, o watchdog
//!    **matava o `go2rtc` a cada 6 minutos, para sempre** — e a ponte ficava
//!    morta. A cura que teve de ser escrita: contar as câmaras cuja **fonte**
//!    está fora do ar, e não reiniciar por causa disso.
//!
//! 2. **Uma cura por episódio.** Depois de reiniciar e continuar sem
//!    servir, reiniciar de novo não conserta nada — a **fonte** é que está
//!    sem sinal. Da segunda vez, o watchdog avisa e **para**.
//!
//! 3. 🔴 **O marcador vai ANTES de tudo o que pode falhar.** Medido a
//!    14/09/2026: sem elevação, o `cameras.txt` em `ProgramData` **recusa**
//!    escrita, e a gravação levantava `UnauthorizedAccessException` — depois
//!    de matar o `go2rtc` e antes de o subir. O processo morria ali: a ponte
//!    ficava morta, o contador subia (6, 7, 8…) e o *kill* repetia-se a cada
//!    2 minutos, para sempre. Com o marcador posto primeiro, uma falha
//!    ali não transforma *"tentar curar"* em *"matar"*.
//!
//! # Porque isto é uma função e não um `if` dentro de um laço
//!
//! A decisão tem **cinco** saídas e depende de três factos. Dentro de um
//! laço, cada caminho novo é um caminho que ninguém prova, e o C# provou-o
//! **no cliente** — que é a forma mais cara de provar uma decisão. Aqui a
//! decisão é uma função, e a prova é uma tabela.
//!
//! # O que este ficheiro **não** é
//!
//! 🔴 **Isto decide; não executa.** O `kill`, o `sleep` e o arranque do
//! `go2rtc` estão **fora** deste ficheiro de propósito, e a razão está
//! escrita em [`ordenar_o_reparo`]: uma função que mata um processo não se
//! prova, e uma função que **diz** o que se deve fazer prova-se com uma
//! tabela. A canelização é o mesmo em qualquer sistema e não tem regra.
//!
//! 🔴 E portanto: **nada aqui toca em disco, em rede ou em processo.** Um
//! ficheiro que decide e não executa é um ficheito que se pode provar inteiro
//! num `cargo test`, e foi aractamente por isso que a decisão ficou separada
//! do resto. A prova é `tests/watchdog.rs`.

/// O que o watchdog viu nesta ronda.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Ronda {
    /// Câmaras que o servidor RTSP está a servir (`200`).
    pub a_servir: usize,
    /// Total de câmaras na lista.
    pub total: usize,
    /// 🔴 Câmaras cuja **fonte** não responde. Estas são a distinção que
    /// separa "o servidor caiu" de "a câmara está desligada".
    pub fonte_fora: usize,
    /// Já se reiniciou **nesta** queda?
    pub ja_curou: bool,
    /// Rodadas seguidas sem nenhuma câmara a servir.
    pub falhas: u32,
}

/// 🔴 Quantas rondas sem serviço antes de considerar o servidor um zumbi.
///
/// Três, e não uma: uma ronda é uma medição, e uma medição é uma hipótese.
impl Ronda {
    /// O limite, e **porquê está aqui** e não na chamada.
    pub const LIMIAR_DE_ZUMBI: u32 = 3;
}

/// O que o watchdog faz a seguir.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decisao {
    /// Nada a fazer: está a servir.
    NaoFazNada,
    /// Estava a servir outra vez: o episódio acabou e a cura volta a valer.
    EncerrarEpisodio,
    /// Há câmaras cuja fonte está fora do ar. **Não** é o servidor.
    ///
    /// 🔴 Esta é a decisão que custou a ponte. Sem ela, um `404` de uma
    /// câmara desligada matava o `go2rtc` a cada 6 minutos.
    FonteFora { fora: usize, total: usize },
    /// Já curou nesta queda e continua sem servir: **para**.
    ///
    /// Reiniciar outra vez não conserta nada — a fonte é que está sem sinal —
    /// e continuar a reiniciar é a forma de transformar uma câmara desligada
    /// numa ponte morta.
    PararDeReparar { total: usize },
    /// Contou mais uma falha.
    Contar { falhas: u32 },
    /// O servidor é um zumbi: **marca antes de tudo**, e só depois reinicia.
    Reparar { falhas: u32 },
}

/// A decisão, com a **ordem** que a casa mediu.
///
/// 🔴 A ordem não é cosmética. "Serviu alguma" vem **primeiro**, e
/// "a fonte está fora" vem **antes** de contar falha — porque a fonte fora é
/// a explicação, e uma explicação correcta não pode ser contada como se fosse
/// um sintoma.
pub fn decidir(r: Ronda) -> Decisao {
    // 1. Está a servir? Então acabou, seja o que for.
    if r.a_servir > 0 {
        return if r.ja_curou {
            Decisao::EncerrarEpisodio
        } else {
            Decisao::NaoFazNada
        };
    }

    // 2. 🔴 Nenhuma serve, mas há fonte fora do ar. A CÂMARA é que está
    //    desligada, e o servidor está de pé a dizer que não a encontra.
    //    Reiniciar aqui era o que matava a ponte.
    if r.fonte_fora > 0 {
        return Decisao::FonteFora {
            fora: r.fonte_fora,
            total: r.total,
        };
    }

    // 3. Nenhuma serve, nenhuma fonte está fora — e já se curou. A resposta
    //    é **parar**: o que falta não é ao servidor.
    if r.ja_curou {
        return Decisao::PararDeReparar { total: r.total };
    }

    // 4. Conta. E o zumbi é a **terceira** ronda sem serviço, com a fonte
    //    de todas acessível — que é a única situação em que reiniciar
    //    alguma coisa ajuda.
    //
    //    🔴 `r.falhas` é o que **já se viu**; esta ronda conta uma a mais. E
    //    a comparação é `>=` e não `==`: com `==`, uma ponte que fica uma
    //    noite inteira sem serviço passa ao lado do limiar em silêncio e
    //    conta para sempre. É a mesma família de defeito do `ponte.dados` a
    //    devolver `1` em vez de `3` — a decisão certa, tomada no sítio
    //    errado, e nenhum teste a apanha porque o caso óbvio é o `3` exato.
    let falhas = r.falhas + 1;
    if falhas >= Ronda::LIMIAR_DE_ZUMBI {
        Decisao::Reparar { falhas }
    } else {
        Decisao::Contar { falhas }
    }
}

/// O que o watchdog **diz** ao operador, por decisão.
///
/// 🔴 E o texto diz **porque**. Um watchdog que avisa *"parei"* sem dizer
/// *"a fonte é que está sem sinal"* obriga o operador a adivinhar, e um
/// operador a adivinhar reinicia a máquina — que é o sintoma que o watchdog
/// existe para evitar.
pub fn frase(d: &Decisao) -> String {
    match d {
        Decisao::NaoFazNada => "a ponte está a servir".to_string(),
        Decisao::EncerrarEpisodio => {
            "câmara a servir outra vez — o episódio acabou e a cura volta a valer".to_string()
        }
        Decisao::FonteFora { fora, total } => format!(
            "{fora} de {total} câmara(s) com a FONTE fora do ar — não é o servidor, \
             por isso a ponte não se mexe. Confira a câmara, a rede e a ponte dela."
        ),
        Decisao::PararDeReparar { total } => format!(
            "nenhuma das {total} câmaras serve **depois** da cura — por isso paro \
             de reiniciar. A fonte é que está sem sinal: confira a câmara, o USB e \
             a ponte dela."
        ),
        Decisao::Contar { falhas } => {
            format!(
                "nenhuma câmara a servir ({falhas} de {})",
                Ronda::LIMIAR_DE_ZUMBI
            )
        }
        Decisao::Reparar { falhas } => format!(
            "servidor RTSP zumbi ({falhas} rondas sem nenhuma câmara a servir, com \
             a fonte de todas acessível) — vou reiniciar o `go2rtc` **uma vez**."
        ),
    }
}

/// 🔴 A ordem dentro de [`executar_reparacao`] é a lição de 14/09/2026.
///
/// Marker **antes** de tudo o que pode falhar, e a configuração é
/// **acessório**: falhar em gravar a config não pode deixar a máquina sem
/// ponte. A gravação vinha depois do *kill* e antes do arranque; sem elevação
/// o `ProgramData` recusava, a exceção matava o processo, e o *kill*
/// repetia-se a cada 2 minutos para sempre.
///
/// O que fica para o lado de fora desta função, **de propósito**: o `kill`, o
/// `sleep` e o arranque. São canelização — o mesmo em qualquer sistema — e a
/// decisão é o que tem regra. Uma função que mata um processo é uma função
/// que não se prova; uma função que **diz** o que se deve fazer prova-se
/// com uma tabela.
pub fn ordenar_o_reparo() -> &'static [&'static str] {
    &[
        "marcar que já curou (ANTES de tudo)",
        "matar o `go2rtc` (se estiver de pé)",
        "esperar, para a porta do RTSP se libertar",
        "gravar a configuração (acessório: a falha aqui não pode impedir o arranque)",
        "subir o `go2rtc`",
        "esperar, e marcar de novo com o PID do servidor NOVO",
    ]
}
