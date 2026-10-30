//! Executar as checagens que o **vertical** declara.
//!
//! 🔴 Isto fecha a lacuna mais séria que o tijolo 1 deixou: o manifesto
//! declara `saude.d/exigido/*.sh`, o `doctor` lia a lista, e **ninguém
//! executava nada**. A lista existia para dar a impressão de que a ilha se
//! media sozinha — que é exatamente a configuração que a casa já mediu como
//! perigosa: *"um gate de update que aprova com o `/health` é um gate que
//! nunca reprovou"*, e o outro caso, um `servicos.env` inexistente que fazia
//! a lista ficar vazia e o gate devolver "saudável" incondicionalmente.
//!
//! # O contrato
//!
//! Convenção greenboot, e o agente **não sabe** o que os scripts checam:
//!
//! - `exigido/*.sh` que sai ≠ `0` **reprova a ilha**;
//! - `opcional/*.sh` que sai ≠ `0` só aparece;
//! - **código `2` é INCONCLUSIVO**, e inconclusivo não é verde. A casa já
//!   pagou por "reprovar por runner limpo" a teaches a ignorar o vermelho —
//!   a prova tem de dizer que **não correu**, não que passou.
//!
//! # O interpretador
//!
//! São scripts `sh`, e a ilha de produção corre dentro de uma VM Linux. Na
//! bancada Windows não há `sh` no caminho — e é por isso que a procura é
//! explícita (`AEGIS_SH` → `sh` → Git for Windows) e que **sem interpretador
//! o resultado é inconclusivo**, nunca verde.

use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::estado::Ilha;

/// Códigos de saída com significado, e nada mais.
pub const SAIDA_OK: i32 = 0;
/// O script não pôde ser executado a sério: falta o interpretador, o
/// ficheiro não é executável, o tempo estourou. **Não é verde.**
pub const SAIDA_INCONCLUSIVO: i32 = 2;

const TEMPO_LIMITE: Duration = Duration::from_secs(30);

/// O resultado de uma checagem. O que a tela mostra vem daqui, e a tradução
/// é por [`Estado`], nunca por texto.
///
/// 🔴 `Deserialize` também, porque o `diagnostico` da face agênrica **lê**
/// esta forma — e um `default` por campo é o que faz uma ilha mais velha não
/// virar uma linha de conferência que mente.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Checagem {
    /// O caminho relativo declarado no manifesto.
    #[serde(default)]
    pub nome: String,
    #[serde(default)]
    pub estado: Estado,
    /// A última linha que o script disse — para o log e para o operador.
    #[serde(default)]
    pub detalhe: Option<String>,
}

/// 🔴 `Inconclusivo` é o `default`, e não `Ok`.
///
/// É a mesma regra do veredicto pessimista: um estado que o JSON não diz é
/// *"não deu para conferir"*, e uma linha que não se mediu **nunca** aparece
/// verde. O inverso — `#[derive(Default)]` num enum sem `#[default]` dá um
/// aviso de compilação, e um aviso que alguém pode ignorar é a razão de o
/// `default` estar escrito à mão.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Estado {
    /// Correu e passou.
    Ok,
    /// Correu e reprovou.
    Falhou,
    /// **Não correu** — e não passou.
    #[default]
    Inconclusivo,
}

impl Estado {
    pub fn codigo(&self) -> &'static str {
        match self {
            Self::Ok => "saude.ok",
            Self::Falhou => "saude.falhou",
            Self::Inconclusivo => "saude.inconclusivo",
        }
    }

    /// O que a tela diz. Montada aqui, por quem tem o dado.
    pub fn humano(&self) -> &'static str {
        match self {
            Self::Ok => "passou",
            Self::Falhou => "falhou",
            // 🔴 A palavra é "não conferido", nunca "ok". A casa já tem um
            // `SEM-CHECK` que sai laranja e não verde, e a regra é a mesma.
            Self::Inconclusivo => "não conferido",
        }
    }
}

