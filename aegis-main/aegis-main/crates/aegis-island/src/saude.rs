//! `/health` e `/health/ready` — e a diferença entre eles, que é a coisa mais
//! importante desta camada.
//!
//! 🔴 **`/health` responde `200` quando o processo acorda. Não prova que o
//! produto está pronto.** Foi medido no núcleo anterior: a ilha subia, o
//! `/health` devolvia `200`, o painel abria, e o tenant operacional estava
//! **inativo** — o primeiro acesso não funcionava e nada estava em vermelho.
//!
//! O `/health/ready` é o gate oficial e exige, todos verdadeiros:
//!
//! 1. o banco responde;
//! 2. o **tenant existe e está ativo**;
//! 3. o **marcador do seed** bate com a versão que o manifesto pede.
//!
//! Um `gate` de update que aprova com o `/health` é um gate que nunca
//! reprovou.

use serde::Serialize;

use crate::estado::{Ilha, Veredito};
use crate::saude_exec::{Checagem, Estado};

/// Por que a ilha não está pronta. Vocabulário **fechado**: a tela traduz por
/// este e nunca por texto.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Motivo {
    /// O banco não respondeu.
    BancoFora,
    /// O vertical foi declarado, mas o tenant não existe no banco.
    TenantInexistente,
    /// O tenant existe mas está inativo.
    TenantInativo,
    /// O seed do banco está atrás ou à frente do que o manifesto pede.
    SeedDesatualizado,
    /// Uma checagem que o vertical declara como exigida **não passou**.
    SaudeExigidaFALHOU,
    /// A checagem exigida não pôde correr — e "não pude conferir" não é
    /// "está bem". Nunca sai verde.
    SaudeInconclusiva,
    /// As checagens nunca foram correres nesta ilha.
    SaudeNaoConferida,
}

impl Motivo {
    /// **Todos** os motivos, para a referência do produto.
    ///
    /// 🔴 Lista escrita à mão e sem ligação ao enum — a mesma fraqueza e as
    /// mesmas consequências de [`aegis_license::Motivo::todos`].
    pub fn todos() -> Vec<Motivo> {
        use Motivo::*;
        vec![
            BancoFora,
            TenantInexistente,
            TenantInativo,
            SeedDesatualizado,
            SaudeExigidaFALHOU,
            SaudeInconclusiva,
            SaudeNaoConferida,
        ]
    }

    pub fn codigo(&self) -> &'static str {
        match self {
            Self::BancoFora => "pronto.banco-fora",
            Self::TenantInexistente => "pronto.tenant-inexistente",
            Self::TenantInativo => "pronto.tenant-inativo",
            Self::SeedDesatualizado => "pronto.seed-desatualizado",
            Self::SaudeExigidaFALHOU => "pronto.saude-falhou",
            Self::SaudeInconclusiva => "pronto.saude-inconclusiva",
            Self::SaudeNaoConferida => "pronto.saude-nao-conferida",
        }
    }

    /// O que a tela mostra. **Montada aqui**, por quem tem o dado — quem
    /// traduz nunca casa texto.
    pub fn humano(&self) -> &'static str {
        match self {
            Self::BancoFora => "O banco de dados não está respondendo.",
            Self::TenantInexistente => "Esta ilha ainda não tem o tenant do produto.",
            Self::TenantInativo => "O tenant desta ilha está desativado.",
            Self::SeedDesatualizado => "O conteúdo declarado pelo vertical ainda não foi aplicado.",
            Self::SaudeExigidaFALHOU => "Uma verificação do produto não passou.",
            Self::SaudeInconclusiva => "Não deu para verificar o produto.",
            Self::SaudeNaoConferida => "O produto ainda não foi verificado nesta ilha.",
        }
    }

    /// O que o operador pode fazer — a ação, não o diagnóstico.
    pub fn gesto(&self) -> &'static str {
        match self {
            Self::BancoFora => "Verificar o serviço de banco",
            Self::TenantInexistente => "Aplicar o vertical",
            Self::TenantInativo => "Ativar o tenant",
            Self::SeedDesatualizado => "Aplicar o vertical",
            Self::SaudeExigidaFALHOU => "Ver a verificação que falhou",
            Self::SaudeInconclusiva => "Conferir o que impediu a verificação",
            Self::SaudeNaoConferida => "Verificar o produto",
        }
    }
}

