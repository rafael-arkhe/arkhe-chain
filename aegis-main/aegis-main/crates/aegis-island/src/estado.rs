//! O estado da ilha: o vertical instalado, o contrato derivado e o repo.
//!
//! 🔴 A ilha **nunca** recebe um slug de vertical como argumento de runtime.
//! Ela carrega o `Manifesto` da pasta que aponta, e pronto — não há
//! `match vertical { ... }` em lado nenhum, porque é esse `match` que no
//! núcleo anterior produziu o defeito "Declarar não implanta".

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use aegis_ontology::Contrato;
use aegis_store::{Repo, Tenant};
use aegis_vertical::Manifesto;

use crate::saude_exec::{self, Checagem, Estado};

/// O slug do tenant da ilha. 🔴 **Não** é o slug do vertical — ver o
/// comentário em [`Ilha::tenant_padrao`].
fn aegis_produto_ilha() -> &'static str {
    "ilha"
}

/// O veredicto das checagens, e quando foi tirado.
#[derive(Clone)]
pub struct Veredito {
    /// A primeira checagem exigida que **não** passou. `None` = todas passaram.
    pub falha: Option<Checagem>,
    /// Todas as **exigidas**, para a tela mostrar o quadro inteiro.
    pub todas: Vec<Checagem>,
    /// As **opcionais**. 🔴 Não travam a ilha — mas **aparecem**. Um
    /// `opcional/*.sh` que falha e ninguém vê é o mesmo que não existir, e é
    /// a forma como uma capacidade optional morre sem ninguém decidir.
    pub opcionais: Vec<Checagem>,
    pub em: Instant,
}

#[derive(Clone)]
pub struct Ilha {
    repo: Repo,
    contrato: Contrato,
    pasta: std::path::PathBuf,
    /// 🔴 `Arc<Mutex<…>>` e não um campo simples, porque a ilha é clonada
    /// para cada handler do axum e o veredicto tem de ser **um só**. Se cada
    /// handler tivesse o seu, o `/health/ready` e o `estado` poderiam dizer
    /// coisas diferentes ao mesmo tempo — e dois verdadeiros que discordam
    /// são piores que um falso.
    veredito: Arc<Mutex<Option<Veredito>>>,
}

impl Ilha {
    /// Carrega a ilha a partir da pasta de um vertical.
    ///
    /// Falha **cedo e com o motivo**: um vertical que não carrega não vira uma
    /// ilha a meio, porque "instalada mas sem vertical" é o estado que produz
    /// telas vazias sem nada em vermelho.
    pub fn abrir(pasta: &std::path::Path, repo: Repo) -> aegis_store::Resultado<Self> {
        let manifesto = aegis_vertical::carregar(pasta)?;
        Ok(Self::de_manifesto_com_pasta(
            manifesto,
            repo,
            pasta.to_path_buf(),
        ))
    }

    /// Constrói a ilha a partir de um manifesto **já carregado**.
    ///
    /// Existe para os testes e para quem já tem o manifesto na mão. O
    /// `abrir` é o caminho do produto: ele **valida** antes de construir.
    pub fn de_manifesto(manifesto: Manifesto, repo: Repo) -> Self {
        Self::de_manifesto_com_pasta(manifesto, repo, PathBuf::new())
    }

    fn de_manifesto_com_pasta(manifesto: Manifesto, repo: Repo, pasta: std::path::PathBuf) -> Self {
        Self {
            repo,
            contrato: Contrato::de(manifesto),
            pasta,
            veredito: Arc::new(Mutex::new(None)),
        }
    }

    /// Corre as checagens **exigidas** e guarda o veredicto.
    ///
    /// É o boot e o `estado` que chamam isto, **não** o `/health/ready`:
    /// correr scripts a cada pedido de health torna o health check caro e,
    /// pior, faz-o oscilar. O `/health/ready` publica o veredicto e a idade
    /// dele — e um veredicto velho é declarado velho, não repetido como se
    /// fosse de agora.
    pub async fn medir_saude(&self) -> Veredito {
        let todas = saude_exec::correr(self, "exigido").await;
        // 🔴 As opcionais CORREM. Não travam, mas aparecem — e o motivo
        // está em cima: um opcional que ninguém vê é uma capacidade morta.
        let opcionais = saude_exec::correr(self, "opcional").await;
        let falha = todas.iter().find(|c| c.estado != Estado::Ok).cloned();
        let v = Veredito {
            falha,
            todas,
            opcionais,
            em: Instant::now(),
        };
        *self.veredito.lock().expect("veredito trancado") = Some(v.clone());
        v
    }

    /// O último veredicto, sem correr nada.
    ///
    /// `None` = nunca conferido. E **nunca conferido não é pronto**: devolve
    /// um `Inconclusivo` com o motivo, que é a diferença entre "não sei" e
    /// "está bem" — a mesma linha que separa o `/health` do `/health/ready`.
    pub fn veredito(&self) -> Option<Veredito> {
        self.veredito.lock().expect("veredito trancado").clone()
    }

    pub fn repo(&self) -> &Repo {
        &self.repo
    }

    pub fn contrato(&self) -> &Contrato {
        &self.contrato
    }

    /// 🔴 Volta a ler o manifesto **do disco**.
    ///
    /// Sem isto, salvar uma página no Construtor não muda a tela até a ilha
    /// reiniciar — e o operador vê "guardei" e não vê nada. É o sintoma que
    /// a casa já descreve do outro lado: *"a página existe no menu e não
    /// abre"*, e a causa aqui é a ilha a servir um contrato de ontem.
    ///
    /// Custa uma leitura de um ficheiro de texto, e só acontece no caminho
    /// de **autoria** — o catálogo e a API continuam com o contrato em
    /// memória, porque esse caminho é quente e não muda de forma.
    pub fn contrato_do_disco(&self) -> aegis_store::Resultado<Contrato> {
        let manifesto = aegis_vertical::carregar(self.pasta())?;
        Ok(Contrato::de(manifesto))
    }

    pub fn manifesto(&self) -> &Manifesto {
        self.contrato.manifesto()
    }

    pub fn pasta(&self) -> &std::path::Path {
        &self.pasta
    }

    /// 🔴 O slug do tenant desta ilha — **derivado do manifesto**, nunca
    /// escrito à mão. É ele que dá nome ao tenant, e é por isso que não há
    /// ambiguidade de resolução: a ilha tem um tenant, e ele é o do vertical.
    pub fn slug_do_tenant(&self) -> &str {
        self.manifesto().id.as_str()
    }

    /// O tenant desta ilha, ou `None` se o vertical ainda não foi aplicado.
    pub async fn tenant_padrao(&self) -> aegis_store::Resultado<Option<Tenant>> {
        // 🔴 O slug é o **da ilha**, não o do vertical. A ilha tem um tenant e
        // a coluna `vertical` dele diz que produto está instalado — que é o
        // que permite trocar de produto sem deixar o antigo a lado.
        let slug = aegis_produto_ilha();
        if !self.repo.tenant_existe(slug).await? {
            return Ok(None);
        }
        let t = self
            .repo
            .tenant(slug, &self.nome_do_tenant(), self.contrato().id().as_str())
            .await?;
        Ok(Some(t))
    }

    pub fn nome_do_tenant(&self) -> String {
        self.manifesto()
            .titulo
            .clone()
            .unwrap_or_else(|| self.manifesto().id.as_str().to_string())
    }
}
