//! Erros de página. Fechados, com código — a tela traduz por estes, nunca por
//! texto.

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum ErroPagina {
    #[error("a página não tem o formato esperado: {detalhe}")]
    Formato { detalhe: String },

    #[error("a página {slug:?} não tem blocos")]
    SemBlocos { slug: String },

    #[error("a página {slug:?} pede refresh a cada 0 segundos")]
    RefreshInvalido { slug: String },

    #[error("a página {slug:?} tem duas variáveis chamadas {id:?}")]
    Duplicada { slug: String, id: String },

    #[error("a variável {id:?} da página {slug:?} precisa de {campo:?}")]
    CampoObrigatorio {
        slug: String,
        id: String,
        campo: &'static str,
    },

    #[error("a variável {de:?} da página {slug:?} não existe")]
    VariavelPendente { slug: String, de: String },

    #[error("a agregação da página {slug:?} aponta para {de:?}, que também é agregação")]
    AgregacaoDeAggregacao { slug: String, de: String },

    #[error("a página {slug:?} usa o tipo {objeto:?}, que o vertical não declara")]
    TipoDesconhecido { slug: String, objeto: String },

    #[error("a página {slug:?} pede a coluna {coluna:?} de {objeto:?}, que não existe nele")]
    ColunaDesconhecida {
        slug: String,
        objeto: String,
        coluna: String,
    },
}

impl ErroPagina {
    /// O **catálogo** de motivos, para a referência do produto.
    ///
    /// 🔴 Um valor por motivo, com a **carga a vazio** — e isso parece
    /// desonesto até se perceber o que se cataloga: o **código**, a **frase**
    /// e o **gesto**. Nenhum dos três olha para a carga, e por isso o valor
    /// aqui é inerte: existe para o `match` de `codigo()` ter o que casar.
    ///
    /// A alternativa seria uma tabela de `(&código, &frase, &gesto)` escrita à
    /// mão — e isso **duplicaria** as três coisas, que é exatamente o defeito
    /// que este repo existe para matar: duas versões divergem no primeiro caso
    /// de borda, e a divergência é silenciosa.
    ///
    /// 🔴 A lista é escrita à mão e o compilador **não** a liga ao enum — um
    /// motivo novo entra no `match` e fica de fora daqui, e a referência passa
    /// a estar errada sem ninguém dar por isso. A cura é a guarda que
    /// acompanha a referência, e o resto é a nota em
    /// [`aegis_license::Motivo::todos`].
    pub fn catalogo() -> Vec<ErroPagina> {
        use ErroPagina::*;
        vec![
            Formato {
                detalhe: String::new(),
            },
            SemBlocos {
                slug: String::new(),
            },
            RefreshInvalido {
                slug: String::new(),
            },
            Duplicada {
                slug: String::new(),
                id: String::new(),
            },
            CampoObrigatorio {
                slug: String::new(),
                id: String::new(),
                campo: "",
            },
            VariavelPendente {
                slug: String::new(),
                de: String::new(),
            },
            AgregacaoDeAggregacao {
                slug: String::new(),
                de: String::new(),
            },
            TipoDesconhecido {
                slug: String::new(),
                objeto: String::new(),
            },
            ColunaDesconhecida {
                slug: String::new(),
                objeto: String::new(),
                coluna: String::new(),
            },
        ]
    }

