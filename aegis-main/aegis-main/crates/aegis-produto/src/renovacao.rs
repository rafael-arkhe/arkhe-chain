//! A renovação, como **operação do produto**.
//!
//! 🔴 Sem este ficheiro, a recusa de licença vencida mandava o operador
//! "Renovar a licença" para um gesto que não existia. A regra está em
//! `aegis_license::renovacao` e é **pura**; o que falta — e é o que o
//! operador toca — é o outro tempo do gesto: onde o pedido fica, e como a
//! licença de dentro chega ao disco.
//!
//! # O pedido fica AO LADO da licença, e não numa pasta de dados
//!
//! 🔴 Uma pasta de dados própria seria o sítio certo, e ela ainda não existe
//! neste núcleo. Até lá a regra é **uma** e é derivável sem configuração: a
//! licença é um ficheiro, e o que se refere a ela mora ao lado dela.
//!
//! A alternativa — um caminho no ambiente — daria **dois sítios** para a mesma
//! licença, que é como uma acaba num ficheiro e o emissor responde a outra. E
//! há um segundo motivo, que é o mais importante: o pedido pendente **não é
//! apagado** ao aplicar, porque ele *é* a memória de qual pedido está vivo.
//! Um ficheiro que ninguém sabe onde está é um ficheiro que ninguém apaga.

use aegis_license::{ContextoRenovacao, Desfecho, PedidoRenovacao, canonico, conferir_resposta};
use chrono::Utc;
use serde::Serialize;
use std::path::{Path, PathBuf};

use crate::Resultado;
use crate::licenca::{fingerprint_de, partes_da_maquina, raiz_do_vendor};

/// O nome do pedido pendente, ao lado da licença.
pub const NOME_DO_PEDIDO: &str = "pedido-renovacao.json";

/// Onde o pedido pendente vive, a partir de onde vive a licença.
pub fn pedido_ao_lado(licenca: &Path) -> PathBuf {
    licenca
        .parent()
        .map(|p| p.join(NOME_DO_PEDIDO))
        .unwrap_or_else(|| PathBuf::from(NOME_DO_PEDIDO))
}

/// O que o primeiro tempo do gesto produz.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ResumoPedido {
    /// Onde foi escrito, para o técnico poder mandá-lo.
    pub destino: String,
    pub pedido_id: String,
    pub licenca_id: String,
    pub seed: String,
    pub parceiro: String,
    /// 🔴 A data que a licença **tem hoje**. Quem emite precisa dela, e sem
    /// ela a resposta só se pode medir contra o pedido — que é a metade do
    /// não-encurta, e não a que importa.
    pub expira_em_atual: String,
}

/// O primeiro tempo: **tirar o pedido**.
///
/// 🔴 Só escreve. Não toca na licença, não toca no banco e não decide nada —
/// a decisão é de quem emite. E o pedido **sobrescreve** o anterior de
/// propósito: o nonce novo é o que invalida as respostas velhas, e um pedido
/// que se recusasse a nascer porque já há outro seria um pedido que nunca
/// expira.
pub fn pedir(caminho_licenca: &Path, machine_id: &str) -> Resultado<ResumoPedido> {
    let Some(documento) = ler(caminho_licenca) else {
        return Resultado::recusado(
            "renovacao.sem-licenca-instalada",
            &format!("não há licença instalada em {}", caminho_licenca.display()),
            "Instalar a ilha com a licença desta máquina antes de renovar",
        );
    };

    let (id, plataforma, arquitetura) = partes_da_maquina(machine_id);
    let fingerprint = fingerprint_de(&id, &plataforma, &arquitetura);
    let host = id.clone();

    let pedido = match PedidoRenovacao::da_licenca(&documento, &host, &fingerprint, Utc::now()) {
        Ok(p) => p,
        Err(e) => {
            return Resultado::Recusado {
                codigo: e.codigo().to_string(),
                o_que_dizer: e.humano().to_string(),
                o_que_fazer: e.gesto().to_string(),
            };
        }
    };

    let destino = pedido_ao_lado(caminho_licenca);
    if let Err(e) = escrever(&destino, &format!("{}\n", canonico(&pedido.para_json()))) {
        return Resultado::falhou(
            "renovacao.escrita",
            &format!("não consegui escrever {}: {e}", destino.display()),
        );
    }

    Resultado::Feito(ResumoPedido {
        destino: destino.display().to_string(),
        pedido_id: pedido.pedido_id.clone(),
        licenca_id: pedido.licenca_id.clone(),
        seed: pedido.seed.clone(),
        parceiro: pedido.parceiro.clone(),
        expira_em_atual: pedido.expira_em_atual.clone(),
    })
}

