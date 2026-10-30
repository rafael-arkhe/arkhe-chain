//! A renovação, em dois tempos — **o buraco que a recusa de expirada tinha**.
//!
//! 🔴 O `Motivo::Expirada` diz ao operador *"Renovar a licença"*. Antes deste
//! ficheiro, esse gesto **não levava a lado nenhum** no núcleo novo: não havia
//! caminho para renovar. Um erro que aponta para uma ação que não existe é a
//! pior das três coisas que um verificador pode dizer — pior que "erro", porque
//! "`erro`" pelo menos admite que ninguém sabe.
//!
//! # O mesmo request/response da ativação, porque o problema é o mesmo
//!
//! A licença vence e a máquina de campo pode nunca ter falado com a nuvem. É
//! o ar-gap que o plano da casa já descreve como caminho principal. A resposta
//! é a mesma da ativação, em dois tempos:
//!
//! 1. a máquina **escreve um pedido** — que é pergunta, não credencial;
//! 2. quem emite devolve um envelope **assinado**, e a máquina confere e grava.
//!
//! # 🔴 O envelope não pode virar estoque
//!
//! Ele sai do PC de quem emite e viaja por pendrive, e-mail ou WhatsApp. Sem
//! as amarras abaixo, um envelope capturado renovaria licença para sempre — e
//! revogação não significaria nada. São seis, e cada uma fecha uma coisa que
//! as outras não fecham:
//!
//! | # | Amarra | O que fecha |
//! |---|---|---|
//! | 1 | o **nonce** (`pedido_id`) | uma resposta só vale para o pedido que responde. É o que faz uma resposta velha parar de valer no instante em que se tira um pedido novo — e é por isso que o pedido pendente **não** é apagado ao aplicar: ele *é* a memória de qual pedido está vivo |
//! | 2 | a **janela** (`valida_ate`, 72 h) | vencida, ela não revive |
//! | 3 | o **node-lock do envelope** | resposta de outra máquina é recusada aqui, e não lá na emissão |
//! | 4 | a **cadeia inteira** da licença de dentro | não existe "versão rápida" do gate: um emissor com defeito que assinasse um envelope legítimo com a licença de **outra** caixa é descoberto aqui |
//! | 5 | o **`licenca_id` inalterado** | renovação não é instância nova; um id novo a cada renovação faria a cota do parceiro contar caixas que não existem |
//! | 6 | o **não-encurta** | responder duas vezes ao mesmo pedido é um downgrade, e renovação não é downgrade |
//!
//! # O que este módulo NÃO faz
//!
//! Não decide. O ledger decide `renovar`/`negar`; aqui só se confere o que
//! veio assinado. E **não assina** — nenhuma chave privada entra no núcleo.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::carga::Carga;
use crate::erro::{ErroLicenca, Motivo};
use crate::verificador::{ChavePublica, FORMATO, Pedido, TIPO_OEM, conferir_chave_oem, verificar};

/// O rótulo do pedido. É do **emissor** (`aegis-cli/src/licenca.js`).
pub const FORMATO_PEDIDO: &str = "aegis/pedido-renovacao/1";

/// O rótulo da resposta.
pub const TIPO_RESPOSTA: &str = "resposta";

/// As decisões possíveis. **Vocabulário fechado**, espelho de `DECISOES` no
/// `aegis-cli` e de `licenciamento.decisao_do_checkin` no ledger.
pub const DECISOES: [&str; 2] = ["renovar", "negar"];

// ===========================================================================
// O pedido
// ===========================================================================

/// O pedido de renovação — **pergunta, não credencial**.
///
/// 🔴 Não é assinado, e não é preciso: ele carrega `licença_id`, `fingerprint`
/// e até quando a licença vale — nada secreto, e nada que o documento
/// instalado já não diga. O que **é** assinado é a resposta.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PedidoRenovacao {
    pub aegis: String,
    /// 🔴 O **nonce**. Ver [`PedidoRenovacao::da_licenca`].
    pub pedido_id: String,
    pub host: String,
    pub fingerprint: String,
    /// A licença que esta renovação renova. Vem do **documento instalado**,
    /// nunca de um campo da resposta — o pedido é que ancora o que se renova.
    pub licenca_id: String,
    pub expira_em_atual: String,
    pub seed: String,
    pub parceiro: String,
    pub em: String,
}

