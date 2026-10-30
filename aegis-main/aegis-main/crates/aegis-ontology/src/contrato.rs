//! O contrato de ontologia, construído a partir de um manifesto.
//!
//! O contrato é **derivado**, nunca escrito à mão: o manifesto é a fonte, e
//! este crate é a leitura. Ninguém acrescenta aqui um tipo que o vertical não
//! declarou — o que faria a ilha ter tela que o vertical não sabe explicar.

use aegis_vertical::{Cardinalidade, Manifesto, TipoAcao, TipoLink, TipoObjeto};
use serde_json::Value;

use crate::coercao::{Coercao, Modo, coagir_instancia};
use crate::erro::ErroPropriedade;

/// Cardinalidade violada: o tipo de link declara um limite e o banco já o
/// passou.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct ErroCardinalidade {
    pub link: String,
    /// A ponta de origem, em forma curta. 🔴 **Curta de propósito**: a
    /// primeira versão imprimia o UUID inteiro no lugar do nome, e a tela
    /// mostrava *"a relação é 9f3a-…-c21 e o objeto de origem já tem 1"* —
    /// que não é informação, é ruído com ar de verdade.
    pub de: String,
    pub ja_existem: usize,
    pub limite: usize,
}

impl ErroCardinalidade {
    pub fn codigo(&self) -> &'static str {
        "ontologia.cardinalidade-violada"
    }

    pub fn humano(&self) -> String {
        format!(
            "a relação {:?} já tem {} a partir deste objeto, e o limite é {}",
            self.link, self.ja_existem, self.limite
        )
    }
}

impl std::fmt::Display for ErroCardinalidade {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.humano())
    }
}

impl std::error::Error for ErroCardinalidade {}

/// O contrato inteiro de uma ilha, derivado do vertical instalado.
#[derive(Debug, Clone)]
pub struct Contrato {
    manifesto: Manifesto,
}

impl Contrato {
    pub fn de(manifesto: Manifesto) -> Self {
        Self { manifesto }
    }

    pub fn manifesto(&self) -> &Manifesto {
        &self.manifesto
    }

    pub fn id(&self) -> &aegis_vertical::VerticalId {
        &self.manifesto.id
    }

    pub fn tipos(&self) -> impl Iterator<Item = &TipoObjeto> {
        self.manifesto.ontologia.tipos.iter()
    }

    pub fn links(&self) -> impl Iterator<Item = &TipoLink> {
        self.manifesto.ontologia.links.iter()
    }

    pub fn acoes(&self) -> impl Iterator<Item = &TipoAcao> {
        self.manifesto.ontologia.acoes.iter()
    }

    pub fn tipo(&self, nome: &str) -> Option<&TipoObjeto> {
        self.manifesto.tipo(nome)
    }

    pub fn link(&self, nome: &str) -> Option<&TipoLink> {
        self.manifesto
            .ontologia
            .links
            .iter()
            .find(|l| l.nome == nome)
    }

    pub fn acao(&self, nome: &str) -> Option<&TipoAcao> {
        self.manifesto
            .ontologia
            .acoes
            .iter()
            .find(|a| a.nome == nome)
    }

    /// **O portão.** Toda a escrita de instância passa por aqui.
    ///
    /// Tipo desconhecido é erro mesmo em `lenient`: um `node_type` que o
    /// contrato não conhece é o sintoma exato do sintoma "o LPR só identificou
    /// uma vez e depois parou" — a leitura grava e a tela não sabe mostrar.
    pub fn coagir(&self, tipo_nome: &str, entrada: &Value) -> Result<Coercao, ErroPropriedade> {
        let tipo = self.tipo(tipo_nome).ok_or_else(|| ErroPropriedade {
            tipo: tipo_nome.to_string(),
            propriedade: String::new(),
            esperado: aegis_vertical::TipoPropriedade::Struct,
            recebido: format!("tipo que o vertical {:?} não declara", self.manifesto.id),
        })?;
        coagir_instancia(
            tipo_nome,
            &tipo.propriedades,
            &tipo.propriedade_titulo,
            Modo::de(tipo.reforco),
            entrada,
        )
    }

    /// Quantas arestas com este nome o objeto de origem pode ter.
    ///
    /// 🔴 Isto é **regra pura**, e o store a aplica com um `SELECT … FOR
    /// UPDATE` na linha de origem — a parte que fecha a corrida entre duas
    /// escritas que chegam ao mesmo tempo. No núcleo anterior a cardinalidade
    /// era um `metadata` decorativo que ninguém forçava.
    pub fn limite_de(&self, nome_link: &str) -> Option<(usize, &Cardinalidade)> {
        let link = self.link(nome_link)?;
        let limite = match link.cardinalidade {
            Cardinalidade::OneToOne | Cardinalidade::OneToMany | Cardinalidade::ManyToOne => 1,
            Cardinalidade::ManyToMany => usize::MAX,
        };
        Some((limite, &link.cardinalidade))
    }

    /// A escrita de uma nova aresta cabe na cardinalidade?
    pub fn cabe(
        &self,
        nome_link: &str,
        de: &str,
        ja_existem: usize,
    ) -> Result<(), ErroCardinalidade> {
        match self.limite_de(nome_link) {
            Some((limite, _)) if ja_existem >= limite => Err(ErroCardinalidade {
                link: nome_link.to_string(),
                de: de.chars().take(8).collect(),
                ja_existem,
                limite,
            }),
            Some(_) => Ok(()),
            None => Ok(()),
        }
    }
}
