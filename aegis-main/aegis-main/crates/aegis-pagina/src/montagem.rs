//! A montagem: o que se **monta** na tela e o que isso **produz**.
//!
//! 🔴 Esta é a metade do ponto 10 que faltava. O dono disse que nunca pegou
//! numa página do zero porque *"a base é sempre o seed"*. A resposta não é um
//! editor bonito: é que **montar tem de produzir o ficheiro**.
//!
//! A montagem sai daqui e escreve **dois** artefactos:
//!
//! - `paginas/<slug>.json` — a página, no formato que a ilha lê;
//! - `vertical.yaml` — o manifesto inteiro, **gerado** a partir do que foi
//!   montado.
//!
//! E o que não acontece, e é o ponto: **não há Python**. A primeira versão
//! desta casa escrebia um `seed_<vertical>.py` de algumas centenas de linhas ao lado. Aqui o
//! manifesto é **emitido** por quem montou, e o seed nunca existiu.

use std::path::{Path, PathBuf};

use aegis_vertical::{
    Brand, Dado, Licenca, Ligacao, Manifesto, Menu, Ontologia, Saude, TipoAcao, TipoLink,
    TipoObjeto, VerticalId,
};
use serde_json::Value;

use crate::erro::ErroMontagem;
use crate::modelo::{Bloco, Pagina};

/// O que o Construtor monta: o **domínio** e as **páginas**, e nada mais.
///
/// 🔴 Não é o `Manifesto`, e essa distinção é o ponto. O manifesto é o
/// *resultado* — tem gates, saúde e caminhos, e é gerado. A montagem é o que
/// a pessoa toca. Confundir as duas é o que fazia o manifesto ser um código
/// que ninguém conseguia gerar.
pub struct Montagem {
    pub id: String,
    pub titulo: String,
    /// O que a licença tem de declarar para este vertical instalar.
    pub licenca_exige: String,
    pub brand: Brand,
    pub tipos: Vec<TipoObjeto>,
    pub links: Vec<TipoLink>,
    pub acoes: Vec<TipoAcao>,
    pub paginas: Vec<Pagina>,
    pub dados: Vec<Dado>,
    pub ligacoes: Vec<Ligacao>,
    pub saude: Saude,
}

impl Montagem {
    pub fn nova(id: &str, titulo: &str) -> Self {
        Self {
            id: id.to_string(),
            titulo: titulo.to_string(),
            // 🔴 O padrão é **pedir licença**, não dispensar. Um vertical sem
            // `licenca.exige` instala sem licença nenhuma, e essa é a forma
            // mais barata de o produto inteiro sair de graça.
            licenca_exige: id.to_string(),
            brand: Brand {
                nome: titulo.to_string(),
                ..Brand::default()
            },
            tipos: Vec::new(),
            links: Vec::new(),
            acoes: Vec::new(),
            paginas: Vec::new(),
            dados: Vec::new(),
            ligacoes: Vec::new(),
            saude: Saude::default(),
        }
    }

    /// Acrescenta um tipo de objeto à montagem.
    pub fn com_tipo(mut self, tipo: TipoObjeto) -> Self {
        self.tipos.push(tipo);
        self
    }

    pub fn com_link(mut self, link: TipoLink) -> Self {
        self.links.push(link);
        self
    }

    pub fn com_acao(mut self, acao: TipoAcao) -> Self {
        self.acoes.push(acao);
        self
    }

    pub fn com_pagina(mut self, pagina: Pagina) -> Self {
        self.paginas.push(pagina);
        self
    }

    /// 🔴 **Define** a página deste `slug`: substitui a que lá está, ou
    /// acrescenta se ainda não existe.
    ///
    /// `com_pagina` **acrescenta**, e é o que o editor quer — montar do zero.
    /// Mas quem grava a mesma página duas vezes ficava com **duas** páginas do
    /// mesmo `slug`: o manifesto listava a entrada duas vezes, o menu do
    /// operador tinha o item repetido, e nada dava erro — o ficheiro é o mesmo,
    /// escrito duas vezes, e sai limpo. 🔴 Um duplicado que não dá erro é a
    /// pior classe de defeito: só aparece no ecrã do cliente, e o sintoma
    /// ("o item está repetido") está a três camadas da causa.
    ///
    /// Por isso a semântica de *substituir* mora aqui, no produto, e a
    /// ferramenta do agente chama-a em vez de a reimplementar.
    pub fn definir_pagina(&mut self, pagina: Pagina) {
        match self.paginas.iter_mut().find(|p| p.slug == pagina.slug) {
            Some(existente) => *existente = pagina,
            None => self.paginas.push(pagina),
        }
    }