/// O interpretador `sh`, ou `None` se não há nenhum.
///
/// 🔴 Isto **pergunta** ao `aegis-ambiente` e não decide nada. A versão
/// anterior repetia aqui a ordem `AEGIS_SH` → `sh` → Git Bash, e a repetição
/// mudou o sentido da válvula: um `AEGIS_SH` que aponta para um ficheiro
/// inexistente caía no `sh` do sistema, que é exactamente o retrocesso que a
/// válvula existe para impedir — e que o `which("bash")` no Windows torna
/// pior, porque acha o lançador do WSL e não um shell POSIX. O teste
/// `o_interpretador_respeita_a_valvula_de_bancada` apanhou isso.
///
/// A regra mora no `aegis-ambiente` porque é a **regra do ambiente**, e
/// porque quem a põe num segundo sítio é a segunda versão dela.
pub fn interpretador() -> Option<PathBuf> {
    aegis_ambiente::interpretador()
}

/// O prefixo de uma checagem **embutida**.
///
/// 🔴 A casa já tem a convenção certa e não a estava a usar: o greenboot tem
/// `required.d` **e** drop-ins. Uma plataforma que só aceita drop-ins obriga
/// cada vertical a inventar cliente de banco em script — e a prova disso é
/// esta bancada: `saude.d/exigido/banco.sh` correu, e respondeu *"não há
/// `psql`, inconclusivo"*. Não é defeito do script; é o script a pedir uma
/// ferramenta que a ilha já tem dentro.
///
/// Por isso o manifesto aceita **as duas** formas:
///
/// ```yaml
/// saude:
///   exigido:
///     - "@banco"                              # embutida: o que a ilha sabe
///     - saude.d/exigido/psql.sh              # drop-in: o que só o vertical sabe
/// ```
///
/// O `@` é dado, não código: `saude.d/` é ficheiro, `@` é embutida, e nada
/// mais.
const EMBUTIDA: char = '@';

/// Corre as checagens de um grupo (`exigido` ou `opcional`).
///
/// O `AEGIS_BANCO` e o `AEGIS_ILHA` são posto para o script: ele precisa de
/// saber **onde** está, e quem decide isso é quem chamou, não o script.
pub async fn correr(ilha: &Ilha, grupo: &str) -> Vec<Checagem> {
    let m = ilha.manifesto();
    let lista = match grupo {
        "exigido" => &m.saude.exigido,
        _ => &m.saude.opcional,
    };
    if lista.is_empty() {
        // 🔴 Declarações vazias são o caso perigoso, não o seguro. Um
        // vertical sem checagem exigida é um vertical que ninguém mediu — e
        // a lista tem de DIZER isso, não passar em silêncio.
        return vec![Checagem {
            nome: format!("({grupo})"),
            estado: Estado::Inconclusivo,
            detalhe: Some(format!("o vertical não declara nenhuma checagem {grupo}")),
        }];
    }

    let Some(sh) = interpretador() else {
        return lista
            .iter()
            .map(|caminho| Checagem {
                nome: caminho.display().to_string(),
                estado: Estado::Inconclusivo,
                detalhe: Some("não há interpretador sh (use AEGIS_SH para indicar um)".to_string()),
            })
            .collect();
    };

    let mut saida = Vec::with_capacity(lista.len());
    for caminho in lista {
        let nome = caminho.to_string_lossy().replace('\\', "/");
        if let Some(qual) = nome.strip_prefix(EMBUTIDA) {
            saida.push(correr_embutida(ilha, qual).await);
        } else {
            saida.push(correr_um(&sh, ilha, caminho).await);
        }
    }
    saida
}

