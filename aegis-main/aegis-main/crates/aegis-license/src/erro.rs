//! Erros de licença. Vocabulário **fechado**.
//!
//! 🔴 A regra dos motivos é da casa e não é negociável: *"cada recusa tem
//! NOME (`motivo`) além da frase: o chamador decide o que mostrar, e um
//! teste consegue afirmar o motivo sem casar texto de mensagem"*. A frase
//! pode ser reescrita amanhã; o motivo não.

/// Os motivos. **Um por resposta diferente**, e não um por frase: dois motivos
/// que dizem a mesma coisa são dois motivos que divergem.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Motivo {
    /// Não é um documento AEGIS.
    Formato,
    /// A assinatura da Chave OEM não confere com a raiz.
    AssinaturaOem,
    /// A Chave OEM não declara nenhum vertical.
    SemSeeds,
    /// Falta a raiz do vendor: sem ela não há cadeia.
    SemRaiz,
    /// Licença de instância sem a Chave OEM do parceiro.
    SemChaveOem,
    /// A licença não foi assinada pela chave do parceiro da Chave OEM.
    AssinaturaParceiro,
    /// A assinatura não confere com a chave esperada.
    Assinatura,
    /// A licença é de um parceiro e a Chave OEM é de outro.
    Parceiro,
    /// O vertical não está na cota desta Chave OEM.
    Seed,
    /// A licença vence depois da Chave OEM que a originou.
    Prazo,
    /// A licença é de outra máquina.
    Fingerprint,
    /// A licença é de outro vertical do que o que se quer instalar.
    SeedUso,
    /// A licença venceu, grace esgotado.
    Expirada,
    /// Não foi apresentada licença nenhuma.
    SemLicenca,

    // ---- renovação -------------------------------------------------------
    //
    // 🔴 Estes motivos existem porque a renovação é um pedido/response
    // **offline**, e cada amarra recusa por um motivo diferente. Um motivo
    // único para as seis seria seis respostas iguais com uma frase que
    // ninguém sabe reescrever.
    /// A renovação não responde a nenhum pedido vivo nesta máquina.
    SemPedido,
    /// A renovação responde a um pedido que não é o pendente.
    PedidoOutro,
    /// A janela da própria resposta fechou.
    RespostaVencida,
    /// A decisão não é `renovar` nem `negar`.
    DecisaoFora,
    /// Quem emitiu recusou, e não disse porquê.
    SemMotivo,
    /// A decisão é `renovar` e não vem licença nenhuma dentro.
    SemLicencaNaResposta,
    /// A licença de dentro é de outra licença.
    LicencaOutra,
    /// A licença nova vence antes da que já está na máquina.
    Encurta,
}

impl Motivo {
    /// **Todos** os motivos, para a referência do produto.
    ///
    /// 🔴 Esta lista é escrita à mão e o compilador **não** a liga ao enum —
    /// um motivo novo entra no `match` e fica de fora daqui, e a referência
    /// passa a estar errada sem ninguém dar por isso. É a fraqueza conhecida
    /// desta peça, e a cura é a guarda ao lado: ela mede o que a lista tem
    /// (códigos únicos, frases com conteúdo) e a ausência fica a ser
    /// apanhada quando alguém abre a referência à procura de um motivo que
    /// não lá está — que é quando a referência era para estar certa.
    ///
    /// A alternativa — enumerar o enum a partir de si mesmo — não existe em
    /// Rust sem uma lista, e a lista é sempre a mesma lista.
    pub fn todos() -> Vec<Motivo> {
        use Motivo::*;
        vec![
            Formato,
            AssinaturaOem,
            SemSeeds,
            SemRaiz,
            SemChaveOem,
            AssinaturaParceiro,
            Assinatura,
            Parceiro,
            Seed,
            Prazo,
            Fingerprint,
            SeedUso,
            Expirada,
            SemLicenca,
            SemPedido,
            PedidoOutro,
            RespostaVencida,
            DecisaoFora,
            SemMotivo,
            SemLicencaNaResposta,
            LicencaOutra,
            Encurta,
        ]
    }

