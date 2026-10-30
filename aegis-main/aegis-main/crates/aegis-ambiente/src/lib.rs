//! **aegis-ambiente** — o ambiente do produto, lido **num sítio só**.
//!
//! Crate **folha**: não depende de nada, e nada depende dele por conveniência.
//! Existe porque quem lê o ambiente é `aegis-store` (o banco), `aegis-island`
//! (o interpretador) e `aegis-produto` (a raiz do vendor) — e nenhum deles
//! pode depender de outro. Um lugar comum que três precisam só pode ser uma
//! folha.
//!
//! 🔴 A regra da casa é *"um vocabulário de config: um lugar para ler backend,
//! licença e vertical; nenhum segundo interpretador"*. E medido antes de
//! existir: as variáveis eram lidas em **cinco sítios** por **quatro crates**,
//! e `AEGIS_RAIZ_VENDOR` era lida em **dois** — o que é uma segunda
//! implementação da regra da raiz do vendor, que é a regra que mais dói quando
//! está errada.
//!
//! Isto é aquele lugar. Nenhum outro módulo lê `AEGIS_*` — e a guarda
//! `nenhuma_variavel_de_ambiente_e_lida_fora_do_ambiente` diz isso, porque uma
//! regra que é só um `mod` e um comentário não sobrevive à pressa.
//!
//! # Porque uma função por variável, e não um `HashMap`
//!
//! Um `HashMap<String, String>` lido de uma vez parece mais simples, e é a
//! forma que produz a segunda interpretação: o chamador sabe o **nome** da
//! variável em vez de pedir o **significado**, e dois pontos passam a poder
//! ler a mesma coisa com nomes diferentes. Uma função por variable devolve
//! um tipo, e o tipo é o que impede `AEGIS_BANCO` de virar uma `Option<String>`
//! que alguém abre com `unwrap_or_default()`.
//!
//! # E o `.env`
//!
//! 🔴 Este módulo **não lê ficheiro nenhum**. Uma ilha offline tem de ter o
//! ambiente no **processo** — e um ficheiro de configuração é estado que
//! precisa de um caminho, de um formato e de uma versão. A variável de
//! ambiente não tem nenhum dos três. (O `.env` do **frontend** é outra
//! conversa e vive em `apps/web/`, porque o Next precisa dele para o
//! `NEXT_PUBLIC_*`.)

use std::path::PathBuf;

/// A URL do Postgres do **dono** — a que migra e a que cria o role de
/// runtime.
///
/// 🔴 Esta função **não** serve para a aplicação. Serve para
/// [`banco_da_aplicacao`], que é outra, e a separação não é de estilo: usar
/// esta na aplicação faz a ilha ligar com o dono, e o dono é superuser, e
/// superuser tem `BYPASSRLS` — ou seja, a RLS é lida e não é aplicada. Foi
/// exactamente o que aconteceu quando `url_do_app` passou a chamar esta
/// função, e o que a checagem `@isolamento` apanhou.
pub fn banco() -> Option<String> {
    ler("AEGIS_BANCO")
}

/// A URL do Postgres da **aplicação** — a que a ilha serve.
///
/// 🔴 Só `AEGIS_BANCO_APP`, e **nunca** `AEGIS_BANCO`. A desculpa natural
/// ("se não vier nada, usa a do dono") é a que desligou o isolamento: a
/// aplicação passou a ligar com `aegis`, que é superuser, e `@isolamento`
/// viu dez linhas sem contexto de tenant. Um default que devolve o dono é
/// um default que devolve quem não tem RLS.
pub fn banco_da_aplicacao() -> Option<String> {
    ler("AEGIS_BANCO_APP")
}

/// O endereço da **ilha** — a que a face agêntica fala.
///
/// 🔴 É a **primeira** variável deste ficheiro que aponta para um serviço
/// remoto, e por isso a regra é a mesma das outras: uma função por variável,
/// o significado em vez do nome, e ninguém a ler fora daqui. A guarda
/// `nenhuma_variavel_de_ambiente_e_lida_fora_do_ambiente` é o que impede que
/// uma segunda leitora apareça — e foi ela que já apanhou `AEGIS_RAIZ_VENDOR`
/// lida em dois sítios.
///
/// 🔴 Sem valor, **não há default**. Uma face que fala para `localhost:8020`
/// por omissão acerta em máquinas de bancada e erra em todas as outras, e o
/// sintoma — *"o agente falou com a ilha errada"* — não aponta para a causa.
/// Quem pede a ilha sem a ter diz isso.
pub fn ilha_url() -> Option<String> {
    ler("AEGIS_ILHA_URL")
}

/// O token que a ilha pede, quando pede um.
///
/// 🔴 A ilha **não** tem sessão: é um serviço de rede no tailnet, e o par
/// atrás dele é o do produto. A `aegis-desktop` já fazia isto pelo trilho
/// `/api/v1/edge` (pareamento, depois `edge_token` em `config.json`) — e a
/// **mesma** cadeia, com a **mesma** licença, foi a que o gate do `mcp`
/// conferiu no arranque. Uma token da ilha que não é a licença é um caminho
/// que não passa pelo portão; esta passa.
pub fn token_da_ilha() -> Option<String> {
    ler("AEGIS_ILHA_TOKEN")
}

