//! **aegis** — a casca.
//!
//! 🔴 Este ficheiro **não decide nada**. Cada comando chama
//! [`aegis_produto`], recebe um `Resultado` e imprime-o. O código de saída vem
//! de [`aegis_produto::Resultado::saida`], que é a **única** função do
//! produto que decide um número.
//!
//! É essa separação que faz "um produto, duas faces" ser verdade: a janela que
//! o tijolo 4 vai construir chama as mesmas funções e recebe o mesmo
//! resultado. Uma CLI com a lógica dentro obriga a GUI a reimplementá-la, e
//! nasce o **segundo produto** — a mesma classe do pseudónimo em quatro sítios,
//! e a mesma lição: a divergência aparece quando alguém já mandou um cliente
//! instalar por uma delas.
//!
//! Um binário, sem runtime, que roda em Windows **e** em Linux. É a forma que
//! responde ao item 7 do dono: *"o AEGIS BRIDGE GUI deveria ser aplicação
//! plug-play perfeita para Windows"*.

use std::path::PathBuf;

use aegis_produto::{
    Resultado, aplicar_renovacao, conferir_licenca, fingerprint_de, instalar, listar_verticais,
    machine_id_padrao, partes_da_maquina, pedir_renovacao, ver_vertical,
};
use clap::{Parser, Subcommand};

mod mcp;
mod referencia;

#[derive(Parser)]
#[command(
    name = "aegis",
    about = "AEGIS — instala, serve e diagnostica uma ilha",
    version
)]
struct Cli {
    #[command(subcommand)]
    comando: Comando,
}

#[derive(Subcommand)]
enum Comando {
    /// Um vertical: a pasta que o descreve por inteiro.
    Vertical {
        #[command(subcommand)]
        acao: AcaoVertical,
    },
    /// A ilha: banco, vertical e serviço.
    Ilha {
        #[command(subcommand)]
        acao: AcaoIlha,
    },
    /// A licença: o fingerprint desta máquina, para o pedido.
    Licenca {
        #[command(subcommand)]
        acao: AcaoLicenca,
    },
    /// As câmaras da ponte. 🔴 **O mesmo binário.**
    ///
    /// Houve um `aegis-bridge` a parte, com o seu próprio executável, e foi
    /// dissolvido: o que ele fazia entra aqui como `aegis camera`. Um produto
    /// com dois programas é um produto com dois modos de divergir — e a casa
    /// mediu que a regra duplicada divergia sempre no primeiro caso de borda.
    Camera {
        #[command(subcommand)]
        acao: AcaoCamera,
    },
    /// 🔴 A face agêntica: o mesmo produto, noutro protocolo.
    ///
    /// O motor (opencode) fala MCP em stdio; o produto fala `Resultado`. Esta
    /// peça é a **única** tradução entre os dois, e por isso não tem regra
    /// própria: cada ferramenta devolve o `codigo`, a frase e o gesto que a
    /// linha de comandos imprime. A prova está em `tests/quatro_faces.rs`.
    ///
    /// E o `--vertical` **não é opcional**: um servidor, um produto, e a
    /// licença que o agente tem é a desse vertical. Sem licença, o processo
    /// não arranca — porque um shell que abre sem licença não é fuga, e
    /// **fuga é o agente agir sem licença**.
    Mcp {
        /// Pasta do vertical deste servidor. É dela que sai a licença exigida.
        #[arg(long)]
        vertical: PathBuf,
        /// A licença desta máquina. **Obrigatória** quando o vertical declara
        /// `licenca.exige` — sem ela o gesto recusa com `3`.
        #[arg(long)]
        licenca: Option<PathBuf>,
        /// A Chave OEM do parceiro, que autorizou a licença.
        #[arg(long)]
        chave_oem: Option<PathBuf>,
        /// Identificador estável da máquina. Cai para o nome do host.
        #[arg(long)]
        machine_id: Option<String>,
        /// Escreve as ferramentas e os esquemas, e sai. 🔴 Não serve: é o que
        /// o console lê para se configurar, e um servidor cujas ferramentas só
        /// se descobrem chamando-as é um servidor que ninguém consegue
        /// documentar.
        #[arg(long)]
        lista: bool,
    },
    /// A referência do produto, **gerada do código**.
    ///
    /// 🔴 A cura da queixa *"a documentação está densa e mal atualizada"*: um
    /// ficheiro escrito à mão descreve o que o produto fazia quando o ficheiro
    /// foi escrito. Este descreve o que ele faz agora — ou recusa.
    ///
    /// A árvore de comandos é introspeccionada do próprio `clap`, e o
    /// vocabulário de recusa sai dos próprios enums. Não há lista escrita à
    /// mão, e por isso não pode haver um comando no programa que não esteja
    /// aqui.
    Referencia {
        /// Onde escrever. Cai para `docs/REFERENCIA.md`.
        #[arg(long)]
        saida: Option<PathBuf>,
        /// Não escreve: sai com `3` se o ficheiro já não bater com o código.
        ///
        /// É esta flag que faz a peça valer alguma coisa — sem ela,
        /// *"gerada do código"* é uma afirmação sobre a origem do ficheiro, e
        /// não sobre o seu conteúdo.
        #[arg(long)]
        verificar: bool,
    },
}

