//! Papéis e escopo — o que um login alcança.
//!
//! 🔴 A regra é pura e não toca em banco, e é essa a razão de ela ser uma
//! **função** e não uma lista de `if` espalhados. O `frota-app` já a tinha
//! como módulo puro (`papeis.py`, 195 linhas) e ela continuava a ser
//! reimplementada — no painel, no produto, no roteador — porque "só um
//! `if` a mais" não custa e a divergência só aparece quando alguém perde
//! acesso a uma ilha que não devia.
//!
//! # As três invariantes
//!
//! 1. 🔴 **Papel com escopo e sem vínculo é RECUSADO** — nunca "vê tudo".
//!    Um papel que responde a um pedido de âmbito sem dizer de quem é, é um
//!    papel que devolve a frota inteira.
//! 2. 🔴 **Linha sem dono (`parceiro` vazio) é do vendor** e de mais ninguém.
//!    É a regra que impede um órfão de ser adotado por um parceiro.
//! 3. 🔴 **Papel desconhecido cai no mais fraco** (`leitor`) — e não num
//!    padrão, e não em "erro". Um `admin` que deixou de existir tem de
//!    deixar de ser `admin` no próximo login, e um pedido malformado tem de
//!    devolver o mínimo.

use std::collections::BTreeSet;

/// Os quatro papéis. **Vocabulário fechado**: um papel que não está aqui não
/// existe, e o `CLAUDE.md` já regista a migração que matou o `admin` legado.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[serde(rename_all = "kebab-case")]
pub enum Papel {
    /// O fornecedor. Alcança a frota inteira.
    VendorAdmin,
    /// O parceiro (OEM). Alcança só o que é dele.
    OemAdmin,
    /// O técnico de campo. Opera a máquina dele.
    Campo,
    /// O leitor. Só lê o que está à frente dele.
    Leitor,
}

impl Papel {
    pub fn nome(&self) -> &'static str {
        match self {
            Self::VendorAdmin => "vendor-admin",
            Self::OemAdmin => "oem-admin",
            Self::Campo => "campo",
            Self::Leitor => "leitor",
        }
    }

    /// O papel mais fraco. É para onde cai o que não se reconhece.
    pub const MAIS_FRACO: Papel = Papel::Leitor;

    /// Este papel tem âmbito próprio (o que decide se o vínculo é obrigatório).
    ///
    /// 🔴 `vendor-admin` **não** tem âmbito: ele é o fornecedor, e o
    /// fornecedor não é parceiro de ninguém. Exigir vínculo a ele seria a
    /// forma de transformar o fornecedor num parceiro sem querer.
    pub fn exige_vinculo(&self) -> bool {
        matches!(self, Self::OemAdmin | Self::Campo | Self::Leitor)
    }

    /// Este gesto alcança a **frota inteira**, e não um alvo.
    ///
    /// No núcleo anterior, `admin` como *dependência* passou a significar
    /// exatamente isto — promover canal, exportar, gerir utilizadores. A
    /// depreciação do nome terá de se traduzir aqui.
    pub fn alcanca_a_frota(&self) -> bool {
        matches!(self, Self::VendorAdmin)
    }

    /// Um papel desconhecido **cai no mais fraco**.
    ///
    /// A primeira versão devolvia `Erro` — e isso é pior: um nome de papel
    /// que deixou de existir (ou que chegou com um acento) passava a devolver
    /// 403 em todo o lado, e o operador via "sem permissão" em vez de "o seu
    /// papel mudou". Cai no mais fraco **e diz**.
    pub fn desconhecido(nome: &str) -> (Papel, bool) {
        for p in [Self::VendorAdmin, Self::OemAdmin, Self::Campo, Self::Leitor] {
            if p.nome() == nome {
                return (p, false);
            }
        }
        (Self::MAIS_FRACO, true)
    }
}