    pub fn codigo(&self) -> &'static str {
        match self {
            Self::Formato { .. } => "pagina.formato",
            Self::SemBlocos { .. } => "pagina.sem-blocos",
            Self::RefreshInvalido { .. } => "pagina.refresh-invalido",
            Self::Duplicada { .. } => "pagina.variavel-duplicada",
            Self::CampoObrigatorio { .. } => "pagina.campo-obrigatorio",
            Self::VariavelPendente { .. } => "pagina.variavel-pendente",
            Self::AgregacaoDeAggregacao { .. } => "pagina.agregacao-de-agregacao",
            Self::TipoDesconhecido { .. } => "pagina.tipo-desconhecido",
            Self::ColunaDesconhecida { .. } => "pagina.coluna-desconhecida",
        }
    }

    /// O que a tela diz. Montada aqui, por quem tem o dado.
    pub fn humano(&self) -> &'static str {
        match self {
            Self::Formato { .. } => "Esta página não tem o formato esperado.",
            Self::SemBlocos { .. } => "Esta página ainda não tem blocos.",
            Self::RefreshInvalido { .. } => {
                "Esta página pede uma atualização a cada zero segundos."
            }
            Self::Duplicada { .. } => "Há duas variáveis com o mesmo nome nesta página.",
            Self::CampoObrigatorio { .. } => "Falta um campo numa variável desta página.",
            Self::VariavelPendente { .. } => "Esta página usa uma variável que não existe.",
            Self::AgregacaoDeAggregacao { .. } => {
                "Só se pode contar um conjunto, não uma contagem."
            }
            Self::TipoDesconhecido { .. } => "Esta página usa um tipo que o produto não declara.",
            Self::ColunaDesconhecida { .. } => "Esta página pede uma coluna que o tipo não tem.",
        }
    }

    /// 🔴 O que a pessoa pode fazer. **Ação**, não diagnóstico.
    ///
    /// 🔴 Este método **não existia**, e a sua falta é um defeito da casa e
    /// não um esquecimento: a regra é *"cada recusa tem código, frase **e
    /// gesto**"*, e sem gesto a tela mostra *"Esta página usa um tipo que o
    /// produto não declara"* e deixa o operador sem saber o que fazer. É a
    /// mesma classe do erro que mandava "Renovar a licença" para um gesto que
    /// não existia — aqui a falta é a ação, lá era a ação que não havia.
    ///
    /// E note-se que **todas** as recusas de página se corrigem no Construtor:
    /// a página é um artefacto gerado, e o que a gera é a pessoa que está à
    /// frente dela. Uma recusa de página que mandasse "abrir um ticket" seria
    /// dizer que a página é de outra pessoa — e não é.
    pub fn gesto(&self) -> &'static str {
        match self {
            Self::Formato { .. } | Self::CampoObrigatorio { .. } => {
                "Abrir a página no Construtor e guardar"
            }
            Self::SemBlocos { .. } => "Acrescentar um bloco à página no Construtor",
            Self::RefreshInvalido { .. } => {
                "Pôr um intervalo de atualização maior que zero — ou nenhum"
            }
            Self::Duplicada { .. } | Self::VariavelPendente { .. } => {
                "Dar a cada variável um nome próprio nesta página"
            }
            Self::AgregacaoDeAggregacao { .. } => "Contar um conjunto, não uma contagem",
            Self::TipoDesconhecido { .. } => {
                "Acrescentar o tipo ao vertical, ou tirar a tabela da página"
            }
            Self::ColunaDesconhecida { .. } => {
                "Acrescentar a propriedade ao tipo, ou trocar a coluna"
            }
        }
    }
}

/// Erros da **montagem** — o que o Construtor grava.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum ErroMontagem {
    #[error("o identificador {id:?} não serve: {detalhe}")]
    Identificador { id: String, detalhe: String },

    #[error("um vertical sem `licenca.exige` instala sem licença nenhuma")]
    SemLicenca,

    #[error("um vertical sem tipos não tem o que mostrar")]
    SemTipos,

    #[error("um vertical sem páginas não tem tela")]
    SemPaginas,

    #[error("o vertical recusou a montagem: {detalhe}")]
    Vertical { detalhe: String },

    #[error("a página {slug:?} recusou: {detalhe}")]
    Pagina { slug: String, detalhe: String },

    #[error("não consegui escrever: {detalhe}")]
    Disco { detalhe: String },

    #[error("não consegui serializar: {detalhe}")]
    Serializacao { detalhe: String },
}