#[derive(Subcommand)]
enum AcaoVertical {
    /// Lista os verticais de uma pasta.
    Listar {
        /// Pasta que contém as pastas de vertical.
        #[arg(default_value = "verticals")]
        pasta: PathBuf,
    },
    /// Mostra o manifesto de um vertical.
    Ver {
        /// Pasta do vertical.
        pasta: PathBuf,
    },
}

#[derive(Subcommand)]
enum AcaoLicenca {
    /// O fingerprint desta máquina, no formato que o emissor usa.
    Fingerprint {
        /// Identificador estável da máquina. Cai para o nome do host.
        #[arg(long)]
        machine_id: Option<String>,
    },
    /// Confere uma licença e diz o que está em falta — sem instalar nada.
    ///
    /// É o `doctor` da licença: o mesmo verificador, sem efeito.
    Conferir {
        /// Pasta do vertical — é dela que sai que licença este produto exige.
        #[arg(long)]
        vertical: PathBuf,
        /// A licença a conferir.
        #[arg(long)]
        licenca: Option<PathBuf>,
        /// A Chave OEM do parceiro, que autorizou a licença.
        #[arg(long)]
        chave_oem: Option<PathBuf>,
        /// Identificador estável da máquina. Cai para o nome do host.
        #[arg(long)]
        machine_id: Option<String>,
    },
    /// 🔴 A renovação, em **dois tempos** — como a ativação.
    ///
    /// Sem argumento, **escreve o pedido** ao lado da licença e diz onde
    /// ficou. Com a resposta, **confere a cadeia e grava** a licença de
    /// dentro. A licença vence e a máquina de campo pode nunca ter falado
    /// com a nuvem, e esta é a resposta a isso.
    ///
    /// O pedido pendente **não é apagado** ao aplicar: ele é a memória de
    /// qual pedido está vivo, e é o que impede que a mesma resposta seja
    /// aplicada outra vez.
    Renovar {
        /// A resposta de quem emite. Sem isto, o gesto escreve o pedido.
        resposta: Option<PathBuf>,
        /// A licença **instalada** nesta máquina. É dela que sai o pedido.
        #[arg(long)]
        licenca: PathBuf,
        /// A Chave OEM do parceiro. Só no segundo tempo.
        #[arg(long)]
        chave_oem: Option<PathBuf>,
        /// Identificador estável da máquina. Cai para o nome do host.
        #[arg(long)]
        machine_id: Option<String>,
    },
}

#[derive(Subcommand)]
enum AcaoCamera {
    /// Lista as câmaras desta máquina, e os endereços de cada uma.
    Listar {
        /// Pasta onde vive a lista. Cai para `%ProgramData%\AEGIS`.
        #[arg(long)]
        pasta: Option<PathBuf>,
    },
    /// Acrescenta uma câmara, ou muda o endereço de uma que já existe.
    Adicionar {
        /// O nome como o operador escreve. **Nunca** um endereço.
        nome: String,
        /// O endereço: `rtsp://…`, `http://…`.
        endereco: String,
        #[arg(long)]
        pasta: Option<PathBuf>,
    },
    /// Tira uma câmara pelo nome.
    Remover {
        nome: String,
        #[arg(long)]
        pasta: Option<PathBuf>,
    },
}