/// O que o segundo tempo do gesto produz.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ResumoRenovacao {
    pub licenca_id: String,
    pub expira_em: String,
    pub parceiro: String,
    pub seed: String,
    pub destino: String,
    /// 🔴 Onde o pedido ficou pendente. Continua lá **de propósito**: é ele
    /// que diz qual pedido está vivo, e portanto é ele que recusa uma
    /// resposta de outro pedido.
    ///
    /// ⚠️ O que ele **não** faz é impedir que a mesma resposta seja aplicada
    /// duas vezes — e a primeira versão desta docstring dizia que sim. Medido
    /// contra o binário: reaplicar a mesma resposta volta a escrever a mesma
    /// licença e sai com `0`. A garantia contra o replay é o **não-encurta**,
    /// que mede contra o documento que está no disco.
    pub pedido_pendente: String,
}

/// O segundo tempo: **conferir a resposta e gravar**.
///
/// 🔴 Grava a licença **de dentro** do envelope, nunca o ficheiro recebido. A
/// resposta é um documento `tipo: resposta` com a licença aninhada; copiar o
/// ficheiro tal e qual poria `tipo: resposta` no lugar da licença, e o
/// `doctor` leria um documento que não é licença — sem `expira_em` no payload.
pub fn aplicar(
    caminho_resposta: &Path,
    caminho_licenca: &Path,
    caminho_chave_oem: Option<&Path>,
    machine_id: &str,
) -> Resultado<ResumoRenovacao> {
    let Some(resposta) = ler(caminho_resposta) else {
        return Resultado::falhou(
            "renovacao.leitura",
            &format!("não li {}", caminho_resposta.display()),
        );
    };
    // 🔴 A Chave OEM é `Option`, e a **recusa sai daqui** — a casca não a
    // transforma num erro próprio. Uma recusa decidida na casca é uma segunda
    // política a dizer a mesma coisa, e as duas divergem no primeiro caso em
    // que alguém passa a flag por engano.
    let chave_oem = match caminho_chave_oem.and_then(ler) {
        Some(c) => c,
        None => {
            return Resultado::Recusado {
                codigo: "licenca.sem-chave-oem".to_string(),
                o_que_dizer: "A renovação só se confere com a Chave OEM do parceiro.".to_string(),
                o_que_fazer: "Instalar a Chave OEM antes de renovar".to_string(),
            };
        }
    };
    let licenca_atual = ler(caminho_licenca);
    let pedido = pedido_ao_lado(caminho_licenca);
    let pedido = ler(&pedido).and_then(|v| PedidoRenovacao::de_json(&v));

    let raiz = match raiz_do_vendor() {
        Ok(r) => r,
        Err(e) => {
            return Resultado::Recusado {
                codigo: e.codigo().to_string(),
                o_que_dizer: e.humano().to_string(),
                o_que_fazer: e.gesto().to_string(),
            };
        }
    };

    let (id, plataforma, arquitetura) = partes_da_maquina(machine_id);
    let fingerprint = fingerprint_de(&id, &plataforma, &arquitetura);

    let conferido = conferir_resposta(
        &resposta,
        &ContextoRenovacao {
            raiz: &raiz,
            chave_oem: &chave_oem,
            pedido: pedido.as_ref(),
            licenca_atual: licenca_atual.as_ref(),
            fingerprint: &fingerprint,
            agora: Utc::now(),
            ultimo_visto: None,
        },
    );

    let desfecho = match conferido {
        Ok(d) => d,
        Err(e) => {
            return Resultado::Recusado {
                codigo: e.codigo().to_string(),
                o_que_dizer: e.humano().to_string(),
                o_que_fazer: e.gesto().to_string(),
            };
        }
    };

    // `negar` **não** é uma falha do produto: quem emitiu respondeu, e a
    // resposta foi não. Sai por `3` com o motivo em palavras, que é o que o
    // técnico precisa de ler — e nada é gravado.
    let (licenca, licenca_id, expira_em) = match desfecho {
        Desfecho::Renovada {
            licenca,
            licenca_id,
            expira_em,
        } => (licenca, licenca_id, expira_em),
        Desfecho::Recusada { motivo } => {
            return Resultado::Recusado {
                codigo: "renovacao.recusada".to_string(),
                o_que_dizer: format!("Quem emitiu recusou a renovação: {motivo}"),
                o_que_fazer: "Acertar com o parceiro o motivo da recusa".to_string(),
            };
        }
    };

    // Só agora se grava — e em **temporário + cópia**, porque uma licença
    // escrita pela metade é pior do que nenhuma: o `doctor` leria lixo em vez
    // de dizer que a licença venceu.
    //
    // 🔴 E escreve-se em **canónico**, a forma que as implementações do
    // verificador reproduzem. Um `to_string_pretty` seria mais bonito de ler e
    // dependente de a ordem das chaves sobreviver à ida e à volta.
    if let Err(e) = escrever(caminho_licenca, &aegis_license::para_recebido(&licenca)) {
        return Resultado::falhou(
            "renovacao.escrita",
            &format!(
                "conferi e está tudo certo, mas não consegui gravar {}: {e}",
                caminho_licenca.display()
            ),
        );
    }

    let carga = aegis_license::Carga::de(&licenca);
    Resultado::Feito(ResumoRenovacao {
        licenca_id: licenca_id.clone(),
        expira_em: expira_em.to_rfc3339(),
        parceiro: carga
            .as_ref()
            .map(|c| c.parceiro.clone())
            .unwrap_or_default(),
        seed: carga.as_ref().map(|c| c.seed.clone()).unwrap_or_default(),
        destino: caminho_licenca.display().to_string(),
        pedido_pendente: pedido_ao_lado(caminho_licenca).display().to_string(),
    })
}