    pub fn com_dado(mut self, dado: Dado) -> Self {
        self.dados.push(dado);
        self
    }

    pub fn com_saude(mut self, saude: Saude) -> Self {
        self.saude = saude;
        self
    }

    /// ⚠️ Os `health` **exigidos** por omissão. Um vertical montado sem
    /// verificações é um vertical que ninguém mediu — e a casa já mediu o
    /// custo: um gate com a lista vazia devolve "saudável" sem ter medido nada.
    pub fn com_exigido_padrao(mut self) -> Self {
        self.saude.exigido = vec![
            PathBuf::from("@banco"),
            PathBuf::from("@catalogo"),
            PathBuf::from("@isolamento"),
        ];
        self
    }

    /// **Valida** a montagem sem escrever nada.
    ///
    /// É o botão de "publicar" a dizer que não, com o motivo. Validar e
    /// escrever são dois passos para que a escrita seja sempre precedida de
    /// uma conferência — e para o erro aparecer **antes** de o disco mudar.
    pub fn conferir(&self) -> Result<(), ErroMontagem> {
        VerticalId::novo(&self.id).map_err(|e| ErroMontagem::Identificador {
            id: self.id.clone(),
            detalhe: e.humano(),
        })?;
        if self.licenca_exige.trim().is_empty() {
            return Err(ErroMontagem::SemLicenca);
        }
        if self.tipos.is_empty() {
            return Err(ErroMontagem::SemTipos);
        }
        if self.paginas.is_empty() {
            return Err(ErroMontagem::SemPaginas);
        }

        // Monta o manifesto **em memória** e deixa o validador do vertical
        // dizer o que está errado. Uma validação própria seria uma segunda
        // versão da regra, e duas versões divergem.
        let manifesto = self.para_manifesto(&PathBuf::new());
        aegis_vertical::Manifesto::conferir(&manifesto).map_err(|e| ErroMontagem::Vertical {
            detalhe: e.humano(),
        })?;

        for pagina in &self.paginas {
            pagina
                .validar(&manifesto)
                .map_err(|e| ErroMontagem::Pagina {
                    slug: pagina.slug.clone(),
                    detalhe: e.humano().to_string(),
                })?;
        }
        Ok(())
    }

    /// O manifesto que a montagem descreve.
    pub fn para_manifesto(&self, pasta: &Path) -> Manifesto {
        let versao = 1;
        let home = self
            .paginas
            .first()
            .map(|p| p.slug.clone())
            .unwrap_or_default();

        let mut manifesto =
            serde_yaml::from_str::<Manifesto>(&format!("id: {}\nversao: {versao}\n", self.id))
                .unwrap_or_else(|_| {
                    // O esqueleto mínimo válido; o resto é escrito a seguir.
                    serde_yaml::from_str("id: x\nversao: 1\nlicenca: { exige: x }\n")
                        .expect("esqueleto")
                });

        manifesto.id = VerticalId::novo(&self.id)
            .unwrap_or_else(|_| VerticalId::novo("montagem").expect("id de recurso"));
        manifesto.versao = versao;
        manifesto.titulo = Some(self.titulo.clone());
        manifesto.brand = self.brand.clone();
        manifesto.licenca = Licenca {
            exige: self.licenca_exige.clone(),
            node_locked: true,
        };
        manifesto.ontologia = Ontologia {
            tipos: self.tipos.clone(),
            links: self.links.clone(),
            acoes: self.acoes.clone(),
        };
        manifesto.paginas = self
            .paginas
            .iter()
            .map(|p| aegis_vertical::Pagina {
                slug: p.slug.clone(),
                ficheiro: PathBuf::from("paginas").join(format!("{}.json", p.slug)),
                rotulo: p.titulo.clone(),
            })
            .collect();
        manifesto.menu = Menu {
            home: if home.is_empty() { None } else { Some(home) },
            // 🔴 O placeholder **não** é inventado aqui. O texto do operador
            // é sagrado, e um texto de busca inventado pelo gerador é texto de
            // busca que ninguém escreveu.
            busca_placeholder: None,
        };
        manifesto.dados = self.dados.clone();
        manifesto.ligacoes = self.ligacoes.clone();
        manifesto.saude = self.saude.clone();
        let _ = pasta;
        manifesto
    }