#[derive(Subcommand)]
enum AcaoIlha {
    /// Aplica o vertical: licença, migrações, tenant, catálogo e marcador.
    Instalar {
        /// Pasta do vertical a aplicar.
        #[arg(long)]
        vertical: PathBuf,
        /// URL do Postgres. Cai para `AEGIS_BANCO`.
        #[arg(long)]
        banco: Option<String>,
        /// A licença desta máquina. **Obrigatória** quando o vertical declara
        /// `licenca.exige` — sem ela o gesto recusa com `3`.
        #[arg(long)]
        licenca: Option<PathBuf>,
        /// A Chave OEM do parceiro, que autorizou a licença.
        #[arg(long)]
        chave_oem: Option<PathBuf>,
        /// Identificador estável da máquina. Cai para o nome do host.
        #[arg(long)]
        machine_id: Option<String>,
    },
    /// Sobe o serviço da ilha.
    Servir {
        /// Pasta do vertical a servir.
        #[arg(long)]
        vertical: PathBuf,
        /// URL do Postgres. Cai para `AEGIS_BANCO`.
        #[arg(long)]
        banco: Option<String>,
        /// A licença desta máquina. Só é conferida no arranque da ilha.
        #[arg(long)]
        licenca: Option<PathBuf>,
        /// A Chave OEM do parceiro, que autorizou a licença.
        #[arg(long)]
        chave_oem: Option<PathBuf>,
        /// Identificador estável da máquina. Cai para o nome do host.
        #[arg(long)]
        machine_id: Option<String>,
        /// Porta do serviço da ilha.
        #[arg(long, default_value_t = 8020)]
        porta: u16,
    },
    /// Diz o estado real, e sai com `3` se não estiver pronto.
    Estado {
        /// Pasta do vertical instalado.
        #[arg(long)]
        vertical: PathBuf,
        /// URL do Postgres. Cai para `AEGIS_BANCO`.
        #[arg(long)]
        banco: Option<String>,
    },
}

#[tokio::main]
async fn main() {
    // 🔴 O `tracing` vai para o **stderr**, e esta linha é o que mantém o
    // `aegis mcp` de pé. O `tracing_subscriber::fmt()` escreve no stdout por
    // omissão — e o stdout do `mcp` é o canal do protocolo JSON-RPC, onde uma
    // linha a mais é um pacote partido. Um único `INFO` por arranque e o
    // cliente vê lixo onde esperava JSON, e a causa aparece longe do defeito.
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "aegis=info,warn".into()),
        )
        .init();

    let cli = Cli::parse();
    let codigo = match cli.comando {
        Comando::Vertical { acao } => vertical(acao),
        Comando::Ilha { acao } => ilha(acao).await,
        Comando::Licenca { acao } => licenca(acao),
        Comando::Camera { acao } => camera(acao),
        Comando::Mcp {
            vertical,
            licenca,
            chave_oem,
            machine_id,
            lista,
        } => mcp(vertical, licenca, chave_oem, machine_id, lista).await,
        Comando::Referencia { saida, verificar } => {
            let destino = saida.unwrap_or_else(|| PathBuf::from("docs/REFERENCIA.md"));
            match referencia::escrever(&destino, verificar) {
                Ok(true) => {
                    println!("referência escrita em {}", destino.display());
                    aegis_produto::SAIDA_FEITO
                }
                Ok(false) => {
                    println!("{} está em dia", destino.display());
                    aegis_produto::SAIDA_FEITO
                }
                // 🔴 Um ficheiro desatualizado é uma **recusa**, não uma
                // falha: o pedido foi legítimo, o ficheiro é que divergiu. E o
                // código sai de `Resultado::saida()` como o de qualquer outra.
                Err(motivo) => {
                    eprintln!("[referencia.desatualizada] {motivo}");
                    aegis_produto::SAIDA_RECUSADO
                }
            }
        }
    };
    std::process::exit(codigo);
}

fn url_do_banco(explicito: Option<&String>) -> String {
    explicito
        .cloned()
        .or_else(aegis_ambiente::banco)
        .unwrap_or_else(|| {
            eprintln!("falta o banco: passe --banco ou defina AEGIS_BANCO");
            std::process::exit(aegis_produto::SAIDA_FALHOU);
        })
}

// ---------------------------------------------------------------------------
// As três faces: a casca imprime o que a biblioteca decidiu
// ---------------------------------------------------------------------------