impl PedidoRenovacao {
    /// O pedido que esta máquina tem de fazer, a partir da licença **instalada**.
    ///
    /// 🔴 É do documento instalado que saem `licenca_id`, `expira_em_atual`,
    /// `seed` e `parceiro`. Um pedido escrito à mão seria uma segunda
    /// verdade sobre a mesma licença, e a divergência entre as duas apareceria
    /// como uma renovação que "não encaixa" — sem ninguém saber qual das duas
    /// está errada.
    pub fn da_licenca(
        licenca: &Value,
        host: &str,
        fingerprint: &str,
        agora: DateTime<Utc>,
    ) -> Result<Self, ErroLicenca> {
        let carga = Carga::de(licenca)
            .ok_or_else(|| ErroLicenca::de(Motivo::Formato, "a licença instalada não se lê"))?;
        // 🔴 Uma licença sem `licenca_id` não tem o que renovar. Sem id, a
        // amarra nº 5 não tem contra o que medir, e a renovação passa a ser
        // "qualquer licença deste parceiro" — que é stock.
        let licenca_id = carga
            .licenca_id
            .clone()
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| {
                ErroLicenca::de(
                    Motivo::Formato,
                    "a licença instalada não tem `licenca_id`, e sem ele a renovação \
                     não tem o que renovar",
                )
            })?;

        Ok(Self {
            aegis: FORMATO_PEDIDO.to_string(),
            pedido_id: nonce(),
            host: host.to_string(),
            fingerprint: normalizado(fingerprint)?,
            licenca_id,
            expira_em_atual: carga.expira_em.to_rfc3339(),
            seed: carga.seed,
            parceiro: carga.parceiro,
            em: agora.to_rfc3339(),
        })
    }

    /// O nonce.
    ///
    /// 🔴 Sai do **sistema operativo**, e não de um contador nem do relógio: a
    /// propriedade que importa é ser diferente de todos os outros pedidos, e um
    /// id derivado do tempo repete-se assim que dois pedidos saem no mesmo
    /// tique. Não é segredo — quem tem de assinar é o parceiro — mas tem de ser
    /// único, e "único" é mais fácil de pedir ao SO do que de argumentar.
    pub fn para_json(&self) -> Value {
        serde_json::to_value(self).unwrap_or(Value::Null)
    }

    /// Relê um pedido do disco — o que é a **memória de qual pedido está vivo**.
    pub fn de_json(valor: &Value) -> Option<Self> {
        serde_json::from_value(valor.clone()).ok()
    }
}

// ===========================================================================
// A resposta
// ===========================================================================

/// O que a máquina fez com a resposta.
#[derive(Debug, Clone, PartialEq)]
pub enum Desfecho {
    /// Quem emitiu renovou. `licenca` é a licença **de dentro** do envelope,
    /// já conferida pela cadeia inteira — e é ela que se grava, nunca o
    /// ficheiro recebido.
    Renovada {
        licenca: Value,
        licenca_id: String,
        expira_em: DateTime<Utc>,
    },
    /// Quem emitiu **recusou**, e disse porquê. Nada é gravado, e a recusa é
    /// uma resposta — não um erro. O técnico precisa do motivo, não de um
    /// código de erro que não diz de quem foi a recusa.
    Recusada { motivo: String },
}

/// O que a conferência precisa. Tudo o que é **externo** entra por aqui: o
/// relógio, a raiz, e o pedido pendente. É a mesma disciplina do `Pedido` do
/// verificador — uma prova que depende do relógio de quem a corre fica
/// vermelha sozinha quando o fixture vence, e o vermelho aponta para o produto.
pub struct Contexto<'a> {
    pub raiz: &'a ChavePublica,
    pub chave_oem: &'a Value,
    /// O pedido pendente **nesta máquina**. `None` = não há pedido vivo, e
    /// nenhuma resposta vale.
    pub pedido: Option<&'a PedidoRenovacao>,
    /// A licença que está no disco agora. Serve para o **não-encurta**: é a
    /// única coisa contra a qual reaplicar uma resposta antiga é um downgrade.
    pub licenca_atual: Option<&'a Value>,
    pub fingerprint: &'a str,
    pub agora: DateTime<Utc>,
    /// O último instante em que esta licença foi vista válida.
    pub ultimo_visto: Option<DateTime<Utc>>,
}