impl ErroMontagem {
    /// O **catálogo** de motivos, para a referência do produto. Com a carga a
    /// vazio, como em [`ErroPagina::catalogo`] — o que se cataloga é o código,
    /// a frase e o gesto, e nenhum dos três olha para a carga.
    pub fn catalogo() -> Vec<ErroMontagem> {
        use ErroMontagem::*;
        vec![
            Identificador {
                id: String::new(),
                detalhe: String::new(),
            },
            SemLicenca,
            SemTipos,
            SemPaginas,
            Vertical {
                detalhe: String::new(),
            },
            Pagina {
                slug: String::new(),
                detalhe: String::new(),
            },
            Disco {
                detalhe: String::new(),
            },
            Serializacao {
                detalhe: String::new(),
            },
        ]
    }

    pub fn codigo(&self) -> &'static str {
        match self {
            Self::Identificador { .. } => "montagem.identificador",
            Self::SemLicenca => "montagem.sem-licenca",
            Self::SemTipos => "montagem.sem-tipos",
            Self::SemPaginas => "montagem.sem-paginas",
            Self::Vertical { .. } => "montagem.vertical-invalido",
            Self::Pagina { .. } => "montagem.pagina-invalida",
            Self::Disco { .. } => "montagem.disco",
            Self::Serializacao { .. } => "montagem.serializacao",
        }
    }

    /// O que a tela diz. **Montada aqui**, por quem tem o dado.
    ///
    /// 🔴 Esta função devolveva `self.to_string()` — o `Display` — e isso punha
    /// na tela o **texto técnico com o caminho e o slug dentro**: *"o vertical
    /// recusou a montagem: `montagem.vertical-invalido`"*. É a mesma confusão
    /// que a Bridge da casa já registou do outro lado: mostrar o
    /// `Detalhe` quando a medição já trazia a frase humana, e o operador fica
    /// a ler o código em vez da frase.
    ///
    /// O `Display` continua a ser o texto técnico — é para o log e para o
    /// `--verbose`. A tela lê isto.
    pub fn humano(&self) -> &'static str {
        match self {
            Self::Identificador { .. } => "Este nome não serve para um produto.",
            Self::SemLicenca => {
                "Este produto não diz que licença exige — e sem isso instala sem licença nenhuma."
            }
            Self::SemTipos => "Um produto sem tipos não tem nada para mostrar.",
            Self::SemPaginas => "Um produto sem páginas não tem tela.",
            Self::Vertical { .. } => "O produto recusou o que foi montado.",
            Self::Pagina { .. } => "Uma das páginas recusou o que foi montado.",
            Self::Disco { .. } => "Não consegui escrever no sítio onde o produto vive.",
            Self::Serializacao { .. } => "Não consegui transformar o que foi montado em ficheiro.",
        }
    }

    /// 🔴 O que a pessoa pode fazer. **Ação**, não diagnóstico.
    ///
    /// 🔴 Este método **não existia**, e a regra da casa é *"cada recusa tem
    /// código, frase **e gesto**"*. Sem ele, a tela do Construtor mostrava o
    /// que faltava e não o que fazer — e o Construtor é a pessoa que está a
    /// olhar para a falha, portanto o gesto aponta sempre para lá.
    pub fn gesto(&self) -> &'static str {
        match self {
            Self::Identificador { .. } => "Escolher outro nome para o produto",
            // 🔴 Um vertical sem `licenca.exige` instala sem licença nenhuma, e
            // essa é a forma mais barata de o produto inteiro sair de graça.
            // A recusa é o oposto disso, e o gesto tem de dizer porquê.
            Self::SemLicenca => {
                "Declarar no vertical que produto este é — sem isso, instala sem licença"
            }
            Self::SemTipos => "Acrescentar pelo menos um tipo ao produto",
            Self::SemPaginas => "Acrescentar pelo menos uma página ao produto",
            Self::Vertical { .. } | Self::Pagina { .. } => {
                "Abrir o Construtor e corrigir o que está assinalado"
            }
            Self::Disco { .. } => "Verificar se a pasta do vertical é gravável",
            Self::Serializacao { .. } => "Verificar o que está no campo de texto e guardar",
        }
    }
}