fn vertical(acao: AcaoVertical) -> i32 {
    // Cada ação é tratada à sua: `listar_verticais` devolve resumos e
    // `ver_vertical` devolve o manifesto, e um `match` sobre as duas
    // teria de inventar um tipo comum que ninguém usa.
    match acao {
        AcaoVertical::Listar { pasta } => match listar_verticais(&pasta) {
            Resultado::Feito(lista) => {
                for v in lista {
                    println!(
                        "{:<16} v{:<3} {:<28} {} tipo(s), {} acao(oes), {} pagina(s), {} dado(s)",
                        v.id,
                        v.versao,
                        v.titulo.as_deref().unwrap_or("-"),
                        v.tipos,
                        v.acoes,
                        v.paginas,
                        v.dados
                    );
                }
                0
            }
            outro => imprime(&outro),
        },
        AcaoVertical::Ver { pasta } => match ver_vertical(&pasta) {
            Resultado::Feito(v) => {
                println!("{}", serde_json::to_string_pretty(&v).unwrap_or_default());
                0
            }
            outro => imprime(&outro),
        },
    }
}

async fn ilha(acao: AcaoIlha) -> i32 {
    match acao {
        AcaoIlha::Instalar {
            vertical,
            banco,
            licenca,
            chave_oem,
            machine_id,
        } => {
            let r = instalar(
                &vertical,
                &url_do_banco(banco.as_ref()),
                licenca.as_deref(),
                chave_oem.as_deref(),
                &machine_id.unwrap_or_else(machine_id_padrao),
            )
            .await;
            imprime_instalacao(&r)
        }

        AcaoIlha::Estado { vertical, banco } => {
            let r = aegis_produto::estado(&vertical, &url_do_banco(banco.as_ref())).await;
            match &r {
                Resultado::Feito(p) => {
                    println!("{}", serde_json::to_string_pretty(p).unwrap_or_default());
                    0
                }
                outro => {
                    println!(
                        "{}",
                        serde_json::to_string_pretty(&outro.para_tela()).unwrap_or_default()
                    );
                    outro.saida()
                }
            }
        }

        AcaoIlha::Servir {
            vertical,
            banco,
            licenca,
            chave_oem,
            machine_id,
            porta,
        } => {
            let banco = url_do_banco(banco.as_ref());
            // 🔴 Servir é instalar. A mesma porta de entrada e a mesma recusa:
            // uma ilha que só se põe de pé depois de a licença ser conferida é
            // uma ilha que alguém pode levantar sem licença nenhuma.
            let r = instalar(
                &vertical,
                &banco,
                licenca.as_deref(),
                chave_oem.as_deref(),
                &machine_id.unwrap_or_else(machine_id_padrao),
            )
            .await;
            let codigo = imprime_instalacao(&r);
            if codigo != aegis_produto::SAIDA_FEITO {
                return codigo;
            }
            servir(&vertical, &banco, porta).await
        }
    }
}