/// Confere uma resposta de renovação e diz o que fazer.
///
/// A ordem das conferências **é** a defesa: cada uma recusa antes de a
/// seguinte poder ser usada para enganar. A assinatura vem cedo (é a que
/// valida que o resto do documento é do parceiro), o nonce vem antes da
/// janela (uma resposta velha é velha seja qual for a janela), e a licença de
/// dentro vem no fim, quando já se sabe que a resposta é para esta máquina e
/// para este pedido.
pub fn conferir_resposta(resposta: &Value, ctx: &Contexto<'_>) -> Result<Desfecho, ErroLicenca> {
    // 1. O formato. Sem isto, um JSON qualquer entra na máquina.
    if resposta.get("aegis").and_then(Value::as_str) != Some(FORMATO)
        || resposta.get("tipo").and_then(Value::as_str) != Some(TIPO_RESPOSTA)
    {
        return Err(ErroLicenca::de(Motivo::Formato, TIPO_RESPOSTA));
    }
    if ctx.raiz.como_texto().trim().is_empty() {
        return Err(ErroLicenca::de(Motivo::SemRaiz, ""));
    }

    // 2. A Chave OEM, e é ela que diz **quem** pode assinar uma renovação
    //    desta máquina. Uma renovação só existe no mundo de um parceiro.
    //
    // 🔴 É a MESMA função que o gate de instalação chama, e não uma cópia. A
    // regra da Chave OEM já tem uma regra, e a sua docstring avisa
    // precisamente desta divisão. Duas cópias divergem no primeiro caso de
    // borda — e o caso de borda daqui é a renovação.
    let carga_oem = conferir_chave_oem(ctx.chave_oem, ctx.raiz).map_err(|e| {
        // Falta a Chave OEM é um gesto diferente de uma Chave OEM que não
        // confere: uma instala-se, a outra é um contacto com a Safe Core.
        if e.codigo() == "licenca.formato" {
            ErroLicenca::de(
                Motivo::SemChaveOem,
                "a renovação só se confere com a Chave OEM do parceiro",
            )
        } else {
            e
        }
    })?;
    debug_assert_eq!(
        ctx.chave_oem.get("tipo").and_then(Value::as_str),
        Some(TIPO_OEM)
    );

    // 3. 🔴 A chave esperada é a do **parceiro** da Chave OEM — nunca
    //    `assinatura.por`. Deixar o documento dizer quem o assinou é aceitar
    //    uma resposta que qualquer um forja trocando esse campo pela sua chave.
    let por = resposta
        .get("assinatura")
        .and_then(|a| a.get("por"))
        .and_then(Value::as_str)
        .unwrap_or("");
    if por != carga_oem.pub_parceiro {
        return Err(ErroLicenca::de(
            Motivo::AssinaturaParceiro,
            &carga_oem.parceiro,
        ));
    }
    let chave_parceiro = ChavePublica::nova(&carga_oem.pub_parceiro)
        .map_err(|e| ErroLicenca::de(Motivo::AssinaturaParceiro, e.0))?;
    if !crate::verificador::assinatura_confere(resposta, &chave_parceiro) {
        return Err(ErroLicenca::de(
            Motivo::Assinatura,
            carga_oem.parceiro.as_str(),
        ));
    }

    // Daqui para baixo o documento é do parceiro, e por isso é em que se pode
    // ler o que ele afirma.
    let payload = resposta
        .get("payload")
        .ok_or_else(|| ErroLicenca::de(Motivo::Formato, "payload"))?;

    // 4. A decisão, em **vocabulário fechado**. Um campo de texto livre aqui
    //    seria um ramo que ninguém escreveu e que ninguém testou.
    let decisao = payload.get("decisao").and_then(Value::as_str).unwrap_or("");
    if !DECISOES.contains(&decisao) {
        return Err(ErroLicenca::de(Motivo::DecisaoFora, decisao));
    }

    // 5. O node-lock do **envelope**. O envelope tem fingerprint próprio de
    //    propósito: é o que permite recusar uma resposta de outra máquina
    //    ANTES de olhar a licença de dentro.
    let local = normalizado(ctx.fingerprint)?;
    let do_envelope = normalizado(
        payload
            .get("fingerprint")
            .and_then(Value::as_str)
            .unwrap_or(""),
    )?;
    if do_envelope != local {
        return Err(ErroLicenca::de(Motivo::Fingerprint, ctx.fingerprint));
    }

    // 6. 🔴 O NONCE. Sem pedido pendente não se aplica nada — e é esta
    //    comparação que faz uma resposta velha parar de valer no instante em
    //    que o técnico tira um pedido novo.
    let pedido = ctx
        .pedido
        .filter(|p| !p.pedido_id.trim().is_empty())
        .ok_or_else(|| {
            ErroLicenca::de(
                Motivo::SemPedido,
                "não há pedido de renovação pendente nesta máquina",
            )
        })?;
    let do_pedido = payload
        .get("pedido_id")
        .and_then(Value::as_str)
        .unwrap_or("");
    if do_pedido != pedido.pedido_id {
        return Err(ErroLicenca::de(Motivo::PedidoOutro, do_pedido));
    }

    // 7. A janela da **própria resposta**. Vencida, ela não revive.
    let valida_ate = data_de(payload.get("valida_ate"))?;
    if ctx.agora > valida_ate {
        return Err(ErroLicenca::de(
            Motivo::RespostaVencida,
            &valida_ate.to_rfc3339(),
        ));
    }

    // ---- negar: nada é gravado, e o motivo volta em palavras ---------------
    if decisao == "negar" {
        let motivo = payload
            .get("motivo")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        // 🔴 Recusa sem motivo não é resposta: o técnico fica com um ficheiro
        // que não instala e nada a fazer. O emissor recusa isso na montagem;
        // aqui é a segunda barreira.
        if motivo.is_empty() {
            return Err(ErroLicenca::de(
                Motivo::SemMotivo,
                "a resposta recusa a renovação e não diz porquê",
            ));
        }
        return Ok(Desfecho::Recusada { motivo });
    }

    // ---- renovar: a licença de dentro passa pela cadeia INTEIRA -------------
    let licenca = payload
        .get("licenca")
        .filter(|v| v.is_object())
        .ok_or_else(|| {
            ErroLicenca::de(
                Motivo::SemLicencaNaResposta,
                "a resposta diz `renovar` e não traz licença nenhuma dentro",
            )
        })?;

    // 🔴 A identidade primeiro, e é o PEDIDO que a ancora: o `licenca_id` da
    // licença que veio dentro tem de ser o do pedido pendente. Sem esta
    // checagem, uma resposta legítima de **outra** licença do mesmo parceiro
    // — mesma seed, mesmo fingerprint; dois documentos que existem de verdade —
    // trocaria o documento desta caixa por um que não é dela, e o ledger
    // passaria a contar outra instalação.
    let id_nova = Carga::de(licenca)
        .and_then(|c| c.licenca_id.clone())
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| {
            ErroLicenca::de(
                Motivo::LicencaOutra,
                "a licença de dentro da resposta não tem `licenca_id`",
            )
        })?;
    if id_nova != pedido.licenca_id {
        return Err(ErroLicenca::de(Motivo::LicencaOutra, &id_nova));
    }
    // E a mesma pergunta contra o documento que está no disco: se ele existe
    // e é de outra licença, aplicar isto apagaria a licença que a ilha usa.
    if let Some(atual) = ctx.licenca_atual
        && let Some(c) = Carga::de(atual)
        && let Some(id_atual) = c.licenca_id.clone()
        && !id_atual.trim().is_empty()
        && id_atual != id_nova
    {
        return Err(ErroLicenca::de(Motivo::LicencaOutra, &id_atual));
    }

    // 🔴 A cadeia INTEIRA, pelo **mesmo** `verificar` do gate de instalação.
    // Não existe versão rápida: um emissor com defeito que assinasse um
    // envelope legítimo com a licença de outra caixa dentro é descoberto aqui.
    // Note-se que **não** se passa `seed`: o vertical desta máquina não é o
    // assunto da pergunta, e a cobertura do produto é a da Chave OEM.
    let veredito = verificar(
        licenca,
        &Pedido {
            raiz: ctx.raiz,
            chave_oem: Some(ctx.chave_oem),
            fingerprint: Some(&local),
            seed: None,
            agora: ctx.agora,
            ultimo_visto: ctx.ultimo_visto,
        },
    )?;

    // 🔴 Renovação NÃO é downgrade. Se a licença que veio dentro vence ANTES da
    // que já está na máquina, aplicar isto seria trocar uma licença boa por uma
    // pior — e o único gesto que faz isso é responder **duas vezes** ao mesmo
    // pedido, dentro da janela de 72 h dele.
    //
    // ⚠️ Esta conferência vem **depois** da cadeia, e por isso uma licença que
    // encurta *e já venceu* sai por `licenca.expirada`. Foi medido: foi o que
    // o primeiro fixture desta prova fez, com um prazo de uma hora. E é a
    // ordem certa — "a licença venceu" com o gesto "renovar" manda o técnico
    // tirar um pedido novo, e o que vier desse pedido é do emissor e não
    // encurta nada. A amarra do não-encurta é para o caso em que a licença nova
    // ainda está no futuro e mesmo assim é pior do que a que está aqui.
    if let Some(atual) = ctx.licenca_atual
        && let Some(expira_hoje) = Carga::de(atual).map(|c| c.expira_em)
        && veredito.expira_em < expira_hoje
    {
        return Err(ErroLicenca::de(
            Motivo::Encurta,
            &format!(
                "a nova vence em {} e a instalada vale até {}",
                veredito.expira_em.to_rfc3339(),
                expira_hoje.to_rfc3339()
            ),
        ));
    }

    Ok(Desfecho::Renovada {
        licenca: licenca.clone(),
        licenca_id: id_nova,
        expira_em: veredito.expira_em,
    })
}

