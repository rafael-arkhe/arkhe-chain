//! Erros de manifesto.
//!
//! A regra da casa: **erro que chega à tela traduz por código, nunca por
//! casamento de texto**. Cada variante abaixo é um código fechado; a frase em
//! português é montada aqui, junto dos dados, e quem traduz é o leitor.

use std::path::PathBuf;

/// Erro de leitura/parse do ficheiro de manifesto.
#[derive(Debug, thiserror::Error)]
pub enum ManifestError {
    #[error("o manifesto não foi encontrado em {caminho}")]
    NaoEncontrado { caminho: PathBuf },

    #[error("não consegui ler {caminho}: {fonte}")]
    Leitura {
        caminho: PathBuf,
        #[source]
        fonte: std::io::Error,
    },

    #[error("o manifesto não é YAML válido: {fonte}")]
    Parse {
        #[source]
        fonte: serde_yaml::Error,
    },

    #[error("campo obrigatório ausente ou vazio: {campo}")]
    CampoObrigatorio { campo: &'static str },

    #[error("identificador inválido {valor:?} em {campo}: {motivo}")]
    IdentificadorInvalido {
        valor: String,
        campo: &'static str,
        motivo: &'static str,
    },

    #[error("{tipo} {nome:?} está declarado {vezes} vezes")]
    Duplicado {
        tipo: &'static str,
        nome: String,
        vezes: usize,
    },

    #[error("{declarado:?} referencia {referencia:?}, que não existe em {colecao}")]
    ReferenciaPendente {
        declarado: String,
        referencia: String,
        colecao: &'static str,
    },

    #[error(
        "a ligação {ligacao:?} foi usada como {encontrado}, mas o tipo de link declara {esperado}"
    )]
    LigacaoIncompativel {
        ligacao: String,
        esperado: String,
        encontrado: String,
    },

    #[error("a propriedade de título {propriedade:?} não está entre as propriedades de {tipo:?}")]
    PropriedadeDeTituloAusente { tipo: String, propriedade: String },

    #[error("a propriedade {propriedade:?} de {tipo:?} precisa de sub-esquema (fields/items)")]
    SubesquemaAusente { tipo: String, propriedade: String },

    #[error("a página inicial {slug:?} não está entre as páginas declaradas")]
    HomeInexistente { slug: String },

    #[error("o ficheiro {caminho} é referenciado pelo manifesto e não existe")]
    FicheiroAusente { caminho: PathBuf },

    #[error("a pasta {caminho} não é um vertical: falta {falta}")]
    NaoEhVertical {
        caminho: PathBuf,
        falta: &'static str,
    },
}

impl ManifestError {
    /// Código fechado, para a tela traduzir por ele e nunca por texto.
    pub fn codigo(&self) -> &'static str {
        match self {
            Self::NaoEncontrado { .. } => "manifesto.ausente",
            Self::Leitura { .. } => "manifesto.ilegivel",
            Self::Parse { .. } => "manifesto.invalido",
            Self::CampoObrigatorio { .. } => "manifesto.campo-obrigatorio",
            Self::IdentificadorInvalido { .. } => "manifesto.identificador-invalido",
            Self::Duplicado { .. } => "manifesto.duplicado",
            Self::ReferenciaPendente { .. } => "manifesto.referencia-pendente",
            Self::LigacaoIncompativel { .. } => "manifesto.ligacao-incompativel",
            Self::PropriedadeDeTituloAusente { .. } => "manifesto.titulo-ausente",
            Self::SubesquemaAusente { .. } => "manifesto.subesquema-ausente",
            Self::HomeInexistente { .. } => "manifesto.home-inexistente",
            Self::FicheiroAusente { .. } => "manifesto.ficheiro-ausente",
            Self::NaoEhVertical { .. } => "manifesto.nao-e-vertical",
        }
    }

    /// Frase em português, montada por quem tem os dados.
    pub fn humano(&self) -> String {
        self.to_string()
    }
}