    /// 🔴 Escreve a montagem na pasta do vertical: as páginas **e** o manifesto.
    ///
    /// A ordem é páginas primeiro, manifesto depois. Ao contrário, um
    /// manifesto que aponta para uma página que ainda não existe é um
    /// vertical que não carrega — e o load recusa, que é a coisa certa, mas
    /// com a causa errada à frente.
    pub fn gravar(&self, pasta: &Path) -> Result<(), ErroMontagem> {
        // 🔴 A conferência vem ANTES de qualquer escrita. O botão de publicar
        // recusa com o motivo e o disco fica como estava; escrever e depois
        // dizer que falhou deixa um vertical meio gerado, que é pior do que
        // não ter gerado.
        self.conferir()?;

        let dir_paginas = pasta.join("paginas");
        std::fs::create_dir_all(&dir_paginas).map_err(|e| ErroMontagem::Disco {
            detalhe: e.to_string(),
        })?;

        for pagina in &self.paginas {
            let ficheiro = dir_paginas.join(format!("{}.json", pagina.slug));
            let texto = serde_json::to_string_pretty(&pagina.para_json()).map_err(|e| {
                ErroMontagem::Serializacao {
                    detalhe: e.to_string(),
                }
            })?;
            std::fs::write(&ficheiro, format!("{texto}\n")).map_err(|e| ErroMontagem::Disco {
                detalhe: e.to_string(),
            })?;
        }

        let manifesto = self.para_manifesto(pasta);
        let texto = serde_yaml::to_string(&manifesto).map_err(|e| ErroMontagem::Serializacao {
            detalhe: e.to_string(),
        })?;
        // 🔴 O `vertical.yaml` é um **artefacto gerado**, e diz isso na
        // primeira linha. Um YAML que vai e volta por uma estrutura perde os
        // comentários, e perdê-los a cada guardado tornaria o ficheiro
        // progressivamente pior, sem ninguém dar por isso. Dizer "gerado" é o
        // que torna a perda **esperada** em vez de ser um estrago.
        std::fs::write(
            pasta.join(aegis_vertical::NOME_MANIFESTO),
            format!("{CABECALHO_GERADO}\n{texto}\n"),
        )
        .map_err(|e| ErroMontagem::Disco {
            detalhe: e.to_string(),
        })?;

        Ok(())
    }

    /// O que a montagem fica, em JSON — para o editor mostrar antes de gravar.
    pub fn previa(&self) -> Value {
        serde_json::to_value(self.para_manifesto(&PathBuf::new())).unwrap_or(Value::Null)
    }
}

/// A primeira linha do manifesto gerado.
///
/// 🔴 Dizer "isto foi gerado" no ficheiro é o que torna a perda de comentários
/// uma coisa **esperada** em vez de ser um estrago. Um artefacto gerado que
/// não se identifica convida a editar à mão, e a edição à mão é perdida no
/// próximo guardado — que é a forma mais cara de perder trabalho: sem
/// erro, sem aviso.
pub const CABECALHO_GERADO: &str =
    "# Gerado por `aegis` (Construtor). As explicações vivem em LEIA-ME.md ao lado.
# Editar à mão funciona até ao próximo guardado — e o próximo guardado
# reescreve tudo o que estiver comentado aqui.";

