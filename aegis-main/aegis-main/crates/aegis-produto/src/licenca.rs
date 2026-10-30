//! O gate de licença, como operação do produto.
//!
//! 🔴 **A regra, da casa, medida:** *"sem licença nenhuma a ilha subia
//! inteira. Agora o `Instalar` recusa **antes de qualquer peça**"*.
//!
//! O detalhe que fecha o buraco não é o `verificar` — é o facto de **não
//! haver `None` que passe**. Sem o ficheiro, a função devolve
//! [`ErroLicenca::sem_licenca`]. A forma mais barata de contornar uma licença
//! não é forjar nada: é não passar o ficheiro.

use aegis_license::{ChavePublica, ErroLicenca, Pedido, verificar};
use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use std::path::Path;

/// O que o gate precisa para decidir.
pub struct Contexto {
    pub raiz: ChavePublica,
    pub vertical: String,
    pub licenca: Option<serde_json::Value>,
    pub chave_oem: Option<serde_json::Value>,
    pub fingerprint: String,
    pub agora: DateTime<Utc>,
}

/// Confere a licença de um vertical.
///
/// Devolve `Err` com **código fechado** — a tela traduz por ele, e nunca casa
/// a frase, que muda.
pub fn conferir(
    vertical_esperado: &str,
    caminho_licenca: Option<&Path>,
    caminho_chave_oem: Option<&Path>,
    machine_id: &str,
) -> Result<(), ErroLicenca> {
    let raiz = raiz_do_vendor()?;

    let licenca = caminho_licenca.and_then(|c| ler_documento(c).ok());
    let chave_oem = caminho_chave_oem.and_then(|c| ler_documento(c).ok());

    let (id, plataforma, arquitetura) = partes_da_maquina(machine_id);

    let contexto = Contexto {
        raiz,
        vertical: vertical_esperado.to_string(),
        licenca,
        chave_oem,
        fingerprint: fingerprint_de(&id, &plataforma, &arquitetura),
        agora: Utc::now(),
    };

    let Some(documento) = &contexto.licenca else {
        // 🔴 A forma de contorno mais barata que existe: não passar o
        // ficheiro. E é por isso que este `else` existe em vez de o `None`
        // descer até ao verificador.
        return Err(ErroLicenca::sem_licenca(&contexto.vertical));
    };

    let pedido = Pedido {
        raiz: &contexto.raiz,
        chave_oem: contexto.chave_oem.as_ref(),
        fingerprint: Some(&contexto.fingerprint),
        // 🔴 O vertical pedido é o do manifesto. Uma licença de um produto não
        // instala outro — e é a mesma regra que a casa escreve como "uma
        // licença `safetag` não pode instalar Contagem".
        seed: Some(&contexto.vertical),
        agora: contexto.agora,
        ultimo_visto: None,
    };

    verificar(documento, &pedido).map(|_| ())
}

/// Confere já com a raiz e os documentos carregados — para quem já os tem
/// (a GUI, que os pede ao utilizador uma vez).
pub fn conferir_com(
    vertical_esperado: &str,
    raiz: ChavePublica,
    licenca: Option<serde_json::Value>,
    chave_oem: Option<serde_json::Value>,
    machine_id: &str,
) -> Result<(), ErroLicenca> {
    if licenca.is_none() {
        return Err(ErroLicenca::sem_licenca(vertical_esperado));
    }
    let (id, plataforma, arquitetura) = partes_da_maquina(machine_id);
    let pedido = Pedido {
        raiz: &raiz,
        chave_oem: chave_oem.as_ref(),
        fingerprint: Some(&fingerprint_de(&id, &plataforma, &arquitetura)),
        seed: Some(vertical_esperado),
        agora: Utc::now(),
        ultimo_visto: None,
    };
    verificar(licenca.as_ref().expect("conferido acima"), &pedido).map(|_| ())
}