/// As checagens que a **ilha** faz, sem depender de ferramenta nenhuma.
///
/// Cada uma existe porque já custou uma noite em algum lugar:
///
/// - `@banco` — banco responde **e** o tenant existe **e** o marcador do seed
///   bate. É o "declarar não implanta" fechado pelo lado do estado.
/// - `@catalogo` — o vertical declara dados **e** eles chegaram ao banco. É o
///   sintoma "instalada com o tenant vazio" que respondia `200` e não
///   mostrava nada.
async fn correr_embutida(ilha: &Ilha, qual: &str) -> Checagem {
    let nome = format!("{EMBUTIDA}{qual}");
    match qual {
        "banco" => {
            if !aegis_store::vivo(ilha.repo().pool()).await {
                return Checagem {
                    nome,
                    estado: Estado::Falhou,
                    detalhe: Some("o banco não responde".into()),
                };
            }
            let Some(tenant) = ilha.tenant_padrao().await.unwrap_or(None) else {
                return Checagem {
                    nome,
                    estado: Estado::Falhou,
                    detalhe: Some("o tenant do vertical não existe".into()),
                };
            };
            let esperado = ilha.contrato().manifesto().versao_do_seed() as i32;
            let no_banco = ilha.repo().seed_de(&tenant.id).await.unwrap_or(-1);
            if no_banco != esperado {
                return Checagem {
                    nome,
                    estado: Estado::Falhou,
                    detalhe: Some(format!(
                        "o seed está em {no_banco} e o vertical pede {esperado}"
                    )),
                };
            }
            Checagem {
                nome,
                estado: Estado::Ok,
                detalhe: Some(format!("banco e seed em {no_banco}")),
            }
        }
        "catalogo" => {
            let Some(tenant) = ilha.tenant_padrao().await.unwrap_or(None) else {
                return Checagem {
                    nome,
                    estado: Estado::Falhou,
                    detalhe: Some("o tenant do vertical não existe".into()),
                };
            };
            let declarados = ilha.contrato().manifesto().dados.len();
            if declarados == 0 {
                // Um vertical sem catálogo é legítimo: ele recebe tudo por
                // importação ou por operação. E é honesto dizer que não há
                // o que conferir.
                return Checagem {
                    nome,
                    estado: Estado::Ok,
                    detalhe: Some("o vertical não declara catálogo".into()),
                };
            }
            let mut aplicadas = 0usize;
            for dado in &ilha.contrato().manifesto().dados {
                if ilha
                    .repo()
                    .por_chave(&tenant.id, &dado.tipo, dado.chave.as_deref().unwrap_or(""))
                    .await
                    .ok()
                    .flatten()
                    .is_some()
                {
                    aplicadas += 1;
                }
            }
            if aplicadas == declarados {
                Checagem {
                    nome,
                    estado: Estado::Ok,
                    detalhe: Some(format!(
                        "{aplicadas} de {declarados} itens do catálogo no banco"
                    )),
                }
            } else {
                Checagem {
                    nome,
                    estado: Estado::Falhou,
                    detalhe: Some(format!(
                        "o vertical declara {declarados} itens e só {aplicadas} chegaram ao banco"
                    )),
                }
            }
        }
        // 🔴 A ilha mede o **seu próprio** isolamento. A casa já mediu um
        // `doctor` que lia a lista de políticas, achava-a válida, e o
        // runtime ligava-se com `BYPASSRLS` — a lista estava certa e o
        // isolamento não. Ler a política não é medir o isolamento; é ler
        // uma promessa.
        "isolamento" => {
            let Some(tenant) = ilha.tenant_padrao().await.unwrap_or(None) else {
                return Checagem {
                    nome,
                    estado: Estado::Falhou,
                    detalhe: Some("o tenant do vertical não existe".into()),
                };
            };
            let m = ilha.repo().isolamento(&tenant.id).await;
            if !m.tabela_presente {
                return Checagem {
                    nome,
                    estado: Estado::Inconclusivo,
                    detalhe: Some("o esquema ainda não está aplicado".into()),
                };
            }
            if !m.efetivo() {
                return Checagem {
                    nome,
                    estado: Estado::Falhou,
                    detalhe: Some(format!(
                        "sem contexto de tenant a consulta devolveu {} linha(s) —                          a RLS não está a isolar, ou quem lê tem {}",
                        m.sem_contexto, "BYPASSRLS"
                    )),
                };
            }
            Checagem {
                nome,
                estado: Estado::Ok,
                detalhe: Some(format!(
                    "sem contexto vê {} linha(s), com contexto vê {}",
                    m.sem_contexto, m.com_contexto
                )),
            }
        }
        outra => Checagem {
            nome,
            estado: Estado::Inconclusivo,
            // 🔴 Uma checagem embutida com nome desconhecido é inconclusiva,
            // nunca verde. Um `@xyz` que ninguém implementou é o pior caso:
            // o vertical PEDIU uma verificação e a plataforma respondeu
            // "passou" sem nunca a ter corrido.
            detalhe: Some(format!("não há checagem embutida chamada {outra:?}")),
        },
    }
}

