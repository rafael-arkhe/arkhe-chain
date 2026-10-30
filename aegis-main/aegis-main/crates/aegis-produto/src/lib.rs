//! **aegis-produto** — as operações do produto, como biblioteca.
//!
//! 🔴 Isto é o que faz "um produto, duas faces" ser verdade em vez de ser
//! uma segunda língua.
//!
//! A alternativa — deixar a lógica no `main.rs` — obriga a GUI a
//! reimplementá-la, e nasce o **segundo produto**: a CLI passa a ser a
//! defeituosa e a GUI a certa, ou o contrário, e a divergência aparece
//! quando alguém já mandou um cliente instalar por uma delas. É a mesma
//! classe do pseudónimo em quatro sítios, e a casa já a pagou.
//!
//! Por isso: **a casca não decide nada.** A CLI e a janela chamam as mesmas
//! funções e recebem o mesmo [`Resultado`], com o mesmo código fechado. A
//! prova está em [`saida`], que é a única função que decide código de
//! processo — e ela é usada pelas duas faces.

mod diagnostico;
mod ilha;
mod licenca;
mod ponte;
mod renovacao;
mod vertical;
mod vocabulario;

use aegis_island::Prontidao;
use serde::Serialize;

// 🔴 O ambiente é um **crate folha** reexportado, e não um módulo deste.
// A folha é o que permite que `aegis-store`, `aegis-island` e este leiam o
// mesmo sítio sem que nenhum dependa de outro.
pub use aegis_ambiente::{
    banco, banco_da_aplicacao, interpretador, machine_id, pasta_de_dados,
    raiz_do_vendor as raiz_do_vendor_do_ambiente,
};
pub use diagnostico::{
    Conserto, Diagnostico, Interpretador, Licenca as LicencaDaMaquina, Linha as LinhaDeConferencia,
    Situacao, a_partir_de as conferencia_de, linha_de_verificacao, palavra_da_licenca,
    veredicto as veredicto_de,
};
pub use ilha::{
    endereco as endereco_da_ilha, pagina as pagina_da_ilha, prontidao as prontidao_da_ilha,
    saude as saude_da_ilha, tipos as tipos_da_ilha, vertical as vertical_da_ilha,
};
pub use licenca::{
    conferir as conferir_licenca, conferir_com as conferir_licenca_com,
    exigencia_de as licenca_exigida_por, exigir as exigir_licenca, fingerprint_de,
    machine_id_padrao, partes_da_maquina, raiz_do_vendor,
};
pub use ponte::{
    ResumoCamera, ResumoCameras, camera_adicionar as adicionar_camera,
    camera_listar as listar_cameras, camera_remover as remover_camera,
};
pub use renovacao::{
    NOME_DO_PEDIDO, ResumoPedido, ResumoRenovacao, aplicar as aplicar_renovacao, pedido_ao_lado,
    pedir as pedir_renovacao,
};
pub use vertical::{ResumoVertical, listar_verticais, ver_vertical};
pub use vocabulario::{Linha as LinhaDeRecusa, todos as vocabulario_de_recusa};

/// O resultado de uma operação do produto, **estruturado**.
///
/// 🔴 O código de processo vem **daqui**, e a casca limita-se a imprimi-lo. É
/// o que impede a CLI de dizer `3` e a GUI de dizer "erro" para a mesma
/// recusa — e o que faz o `aegis ilha instalar` do terminal e o botão
/// "Instalar" da janela fazerem a mesma coisa.
#[derive(Debug, Clone, PartialEq)]
pub enum Resultado<T> {
    /// Feito. A casca devolve `0`.
    Feito(T),
    /// **Recusado com motivo.** A casca devolve `3` — e `3` é separado de `1`
    /// porque "não posso" e "não consegui" pedem ações diferentes de quem
    /// decide o que fazer a seguir.
    Recusado {
        codigo: String,
        o_que_dizer: String,
        o_que_fazer: String,
    },
    /// Falhou. A casca devolve `1`.
    Falhou { codigo: String, o_que_dizer: String },
}