/// 🔴 Devolve o **código de saída**, e não chama `exit` por dentro.
///
/// A primeira versão desta função fazia `std::process::exit(3)` na recusa e o
/// `main` devolvia `0` no resto — duas maneiras de sair no mesmo ficheiro, e
/// a que se engana é a que ninguém lê. Devolver o código deixa o `main` ser o
/// **único** sitio onde se sai, que é o que torna `Resultado::saida()` a única
/// decisão de número.
fn licenca(acao: AcaoLicenca) -> i32 {
    match acao {
        AcaoLicenca::Fingerprint { machine_id } => {
            let m = machine_id.unwrap_or_else(machine_id_padrao);
            let (id, plataforma, arquitetura) = partes_da_maquina(&m);
            println!(
                "fingerprint: {}",
                fingerprint_de(&id, &plataforma, &arquitetura)
            );
            println!("maquina:     {id}");
            println!("plataforma:  {plataforma} {arquitetura}");
            aegis_produto::SAIDA_FEITO
        }
        AcaoLicenca::Conferir {
            vertical,
            licenca,
            chave_oem,
            machine_id,
        } => {
            // 🔴 A leitura do manifesto é `licenca_exigida_por`, da biblioteca.
            // A versão anterior fazia `carregar(...).map(...).unwrap_or_default()`
            // **aqui**, e era a segunda cópia — e a segunda copia tratava uma
            // pasta inválida como "não exige licença", que é a forma mais
            // barata de contornar uma licença: não passar o manifesto.
            let esperado = aegis_produto::licenca_exigida_por(&vertical).unwrap_or_default();
            match conferir_licenca(
                &esperado,
                licenca.as_deref(),
                chave_oem.as_deref(),
                &machine_id.unwrap_or_else(machine_id_padrao),
            ) {
                Ok(()) => {
                    println!("a licença de {esperado} confere");
                    aegis_produto::SAIDA_FEITO
                }
                Err(e) => {
                    eprintln!("[{}] {} — {}", e.codigo(), e.humano(), e.gesto());
                    aegis_produto::SAIDA_RECUSADO
                }
            }
        }
        AcaoLicenca::Renovar {
            resposta,
            licenca,
            chave_oem,
            machine_id,
        } => {
            let machine = machine_id.unwrap_or_else(machine_id_padrao);
            // 🔴 Os dois tempos são **o mesmo gesto**, e a casca só escolhe
            // qual deles é. Nenhuma regra de licença vive aqui — nem a recusa
            // por Chave OEM em falta, que é da biblioteca.
            //
            // Os dois ramos são escritos à parte porque devolvem `T`
            // diferentes, e o que se quer dizer ao operador também é
            // diferente: um escreveu um pedido, o outro renovou. A
            // **impressão** do que não é `Feito` é a mesma função nos dois —
            // uma segunda tradução de `Resultado` para texto seria uma
            // política que pode divergir da da janela.
            match &resposta {
                None => {
                    let r = pedir_renovacao(&licenca, &machine);
                    if let Resultado::Feito(p) = &r {
                        println!("pedido de renovação escrito em {}", p.destino);
                        println!("  licença:  {} ({})", p.licenca_id, p.seed);
                        println!("  parceiro: {}", p.parceiro);
                        println!("  vale até: {}", p.expira_em_atual);
                        println!("  mande este ficheiro a quem emite.");
                    }
                    imprime(&r)
                }
                Some(resposta) => {
                    let r = aplicar_renovacao(resposta, &licenca, chave_oem.as_deref(), &machine);
                    if let Resultado::Feito(p) = &r {
                        println!(
                            "licença renovada: {} / {} — vale até {}",
                            p.parceiro, p.seed, p.expira_em
                        );
                        println!("  gravada em {}", p.destino);
                        // 🔴 A frase é a que é verdade, e a primeira versão
                        // mentia. Dizia que o pedido pendente "impedia
                        // aplicar a mesma resposta outra vez" — e não impede:
                        // reaplicar a mesma resposta volta a escrever a mesma
                        // licença, e sai com `0`. O que o pedido pendente
                        // impede é uma resposta de **outro** pedido, que é a
                        // propriedade que interessa: é ela que faz uma
                        // resposta velha parar de valer no instante em que se
                        // tira um pedido novo.
                        //
                        // E a garantia contra o replay verdadeiro não é o
                        // pedido: é o **não-encurta**. Reaplicar uma resposta
                        // antiga tentaria derrubar a licença que está no disco,
                        // e é contra o disco que essa amarra mede.
                        println!(
                            "  o pedido {} fica pendente: é ele que recusa \
                             uma resposta de outro pedido",
                            p.pedido_pendente
                        );
                    }
                    imprime(&r)
                }
            }
        }
    }
}

