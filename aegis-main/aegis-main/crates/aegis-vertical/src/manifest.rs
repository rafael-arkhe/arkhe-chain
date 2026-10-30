//! O manifesto de vertical.
//!
//! **A regra que dá sentido a tudo:** um vertical é *dado*, nunca código.
//! Este crate é o **único** que conhece o slug de um vertical — nenhum outro
//! crate do workspace recebe um `VerticalId` hardcoded, e nenhum vertical
//! importa outro. Adicionar um domínio = **adicionar uma pasta**.
//!
//! Isto substitui o `GateDaSeed()`, que no núcleo anterior é um `switch`
//! *fechado* em `AegisInstalacao.cs` e é a causa do defeito "Declarar não
//! implanta" (14/09/2026): um switch fechado é um lugar onde o vertical pode
//! divergir da verdade, e ninguém é avisado.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::ManifestError;

/// Ficheiro que descreve um vertical.
pub const NOME_MANIFESTO: &str = "vertical.yaml";

// ---------------------------------------------------------------------------
// Identificadores
// ---------------------------------------------------------------------------

/// Slug de vertical: `minusculas-separadas`, 2..=40 caracteres.
///
/// ⚠️ **Não confie no deserializador.** O `#[serde(transparent)]` constrói o
/// valor a partir de um `String` cru **sem passar por [`VerticalId::novo`]** —
/// foi medido: `id: Cadernal` entrava e saía do parser sem reclamar. Por isso
/// [`Manifesto::validar`] chama [`VerticalId::validar`], e o teste
/// `recusa_vertical_com_id_invalido` existe para travar essa chamada.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct VerticalId(String);

impl VerticalId {
    /// Campo do manifesto ao qual este id pertence, usado na mensagem de erro.
    const CAMPO: &'static str = "id";