impl<T> Resultado<T> {
    pub fn feito(v: T) -> Self {
        Self::Feito(v)
    }

    pub fn recusado(codigo: &str, o_que_dizer: &str, o_que_fazer: &str) -> Self {
        Self::Recusado {
            codigo: codigo.to_string(),
            o_que_dizer: o_que_dizer.to_string(),
            o_que_fazer: o_que_fazer.to_string(),
        }
    }

    pub fn falhou(codigo: &str, o_que_dizer: &str) -> Self {
        Self::Falhou {
            codigo: codigo.to_string(),
            o_que_dizer: o_que_dizer.to_string(),
        }
    }

    /// Troca o que está dentro do `Feito`, e **não** toca no resto.
    ///
    /// 🔴 Existe para uma face poder entregar à tela o que ela sabe mostrar.
    /// A face agêntica devolve JSON e a biblioteca devolvia um tipo com nome
    /// — e a alternativa era escrever a conversão à mão em cada casca, que é
    /// a segunda tradução. E é `Recusado` e `Falhou` que **passam intactos**:
    /// um `map` que reescrevesse o motivo seria uma face a decidir o motivo.
    pub fn map<U>(self, f: impl FnOnce(T) -> U) -> Resultado<U> {
        match self {
            Self::Feito(v) => Resultado::Feito(f(v)),
            Self::Recusado {
                codigo,
                o_que_dizer,
                o_que_fazer,
            } => Resultado::Recusado {
                codigo,
                o_que_dizer,
                o_que_fazer,
            },
            Self::Falhou {
                codigo,
                o_que_dizer,
            } => Resultado::Falhou {
                codigo,
                o_que_dizer,
            },
        }
    }

    /// O código que a casca devolve ao sistema operativo.
    ///
    /// 🔴 **A única função do produto que decide um número.** Enquanto ela
    /// viver aqui, a CLI e a GUI não podem divergir no que o operador vê —
    /// e o teste `a_casca_e_a_biblioteca_dizem_o_mesimo` trava isso.
    pub fn saida(&self) -> i32 {
        match self {
            Self::Feito(_) => SAIDA_FEITO,
            Self::Recusado { .. } => SAIDA_RECUSADO,
            Self::Falhou { .. } => SAIDA_FALHOU,
        }
    }

    /// O que a tela mostra: código, frase e gesto.
    ///
    /// 🔴 O `dado` só aparece se o tipo sabe serializar. Uma operação cujo
    /// resultado não é serializável é uma operação cuja tela não mostra
    /// nada — e isso descobre-se na tela, não aqui.
    pub fn para_tela(&self) -> serde_json::Value
    where
        T: Serialize,
    {
        match self {
            Self::Feito(v) => serde_json::json!({ "feito": true, "dado": v }),
            Self::Recusado {
                codigo,
                o_que_dizer,
                o_que_fazer,
            } => serde_json::json!({
                "feito": false,
                "codigo": codigo,
                "mensagem": o_que_dizer,
                "gesto": o_que_fazer,
            }),
            Self::Falhou {
                codigo,
                o_que_dizer,
            } => serde_json::json!({
                "feito": false,
                "codigo": codigo,
                "mensagem": o_que_dizer,
            }),
        }
    }
}

/// 🔴 O tenant da ilha. **Um só**, e o mesmo para todos os produtos.
///
/// Uma ilha corre **um** produto. A coluna `vertical` do tenant é que diz
/// qual — e é por ela que a instalação sabe o que está a aposar. Dar um tenant
/// a cada produto foi a primeira versão, e dava dois produtos a conviver na
/// mesma ilha, isolados um do outro, que é o oposto do que se quer.
pub const TENANT_DA_ILHA: &str = "ilha";

