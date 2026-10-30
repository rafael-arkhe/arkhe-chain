//! O verificador: **raiz do vendor → Chave OEM → licença**.
//!
//! # A cadeia, e por que nesta ordem
//!
//! 🔴 A raiz esperada é **sempre** a que o chamador fixou, nunca a
//! `assinatura.por` que viaja no documento. Deixar o documento dizer quem o
//! assinou é aceitar uma licença que qualquer um forja trocando esse campo
//! pela sua própria chave — e a casa já pagou por essa leitura errada, com um
//! verificador que recusava a Chave OEM legítima por esperar a assinatura da
//! Safe Core numa licença que o **parceiro** tinha assinado de propósito.

use base64::Engine as _;
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde_json::Value;

use crate::canonico::conteudo_assinado;
use crate::carga::{Carga, CargaOem};
use crate::erro::{ErroLicenca, Motivo};

/// O rótulo do envelope. 🔴 É este rótulo **e** o `tipo` que dizem o que o
/// documento é; a casa já custou a caro a tentativa de os separar.
pub const FORMATO: &str = "aegis/licenca/1";

pub const TIPO_OEM: &str = "chave-oem";
pub const TIPO_LICENCA: &str = "licenca";

/// Uma chave pública Ed25519 **validada**, em base64url.
///
/// 🔴 Newtype, e não `type ChavePublica = String`. Um alias deixa passar
/// qualquer texto para dentro da verificação, e o `Err` do Ed25519 só aparece
/// já no meio do caminho — como "assinatura inválida", que é um motivo
/// **falso** para a recusa que o operador vai ver. A chave tem de estar
/// validada no momento em que entra, para que uma chave malformada e uma
/// assinatura falsificada sejam coisas diferentes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChavePublica(String);

/// 🔴 O prefixo de uma chave pública Ed25519 em **DER/SPKI**.
///
/// A chave viaja no documento como SPKI em base64url — **59 caracteres**, não
/// os 43 de uma chave crua. A escolha é do emissor e está escrita lá: PEM tem
/// quebras de linha, e um campo multi-linha num JSON assinado é um convite
/// para o CRLF do Windows virar divergência de assinatura.
///
/// A primeira versão deste ficheiro assumia 32 bytes crus e recusava toda a
/// chave boa com um `Err(())` sem dizer porquê — a falha mais cara possível,
/// porque parece "a criptografia não funciona".
const SPKI_ED25519: [u8; 12] = [
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
];

/// 🔴 Uma chave que não é chave dá `ErroChave`, e não `()`.
///
/// `Result<_, ()>` é a assinatura de "não sei porque" — e o chamador acaba
/// por traduzir isso para "assinatura inválida", que é um motivo **falso**.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ErroChave(pub &'static str);

impl std::fmt::Display for ErroChave {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.0)
    }
}

impl std::error::Error for ErroChave {}

impl ChavePublica {
    /// Valida a forma. Não verifica nada sobre a assinatura — isso é trabalho
    /// de `assinatura_confere`.
    pub fn nova(base64url: &str) -> Result<Self, ErroChave> {
        Self::verificadora_de(base64url)?;
        Ok(Self(base64url.trim().to_string()))
    }

    fn bytes_de(base64url: &str) -> Result<[u8; 32], ErroChave> {
        let der =
            decode_b64url(base64url.trim()).map_err(|_| ErroChave("a chave não é base64url"))?;
        if der.len() != 44 {
            return Err(ErroChave(
                "a chave não tem o tamanho de uma SPKI Ed25519 (44 bytes)",
            ));
        }
        if der[..12] != SPKI_ED25519 {
            return Err(ErroChave("a chave não é uma Ed25519"));
        }
        let arr: [u8; 32] = der[12..]
            .try_into()
            .map_err(|_| ErroChave("chave truncada"))?;
        Ok(arr)
    }

    fn verificadora_de(base64url: &str) -> Result<VerifyingKey, ErroChave> {
        let arr = Self::bytes_de(base64url)?;
        VerifyingKey::from_bytes(&arr).map_err(|_| ErroChave("chave fora do grupo"))
    }

    /// Como veio — para o log e para comparar com `assinatura.por`.
    pub fn como_texto(&self) -> &str {
        &self.0
    }

    fn verificadora(&self) -> Result<VerifyingKey, ErroChave> {
        Self::verificadora_de(&self.0)
    }
}

impl std::fmt::Display for ChavePublica {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // 🔴 A chave NUNCA é impressa por inteiro. Uma tela ou um log que
        // despeja a chave transforma a auditoria numa Recolha de chaves, e a
        // casa mediu isso com a Chave OEM que viajava em todo o exe entregue.
        write!(
            f,
            "{}…{}",
            self.0.chars().take(6).collect::<String>(),
            self.0.chars().count()
        )
    }
}

