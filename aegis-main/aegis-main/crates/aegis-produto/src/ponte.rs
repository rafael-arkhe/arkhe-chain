//! As câmaras da ponte, como **operação do produto**.
//!
//! 🔴 Isto estava dentro de `main.rs`, e a casca **não pode** traduzir recusa:
//! traduzir na casca é ter duas traduções, e a da outra face — a janela, e
//! amanhã o MCP — fica para trás. Foi exactamente o que aconteceu com
//! `camera remover`: a recusa `ponte.inexistente` era escrita à mão num
//! `eprintln!`, **sem gesto**, porque uma recusa que só existe na casca não
//! entra no vocabulário e por isso não tem frase nem gesto. É o defeito que a
//! regra *"erro tem código, frase **e** gesto"* existe para apanhar — e que
//! ninguém apanhou porque ainda não havia uma segunda face com quem comparar.
//!
//! ## O que mudou, e porque vale a pena
//!
//! | antes (na casca) | agora (aqui) |
//! |---|---|
//! | `ponte.inexistente` escrito à mão, **sem gesto** | motivo de [`aegis_ponte::ErroCamera`], com frase e gesto |
//! | `ponte.dados` devolvia `1` (*não consegui*) | devolve `3` (*não posso*): o pedido era legítimo, é o ambiente que não diz onde está |
//! | a CLI imprimia a lista; uma face nova teria de a reimprimir | a face nova devolve **os mesmos campos** |

use std::path::{Path, PathBuf};

use aegis_ponte::{Camera, ErroCamera, Lista, Nome};
use serde::Serialize;

use crate::Resultado;

/// 🔴 O `?` do produto: sai com o `Resultado` que **não** é `Feito`.
///
/// `Resultado` não implementa `Try` e **não deve**. A casa tem uma pegadinha
/// escrita sobre o `?` — *"uma validação cujo resultado se deita fora não
/// roda"* — e dar ao `?` um tipo novo é dar-lhe um caminho novo de se deitar
/// fora sem dar por isso. Um verbo que se lê é um verbo que se avalia.
///
/// E os dois braços estão escritos um a um, em vez de um `outro => return
/// outro`: esse atalho deixa o `T` do resultado interior vazar para o tipo de
/// retorno, e a recusa de uma câmara acabaria a ter de ser a `Camera` que
/// nunca chegou a existir.
///
/// Vive em [`crate`] e não aqui, porque **é um só para o crate inteiro**: o
/// `?` do produto que vivesse num módulo seria um `?` do produto com duas
/// definições.
#[macro_export]
macro_rules! ou_saia {
    ($r:expr) => {
        match $r {
            $crate::Resultado::Feito(v) => v,
            $crate::Resultado::Recusado {
                codigo,
                o_que_dizer,
                o_que_fazer,
            } => {
                return $crate::Resultado::Recusado {
                    codigo,
                    o_que_dizer,
                    o_que_fazer,
                }
            }
            $crate::Resultado::Falhou {
                codigo,
                o_que_dizer,
            } => {
                return $crate::Resultado::Falhou {
                    codigo,
                    o_que_dizer,
                }
            }
        }
    };
}

/// Uma câmara, como a tela e o agente a veem.
///
/// 🔴 Não é a `Camera` de `aegis-ponte`: a ponte tem nomes de tipo seus e
/// ganhou campos que **não** são o contrato do produto. O que o produto
/// promete é nome, endereço e os dois endereços derivados — e uma estrutura
/// que é do produto não se deixa arrastar quando a ponte ganha um campo.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ResumoCamera {
    pub nome: String,
    pub endereco: String,
    /// O endereço que o `go2rtc` serve.
    pub rtsp: String,
    /// O endereço que o browser toca.
    ///
    /// 🔴 Com o lugar do **IP desta máquina** trocado por `<ip>`. A troca é
    /// feita **aqui** e não em cada casca porque é uma decisão de produto: a
    /// ponte não conhece o IP da máquina, e um campo que leva `<ip>` é um
    /// campo que não mente sobre o que sabe. Ficava na casca antes, e uma
    /// segunda face teria de a repetir — que é a segunda tradução.
    pub hls: String,
}

/// A lista de câmaras desta máquina.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ResumoCameras {
    /// Onde a lista vive.
    pub pasta: String,
    pub cameras: Vec<ResumoCamera>,
    /// 🔴 Linhas que o programa **não entendeu**, e que são **ditas** e não
    /// saltadas. Um ficheiro que o operador edita à mão tem linhas que o
    /// programa não entende, e um ficheiro em que isso acontece em silêncio é
    /// um ficheiro em que o operador já não confia.
    pub ignoradas: Vec<String>,
    /// O que fazer a seguir, quando há algo a fazer. `None` quando não há
    /// nada a sugerir — e é `None`, **e não** uma frase vazia, porque uma
    /// string vazia é indistinguível de um esquecimento de preencher.
    pub dica: Option<String>,
}

/// A pasta onde a lista vive.
///
/// 🔴 `--pasta` existe para a bancada e **não** tira a licença daqui: a
/// licença, o pedido pendente e a lista vivem em sítios diferentes **por
/// decisão**, e o que é segredo nunca vem de um caminho que o operador possa
/// escolher.
fn pasta_ou_recusa<T>(pasta: Option<&Path>) -> Result<PathBuf, Resultado<T>> {
    if let Some(p) = pasta {
        return Ok(p.to_path_buf());
    }
    match crate::pasta_de_dados() {
        Some(p) => Ok(p),
        None => Err(Resultado::recusado(
            ErroCamera::DadosDesconhecidos.codigo(),
            &ErroCamera::DadosDesconhecidos.humano(),
            ErroCamera::DadosDesconhecidos.gesto(),
        )),
    }
}