/// A raiz do vendor, em base64url.
///
/// 🔴 Vem do ambiente ou do binário compilado — **nunca** do ficheiro de
/// licença. Uma raiz que o documento diga qual é não é uma raiz: é uma opinião,
/// e a casa já pagou por essa leitura errada com um verificador que recusava a
/// Chave OEM legítima por esperar a assinatura da Safe Core numa licença que o
/// *parceiro* tinha assinado de propósito.
pub fn raiz_do_vendor() -> Option<String> {
    ler("AEGIS_RAIZ_VENDOR")
}

/// O interpretador das verificações de saúde.
///
/// 🔴 `AEGIS_SH` é uma **válvula**: se está posta, é a resposta — e um
/// `AEGIS_SH` que aponta para um ficheiro que não existe dá `None`, sem
/// cair no `sh` do sistema. É o que o teste `o_interpretador_respeita_a_
/// válvula_de_bancada` exige, e o motivo está na doc dele: o `which("bash")`
/// no Windows acha o lançador do WSL e não um shell POSIX, e um teste que
/// corre no shell errado **passa a verde sem correr nada**.
///
/// A primeira versão desta função devolvia o `AEGIS_SH` sem conferir o
/// ficheiro, e o `aegis-island` caía no `sh` quando ele não existia — que é
/// exactamente o retrocesso que a válvula existe para impedir. A regra fica
/// aqui, inteira, e o `aegis-island` limita-se a perguntar.
///
/// Sem esta ordem, uma ilha em Windows não corre uma única verificação e o
/// `/health/ready` devolve "pronto" sem ter medido nada.
pub fn interpretador() -> Option<PathBuf> {
    if let Some(v) = ler("AEGIS_SH") {
        let p = PathBuf::from(v);
        return p.is_file().then_some(p);
    }
    // 🔴 O caminho **completo**, e não o nome. A primeira versão devolvia
    // `PathBuf::from("sh")` depois de confirmar que existia no PATH — e
    // devolvia o nome, que `Command` resolve e `Path::is_file` nao. O
    // contrato desta funcao e "um caminho que existe", porque quem a chama
    // mostra-o ao operador e o passa a um `Command`; um caminho que o
    // operador nao consegue abrir e um caminho que nao e caminho.
    if let Some(c) = which("sh") {
        return Some(c);
    }
    if cfg!(windows) {
        for candidato in [
            r"C:\Program Files\Git\bin\bash.exe",
            r"C:\Program Files\Git\usr\bin\bash.exe",
        ] {
            let p = PathBuf::from(candidato);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

/// O identificador estável da máquina, quando ninguém o diz.
///
/// `COMPUTERNAME` no Windows, `HOSTNAME` nos outros, e `"desconhecida"` quando
/// nem um existe — que é um fingerprint que **ninguém** tem licença para, e é
/// por isso que é aceitável: o pior caso é uma recusa, não uma licença errada.
pub fn machine_id() -> String {
    ler("COMPUTERNAME")
        .or_else(|| ler("HOSTNAME"))
        .unwrap_or_else(|| "desconhecida".to_string())
}

fn ler(nome: &str) -> Option<String> {
    match std::env::var(nome) {
        Ok(v) if !v.trim().is_empty() => Some(v.trim().to_string()),
        _ => None,
    }
}

/// O caminho **completo** de um executável, ou `None`.
///
/// 🔴 Devolve o caminho e não um booleano, pela mesma razão de cima: quem
/// pede "existe?" precisa logo de saber *onde*. E o `PATH` é lido pelo
/// `ambiente`, e não por um `std::env::var` próprio — que seria a segunda
/// leitura do mesmo sítio.
fn which(nome: &str) -> Option<PathBuf> {
    let alvo = std::path::Path::new(nome);
    if alvo.is_absolute() {
        return alvo.is_file().then(|| alvo.to_path_buf());
    }
    let path = ler("PATH")?;
    #[cfg(windows)]
    let separador = ';';
    #[cfg(not(windows))]
    let separador = ':';
    path.split(separador)
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .map(|d| std::path::Path::new(d).join(nome))
        .find(|c| c.is_file())
}

/// 🔴 A pasta onde esta máquina guarda o que **tem de sobreviver a um
/// reinício**: a lista de câmaras, a licença instalada, o pedido pendente.
///
/// Antes disto cada gesto escolhia o seu sítio — e foi assim que a mesma
/// licença foi lida de dois sítios diferentes, que é a forma mais barata de
/// um ficheiro de segredo acabar num dump. Uma pasta, e o que é secreto
/// **nunca** é lido de uma que o operador possa apontar com `--pasta`.
pub fn pasta_de_dados() -> Option<PathBuf> {
    if let Some(v) = ler("AEGIS_DADOS") {
        return Some(PathBuf::from(v));
    }
    #[cfg(windows)]
    {
        let base = std::env::var("ProgramData").ok()?;
        Some(PathBuf::from(base).join("AEGIS"))
    }
    #[cfg(not(windows))]
    {
        Some(PathBuf::from("/var/lib/aegis"))
    }
}