    pub fn novo(valor: &str) -> Result<Self, ManifestError> {
        if valor.is_empty() {
            return Err(ManifestError::CampoObrigatorio { campo: Self::CAMPO });
        }
        if valor.len() < 2 || valor.len() > 40 {
            return Err(ManifestError::IdentificadorInvalido {
                valor: valor.to_string(),
                campo: Self::CAMPO,
                motivo: "deve ter entre 2 e 40 caracteres",
            });
        }
        if !valor
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        {
            return Err(ManifestError::IdentificadorInvalido {
                valor: valor.to_string(),
                campo: Self::CAMPO,
                motivo: "só pode ter minúsculas, dígitos e hífen",
            });
        }
        if valor.starts_with('-') || valor.ends_with('-') || valor.contains("--") {
            return Err(ManifestError::IdentificadorInvalido {
                valor: valor.to_string(),
                campo: Self::CAMPO,
                motivo: "o hífen não pode abrir, fechar nem repetir",
            });
        }
        Ok(Self(valor.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Confere a forma de um id que veio do deserializador.
    ///
    /// É o mesmo caminho de [`VerticalId::novo`], sem alocar um id novo — o
    /// deserializador já construiu o valor e só falta dizer que ele não presta.
    pub fn validar(&self) -> Result<(), ManifestError> {
        Self::novo(&self.0).map(|_| ())
    }
}

impl std::fmt::Display for VerticalId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// Identificador de tipo dentro da ontologia: `minusculas_ou_maiusculas_sem_espaco`.
fn identificador_lexico(valor: &str, campo: &'static str) -> Result<(), ManifestError> {
    if valor.is_empty() {
        return Err(ManifestError::CampoObrigatorio { campo });
    }
    if valor.len() > 64 {
        return Err(ManifestError::IdentificadorInvalido {
            valor: valor.to_string(),
            campo,
            motivo: "passa de 64 caracteres",
        });
    }
    let ok = valor
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if !ok || valor.starts_with('-') || valor.ends_with('-') {
        return Err(ManifestError::IdentificadorInvalido {
            valor: valor.to_string(),
            campo,
            motivo: "só pode ter letras, dígitos, sublinhado e hífen, e não começa nem acaba em hífen",
        });
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Marca
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Brand {
    /// Nome que o operador vê.
    pub nome: String,
    #[serde(default)]
    pub logo: Option<PathBuf>,
    #[serde(default)]
    pub cor_primaria: Option<String>,
}

// ---------------------------------------------------------------------------
// Licença
// ---------------------------------------------------------------------------

/// Que licença esta ilha exige para rodar.
///
/// 🔴 A licença é conferida **por vertical**: um vertical novo não pode ser
/// instalado por uma licença que não o declara. É por isso que isto é campo
/// do manifesto e não um `match` no motor.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Licenca {
    /// O que a licença precisa declarar para este vertical ser instalável.
    pub exige: String,
    /// Se a licença é verificada contra o fingerprint desta máquina.
    #[serde(default = "padrao_true")]
    pub node_locked: bool,
}

fn padrao_true() -> bool {
    true
}

impl Default for Licenca {
    /// Um vertical sem licença declarada é **recusado** na validação
    /// (`exige` vazio), e não aceito com um valor inventado. O default existe
    /// só para o parser devolver o erro com código certo.
    fn default() -> Self {
        Self {
            exige: String::new(),
            node_locked: padrao_true(),
        }
    }
}

// ---------------------------------------------------------------------------
// Ontologia
// ---------------------------------------------------------------------------

/// Tipo de uma propriedade.
///
/// 🔴 **Só variantes unitárias.** O sub-esquema de `struct` e de `lista` mora
/// em campos IRMÃOS (`campos`, `itens`), e não aninhado dentro da variante.
///
/// A lição é medida: o `serde_yaml` trata a chave `struct:` de um mapa
/// aninhado como **tag YAML** e recusa com *"invalid type: map, expected a
/// YAML tag starting with '!'"*. O formato achatado elimina a colisão de vez e
/// ainda fica mais fácil de escrever à mão:
/// ```yaml
/// - nome: endereco
///   tipo: struct
///   campos:
///     - { nome: rua,    tipo: texto }
///     - { nome: numero, tipo: texto }
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TipoPropriedade {
    Texto,
    Numero,
    Booleano,
    Data,
    Geoponto,
    Vetor,
    SerieTemporal,
    Struct,
    Lista,
}

/// 🔴 `struct` e `lista` **exigem** sub-esquema (`campos` / `itens`). É a
/// lição da onda 8 do núcleo anterior: tipo rico sem esquema é um `dict` que
/// ninguém sabe ler.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Propriedade {
    pub nome: String,
    #[serde(rename = "tipo")]
    pub tipo: TipoPropriedade,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotulo: Option<String>,
    /// Sub-esquema — obrigatório quando `tipo: struct`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub campos: Vec<Propriedade>,
    /// Tipo do item — obrigatório quando `tipo: lista`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub itens: Option<Box<Propriedade>>,
}

impl Propriedade {
    const CAMPO: &'static str = "propriedade";

    fn validar(&self, dono: &str) -> Result<(), ManifestError> {
        identificador_lexico(&self.nome, Self::CAMPO)?;
        if let Some(rotulo) = &self.rotulo
            && rotulo.trim().is_empty()
        {
            return Err(ManifestError::CampoObrigatorio {
                campo: "propriedade.rotulo",
            });
        }
        match self.tipo {
            TipoPropriedade::Struct => {
                if self.campos.is_empty() {
                    return Err(ManifestError::SubesquemaAusente {
                        tipo: dono.to_string(),
                        propriedade: self.nome.clone(),
                    });
                }
                for campo in &self.campos {
                    campo.validar(dono)?;
                }
            }
            TipoPropriedade::Lista => match &self.itens {
                None => {
                    return Err(ManifestError::SubesquemaAusente {
                        tipo: dono.to_string(),
                        propriedade: self.nome.clone(),
                    });
                }
                Some(item) => item.validar(dono)?,
            },
            _ => {}
        }
        Ok(())
    }

    /// Nome legível, para quando o `rotulo` não foi declarado.
    pub fn rotulo_ou_nome(&self) -> &str {
        self.rotulo.as_deref().unwrap_or(&self.nome)
    }
}

impl TipoPropriedade {
    /// O nome no vocabulário do manifesto — o mesmo que o técnico escreve no
    /// YAML. Uma mensagem de recusa que mostra `Numero` em vez de `numero`
    /// obriga quem lê a saber aonde ir ver o erro.
    pub fn nome(&self) -> &'static str {
        match self {
            Self::Texto => "texto",
            Self::Numero => "numero",
            Self::Booleano => "booleano",
            Self::Data => "data",
            Self::Geoponto => "geoponto",
            Self::Vetor => "vetor",
            Self::SerieTemporal => "serie_temporal",
            Self::Struct => "struct",
            Self::Lista => "lista",
        }
    }
}

impl std::fmt::Display for TipoPropriedade {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.nome())
    }
}