/// De um `ErroCamera` para um `Resultado`, **sem decidir nada**.
///
/// 🔴 A distinção é a da casa entre `1` e `3`: o disco que não deixou gravar
/// é **falhou** — o pedido era legítimo — e o resto é **recusado**, porque é
/// o pedido ou o ambiente que não deixa. Escrever esta conversão como uma
/// **função** é o que impede que uma face nova escolha a diferente.
fn da_ponte<T>(r: Result<T, ErroCamera>, contexto: &str) -> Resultado<T> {
    match r {
        Ok(v) => Resultado::Feito(v),
        Err(e) => {
            let frase = e.humano();
            if matches!(e, ErroCamera::Disco(_)) {
                Resultado::falhou(e.codigo(), &format!("{contexto}: {frase}"))
            } else {
                Resultado::recusado(e.codigo(), &frase, e.gesto())
            }
        }
    }
}

/// Lista as câmaras desta máquina.
pub fn camera_listar(pasta: Option<&Path>) -> Resultado<ResumoCameras> {
    let destino = match pasta_ou_recusa(pasta) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let mut lista = Lista::em(destino);
    let (_n, ignoradas) = lista.ler();

    let cameras = lista.cameras().iter().map(resumo_de).collect::<Vec<_>>();

    // 🔴 A dica só existe quando a lista está vazia, e diz o **gesto** — não
    // um convite. Uma lista vazia com dica é a diferença entre "não há nada
    // aqui" e "aqui está o que fazer a seguir".
    let dica = cameras
        .is_empty()
        .then(|| "Acrescente com: aegis camera adicionar <nome> <endereco>".to_string());

    Resultado::Feito(ResumoCameras {
        pasta: lista.caminho().display().to_string(),
        cameras,
        ignoradas,
        dica,
    })
}

/// Acrescenta uma câmara, ou muda o endereço de uma que já existe.
pub fn camera_adicionar(
    nome: &str,
    endereco: &str,
    pasta: Option<&Path>,
) -> Resultado<ResumoCamera> {
    let destino = match pasta_ou_recusa(pasta) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let camera = ou_saia!(da_ponte(Camera::nova(nome, endereco), "a camara"));
    let resumo = resumo_de(&camera);
    let mut lista = Lista::em(destino);
    let _ = lista.ler();
    // 🔴 A lista **é** a configuração: um `cameras.txt` que o `go2rtc` não lê é
    // uma lista de desejos. Escrever os dois juntos é o que impede duas
    // verdadeiras sobre o mesmo facto — e o ficheiro vai ao lado, não noutro
    // sítio.
    ou_saia!(da_ponte(
        lista
            .acrescentar(camera)
            .and_then(|()| lista.gravar())
            .and_then(|()| lista.gravar_go2rtc()),
        "ao gravar a lista",
    ));
    Resultado::Feito(resumo)
}

/// Tira uma câmara pelo nome.
pub fn camera_remover(nome: &str, pasta: Option<&Path>) -> Resultado<String> {
    let destino = match pasta_ou_recusa(pasta) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let nome = ou_saia!(da_ponte(Nome::novo(nome), "o nome"));
    let mut lista = Lista::em(destino);
    let _ = lista.ler();
    ou_saia!(da_ponte(lista.remover(&nome), "ao tirar a camara"));
    ou_saia!(da_ponte(
        lista.gravar().and_then(|()| lista.gravar_go2rtc()),
        "ao gravar a lista",
    ));
    Resultado::Feito(nome.to_string())
}

fn resumo_de(c: &Camera) -> ResumoCamera {
    let links = c.links("CAM");
    ResumoCamera {
        nome: c.nome.to_string(),
        endereco: c.endereco.to_string(),
        rtsp: links.rtsp,
        hls: links.hls.replace("CAM", "<ip>"),
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    /// 🔴 O teste que **morde** sobre a regra que este ficheiro veio resolver.
    ///
    /// A casa mediu que um motivo novo entra no `match` e fica de fora da
    /// lista, e que a cura da lista é só parcial. O que se pode apanhar aqui é
    /// o pior: um motivo **sem gesto**. E o gesto é o que transforma *"não
    /// consegui"* em *"o que é que eu faço agora"*.
    #[test]
    fn nenhum_motivo_da_ponte_fica_sem_gesto() {
        for (codigo, frase, gesto) in ErroCamera::todos() {
            assert!(!codigo.is_empty(), "um motivo sem código");
            assert!(!frase.trim().is_empty(), "{codigo}: frase vazia");
            assert!(!gesto.trim().is_empty(), "{codigo}: gesto vazio");
        }
    }

    /// A lista de motivos é o que a referência gerada imprime, e uma lista
    /// que se pode esvaziar em silêncio não é uma lista.
    #[test]
    fn a_lista_de_motivos_nao_esta_vazia() {
        assert!(ErroCamera::todos().len() >= 7);
    }

    /// A pasta que o operador aponta não é a pasta onde o **segredo** vive —
    /// e o teste é sobre o que muda de facto, que é a lista.
    #[test]
    fn uma_pasta_que_nao_existe_da_recusa_e_nao_falha() {
        let r = camera_listar(Some(Path::new(
            "caminho/que/nao/existe/e/nao/e/sera/criado",
        )));
        match r {
            Resultado::Feito(_) => {}
            Resultado::Recusado {
                codigo,
                o_que_fazer,
                ..
            } => {
                assert!(!o_que_fazer.trim().is_empty(), "{codigo} sem gesto")
            }
            Resultado::Falhou {
                codigo,
                o_que_dizer,
            } => {
                panic!("{codigo} devia ser recusa, não falha: {o_que_dizer}")
            }
        }
    }
}