pub const SAIDA_FEITO: i32 = 0;
pub const SAIDA_FALHOU: i32 = 1;
pub const SAIDA_RECUSADO: i32 = 3;

// ---------------------------------------------------------------------------
// Instalar
// ---------------------------------------------------------------------------

/// O que uma instalação produz.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ResumoInstalacao {
    pub vertical: String,
    pub versao: u32,
    pub objetos: usize,
    pub arestas: usize,
    pub pronto: bool,
}

/// Aplica um vertical: licença, migrações, role de runtime, tenant, catálogo,
/// arestas e marcador.
///
/// 🔴 **A licença é conferida antes de tocar no banco** — e isso não é
/// organização, é proteção: sem licença, a instalação recusa com `3` e
/// **zero tabelas criadas**. A half-installada é mais difícil de recuperar
/// do que a que nunca chegou a instalar-se.
pub async fn instalar(
    pasta_vertical: &std::path::Path,
    banco: &str,
    licenca: Option<&std::path::Path>,
    chave_oem: Option<&std::path::Path>,
    machine_id: &str,
) -> Resultado<ResumoInstalacao> {
    // 1. O vertical. Antes de tudo, e sem tocar em nada.
    let Ok(vertical) = aegis_vertical::carregar(pasta_vertical) else {
        return Resultado::falhou("manifesto.invalido", "A pasta não é um vertical válido.");
    };
    let slug = vertical.id.to_string();

    // 2. A licença, se o vertical a exige. 🔴 Um vertical sem
    //    `licenca.exige` é uma ESCOLHA — e ela está escrita no manifesto.
    //    A regra é a de `exigir`, e é a **mesma** que o portão da face
    //    agêntica chama: duas escritas da mesma pergunta divergem.
    if let Some(e) = licenca::exigir(&vertical, licenca, chave_oem, machine_id) {
        return Resultado::Recusado {
            codigo: e.codigo().to_string(),
            o_que_dizer: e.humano().to_string(),
            o_que_fazer: e.gesto().to_string(),
        };
    }

    // 3. O banco: migrações, role de runtime, tenant, catálogo.
    let pool = match aegis_store::abrir(banco).await {
        Ok(p) => p,
        Err(e) => {
            return Resultado::falhou(e.codigo(), &e.humano());
        }
    };
    if let Err(e) = aegis_store::aplicar(&pool).await {
        return Resultado::falhou(e.codigo(), &e.humano());
    }
    if let Err(e) = aegis_store::preparar_role_de_app(banco).await {
        return Resultado::falhou(e.codigo(), &e.humano());
    }
    let pool = match aegis_store::abrir(&aegis_store::url_do_app(banco)).await {
        Ok(p) => p,
        Err(e) => {
            return Resultado::falhou(
                e.codigo(),
                &format!(
                    "{} O papel que a ilha usa para servir não conseguiu ligar — \
                     em máquina nova é o role de runtime que ainda não tem senha.",
                    e.humano()
                ),
            );
        }
    };

    let repo = aegis_store::Repo::new(pool);
    // 🔴 A ilha tem **um** tenant, e o produto vive na coluna `vertical`.
    //
    // A primeira versão usava o slug do vertical como nome do tenant — e
    // isso dava um tenant por produto, que convivem. Medido na troca: os
    // tipos do produto anterior ficaram na ilha ao lado dos do novo, e o
    // mesmo cliente via os dois.
    //
    // É o bug que a docstring da seed descreve palavra por palavra: *"o
    // cliente abriria o produto da contagem dentro da guarita"*. E a causa é
    // a mesma: **uma ilha corre um produto**, e o que separa um do outro é o
    // `vertical` do tenant, não o nome do tenant.
    let tenant = match repo
        .tenant(
            TENANT_DA_ILHA,
            &vertical.titulo.clone().unwrap_or_default(),
            &slug,
        )
        .await
    {
        Ok(t) => t,
        Err(e) => return Resultado::falhou(e.codigo(), &e.humano()),
    };

    let ilha = match aegis_island::Ilha::abrir(pasta_vertical, repo.clone()) {
        Ok(i) => i,
        Err(e) => return Resultado::falhou(e.codigo(), &e.humano()),
    };

    // 🔴 O produto anterior é **aposado pela instalação**, e não pelo produto.
    //
    // A seed da portaria, no núcleo anterior, gastava 1.015 linhas nisso e
    // fazia-o importando as seeds alheias para saber o que tirar. Isso é o
    // grafo de dependências entre produtos, e é o que a regra "um vertical é
    // dado" proíbe.
    //
    // Aqui o critério é o **contrato**: os tipos que o vertical novo declara
    // são seus, e tudo o resto é de quem saiu. O produto nunca menciona o
    // anterior — nem o nome dele.
    let tipos_do_vertical: Vec<String> = vertical
        .ontologia
        .tipos
        .iter()
        .map(|t| t.nome.clone())
        .collect();
    if let Err(e) = repo
        .aposar_tipos_de_aposado(&tenant.id, &tipos_do_vertical)
        .await
    {
        return Resultado::falhou(e.codigo(), &e.humano());
    }

    // O catálogo do vertical, gravado **pelo portão do contrato** — um
    // vertical não tem caminho privilegiado para o banco, e é por isso que o
    // que ele traz não pode estragar o que o contrato proíbe.
    for dado in &vertical.dados {
        if let Err(e) = repo
            .gravar(
                ilha.contrato(),
                &tenant.id,
                &dado.tipo,
                dado.chave.as_deref(),
                &dado.propriedades,
            )
            .await
        {
            // 🔴 O marcador NÃO é escrito: a ilha fica
            // `pronto.seed-desatualizado` e o `/health/ready` devolve 503. É o
            // estado honesto, e é o que o `recusa` de baixo mede.
            return Resultado::falhou(
                e.codigo(),
                &format!("ao aplicar {:?}: {}", dado.tipo, e.humano()),
            );
        }
    }

    // As arestas, depois dos dados — porque apontam por chave, e a chave só
    // existe depois da escrita.
    for ligacao in &vertical.ligacoes {
        let Ok(Some(de)) = repo
            .por_chave(&tenant.id, &ligacao.de.tipo, &ligacao.de.chave)
            .await
        else {
            return Resultado::falhou(
                "store.objeto-invisivel",
                &format!(
                    "a ligação {:?} aponta para {}/{}, que não chegou ao banco",
                    ligacao.nome, ligacao.de.tipo, ligacao.de.chave
                ),
            );
        };
        let Ok(Some(para)) = repo
            .por_chave(&tenant.id, &ligacao.para.tipo, &ligacao.para.chave)
            .await
        else {
            return Resultado::falhou(
                "store.objeto-invisivel",
                &format!(
                    "a ligação {:?} aponta para {}/{}, que não chegou ao banco",
                    ligacao.nome, ligacao.para.tipo, ligacao.para.chave
                ),
            );
        };
        if let Err(e) = repo
            .ligar(ilha.contrato(), &tenant.id, &ligacao.nome, &de.id, &para.id)
            .await
        {
            return Resultado::falhou(e.codigo(), &e.humano());
        }
    }

    if let Err(e) = repo
        .definir_seed(&tenant.id, vertical.versao_do_seed() as i32)
        .await
    {
        return Resultado::falhou(e.codigo(), &e.humano());
    }

    // As verificações, e só depois o veredicto.
    ilha.medir_saude().await;
    let prontidao: Prontidao = aegis_island::medir(&ilha).await;

    let objetos = vertical.dados.len();
    let arestas = vertical.ligacoes.len();
    let resumo = ResumoInstalacao {
        vertical: slug.clone(),
        versao: vertical.versao,
        objetos,
        arestas,
        pronto: prontidao.pronto,
    };

    if !prontidao.pronto {
        let codigo = prontidao
            .motivo
            .map(|m| m.codigo())
            .unwrap_or("pronto.indefinido");
        let frase = prontidao
            .o_que_dizer
            .unwrap_or_else(|| "a ilha não ficou pronta".to_string());
        return match prontidao.motivo {
            // Uma verificação que reprovou é uma **recusa**: o pedido é
            // legítimo e o estado não o permite. Devolver `1` puniria o
            // operador por um defeito da plataforma.
            Some(m) if m.codigo().starts_with("pronto.saude") => Resultado::Recusado {
                codigo: m.codigo().to_string(),
                o_que_dizer: frase.to_string(),
                o_que_fazer: m.gesto().to_string(),
            },
            _ => Resultado::falhou(codigo, &frase),
        };
    }

    Resultado::Feito(resumo)
}