/// A licença que uma **pasta** de vertical exige — `None` se a pasta não é um
/// vertical.
///
/// 🔴 Isto estava escrito à mão na linha de comandos:
///
/// ```ignore
/// aegis_vertical::carregar(&vertical).map(|m| m.licenca.exige).unwrap_or_default()
/// ```
///
/// e a face agêntica precisava da mesma linha. Duas cópias da mesma leitura
/// divergem — e a divergência aqui seria silenciosa: uma delas passaria a
/// treatise uma pasta inválida como *"não exige licença"*, que é a forma mais
/// barata de contornar uma licença: **não passar o manifesto**.
pub fn exigencia_de(pasta: &Path) -> Option<String> {
    aegis_vertical::carregar(pasta)
        .ok()
        .map(|m| m.licenca.exige)
}

/// O gate de um **produto**: confere a licença que o vertical exige, ou
/// passa se ele não exige nenhuma.
///
/// 🔴 Isto estava escrito **duas vezes** — no `instalar` e, agora, no
/// portão da face agêntica — e duas escritas da mesma regra divergem no
/// primeiro caso de borda. A segunda cópia não era *"a mesma regra noutro
/// sítio"*: era a regra a perguntar *"e se o vertical não exige licença?"*
/// numa versão e na outra não, e um vertical sem `licenca.exige` é uma
/// **escolha escrita no manifesto**, não um acidente.
pub fn exigir(
    vertical: &aegis_vertical::Manifesto,
    caminho_licenca: Option<&Path>,
    caminho_chave_oem: Option<&Path>,
    machine_id: &str,
) -> Option<ErroLicenca> {
    let esperado = vertical.licenca.exige.trim();
    if esperado.is_empty() {
        return None;
    }
    conferir(esperado, caminho_licenca, caminho_chave_oem, machine_id).err()
}

/// A raiz do vendor.
///
/// 🔴 Vem do **ambiente ou do binário compilado** — nunca do ficheiro de
/// licença. Uma raiz que o documento diga qual é não é uma raiz: é uma
/// opinião, e a casa já pagou por essa leitura errada com um verificador que
/// recusava a Chave OEM legítima.
pub fn raiz_do_vendor() -> Result<ChavePublica, ErroLicenca> {
    let bruto = aegis_ambiente::raiz_do_vendor()
        .ok_or_else(|| ErroLicenca::de(aegis_license::Motivo::SemRaiz, "AEGIS_RAIZ_VENDOR"))?;
    ChavePublica::nova(bruto.trim())
        .map_err(|e| ErroLicenca::de(aegis_license::Motivo::SemRaiz, e.0))
}

/// O fingerprint desta máquina, com a **mesma** derivação do emissor.
///
/// 🔴 A derivação é do `aegis-cli` (`fingerprintDe`): chaves ordenadas,
/// valores em minúsculas, `k=v` unidos por `|`, sha256 em hex. Uma derivação
/// diferente daria um fingerprint diferente, e a licença — que é do emissor —
/// seria recusada como "de outra máquina" numa máquina certa.
pub fn fingerprint_de(machine_id: &str, plataforma: &str, arquitetura: &str) -> String {
    let mut partes = [
        ("machine_id", machine_id),
        ("plataforma", plataforma),
        ("arquitetura", arquitetura),
    ];
    partes.sort_by_key(|(k, _)| *k);

    let texto = partes
        .iter()
        .map(|(k, v)| format!("{k}={}", v.trim().to_lowercase()))
        .collect::<Vec<_>>()
        .join("|");

    let mut h = Sha256::new();
    h.update(texto.as_bytes());
    hex::encode(h.finalize())
}

/// As partes do fingerprint desta máquina, como o emissor as quer.
pub fn partes_da_maquina(machine_id: &str) -> (String, String, String) {
    (
        machine_id.to_string(),
        std::env::consts::OS.to_string(),
        std::env::consts::ARCH.to_string(),
    )
}

/// O identificador estável desta máquina, quando ninguém o diz.
pub fn machine_id_padrao() -> String {
    aegis_ambiente::machine_id()
}

fn ler_documento(caminho: &Path) -> Result<serde_json::Value, ErroLicenca> {
    let texto = std::fs::read_to_string(caminho).map_err(|e| {
        ErroLicenca::de(
            aegis_license::Motivo::Formato,
            &format!("não li {}: {e}", caminho.display()),
        )
    })?;
    serde_json::from_str(&texto).map_err(|e| {
        ErroLicenca::de(
            aegis_license::Motivo::Formato,
            &format!("{} não é um documento válido: {e}", caminho.display()),
        )
    })
}