/// O que se pede ao verificador.
pub struct Pedido<'a> {
    /// A **raiz do vendor**. Sem ela não há cadeia — e a raiz nunca vem do
    /// documento.
    pub raiz: &'a ChavePublica,
    /// A Chave OEM do parceiro, para uma licença de instância.
    pub chave_oem: Option<&'a Value>,
    /// O fingerprint desta máquina.
    pub fingerprint: Option<&'a str>,
    /// O vertical que se quer instalar.
    pub seed: Option<&'a str>,
    /// O instante do julgamento. **Injetado**, nunca lido de dentro: uma
    /// prova que depende do relógio de quem a corre fica vermelha sozinha
    /// quando o fixture vence, e o vermelho aponta para o produto.
    pub agora: DateTime<Utc>,
    /// O último instante em que esta licença foi vista válida.
    pub ultimo_visto: Option<DateTime<Utc>>,
}

/// O resultado de verificar.
#[derive(Debug, Clone, PartialEq)]
pub struct Veredito {
    pub parceiro: String,
    pub seed: String,
    pub licenca_id: Option<String>,
    pub expira_em: DateTime<Utc>,
    pub estado: EstadoValidade,
    pub politica_expiracao: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EstadoValidade {
    Valida,
    Tolerada,
    Expirada,
}

impl EstadoValidade {
    pub fn nome(&self) -> &'static str {
        match self {
            Self::Valida => "valida",
            Self::Tolerada => "tolerada",
            Self::Expirada => "expirada",
        }
    }
}

/// Verifica um envelope contra a cadeia.
pub fn verificar(env: &Value, pedido: &Pedido) -> Result<Veredito, ErroLicenca> {
    // 1. O formato. Sem isto, um JSON qualquer entra na máquina.
    let rotulo = env.get("aegis").and_then(Value::as_str).unwrap_or("");
    if rotulo != FORMATO {
        return Err(ErroLicenca::de(Motivo::Formato, rotulo));
    }
    if pedido.raiz.como_texto().trim().is_empty() {
        return Err(ErroLicenca::de(Motivo::SemRaiz, ""));
    }

    let tipo = env.get("tipo").and_then(Value::as_str).unwrap_or("");

    // 2. Uma licença de instância precisa da Chave OEM para provar a origem.
    if tipo == TIPO_LICENCA && pedido.chave_oem.is_none() {
        return Err(ErroLicenca::de(Motivo::SemChaveOem, tipo));
    }

    // 3. A Chave OEM, quando vem, tem de vir da RAIZ.
    let pub_parceiro: Option<ChavePublica> = match pedido.chave_oem {
        Some(oem) => {
            let carga = conferir_chave_oem(oem, pedido.raiz)?;
            let por = env
                .get("assinatura")
                .and_then(|a| a.get("por"))
                .and_then(Value::as_str)
                .unwrap_or("");
            if por != carga.pub_parceiro {
                return Err(ErroLicenca::de(Motivo::AssinaturaParceiro, &carga.parceiro));
            }
            // A chave do parceiro **é validada aqui**: uma `pub_parceiro`
            // malformada na Chave OEM é recusada como assinatura inválida
            // depois, e não aqui — e a diferença é a diferença entre "o
            // ficheiro está estragado" e "alguém o forjou".
            Some(
                ChavePublica::nova(&carga.pub_parceiro)
                    .map_err(|e| ErroLicenca::de(Motivo::AssinaturaParceiro, e.0))?,
            )
        }
        None => None,
    };

    // 4. A assinatura, contra a chave ESPERADA — raiz para a Chave OEM,
    //    chave do parceiro para a licença.
    let esperada: &ChavePublica = if tipo == TIPO_OEM {
        pedido.raiz
    } else {
        pub_parceiro
            .as_ref()
            .ok_or_else(|| ErroLicenca::de(Motivo::Assinatura, tipo))?
    };
    if !assinatura_confere(env, esperada) {
        return Err(ErroLicenca::de(Motivo::Assinatura, esperada.como_texto()));
    }

    // A Chave OEM sozinha: conferi-la já é verificar.
    if tipo == TIPO_OEM {
        let c = CargaOem::de(env).ok_or_else(|| ErroLicenca::de(Motivo::Formato, "carga"))?;
        return Ok(Veredito {
            parceiro: c.parceiro,
            seed: String::new(),
            licenca_id: None,
            expira_em: c.expira_em,
            estado: EstadoValidade::Valida,
            politica_expiracao: c.politica_expiracao,
        });
    }

    let carga = Carga::de(env).ok_or_else(|| ErroLicenca::de(Motivo::Formato, "carga"))?;

    // 5. As regras do payload, contra a Chave OEM quando há uma.
    if let Some(oem) = pedido.chave_oem
        && let Some(c) = CargaOem::de(oem)
    {
        if carga.parceiro != c.parceiro {
            return Err(ErroLicenca::de(Motivo::Parceiro, &carga.parceiro));
        }
        if !c.seeds.contains(&carga.seed) {
            return Err(ErroLicenca::de(Motivo::Seed, &carga.seed));
        }
        // 🔴 A licença não sobrevive à autorização que a originou: vencer
        // depois da Chave OEM é viver mais do que quem assinou.
        if carga.expira_em > c.expira_em {
            return Err(ErroLicenca::de(
                Motivo::Prazo,
                &carga.expira_em.to_rfc3339(),
            ));
        }
    }

    // 6. O node-lock. É ele que prende a licença a ESTA máquina.
    if let Some(esperado) = pedido.fingerprint
        && normalizar_fingerprint(esperado)? != carga.fingerprint
    {
        return Err(ErroLicenca::de(Motivo::Fingerprint, esperado));
    }

    // 7. O vertical que se está a instalar.
    if let (Some(seed), true) = (pedido.seed, tipo == TIPO_LICENCA)
        && carga.seed != seed
    {
        return Err(ErroLicenca::de(Motivo::SeedUso, seed));
    }

    // 8. O prazo, com tolerância e **sem ressurreição**.
    let estado = avaliar_validade(&carga, pedido);
    if estado == EstadoValidade::Expirada {
        return Err(ErroLicenca::de(
            Motivo::Expirada,
            &carga.expira_em.to_rfc3339(),
        ));
    }

    Ok(Veredito {
        parceiro: carga.parceiro,
        seed: carga.seed,
        licenca_id: carga.licenca_id,
        expira_em: carga.expira_em,
        estado,
        politica_expiracao: carga.politica_expiracao,
    })
}