/// O portão de uma **face**: a licença que este vertical exige, conferida
/// antes de a face ganhar mão alguma.
///
/// 🔴 É a mesma regra de [`instalar`] e passa pelo mesmo [`exigir_licenca`] —
/// e é aqui que ela importa mais. Um shell que abre sem licença não é fuga:
/// **fuga é o agente agir sem licença**. Por isso o portão está onde está a
/// **mão**, e não onde está a boca.
pub fn portao(
    vertical: &std::path::Path,
    licenca: Option<&std::path::Path>,
    chave_oem: Option<&std::path::Path>,
    machine_id: &str,
) -> Resultado<aegis_vertical::Manifesto> {
    let Ok(vertical) = aegis_vertical::carregar(vertical) else {
        return Resultado::falhou(
            "manifesto.invalido",
            "A pasta não é um vertical válido, e sem manifesto não há licença a exigir.",
        );
    };
    if let Some(e) = licenca::exigir(&vertical, licenca, chave_oem, machine_id) {
        return Resultado::Recusado {
            codigo: e.codigo().to_string(),
            o_que_dizer: e.humano().to_string(),
            o_que_fazer: e.gesto().to_string(),
        };
    }
    Resultado::Feito(vertical)
}

/// O estado da ilha, e o código de saída que a casca devolve.
pub async fn estado(pasta_vertical: &std::path::Path, banco: &str) -> Resultado<Prontidao> {
    let pool = match aegis_store::abrir(&aegis_store::url_do_app(banco)).await {
        Ok(p) => p,
        Err(e) => return Resultado::falhou(e.codigo(), &e.humano()),
    };
    let repo = aegis_store::Repo::new(pool);
    let ilha = match aegis_island::Ilha::abrir(pasta_vertical, repo) {
        Ok(i) => i,
        Err(e) => return Resultado::falhou(e.codigo(), &e.humano()),
    };

    // 🔴 `estado` **corre** as verificações, e não as publica de um veredicto
    // que este processo nunca tirou.
    //
    // A primeira versão lia só o veredicto guardado — e um `aegis ilha estado`
    // numa sessão nova não tem veredicto nenhum. O resultado era uma lista
    // `saude: []` e um "pronto" que **não tinha verificado nada**: exatamente
    // a configuração que a casa já mediu como perigosa, um gate a ler um
    // ficheiro que não existe e a devolver "saudável".
    //
    // `estado` é um comando de diagnóstico: pode ser lento, e é este — e só
    // este — que as re-corre. O `/health/ready` continua a publicar o
    // veredicto do boot, que é o que um pedido por segundo não pode pagar.
    ilha.medir_saude().await;
    let p = aegis_island::medir(&ilha).await;
    if p.pronto {
        Resultado::Feito(p)
    } else {
        Resultado::Recusado {
            codigo: p.motivo.map(|m| m.codigo()).unwrap_or("pronto").to_string(),
            o_que_dizer: p
                .o_que_dizer
                .unwrap_or_else(|| "a ilha não está pronta".to_string())
                .to_string(),
            o_que_fazer: p.o_que_fazer.unwrap_or("Verificar a ilha").to_string(),
        }
    }
}