/// 🔴 `enforce: strict` é **hard-reject**: uma escrita com a propriedade do
/// tipo errado é recusada. É o degrau que separa "parece que valida" de
/// "valida".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Reforcamento {
    #[default]
    Lenient,
    Strict,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TipoObjeto {
    pub nome: String,
    /// Propriedade que dá o rótulo humano da instância.
    pub propriedade_titulo: String,
    #[serde(default)]
    pub rotulo: Option<String>,
    pub propriedades: Vec<Propriedade>,
    #[serde(default)]
    pub reforco: Reforcamento,
}

impl TipoObjeto {
    const CAMPO: &'static str = "ontologia.tipos";

    fn validar(&self) -> Result<(), ManifestError> {
        identificador_lexico(&self.nome, Self::CAMPO)?;
        if self.propriedades.is_empty() {
            return Err(ManifestError::CampoObrigatorio {
                campo: "ontologia.tipos.propriedades",
            });
        }

        let mut vistas: BTreeSet<&str> = BTreeSet::new();
        for p in &self.propriedades {
            p.validar(&self.nome)?;
            if !vistas.insert(p.nome.as_str()) {
                return Err(ManifestError::Duplicado {
                    tipo: "propriedade",
                    nome: p.nome.clone(),
                    vezes: self
                        .propriedades
                        .iter()
                        .filter(|q| q.nome == p.nome)
                        .count(),
                });
            }
        }

        if !self
            .propriedades
            .iter()
            .any(|p| p.nome == self.propriedade_titulo)
        {
            return Err(ManifestError::PropriedadeDeTituloAusente {
                tipo: self.nome.clone(),
                propriedade: self.propriedade_titulo.clone(),
            });
        }
        Ok(())
    }

    /// Nome legível do tipo, para quando o `rotulo` não foi declarado.
    pub fn rotulo_ou_nome(&self) -> &str {
        self.rotulo.as_deref().unwrap_or(&self.nome)
    }
}

/// 🔴 Cardinalidade é declarada e **forçada**, não um rótulo num `metadata`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Cardinalidade {
    OneToOne,
    OneToMany,
    ManyToOne,
    ManyToMany,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TipoLink {
    pub nome: String,
    /// Tipo de objeto de origem.
    pub de: String,
    /// Tipo de objeto de destino.
    pub para: String,
    pub cardinalidade: Cardinalidade,
    #[serde(default)]
    pub rotulo: Option<String>,
}

impl TipoLink {
    const CAMPO: &'static str = "ontologia.links";

    fn validar(&self) -> Result<(), ManifestError> {
        identificador_lexico(&self.nome, Self::CAMPO)?;
        identificador_lexico(&self.de, Self::CAMPO)?;
        identificador_lexico(&self.para, Self::CAMPO)?;
        Ok(())
    }

    pub fn rotulo_ou_nome(&self) -> &str {
        self.rotulo.as_deref().unwrap_or(&self.nome)
    }
}

/// O que uma ação faz, em vocabulário fechado.
///
/// Vocabulário fechado é regra da casa: um `match` que aceita
/// `code_ref::free_text` vira shell. Aqui o verbo é dado.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RegraAcao {
    CriarObjeto,
    ModificarObjeto,
    RemoverObjeto,
    CriarLink,
    RemoverLink,
    Notificar,
    ChamarServico,
}