/// Erro de escopo. Fechado, e com a distinção que importa: um papel sem
/// vínculo é **recusado** (não é o mesmo que "não tem acesso").
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum ErroEscopo {
    #[error("o papel {papel:?} tem âmbito próprio e o vínculo está vazio")]
    VinculoVazio { papel: &'static str },

    #[error("a linha {recurso:?} não pertence a nenhum parceiro e não é do vendor")]
    SemDono { recurso: String },

    #[error("o alvo {alvo:?} pertence a {dono:?}, e este login é {eu:?}")]
    Alheio {
        alvo: String,
        dono: String,
        eu: String,
    },

    /// O papel lê e não escreve. É um erro **próprio** e não uma variante de
    /// "é de outro": a resposta é outra, e o operador precisa de saber se
    /// precisa de permissão ou de um papel diferente.
    #[error("o papel {papel:?} lê e não escreve")]
    SemEscrita { papel: &'static str },
}

/// O que um login alcança. **Derivado**, nunca escrito.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Escopo {
    papel: Papel,
    /// O parceiro a que este login pertence. `""` = fornecedor.
    parceiro: String,
    /// O que o papel caiu de um nome desconhecido.
    caiu_de_desconhecido: Option<String>,
}

impl Escopo {
    /// 🔴 O construtor **recusa** papel com âmbito e vínculo vazio. A falha
    /// é aqui e não na autorização, porque é aqui que o dado ainda está a
    /// ser formado — e um papel sem dono que chega à autorização é um papel
    /// que "não é de ninguém" até alguém adivinhar o que fazer com ele.
    pub fn novo(papel: Papel, parceiro: &str) -> Result<Self, ErroEscopo> {
        if papel.exige_vinculo() && parceiro.trim().is_empty() {
            return Err(ErroEscopo::VinculoVazio {
                papel: papel.nome(),
            });
        }
        Ok(Self {
            papel,
            parceiro: parceiro.trim().to_string(),
            caiu_de_desconhecido: None,
        })
    }

    /// Constrói a partir do **nome** do papel, com a regra do desconhecido.
    pub fn por_nome(nome: &str, parceiro: &str) -> Result<Self, ErroEscopo> {
        let (papel, caiu) = Papel::desconhecido(nome);
        let mut e = Self::novo(papel, parceiro)?;
        if caiu {
            e.caiu_de_desconhecido = Some(nome.to_string());
        }
        Ok(e)
    }

    pub fn papel(&self) -> Papel {
        self.papel
    }

    /// O parceiro deste login, ou `""` quando é o fornecedor.
    pub fn parceiro(&self) -> &str {
        &self.parceiro
    }

    /// 🔴 A invariante 3, exposta: um papel que caiu de um nome desconhecido
    /// tem de dizer que caiu. Silenciosamente degradar um login é a forma
    /// mais rápida de um operador ficar sem perceber por quê.
    pub fn caiu_de_desconhecido(&self) -> Option<&str> {
        self.caiu_de_desconhecido.as_deref()
    }

    pub fn eh_fornecedor(&self) -> bool {
        self.parceiro.is_empty()
    }

    /// Este login pode **ler** este recurso?
    ///
    /// A regra da linha sem dono: `""` é do fornecedor, e mais ninguém. É a
    /// invariante 2.
    pub fn pode_ler(&self, recurso_dono: &str) -> bool {
        if self.papel.alcanca_a_frota() {
            return true;
        }
        let dono = recurso_dono.trim();
        // Um recurso sem dono pertence ao fornecedor. Um login de parceiro
        // **não** o alcança — e este é o ponto: sem esta linha, "sem dono"
        // significava "de todos", e um partner novo herdava tudo o que
        // ninguém tinha adotado.
        if dono.is_empty() {
            return false;
        }
        dono == self.parceiro
    }

    /// Este login pode **escrever** neste recurso?
    ///
    /// O leitor nunca escreve, seja qual for o dono — e `alvo` de outro
    /// parceiro responde **recusa**, não "não encontrei" (a distinção que
    /// evita o oráculo de sondagem de ids).
    pub fn pode_escrever(&self, recurso_dono: &str) -> Result<(), ErroEscopo> {
        if self.papel == Papel::Leitor {
            return Err(ErroEscopo::SemEscrita {
                papel: self.papel.nome(),
            });
        }
        if self.pode_ler(recurso_dono) {
            return Ok(());
        }
        Err(ErroEscopo::Alheio {
            alvo: recurso_dono.trim().to_string(),
            dono: recurso_dono.trim().to_string(),
            eu: self.papel.nome().to_string(),
        })
    }

    /// Os recursos deste login, de uma lista — para as consultas de lista,
    /// onde filtrar depois é tarde.
    pub fn filtrar<T: AsRef<str>>(&self, recursos: &[(T, String)]) -> BTreeSet<String> {
        recursos
            .iter()
            .filter(|(_, dono)| self.pode_ler(dono))
            .map(|(chave, _)| chave.as_ref().to_string())
            .collect()
    }
}