/// 🔴 As câmaras. **O mesmo binário, outro subcomando** — e a casca não
/// decide nada, como em todos os outros.
///
/// A pasta de dados é a de `aegis-ambiente`, e `--pasta` existe para a
/// bancada. 🔴 Apontar a lista para uma pasta à escolha não tira a licença
/// daqui: a licença, o pedido pendente e a lista vivem em sítios diferentes
/// por decisão, e o que é **segredo** nunca vem de um caminho que o operador
/// possa escolher.
/// 🔴 A casca de `camera` **não decide nada** e, desde o D1, também não
/// **traduz**: quem sabe o que é uma recusa de câmara é a biblioteca, e é por
/// isso que a face agêntica diz as mesmas coisas que esta.
///
/// A versão anterior decidia aqui dentro, e por isso escrevia códigos à mão
/// (`ponte.inexistente`) e uma delas ficava **sem gesto** — o defeito que a
/// regra *"erro tem código, frase e gesto"* existe para apanhar, e que só
/// apareceu quando havia uma segunda face com quem comparar.
fn camera(acao: AcaoCamera) -> i32 {
    match acao {
        AcaoCamera::Listar { pasta } => match aegis_produto::listar_cameras(pasta.as_deref()) {
            Resultado::Feito(l) => {
                if l.cameras.is_empty() {
                    println!("nenhuma câmara nesta máquina\n");
                } else {
                    println!("{} câmara(s) em {}", l.cameras.len(), l.pasta);
                    println!();
                    for c in &l.cameras {
                        println!("  {}", c.nome);
                        println!("    AEGIS:   {}", c.rtsp);
                        println!("    Browser: {}", c.hls);
                        println!("    Onde:    {}", c.endereco);
                        println!();
                    }
                }
                // 🔴 Uma linha que não percebeu é **DITA**, não saltada. Um
                // ficheiro que o operador edita à mão tem linhas que o programa
                // não entende, e um ficheiro em que isso acontece em silêncio é
                // um ficheiro em que o operador já não confia.
                for m in l.ignoradas {
                    eprintln!("  [ignorado] {m} — não tem `nome|endereço`");
                }
                aegis_produto::SAIDA_FEITO
            }
            outro => imprime(&outro),
        },
        AcaoCamera::Adicionar {
            nome,
            endereco,
            pasta,
        } => match aegis_produto::adicionar_camera(&nome, &endereco, pasta.as_deref()) {
            Resultado::Feito(c) => {
                println!("câmara `{}` guardada", c.nome);
                println!("  {}", c.endereco);
                aegis_produto::SAIDA_FEITO
            }
            outro => imprime(&outro),
        },
        AcaoCamera::Remover { nome, pasta } => {
            match aegis_produto::remover_camera(&nome, pasta.as_deref()) {
                Resultado::Feito(nome) => {
                    println!("câmara `{nome}` removida");
                    aegis_produto::SAIDA_FEITO
                }
                outro => imprime(&outro),
            }
        }
    }
}

/// 🔴 A face agêntica. A mesma forma das outras: o portão primeiro, a
/// biblioteca a decidir, e a casca a imprimir o que ela disse.
async fn mcp(
    vertical: PathBuf,
    licenca: Option<PathBuf>,
    chave_oem: Option<PathBuf>,
    machine_id: Option<String>,
    lista: bool,
) -> i32 {
    let machine = machine_id.unwrap_or_else(machine_id_padrao);

    // 🔴 `--lista` **não** passa pelo portão: listar ferramentas não é agir,
    // e um servidor cujas ferramentas só se descobrem com licença válida é um
    // servidor que ninguém documenta. O `--vertical` continua a ser exigido
    // porque a lista que o console escreve é a lista **deste** produto.
    if lista {
        println!(
            "{}",
            serde_json::to_string_pretty(&mcp::ferramentas()).unwrap_or_default()
        );
        return aegis_produto::SAIDA_FEITO;
    }

    // 🔴 O portão, e é `aegis_produto::portao` — a mesma função que o
    // `instalar` chama. Uma cópia desta regra aqui seria uma segunda versão
    // da única regra que decide se o produto existe.
    let Resultado::Feito(manifesto) = mcp::portao(
        &vertical,
        licenca.as_deref(),
        chave_oem.as_deref(),
        &machine,
    ) else {
        let r = mcp::portao(
            &vertical,
            licenca.as_deref(),
            chave_oem.as_deref(),
            &machine,
        );
        return imprime(&r);
    };

    mcp::servir(mcp::Contexto {
        pasta: vertical,
        // 🔴 `licenca.exige`, e **não** o `id`. São iguais nos verticais de
        // hoje e isso é coincidência: um vertical pode ter `id: portao` e
        // `licenca.exige: portao-acesso`, e seedar pelo `id` seria pedir uma
        // licença errada numa máquina certa.
        exige: manifesto.licenca.exige,
        licenca,
        chave_oem,
        machine_id: machine,
    })
    .await
}

