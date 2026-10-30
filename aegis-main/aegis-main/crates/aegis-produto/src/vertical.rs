//! O catálogo de verticais — a operação que o operador corre primeiro.

use aegis_vertical::Manifesto;
use serde::Serialize;

use crate::Resultado;

/// O resumo de um vertical, do jeito que a tela o mostra.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ResumoVertical {
    pub id: String,
    pub versao: u32,
    pub titulo: Option<String>,
    pub tipos: usize,
    pub links: usize,
    pub acoes: usize,
    pub paginas: usize,
    pub dados: usize,
    pub licenca_exige: String,
    /// A explicação do produto, se existir. 🔴 Vem do `LEIA-ME.md` ao lado,
    /// e não do `vertical.yaml` — porque o manifesto é gerado e um
    /// artefacto gerado não guarda comentários.
    pub leia_me: Option<String>,
}

impl From<&Manifesto> for ResumoVertical {
    fn from(m: &Manifesto) -> Self {
        Self {
            id: m.id.as_str().to_string(),
            versao: m.versao,
            titulo: m.titulo.clone(),
            tipos: m.ontologia.tipos.len(),
            links: m.ontologia.links.len(),
            acoes: m.ontologia.acoes.len(),
            paginas: m.paginas.len(),
            dados: m.dados.len(),
            licenca_exige: m.licenca.exige.clone(),
            leia_me: m
                .pasta
                .join("LEIA-ME.md")
                .is_file()
                .then(|| std::fs::read_to_string(m.pasta.join("LEIA-ME.md")).ok())
                .flatten(),
        }
    }
}

/// Lista os verticais de uma pasta.
///
/// 🔴 Um vertical que **não carrega** é erro, não aviso: um catálogo que
/// esconde um vertical partido é um catálogo que mente, e é assim que o defeito
/// chega ao cliente em vez de ficar na bancada.
pub fn listar_verticais(pasta: &std::path::Path) -> Resultado<Vec<ResumoVertical>> {
    match aegis_vertical::listar(pasta) {
        Ok(lista) => Resultado::Feito(lista.iter().map(ResumoVertical::from).collect()),
        Err(e) => Resultado::Recusado {
            codigo: e.codigo().to_string(),
            o_que_dizer: e.humano(),
            o_que_fazer: "Corrigir o vertical e voltar a listar".to_string(),
        },
    }
}

/// O manifesto de um vertical, em JSON.
pub fn ver_vertical(pasta: &std::path::Path) -> Resultado<serde_json::Value> {
    match aegis_vertical::carregar(pasta) {
        Ok(m) => Resultado::Feito(serde_json::to_value(&m).unwrap_or_default()),
        Err(e) => Resultado::Recusado {
            codigo: e.codigo().to_string(),
            o_que_dizer: e.humano(),
            o_que_fazer: "Corrigir o vertical".to_string(),
        },
    }
}