/// 🔴 A licença de dentro do envelope é a que se grava — e escreve-se em
/// **canónico**, que é a forma que as três implementações do verificador
/// reproduzem. O `to_string_pretty` seria mais bonito de ler e dependente de a
/// ordem das chaves sobreviver à ida e à volta, que é exactamente o que o
/// canónico existe para não depender.
pub fn para_recebido(licenca: &Value) -> String {
    format!("{}\n", crate::canonico::canonico(licenca))
}

// ===========================================================================
// Auxiliares
// ===========================================================================

fn normalizado(s: &str) -> Result<String, ErroLicenca> {
    crate::verificador::normalizar_fingerprint(s)
}

fn data_de(valor: Option<&Value>) -> Result<DateTime<Utc>, ErroLicenca> {
    let texto = valor
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    DateTime::parse_from_rfc3339(&texto)
        .map(|d| d.with_timezone(&Utc))
        .map_err(|_| {
            ErroLicenca::de(
                Motivo::Formato,
                &format!("a resposta não diz uma data legível: {texto:?}"),
            )
        })
}

/// O nonce, em forma de UUID — 16 bytes do sistema operativo.
///
/// 🔴 A **forma** é o que importa para quem lê: `aegis-cli` trata o
/// `pedido_id` como identificador, e um número decimal seria aceite do mesmo
/// jeito — mas a forma é o que impede alguém de confundir um `pedido_id` com
/// outro campo que também é um identificador.
pub fn nonce() -> String {
    let mut b = [0u8; 16];
    // Uma falha do SO **não** pode devolver um nonce previsível: sem
    // aleatoriedade o nonce deixa de ser único, e um nonce repetido é um nonce
    // que amarra a nada. O fallback abaixo é pior, e existe só para o
    // ficheiro não depender do SO: em Windows e em Linux o `getrandom` está
    // sempre disponível, e o que o fallback garante é que uma máquina sem ele
    // não fica sem renovação.
    if getrandom::fill(&mut b).is_err() {
        let agora = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0);
        b[..8].copy_from_slice(&agora.to_le_bytes());
        b[8..].copy_from_slice(&(std::process::id() as u64).to_le_bytes());
    }
    // A versão 4 e a variante, como o `Guid.NewGuid()` do C# — o emissor não
    // valida, mas a forma é um contrato de leitura.
    b[6] = (b[6] & 0x0F) | 0x40;
    b[8] = (b[8] & 0x3F) | 0x80;
    let h = hex::encode(b);
    format!(
        "{}-{}-{}-{}-{}",
        &h[0..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..32]
    )
}