/// Confere a Chave OEM contra a raiz.
///
/// 🔴 Uma cópia desta regra existia no verificador da **resposta** de
/// renovação, e duas cópias divergem no primeiro caso de borda — que, aqui,
/// é o que separa "confio" de "aceitei o ficheiro".
pub fn conferir_chave_oem(oem: &Value, raiz: &ChavePublica) -> Result<CargaOem, ErroLicenca> {
    if oem.get("aegis").and_then(Value::as_str) != Some(FORMATO)
        || oem.get("tipo").and_then(Value::as_str) != Some(TIPO_OEM)
    {
        return Err(ErroLicenca::de(Motivo::Formato, "chave-oem"));
    }
    if !assinatura_confere(oem, raiz) {
        return Err(ErroLicenca::de(Motivo::AssinaturaOem, raiz.como_texto()));
    }
    let carga = CargaOem::de(oem).ok_or_else(|| ErroLicenca::de(Motivo::Formato, "carga"))?;
    if carga.seeds.is_empty() {
        // A casa registou a lição: uma Chave OEM sem `seeds` **não licencia
        // nada**, e o sintoma é um vertical que ninguém consegue instalar.
        return Err(ErroLicenca::de(Motivo::SemSeeds, ""));
    }
    Ok(carga)
}

/// A assinatura confere com a chave esperada?
///
/// 🔴 A chave esperada é **argumento**: nunca se tira o nome do documento.
pub fn assinatura_confere(env: &Value, publica: &ChavePublica) -> bool {
    let Ok(chave) = publica.verificadora() else {
        return false;
    };
    let Some(valor) = env
        .get("assinatura")
        .and_then(|a| a.get("valor"))
        .and_then(Value::as_str)
    else {
        return false;
    };
    let Ok(bytes) = decode_b64url(valor) else {
        return false;
    };
    let Ok(assinatura) = Signature::from_slice(&bytes) else {
        return false;
    };
    chave
        .verify(conteudo_assinado(env).as_bytes(), &assinatura)
        .is_ok()
}

fn decode_b64url(s: &str) -> Result<Vec<u8>, ()> {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(s.as_bytes())
        .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(s.as_bytes()))
        .map_err(|_| ())
}

/// `sha256:ABC…` → `abc…`.
///
/// Aceitar as duas formas evita recusa por maiúscula — o tipo de rigor que
/// não protege nada e atrapalha em campo.
pub fn normalizar_fingerprint(s: &str) -> Result<String, ErroLicenca> {
    let limpo = s
        .trim()
        .to_lowercase()
        .trim_start_matches("sha256:")
        .to_string();
    if limpo.len() != 64 || !limpo.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(ErroLicenca::de(Motivo::Fingerprint, s));
    }
    Ok(limpo)
}

/// A validade, com tolerância — e **sem ressurreição**.
pub fn avaliar_validade(carga: &Carga, pedido: &Pedido) -> EstadoValidade {
    // 🔴 O relógio andou para trás? Uma licença vencida com o relógio atrás é
    // a porta por onde a validade volta. A casa já mediu um verificador que
    // ressuscitava licença assim, e a cura é a data do último visto, que
    // só anda para a frente.
    if let Some(ultimo) = pedido.ultimo_visto
        && pedido.agora < ultimo
    {
        return EstadoValidade::Expirada;
    }
    let com_grace = carga.expira_em - chrono::Duration::hours(carga.grace_horas);
    if pedido.agora <= com_grace {
        EstadoValidade::Valida
    } else if pedido.agora <= carga.expira_em {
        EstadoValidade::Tolerada
    } else {
        EstadoValidade::Expirada
    }
}