async fn correr_um(sh: &Path, ilha: &Ilha, caminho: &Path) -> Checagem {
    let nome = caminho.display().to_string();
    let alvo = ilha.pasta().join(caminho);

    if !alvo.is_file() {
        // O `aegis-vertical` já recusa manifesto que aponte para ficheiro
        // inexistente; chegar aqui é defesa em profundidade, e é o mesmo
        // estado: inconclusivo, não "falhou" (o script não reprovou — não
        // chegou a correr).
        return Checagem {
            nome,
            estado: Estado::Inconclusivo,
            detalhe: Some("o ficheiro da checagem não existe".to_string()),
        };
    }

    let url = aegis_ambiente::banco().unwrap_or_default();
    // 🔴 O caminho handed ao `sh` tem de ser **POSIX e RELATIVO**.
    //
    // Duas lições no mesmo bug, e as duas custaram uma rodada:
    //
    // 1. **POSIX.** `Path::join` juntou `<vertical>` com
    //    `saude.d/exigido/banco.sh` e produziu
    //    `<vertical>/saude.d/exigido/banco.sh` — que o bash lê como
    //    um nome de ficheiro só e responde *"No such file or directory"*.
    // 2. **RELATIVO.** O `current_dir` abaixo já é a pasta do vertical, então
    //    passar o caminho completo faz o bash procurar
    //    `<vertical>/<vertical>/saude.d/…` — a mesma
    //    armadilha, com a resposta igual e a causa ao lado.
    //
    // É a regra que o resto da casa já tem escrita para caminhos de ilha:
    // `PurePosixPath`, nunca `Path`.
    let alvo_posix = caminho.to_string_lossy().replace('\\', "/");

    let exec = tokio::process::Command::new(sh)
        .arg(&alvo_posix)
        .current_dir(ilha.pasta())
        .env("AEGIS_BANCO", &url)
        .env("AEGIS_ILHA", ilha.slug_do_tenant())
        .env("AEGIS_VERTICAL", ilha.slug_do_tenant())
        .kill_on_drop(true)
        .output();

    let saida = match tokio::time::timeout(TEMPO_LIMITE, exec).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => {
            return Checagem {
                nome,
                estado: Estado::Inconclusivo,
                detalhe: Some(format!("não consegui executar: {e}")),
            };
        }
        Err(_) => {
            // 🔴 Estourar o tempo é inconclusivo, não reprovação: o script
            // pode estar certo e a máquina lenta. Reprovar aqui puniria o
            // operador por lentidão de disco.
            return Checagem {
                nome,
                estado: Estado::Inconclusivo,
                detalhe: Some(format!("excedeu {}s", TEMPO_LIMITE.as_secs())),
            };
        }
    };

    let ultima = |buf: &[u8]| {
        String::from_utf8_lossy(buf)
            .lines()
            .rfind(|l| !l.trim().is_empty())
            .map(str::to_string)
    };

    let estado = if saida.status.code() == Some(SAIDA_OK) {
        Estado::Ok
    } else if saida.status.code() == Some(SAIDA_INCONCLUSIVO) {
        Estado::Inconclusivo
    } else {
        Estado::Falhou
    };

    Checagem {
        nome,
        estado,
        detalhe: ultima(&saida.stderr).or_else(|| ultima(&saida.stdout)),
    }
}

/// As checagens **exigidas**, e se alguma reprovou.
pub async fn exigidas_reprovam(ilha: &Ilha) -> Option<Checagem> {
    correr(ilha, "exigido")
        .await
        .into_iter()
        .find(|c| c.estado != Estado::Ok)
}