// ===========================================================================
// Disco
// ===========================================================================

fn ler(caminho: &Path) -> Option<serde_json::Value> {
    let texto = std::fs::read_to_string(caminho).ok()?;
    serde_json::from_str(&texto).ok()
}

/// 🔴 Escreve por **temporário e cópia**, nunca por cima directo.
///
/// Um ficheiro de licença cortado a meio pelo disco cheio, por um antivírus ou
/// por um CTRL-C deixa um documento que **não recusa em lado nenhum** — passa
/// a ler como "não há licença", e a recusa que o operador vê passa a ser
/// "instale a licença", que é um gesto que não resolve o que aconteceu.
fn escrever(destino: &Path, conteudo: &str) -> std::io::Result<()> {
    if let Some(pasta) = destino.parent()
        && !pasta.as_os_str().is_empty()
    {
        std::fs::create_dir_all(pasta)?;
    }
    let temporario = destino.with_extension("novo");
    std::fs::write(&temporario, conteudo)?;
    match std::fs::copy(&temporario, destino) {
        Ok(_) => {
            let _ = std::fs::remove_file(&temporario);
            Ok(())
        }
        Err(e) => {
            // 🔴 O temporário **não** fica: um ficheiro a meio no disco é
            // pior do que nenhum, porque o próximo a ler não sabe o que é.
            let _ = std::fs::remove_file(&temporario);
            Err(e)
        }
    }
}