async fn servir(vertical: &std::path::Path, banco: &str, porta: u16) -> i32 {
    // O serviço liga com o **role de runtime**, nunca com o dono: o dono é
    // superuser, e superuser tem `BYPASSRLS`. Já foi medido.
    let pool = match aegis_store::abrir(&aegis_store::url_do_app(banco)).await {
        Ok(p) => p,
        Err(e) => {
            eprintln!(
                "[{}] o role de runtime não liga: {}",
                e.codigo(),
                e.humano()
            );
            return aegis_produto::SAIDA_FALHOU;
        }
    };
    let repo = aegis_store::Repo::new(pool);
    let ilha = match aegis_island::Ilha::abrir(vertical, repo) {
        Ok(i) => i,
        Err(e) => {
            eprintln!("[{}] {}", e.codigo(), e.humano());
            return aegis_produto::SAIDA_FALHOU;
        }
    };

    // 🔴 **O boot mede a saúde do produto**, e é a única coisa que o publicava.
    //
    // 🔴 O veredicto vive em `Arc<Mutex<Option<Veredito>>>` — **em memória**. E
    // `instalar` e `servir` são **dois processos diferentes**: o `instalar`
    // media, publicava, e morria com o veredicto. O `servir` arrancava com
    // `None`, e o `/health/ready` — que por desenho **não** corre scripts e
    // publica o veredicto do boot — respondia `pronto.saude-nao-conferida`
    // **para sempre**.
    //
    // 🔴 O efeito era que uma ilha real **nunca ficava pronta**: o
    // `ilha_saude` do agente recusava, o agente não arrancava, e o teste ácido
    // do D13 não conseguia dar o primeiro passo. Medido a 30/09/2026, na
    // primeira ilha real da bancada.
    //
    // 🔴 E a recusa era a **certa**: "o produto ainda não foi verificado" era
    // literalmente verdade — ninguém o tinha verificado. O que faltava não era a
    // regra; era o boot a aplicar a que já existia.
    let veredito = ilha.medir_saude().await;
    tracing::info!(
        exigidas = veredito.todas.len(),
        opcionais = veredito.opcionais.len(),
        falhou = veredito.falha.is_some(),
        "saude do produto medida no arranque"
    );
    for checagem in veredito.todas.iter().chain(veredito.opcionais.iter()) {
        if checagem.estado != aegis_island::Estado::Ok {
            eprintln!(
                "[saude] {} [{}]: {}",
                checagem.nome,
                checagem.estado.codigo(),
                checagem.detalhe.as_deref().unwrap_or("")
            );
        }
    }

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], porta));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("não consegui abrir a porta {porta}: {e}");
            return aegis_produto::SAIDA_FALHOU;
        }
    };
    tracing::info!(porta, "ilha a subir");
    match axum::serve(listener, aegis_island::rotas(ilha))
        .with_graceful_shutdown(parar_ao_sinal())
        .await
    {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("a ilha caiu: {e}");
            aegis_produto::SAIDA_FALHOU
        }
    }
}

// ---------------------------------------------------------------------------
// Imprimir
// ---------------------------------------------------------------------------

/// O que a casca escreve quando o resultado **não** é `Feito`.
///
/// 🔴 O **código** vem do resultado, e o **gesto** também. A casca não
/// traduz: traduzir aqui seria ter duas traduções, e a da GUI — a outra face
/// — ficaria para trás.
///
/// 🔴 E um `Feito` **não escreve nada**. A primeira versão imprimia na mesma,
/// e o que saía no sucesso era um `[]` a stderr — porque `para_tela()` de um
/// `Feito` é `{"feito": true, "dado": …}`, sem `codigo` nem `mensagem`. Os
/// chamadores que punham os seus casos antes ficavam tapados por isso; a
/// renovação, que é o primeiro a chamar isto nos dois braços, foi quem o
/// mostrou.
fn imprime<T: serde::Serialize>(r: &Resultado<T>) -> i32 {
    if let Resultado::Feito(_) = r {
        return r.saida();
    }
    let tela = r.para_tela();
    eprintln!(
        "[{}] {}",
        tela["codigo"].as_str().unwrap_or_default(),
        tela["mensagem"].as_str().unwrap_or_default()
    );
    if let Some(g) = tela.get("gesto").and_then(|g| g.as_str()) {
        eprintln!("  {g}");
    }
    r.saida()
}

fn imprime_instalacao(r: &Resultado<aegis_produto::ResumoInstalacao>) -> i32 {
    match r {
        Resultado::Feito(v) => {
            println!(
                "vertical {} v{} aplicado — {} objeto(s), {} aresta(s)",
                v.vertical, v.versao, v.objetos, v.arestas
            );
            aegis_produto::SAIDA_FEITO
        }
        outro => imprime(outro),
    }
}

async fn parar_ao_sinal() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("a pedido");
}