    pub fn codigo(&self) -> &'static str {
        match self {
            Self::Formato => "licenca.formato",
            Self::AssinaturaOem => "licenca.assinatura-oem",
            Self::SemSeeds => "licenca.sem-seeds",
            Self::SemRaiz => "licenca.sem-raiz",
            Self::SemChaveOem => "licenca.sem-chave-oem",
            Self::AssinaturaParceiro => "licenca.assinatura-parceiro",
            Self::Assinatura => "licenca.assinatura",
            Self::Parceiro => "licenca.parceiro",
            Self::Seed => "licenca.seed",
            Self::Prazo => "licenca.prazo",
            Self::Fingerprint => "licenca.fingerprint",
            Self::SeedUso => "licenca.seed-uso",
            Self::Expirada => "licenca.expirada",
            Self::SemLicenca => "licenca.ausente",
            Self::SemPedido => "renovacao.sem-pedido",
            Self::PedidoOutro => "renovacao.pedido-outro",
            Self::RespostaVencida => "renovacao.resposta-vencida",
            Self::DecisaoFora => "renovacao.decisao-fora",
            Self::SemMotivo => "renovacao.sem-motivo",
            Self::SemLicencaNaResposta => "renovacao.sem-licenca",
            Self::LicencaOutra => "renovacao.licenca-outra",
            Self::Encurta => "renovacao.encurta",
        }
    }

    /// O que a tela diz. **Montada aqui**, por quem tem o dado.
    pub fn humano(&self) -> &'static str {
        match self {
            Self::Formato => "Este ficheiro não é uma licença AEGIS.",
            Self::AssinaturaOem => "A chave do parceiro não foi assinada pela Safe Core.",
            Self::SemSeeds => "Esta chave do parceiro não declara nenhum produto.",
            Self::SemRaiz => "Não há como confirmar a licença sem a chave da Safe Core.",
            Self::SemChaveOem => "A licença precisa da chave do parceiro que a autorizou.",
            Self::AssinaturaParceiro => "A licença não foi assinada por esta chave do parceiro.",
            Self::Assinatura => "A assinatura da licença não confere.",
            Self::Parceiro => "Esta licença é de outro parceiro.",
            Self::Seed => "Esta chave do parceiro não cobre este produto.",
            Self::Prazo => "A licença vai além do prazo da chave que a autorizou.",
            Self::Fingerprint => "Esta licença é de outra máquina.",
            Self::SeedUso => "Esta licença é de outro produto.",
            Self::Expirada => "A licença venceu.",
            Self::SemLicenca => "Não foi apresentada licença para este produto.",
            Self::SemPedido => "Não há pedido de renovação pendente nesta máquina.",
            Self::PedidoOutro => "Esta renovação responde a outro pedido.",
            Self::RespostaVencida => "Esta resposta de renovação já não está no prazo.",
            Self::DecisaoFora => {
                "A resposta de renovação diz uma coisa que não é renovar nem recusar."
            }
            Self::SemMotivo => "A renovação foi recusada sem dizer porquê.",
            Self::SemLicencaNaResposta => {
                "A resposta diz que renova, mas não traz licença nenhuma."
            }
            Self::LicencaOutra => "Esta renovação é de outra licença, não desta máquina.",
            Self::Encurta => "Esta renovação encurta a licença, e renovação não é downgrade.",
        }
    }

    /// O que o operador pode fazer. **Ação**, não diagnóstico.
    pub fn gesto(&self) -> &'static str {
        match self {
            Self::Formato | Self::SemSeeds => "Pedir um ficheiro novo ao parceiro",
            Self::AssinaturaOem | Self::Assinatura | Self::AssinaturaParceiro => {
                "Contactar a Safe Core"
            }
            Self::SemRaiz | Self::SemChaveOem => "Verificar a instalação da licença",
            Self::Parceiro | Self::Seed | Self::SeedUso | Self::Fingerprint | Self::Prazo => {
                "Pedir ao parceiro uma licença para este produto e esta máquina"
            }
            Self::Expirada => "Renovar a licença",
            Self::SemLicenca => "Pedir licença ao parceiro",
            // 🔴 Todos os motivos de renovação respondem com o **mesmo** gesto,
            // e é o certo: a máquina não pode destravar sozinha nenhuma das
            // amarras, e o que o técnico pode fazer é o mesmo em todas — tirar
            // um pedido novo. Um gesto por motivo seria uma tela com seis
            // botões que fazem a mesma coisa.
            Self::SemPedido
            | Self::PedidoOutro
            | Self::RespostaVencida
            | Self::DecisaoFora
            | Self::SemMotivo
            | Self::SemLicencaNaResposta
            | Self::LicencaOutra
            | Self::Encurta => "Tirar um pedido de renovação novo e enviá-lo a quem emite",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ErroLicenca {
    pub motivo: Motivo,
    /// O dado que flashou a recusa — para o log, nunca para a tela.
    pub detalhe: String,
}

impl ErroLicenca {
    /// A recusa mais importante de todas: **não há ficheiro nenhum**.
    ///
    /// Sem isto, "não passei o ficheiro" era o caminho mais curto para instalar
    /// o produto sem contrato — e não exigia forjar nada, o que é o que torna
    /// o buraco tão fácil de deixar aberto e tão difícil de notar.
    pub fn sem_licenca(vertical: &str) -> Self {
        Self::de(Motivo::SemLicenca, vertical)
    }

    pub fn de(motivo: Motivo, detalhe: &str) -> Self {
        Self {
            motivo,
            detalhe: detalhe.to_string(),
        }
    }

    pub fn codigo(&self) -> &'static str {
        self.motivo.codigo()
    }

    pub fn humano(&self) -> &'static str {
        self.motivo.humano()
    }

    pub fn gesto(&self) -> &'static str {
        self.motivo.gesto()
    }
}

impl std::fmt::Display for ErroLicenca {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.codigo(), self.humano())
    }
}

impl std::error::Error for ErroLicenca {}