impl RegraAcao {
    /// O verbo que aparece na tela — **o mesmo** que o motor executa.
    pub fn verbo(&self) -> &'static str {
        match self {
            Self::CriarObjeto => "Cria",
            Self::ModificarObjeto => "Modifica",
            Self::RemoverObjeto => "Remove",
            Self::CriarLink => "Liga",
            Self::RemoverLink => "Desvincula",
            Self::Notificar => "Notifica",
            Self::ChamarServico => "Chama serviço",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TipoAcao {
    pub nome: String,
    /// Tipo de objeto que a ação edita.
    pub alvo: String,
    pub regra: RegraAcao,
    #[serde(default)]
    pub rotulo: Option<String>,
}

impl TipoAcao {
    const CAMPO: &'static str = "ontologia.acoes";

    fn validar(&self) -> Result<(), ManifestError> {
        identificador_lexico(&self.nome, Self::CAMPO)?;
        identificador_lexico(&self.alvo, Self::CAMPO)?;
        Ok(())
    }

    pub fn rotulo_ou_nome(&self) -> &str {
        self.rotulo.as_deref().unwrap_or(&self.nome)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Ontologia {
    #[serde(default)]
    pub tipos: Vec<TipoObjeto>,
    #[serde(default)]
    pub links: Vec<TipoLink>,
    #[serde(default)]
    pub acoes: Vec<TipoAcao>,
}

// ---------------------------------------------------------------------------
// Páginas e menu
// ---------------------------------------------------------------------------

/// Uma página declarada. O ficheiro é o **mesmo formato que a UI do Construtor
/// grava** — o seed deixa de ser caminho, e a página passa a circular entre os
/// dois sem tradução no meio.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Pagina {
    pub slug: String,
    pub ficheiro: PathBuf,
    #[serde(default)]
    pub rotulo: Option<String>,
}

impl Pagina {
    fn validar(&self) -> Result<(), ManifestError> {
        identificador_lexico(&self.slug, "paginas.slug")?;
        if self.ficheiro.as_os_str().is_empty() {
            return Err(ManifestError::CampoObrigatorio {
                campo: "paginas.ficheiro",
            });
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Menu {
    /// Slug da página inicial. Tem de existir em `paginas`.
    #[serde(default)]
    pub home: Option<String>,
    /// 🔴 O placeholder de busca **só** é escrito quando o valor atual está
    /// vazio ou é o de fábrica — texto do operador é sagrado.
    #[serde(default)]
    pub busca_placeholder: Option<String>,
}

/// Uma instância que o vertical traz consigo.
///
/// 🔴 Isto é o que substitui o **seed em Python**. Um hotel tem quartos e
/// unidades; uma escola tem salas; um parque tem sectors. Esse catálogo é
/// **dado do domínio**, e dado do domínio vai no manifesto — não em
/// 1.500 linhas de Python que ninguém sabe atualizar sem abrir um
/// interpretador.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Dado {
    /// Tipo de objeto, e tem de estar declarado em `ontologia.tipos`.
    pub tipo: String,
    /// A identidade canônica. `null` = linha sem chave própria.
    #[serde(default)]
    pub chave: Option<String>,
    #[serde(default)]
    pub propriedades: serde_json::Value,
}

/// Uma aresta entre dois `dados`.
///
/// 🔴 Sem isto, um vertical que declara `links` fica com **zero** arestas: as
/// relações existem no papel e não existem no banco. O grafo do contrato
/// descrevia uma coisa e o dado não a confirmava.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Ligacao {
    /// O tipo de link, que tem de estar declarado em `ontologia.links`.
    pub nome: String,
    /// A ponta de origem, por tipo + chave canônica.
    pub de: Referencia,
    /// A ponta de destino.
    pub para: Referencia,
}

/// Aponta para um `dado` pelo seu tipo e chave canônica.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Referencia {
    pub tipo: String,
    pub chave: String,
}

// ---------------------------------------------------------------------------
// Saúde
// ---------------------------------------------------------------------------

/// Convenção greenboot: `exigido/*.sh` reprova a ilha; `opcional/*.sh` só
/// aparece. O agente **não sabe** o que eles checam — é a vertical que sabe.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Saude {
    #[serde(default)]
    pub exigido: Vec<PathBuf>,
    #[serde(default)]
    pub opcional: Vec<PathBuf>,
}

// ---------------------------------------------------------------------------
// O manifesto
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Manifesto {
    pub id: VerticalId,
    /// Versão do **manifesto**, independente da versão do seed. Uma ilha só
    /// está pronta quando a versão guardada bate com esta.
    pub versao: u32,
    #[serde(default)]
    pub titulo: Option<String>,
    #[serde(default)]
    pub brand: Brand,
    /// 🔴 `#[serde(default)]` **de propósito**: sem isto, um manifesto sem
    /// `licenca` morre no parser com *"missing field `licenca`"* — um erro
    /// técnico, sem código, que a tela não sabe traduzir. Com o default, o
    /// vertical chega à validação e volta como `manifesto.campo-obrigatorio`,
    /// que **é** traduzível.
    #[serde(default)]
    pub licenca: Licenca,
    #[serde(default)]
    pub ontologia: Ontologia,
    /// Pelo mesmo motivo de `licenca` — a falta de páginas é um erro de
    /// conteúdo, e precisa de código próprio.
    #[serde(default)]
    pub paginas: Vec<Pagina>,
    #[serde(default)]
    pub menu: Menu,
    /// O catálogo que o vertical traz consigo. É o **seed**, em dados.
    #[serde(default)]
    pub dados: Vec<Dado>,
    /// As arestas entre esses dados.
    #[serde(default)]
    pub ligacoes: Vec<Ligacao>,
    #[serde(default)]
    pub saude: Saude,

    /// Pasta onde o manifesto foi lido. Não vai para o YAML: é fato do disco,
    /// não do manifesto, e os `paginas[].ficheiro` são relativos a ela.
    #[serde(skip)]
    pub pasta: PathBuf,
}

impl Manifesto {
    /// 🔴 Confere as referências internas **sem** tocar no disco.
    ///
    /// É o que o Construtor chama antes de gravar: uma montagem ainda não
    /// escreveu ficheiro nenhum, e dizer "falta o ficheiro" a quem está a
    /// montar pela primeira vez é a resposta errada para a pergunta certa.
    /// O `carregar` continua a chamar [`Manifesto::validar`], que é esta mais a
    /// conferência do disco.
    pub fn conferir(&self) -> Result<(), ManifestError> {
        self.id.validar()?;
        self.validar_parte()
    }

    /// Valida **referências internas**. Não toca no disco — isso é do loader,
    /// que tem a pasta.
    pub fn validar(&self) -> Result<(), ManifestError> {
        self.validar_parte()
    }

    fn validar_parte(&self) -> Result<(), ManifestError> {
        // Primeiro o id: se o slug é inválido, nenhuma das mensagens seguintes
        // ajuda, porque o VerticalId errado contamina as duas.
        self.id.validar()?;

        if self.versao == 0 {
            return Err(ManifestError::CampoObrigatorio {
                campo: "versao (tem de ser >= 1)",
            });
        }
        if self.licenca.exige.trim().is_empty() {
            return Err(ManifestError::CampoObrigatorio {
                campo: "licenca.exige",
            });
        }
        if let Some(t) = &self.titulo
            && t.trim().is_empty()
        {
            return Err(ManifestError::CampoObrigatorio { campo: "titulo" });
        }
        if let Some(p) = &self.menu.busca_placeholder
            && p.trim().is_empty()
        {
            return Err(ManifestError::CampoObrigatorio {
                campo: "menu.busca_placeholder",
            });
        }

        self.validar_ontologia()?;
        self.validar_paginas()
    }

    fn validar_ontologia(&self) -> Result<(), ManifestError> {
        if self.ontologia.tipos.is_empty() {
            return Err(ManifestError::CampoObrigatorio {
                campo: "ontologia.tipos (um vertical sem tipos não tem o que mostrar)",
            });
        }

        for tipo in &self.ontologia.tipos {
            tipo.validar()?;
        }
        sem_duplicados(
            "tipo de objeto",
            self.ontologia.tipos.iter().map(|t| &t.nome),
        )?;

        let nomes: BTreeSet<&str> = self
            .ontologia
            .tipos
            .iter()
            .map(|t| t.nome.as_str())
            .collect();

        for link in &self.ontologia.links {
            link.validar()?;
            for referenced in [&link.de, &link.para] {
                if !nomes.contains(referenced.as_str()) {
                    return Err(ManifestError::ReferenciaPendente {
                        declarado: link.nome.clone(),
                        referencia: referenced.clone(),
                        colecao: "ontologia.tipos",
                    });
                }
            }
        }
        sem_duplicados("tipo de link", self.ontologia.links.iter().map(|l| &l.nome))?;

        for acao in &self.ontologia.acoes {
            acao.validar()?;
            if !nomes.contains(acao.alvo.as_str()) {
                return Err(ManifestError::ReferenciaPendente {
                    declarado: acao.nome.clone(),
                    referencia: acao.alvo.clone(),
                    colecao: "ontologia.tipos",
                });
            }
        }
        sem_duplicados("tipo de ação", self.ontologia.acoes.iter().map(|a| &a.nome))?;

        // Cada dado tem de apontar para um tipo declarado. Um dado cujo tipo
        // não existe é o sintoma "grava e a tela não mostra" — e a causa
        // aparece no load, com código, em vez de na tela, sem nada.
        for dado in &self.dados {
            if !nomes.contains(dado.tipo.as_str()) {
                return Err(ManifestError::ReferenciaPendente {
                    declarado: dado.tipo.clone(),
                    referencia: dado.tipo.clone(),
                    colecao: "ontologia.tipos",
                });
            }
        }

        // A chave canônica é a identidade. Duas linhas com a MESMA chave são a
        // mesma linha — e aplicar o catálogo duas vezes com a chave repetida
        // sobrescreve a primeira sem dizer nada.
        let mut vistas: BTreeSet<(&str, &str)> = BTreeSet::new();
        for dado in &self.dados {
            let Some(chave) = dado.chave.as_deref() else {
                continue;
            };
            if !vistas.insert((dado.tipo.as_str(), chave)) {
                return Err(ManifestError::Duplicado {
                    tipo: "dado (tipo + chave)",
                    nome: format!("{}/{}", dado.tipo, chave),
                    vezes: self
                        .dados
                        .iter()
                        .filter(|d| d.tipo == dado.tipo && d.chave.as_deref() == Some(chave))
                        .count(),
                });
            }
        }

        // 🔴 O `?` aqui não é opcional. A primeira versão desta linha veio sem
        // ele — e uma validação cujo resultado é DESCARTADO é uma validação
        // que não roda: os 4 testes das ligações passavam a aceitar manifestos
        // com arestas para o vazio. O compilador avisa (`unused_must_use`), e
        // o aviso passa. Por isso o `clippy` é gate, não decoração.
        self.validar_ligacoes(&nomes)?;

        Ok(())
    }

    /// As arestas do catálogo apontam para `dados` que existem, e para os
    /// **tipos que o link declara**.
    ///
    /// 🔴 A conferência dos tipos é a que pega o erro caro: um
    /// `reserva_no_quarto` declarado `de: reserva, para: quarto` usado com
    /// `de: {tipo: hospede}` grava a aresta e produz um grafo que ninguém
    /// consegue ler — e o sintoma aparece na tela, do lado do operador, sem
    /// nada em vermelho no banco.
    fn validar_ligacoes(&self, nomes: &BTreeSet<&str>) -> Result<(), ManifestError> {
        let dados: BTreeSet<(&str, &str)> = self
            .dados
            .iter()
            .filter_map(|d| d.chave.as_deref().map(|c| (d.tipo.as_str(), c)))
            .collect();

        for ligacao in &self.ligacoes {
            let link = self
                .ontologia
                .links
                .iter()
                .find(|l| l.nome == ligacao.nome)
                .ok_or_else(|| ManifestError::ReferenciaPendente {
                    declarado: ligacao.nome.clone(),
                    referencia: ligacao.nome.clone(),
                    colecao: "ontologia.links",
                })?;

            for ponta in [&ligacao.de, &ligacao.para] {
                if !nomes.contains(ponta.tipo.as_str()) {
                    return Err(ManifestError::ReferenciaPendente {
                        declarado: ligacao.nome.clone(),
                        referencia: ponta.tipo.clone(),
                        colecao: "ontologia.tipos",
                    });
                }
                if !dados.contains(&(ponta.tipo.as_str(), ponta.chave.as_str())) {
                    return Err(ManifestError::ReferenciaPendente {
                        declarado: ligacao.nome.clone(),
                        referencia: format!("{}/{}", ponta.tipo, ponta.chave),
                        colecao: "dados",
                    });
                }
            }

            // Os tipos das pontas têm de bater com os do link declarado.
            let esperado_de = if ligacao.de.tipo == link.de {
                None
            } else {
                Some(link.de.as_str())
            };
            let esperado_para = if ligacao.para.tipo == link.para {
                None
            } else {
                Some(link.para.as_str())
            };
            if let Some(esperado) = esperado_de {
                return Err(ManifestError::LigacaoIncompativel {
                    ligacao: ligacao.nome.clone(),
                    esperado: format!("de: {esperado}, para: {}", link.para),
                    encontrado: format!("de: {}, para: {}", ligacao.de.tipo, ligacao.para.tipo),
                });
            }
            if let Some(esperado) = esperado_para {
                return Err(ManifestError::LigacaoIncompativel {
                    ligacao: ligacao.nome.clone(),
                    esperado: format!("de: {}, para: {esperado}", link.de),
                    encontrado: format!("de: {}, para: {}", ligacao.de.tipo, ligacao.para.tipo),
                });
            }
        }

        Ok(())
    }

    fn validar_paginas(&self) -> Result<(), ManifestError> {
        if self.paginas.is_empty() {
            return Err(ManifestError::CampoObrigatorio {
                campo: "paginas (um vertical sem página não tem tela)",
            });
        }
        for pagina in &self.paginas {
            pagina.validar()?;
        }
        sem_duplicados("página", self.paginas.iter().map(|p| &p.slug))?;

        if let Some(home) = &self.menu.home
            && !self.paginas.iter().any(|p| &p.slug == home)
        {
            return Err(ManifestError::HomeInexistente { slug: home.clone() });
        }
        Ok(())
    }

    /// Caminho absoluto de uma página, resolvido contra a pasta do manifesto.
    pub fn caminho_de_pagina(&self, slug: &str) -> Option<PathBuf> {
        self.paginas
            .iter()
            .find(|p| p.slug == slug)
            .map(|p| self.pasta.join(&p.ficheiro))
    }

    pub fn tipo(&self, nome: &str) -> Option<&TipoObjeto> {
        self.ontologia.tipos.iter().find(|t| t.nome == nome)
    }

    pub fn pagina(&self, slug: &str) -> Option<&Pagina> {
        self.paginas.iter().find(|p| p.slug == slug)
    }

    /// A pasta onde o vertical foi carregado.
    ///
    /// 🔴 Quem **grava** precisa dela, e quem grava não é o loader: é o
    /// Construtor. Sem este acesso, o editor tinha de receber a pasta por
    /// parâmetro de query string — e um caminho de escrita cuja pasta vem da URL é um
    /// caminho de escrita que se pode apontar para outro sítio.
    pub fn pasta_ref(&self) -> &Path {
        &self.pasta
    }

    /// Versão esperada do seed desta ilha — o que `/health/ready` compara com
    /// o marcador no banco. `/health` sozinho **mente**: prova que o processo
    /// responde, não que o produto está pronto.
    pub fn versao_do_seed(&self) -> u32 {
        self.versao
    }
}

fn sem_duplicados<'a>(
    tipo: &'static str,
    nomes: impl Iterator<Item = &'a String>,
) -> Result<(), ManifestError> {
    let mut vistos: BTreeSet<&str> = BTreeSet::new();
    let todos: Vec<&String> = nomes.collect();
    for nome in &todos {
        if !vistos.insert(nome.as_str()) {
            return Err(ManifestError::Duplicado {
                tipo,
                nome: (*nome).clone(),
                vezes: todos.iter().filter(|o| **o == nome.as_str()).count(),
            });
        }
    }
    Ok(())
}

/// Existe um `vertical.yaml` nesta pasta?
pub fn parece_vertical(pasta: &Path) -> bool {
    pasta.join(NOME_MANIFESTO).is_file()
}