impl Montagem {
    /// 🔴 Volta de um vertical **já escrito**, sem perder nada.
    ///
    /// É o que permite ao construtor abrir um produto existente, mexer numa
    /// página e gravar — e é o que impede a pior versão possível do
    /// "gerador": um que reescreve o manifesto e perde o catálogo, os links e
    /// as verificações porque não sabia lê-los.
    pub fn de_manifesto(manifesto: &Manifesto) -> Self {
        let pasta = &manifesto.pasta;
        let paginas = manifesto
            .paginas
            .iter()
            .filter_map(|p| {
                let caminho = pasta.join(&p.ficheiro);
                let texto = std::fs::read_to_string(caminho).ok()?;
                let valor: Value = serde_json::from_str(&texto).ok()?;
                Pagina::de_json(&valor).ok()
            })
            .collect();

        Self {
            id: manifesto.id.as_str().to_string(),
            titulo: manifesto.titulo.clone().unwrap_or_default(),
            licenca_exige: manifesto.licenca.exige.clone(),
            brand: manifesto.brand.clone(),
            tipos: manifesto.ontologia.tipos.clone(),
            links: manifesto.ontologia.links.clone(),
            acoes: manifesto.ontologia.acoes.clone(),
            paginas,
            dados: manifesto.dados.clone(),
            ligacoes: manifesto.ligacoes.clone(),
            saude: manifesto.saude.clone(),
        }
    }

    /// Abre a pasta de um vertical já escrito e volta a montagem.
    pub fn abrir(pasta: &Path) -> Result<Self, ErroMontagem> {
        let manifesto = aegis_vertical::carregar(pasta).map_err(|e| ErroMontagem::Vertical {
            detalhe: e.humano(),
        })?;
        Ok(Self::de_manifesto(&manifesto))
    }

    /// Acrescenta um bloco a uma página, criando a página se não existir.
    ///
    /// É o gesto do "acrescentar uma tabela" no editor, e é **puro**: quem
    /// chama grava depois.
    pub fn acrescentar_bloco(&mut self, slug_pagina: &str, bloco: Bloco) {
        if let Some(pagina) = self.paginas.iter_mut().find(|p| p.slug == slug_pagina) {
            pagina.blocos.push(bloco);
            return;
        }
        // 🔴 Uma página nova nasce com o bloco que a criou e **sem** nada
        // inventado: nenhuma variável, nenhum título adivinhado. O mínimo
        // que o editor precisa para uma página aparecer é o mínimo que ele
        // escreve.
        self.paginas.push(Pagina {
            slug: slug_pagina.to_string(),
            titulo: None,
            // 🔴 A página nova nasce **sem** refresh e sem ícone. Um valor
            // inventado aqui seria pior que nenhum: um `refresh_segundos: 5`
            // escolhido por omissão transformaria uma página de cadastro numa
            // que fica a perguntar ao servidor cinco vezes por segundo. Quem
            // quiser o "ao vivo" diz que quer.
            refresh_segundos: None,
            icone_nav: None,
            variaveis: vec![],
            blocos: vec![bloco],
        });
    }

    /// Tira um bloco pelo índice. Fora de ordem é um erro de quem clica, e
    /// o editor reescreve a página inteira a partir do que ficou.
    pub fn remover_bloco(&mut self, slug_pagina: &str, indice: usize) -> bool {
        let Some(pagina) = self.paginas.iter_mut().find(|p| p.slug == slug_pagina) else {
            return false;
        };
        if indice >= pagina.blocos.len() {
            return false;
        }
        pagina.blocos.remove(indice);
        true
    }

    /// Acrescenta uma variável de conjunto.
    pub fn acrescentar_conjunto(&mut self, slug_pagina: &str, id: &str, objeto: &str) {
        if let Some(pagina) = self.paginas.iter_mut().find(|p| p.slug == slug_pagina) {
            pagina.variaveis.push(crate::modelo::Variavel {
                id: id.to_string(),
                tipo: crate::modelo::TipoVariavel::ObjectSet,
                objeto: Some(objeto.to_string()),
                de: None,
                op: None,
            });
        }
    }

    /// Acrescenta uma agregação sobre um conjunto já declarado.
    pub fn acrescentar_agregacao(
        &mut self,
        slug_pagina: &str,
        id: &str,
        de: &str,
        op: crate::modelo::Operacao,
    ) {
        if let Some(pagina) = self.paginas.iter_mut().find(|p| p.slug == slug_pagina) {
            pagina.variaveis.push(crate::modelo::Variavel {
                id: id.to_string(),
                tipo: crate::modelo::TipoVariavel::Agregacao,
                objeto: None,
                de: Some(de.to_string()),
                op: Some(op),
            });
        }
    }
}
