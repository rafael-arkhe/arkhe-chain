//! Erros do store.

use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum ErroStore {
    /// 🔴 A causa vai **na mensagem**, não só no `source`. "Não consegui ligar
    /// ao Postgres" sem dizer porquê é o pior sintoma que existe: obriga quem
    /// lê a abrir o código para descobrir se foi DNS, senha, timeout ou banco
    /// a inexistir. Foi medido — a primeira versão desta mensagem escondeva o
    /// `io::Error` e custou uma rodada inteira de adivinhação.
    #[error("não consegui ligar ao Postgres em {url}: {fonte}")]
    Ligacao {
        url: String,
        #[source]
        fonte: sqlx::Error,
    },

    #[error("a migração {versao} já foi aplicada e o conteúdo mudou")]
    MigracaoAlterada { versao: u32 },

    #[error("falha ao aplicar a migração {versao} ({nome}): {fonte}")]
    MigracaoFalhou {
        versao: u32,
        nome: String,
        #[source]
        fonte: sqlx::Error,
    },

    #[error("outra aplicação está a aplicar migrações (o bloqueio não foi tomado)")]
    MigracaoOcupada,

    #[error("o tenant {slug:?} não existe nesta ilha")]
    TenantInexistente { slug: String },

    #[error("a instância {tipo}/{chave} já existe e foi recusada")]
    ChaveDuplicada { tipo: String, chave: String },

    #[error("objeto {id} não existe, ou não é visível para este tenant")]
    ObjetoInvisivel { id: String },

    #[error("o tipo {tipo:?} não existe nesta ilha")]
    TipoDesconhecido { tipo: String },

    #[error("banco inválido: {0}")]
    Banco(String),

    #[error("{0}")]
    Contrato(#[from] aegis_ontology::ErroPropriedade),

    #[error("{0}")]
    Cardinalidade(#[from] aegis_ontology::ErroCardinalidade),

    #[error("{0}")]
    Vertical(#[from] aegis_vertical::ManifestError),

    #[error("banco em {caminho:?} não está em '{esperado}'")]
    RaizInvalida {
        caminho: PathBuf,
        esperado: &'static str,
    },
}

impl ErroStore {
    /// Código fechado. A tela traduz por este e nunca por texto — casar
    /// dentro da frase quebraria no dia em que a frase fosse reescrita, e a
    /// tela passaria a dizer outra coisa que a medição não disse.
    pub fn codigo(&self) -> &'static str {
        match self {
            Self::Ligacao { .. } => "store.ligacao",
            Self::MigracaoAlterada { .. } => "store.migracao-alterada",
            Self::MigracaoFalhou { .. } => "store.migracao-falhou",
            Self::MigracaoOcupada => "store.migracao-ocupada",
            Self::TenantInexistente { .. } => "store.tenant-inexistente",
            Self::ChaveDuplicada { .. } => "store.chave-duplicada",
            Self::ObjetoInvisivel { .. } => "store.objeto-invisivel",
            Self::TipoDesconhecido { .. } => "store.tipo-desconhecido",
            Self::Banco(_) => "store.banco-invalido",
            Self::Contrato(_) => "ontologia.propriedade-invalida",
            Self::Cardinalidade(_) => "ontologia.cardinalidade-violada",
            Self::Vertical(_) => "manifesto.invalido",
            Self::RaizInvalida { .. } => "store.raiz-invalida",
        }
    }

    pub fn humano(&self) -> String {
        self.to_string()
    }

    /// 🔴 O que a pessoa pode fazer. E esta é a parte que faltava.
    ///
    /// O `codigo` e a frase já existiam, e a regra da casa é *"erro tem
    /// código, frase **e** gesto"*. O gesto nunca foi escrito aqui — e ninguém
    /// notou porque **ninguém via este erro por uma face que o mostrasse**:
    /// a tela do `aegis-gui` pede os erros ao `estado`, que traz o
    /// `Prontidao` (que tem gesto), e a CLI é que os imprime.
    ///
    /// O dia em que apareceu a quarta face — a agêntica, que lê o **JSON** da
    /// ilha e não o terminal — foi o dia em que a falta ficou a fazer falta:
    /// um agente que recebe `pagina.inexistente` e a frase *"Esta página não
    /// existe neste produto"* fica a saber o que aconteceu e **não** o que
    /// fazer. Que é exactamente o que a regra dos três elementos existe para
    /// impedir.
    pub fn gesto(&self) -> &'static str {
        match self {
            Self::Ligacao { .. } => "Verificar o banco: aegis ilha estado",
            Self::MigracaoAlterada { .. } => {
                "Uma migracao ja aplicada mudou de conteudo — isto e' um erro de build"
            }
            Self::MigracaoFalhou { .. } => "Ver a migracao que falhou e o banco da ilha",
            Self::MigracaoOcupada => {
                "Esperar a outra aplicacao terminar, ou ver se ha um processo preso"
            }
            Self::TenantInexistente { .. } => "Aplicar o vertical: aegis ilha instalar",
            Self::ChaveDuplicada { .. } => "Mudar a chave, ou atualizar o que ja existe",
            Self::ObjetoInvisivel { .. } => "Ver a chave e o tenant da ilha",
            Self::TipoDesconhecido { .. } => "O tipo nao esta no manifesto deste produto",
            Self::Banco(_) => "Corrigir a configuracao do banco",
            Self::Contrato(_) | Self::Cardinalidade(_) => {
                "O valor nao passa pelo contrato do tipo — ver o codigo do erro"
            }
            Self::Vertical(_) => "A pasta nao e um vertical valido",
            Self::RaizInvalida { .. } => "A base de dados nao e a que a ilha espera",
        }
    }
}

pub type Resultado<T> = Result<T, ErroStore>;