/// 🔴 `Deserialize` **também**, e não só `Serialize`, e a razão é o cliente.
///
/// Esta peça era só de escrita porque só a ilha a produzia. Quando o `mcp`
// ganhou um cliente HTTP, o `diagnostico` passou a precisar de **ler** esta
/// mesma forma — e a primeira versão lia o `serde_json::Value` campo a campo,
/// que é a segunda tradução: um campo renomeado aqui continua a compilar e a
/// devolver `null` para o agente, e o sintoma é uma linha de conferência que
/// diz *"não deu para conferir"* num produto que está bem.
///
/// `serde(default)` em cada campo é o que torna isto tolerante a uma ilha
/// mais velha: um campo que a ilha não manda vale o que o `Default` diz, e a
/// linha fica `NaoConferido` — **nunca** verde por omissão.
impl Prontidao {
    /// 🔴 Lê a Prontidão do **corpo cru** da ilha, e devolve `None` — em vez de
    /// um erro — quando esse corpo não é uma Prontidão.
    ///
    /// `None` e não `Err` porque quem chama precisa de distinguir duas coisas
    /// que um `serde_json::from_value` trata igual: um corpo que **não é**
    /// Prontidão (outro produto, um proxy, uma ilha de outra versão) e uma
    /// Prontidão com campos em falta. A segunda tem de ser aceite — o
    /// `serde(default)` de cada campo transforma o que falta em
    /// *não conferido*; a primeira tem de ser recusada, porque fingir que
    /// sabemos o que uma ilha disse é pior do que dizer que não sabemos.
    pub fn de_json(valor: &serde_json::Value) -> Option<Prontidao> {
        // 🔴 A **presença da chave** é o critério, e não um campo em
        // particular: `pronto` é o único que toda a Prontidão tem, e o que o
        // `serde(default)` transformaria em `false` — que é uma leitura
        // errada e silenciosa.
        if !valor.get("pronto").is_some_and(|p| p.is_boolean()) {
            return None;
        }
        serde_json::from_value(valor.clone()).ok()
    }
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
pub struct Prontidao {
    /// O gate. `true` só quando tudo abaixo está `true`.
    #[serde(default)]
    pub pronto: bool,
    #[serde(default)]
    pub banco: bool,
    #[serde(default)]
    pub tenant_ativo: bool,
    /// A versão que o vertical pede.
    #[serde(default)]
    pub seed_esperado: i32,
    /// A versão que está no banco.
    #[serde(default)]
    pub seed_no_banco: i32,
    /// As checagens **exigidas**, e o estado delas.
    #[serde(default)]
    pub saude: Vec<Checagem>,
    /// As **opcionais**. Não travam a ilha — e aparecem. Uma opcional que
    /// ninguém vê é uma capacidade que morre sem ninguém decidir.
    #[serde(default)]
    pub saude_opcional: Vec<Checagem>,
    /// 🔴 Quantos segundos tinha o veredicto quando esta resposta foi feita.
    /// Um veredicto de há uma hora é declarado velho — e não repetido como se
    /// fosse de agora, que é a forma honesta de não mentir com a idade.
    #[serde(default)]
    pub saude_ha: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub motivo: Option<Motivo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    /// 🔴 Uma `String`, e nao `&'static str`: a frase de "uma
    /// verificacao nao passou" diz **qual** a verificacao, e o nome dela so
    /// se sabe em tempo de execucao. A frase fixa era mais simples e nao
    /// dizia nada.
    pub o_que_dizer: Option<String>,
    /// 🔴 `&'static str`, e por isso este campo **sai mas não entra**:
    /// `Deserialize` não sabe ler um `&'static str` com vida longa.
    ///
    /// 🔴 E está escrito assim **de propósito**, porque quem precisa da frase
    /// "o que fazer" já a tem noutro sítio: a recusa que o agente recebe é
    /// montada pelo **cliente** a partir do corpo cru, e essa [`Recusa`] tem a
    /// frase em `String`. Um `Option<String>` aqui obrigaria a ilha a
    /// construir `String` para algo que é constante, e a ter **duas**
    /// representações do mesmo texto — que é como as traduções divergem.
    #[serde(default, skip_serializing_if = "Option::is_none", skip_deserializing)]
    pub o_que_fazer: Option<&'static str>,
}

/// `/health` — o processo responde. E só.
#[derive(Debug, Serialize)]
pub struct Vida {
    pub vivo: bool,
}

fn montar(
    motivo: Option<Motivo>,
    esperado: i32,
    banco: bool,
    tenant_ativo: bool,
    seed_no_banco: i32,
    veredito: Option<&Veredito>,
    saude_ha: Option<u64>,
) -> Prontidao {
    Prontidao {
        pronto: motivo.is_none(),
        banco,
        tenant_ativo,
        seed_esperado: esperado,
        seed_no_banco,
        saude: veredito.map(|v| v.todas.clone()).unwrap_or_default(),
        saude_opcional: veredito.map(|v| v.opcionais.clone()).unwrap_or_default(),
        saude_ha,
        motivo,
        // 🔴 A frase diz **qual** verificação, e diz o que ela respondeu. A
        // versão anterior devolvia a frase fixa e o gesto *"ver a verificação
        // que falhou"* — a mesma classe do *"Renovar a licença"* a apontar
        // para um gesto que não existia: o operador é mandado procurar uma
        // coisa que não lhe dizem onde está.
        //
        // E sai do **veredicto**, que já é argumento. Passá-la à parte dava
        // uma oitava posição a `montar` e abria a porta de a frase não bater
        // com a medição — que é o que nenhum código de recusa pode permitir.
        o_que_dizer: Some(match (motivo, falhou_de(veredito)) {
            (Some(Motivo::SaudeExigidaFALHOU), Some(nome)) => {
                format!("A verificação exigida {nome}")
            }
            (Some(Motivo::SaudeInconclusiva), Some(nome)) => {
                format!("Não deu para conferir a verificação exigida {nome}")
            }
            (Some(m), _) => m.humano().to_string(),
            (None, _) => String::new(),
        }),
        o_que_fazer: motivo.map(|m| m.gesto()),
    }
}

/// O nome da verificação que reprovou, com o que ela respondeu.
///
/// 🔴 Deriva do veredicto, e não chega como argumento. Um `motivo` e um nome
/// de checagem transmitidos separadamente podem discordar um do outro, e a
/// discordância sai como uma recusa que aponta para a verificação errada.
fn falhou_de(veredito: Option<&Veredito>) -> Option<String> {
    let c = veredito?.falha.as_ref()?;
    let nome = c.nome.trim_start_matches('@');
    Some(match c.detalhe.as_deref() {
        // A frase é a **primeira** coisa que o operador lê, e o detalhe pode
        // ser um parágrafo. Juntá-lo com um travessão punha a causa no meio e
        // a conclusão no fim. São duas frases, e a segunda é a que explica.
        Some(d) if !d.trim().is_empty() => format!(
            "{nome}.
  {}",
            d.trim()
        ),
        _ => nome.to_string(),
    })
}

/// Mede a prontidão. **Esta** é a função que um gate de update tem de
/// chamar, e nunca o `/health`.
///
/// 🔴 Não corre as checagens do vertical: **publica o veredicto** que o boot
/// deixou. Correr scripts a cada pedido de health torna a resposta cara e,
/// pior, faz o gate oscilar entre duas chamadas — e um gate que oscila
/// treina a pessoa a ignorar o vermelho.
pub async fn medir(ilha: &Ilha) -> Prontidao {
    let esperado = ilha.contrato().manifesto().versao_do_seed() as i32;

    let Some(veredito) = ilha.veredito() else {
        return montar(
            Some(Motivo::SaudeNaoConferida),
            esperado,
            true,
            true,
            -1,
            None,
            None,
        );
    };
    let idade = veredito.em.elapsed().as_secs();

    if !aegis_store::vivo(ilha.repo().pool()).await {
        return montar(
            Some(Motivo::BancoFora),
            esperado,
            false,
            false,
            -1,
            Some(&veredito),
            Some(idade),
        );
    }

    // 🔴 O tenant que a ilha **declara** — e é aqui que a ambiguidade morava
    // no núcleo anterior: `/login` é anônimo e resolve o tenant por
    // `?tenant=` → default → principal → operacional → "existe um só". Uma
    // ilha com o tenant default **mais** o do cliente caía no degrau errado e
    // mostrava a marca errada. Aqui a ilha tem **um** tenant, e ele é o do
    // vertical.
    let Some(tenant) = ilha.tenant_padrao().await.unwrap_or(None) else {
        return montar(
            Some(Motivo::TenantInexistente),
            esperado,
            true,
            false,
            -1,
            Some(&veredito),
            Some(idade),
        );
    };

    let seed_no_banco = ilha.repo().seed_de(&tenant.id).await.unwrap_or(-1);

    let (motivo, ativo) = if !tenant.ativo {
        (Some(Motivo::TenantInativo), false)
    } else if seed_no_banco != esperado {
        (Some(Motivo::SeedDesatualizado), false)
    } else {
        (None, true)
    };

    // A saúde vem **depois** do seed: se o seed não entrou, a checagem vai
    // reprovar por uma razão que o seed já disse, e o operador perde o
    // motivo certo. A ordem das perguntas é a ordem do que se conserta.
    // 🔴 O **detalhe** da verificação vai na frase. A checagem já o produz —
    // "a RLS não está a isolar, ou quem lê tem BYPASSRLS" — e ele é a
    // diferença entre "uma verificação não passou" e saber o que fazer. Sem
    // ele o operador tem de ir ao banco, e o banco é o lugar onde ele não
    // vai buscar a resposta.
    let (motivo, ativo) = match veredito.falha.as_ref().map(|c| c.estado) {
        Some(Estado::Falhou) if motivo.is_none() => (Some(Motivo::SaudeExigidaFALHOU), false),
        Some(_) if motivo.is_none() => (Some(Motivo::SaudeInconclusiva), false),
        _ => (motivo, ativo),
    };

    montar(
        motivo,
        esperado,
        true,
        ativo,
        seed_no_banco,
        Some(&veredito),
        Some(idade),
    )
}
