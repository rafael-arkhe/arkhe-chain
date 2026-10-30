//! O pseudónimo de uma ilha.
//!
//! 🔴 Esta é a regra **mais duplicada da casa**: `aegis-cli/src/pseudonimo.js`,
//! `frota-app/painel/lib/pseudonimo.ts`, `frota-app/api/app/routers_frota.py` e a
//! recusa no C# da Bridge. Quatro implementações, três linguagens, e o
//! `CLAUDE.md` a chamar uma delas de "fonte canónica" sem nada ligar as
//! outras. Aqui é **uma**.
//!
//! # A regra
//!
//! 1. O valor é `adjetivo-substantivo-hex4` — por exemplo `sereno-falcao-a1b2`.
//! 2. 🔴 **O mesmo valor vale para o NOME e para o DOMÍNIO.** A ilha
//!    `sereno-falcao-a1b2` responde em `sereno-falcao-a1b2.safecore.space`.
//!    São uma coisa só com duas governance, e não dois identificadores que
//!    podem divergir.
//! 3. 🔴 **Valor que ecoa o cliente ou o vertical é RECUSADO.** Um pseudónimo
//!    que diz "condominio-alfândega" não é pseudónimo: é o nome do cliente
//!    com dois silt.
//!
//! # Por que a recusa por eco importa
//!
//! O pseudônimo existe para que a URL pública **não diga a quem pertence a
//! ilha**. `hotel-porto.safecore.space` publica o contrato antes de haver
//! contrato. E a recusa é aqui, no núcleo, e não em cada produto: cada produto
//! que a reimplementa é um produto onde a regra pode não existir.

use std::collections::BTreeSet;

/// Domínio da casa. **Dado, e só num sítio.**
pub const DOMINIO: &str = "safecore.space";

/// Adjetivos. 🔴 A lista vive **aqui** e não em cada produto: uma segunda
/// lista é uma segunda fonte, e é a segunda fonte que diverge.
pub const ADJETIVOS: &[&str] = &[
    "sereno",
    "alerta",
    "breve",
    "claro",
    "duro",
    "exato",
    "firme",
    "grave",
    "humilde",
    "inteiro",
    "limpo",
    "mesmo",
    "nítido",
    "otimo",
    "pálido",
    "quieto",
    "reto",
    "sólido",
    "terso",
    "único",
    "vasto",
    "zelo",
    "âmbar",
    "brando",
    "curto",
    "dourado",
    "esperto",
    "fino",
    "gordo",
    "hábil",
    "ímpar",
    "justo",
    "leve",
    "magro",
    "novo",
    "ordem",
    "puro",
    "raro",
    "sábio",
    "tranquilo",
];

/// Substantivos.
pub const SUBSTANTIVOS: &[&str] = &[
    "falcão",
    "ardósia",
    "bambu",
    "cume",
    "duna",
    "eco",
    "farol",
    "graxa",
    "húmus",
    "íris",
    "junco",
    "lago",
    "malha",
    "nevoa",
    "ocaso",
    "pedra",
    "quebra",
    "rio",
    "sarga",
    "tocha",
    "urubu",
    "vale",
    "xisto",
    "zenite",
    "âmbar",
    "cervo",
    "fonte",
    "granito",
    "hera",
    "lume",
    "mata",
    "ninho",
    "orvalho",
    "pinho",
    "quirino",
    "rochedo",
    "salgueiro",
];

/// Porções de geração. Mais de 16 faz a colisão frequente, e a palavra
/// perde o sentido que o pseudónimo tem de ser **legível**.
pub const PORCOES: usize = 16;

/// O pseudónimo gerado, e as duas faces dele.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pseudonimo {
    /// O valor, que é **o mesmo** nas duas faces.
    pub valor: String,
}

/// O resultado de gerar, validar ou recusar.
pub type Resultado<T> = Result<T, ErroPseudonimo>;

impl Pseudonimo {
    /// A face de **nome** — a que o operador lê.
    pub fn nome(&self) -> &str {
        &self.valor
    }

    /// A face de **domínio**. É o mesmo valor: um pseudónimo que tem nome
    /// próprio e domínio próprio são dois identificadores, e dois
    /// identificadores divergem.
    pub fn dominio(&self) -> String {
        format!("{}.{DOMINIO}", self.valor)
    }
}

/// Erro de pseudónimo. Vocabulário **fechado**: a tela traduz por este.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum ErroPseudonimo {
    #[error("um pseudónimo tem de ser adjetivo-substantivo-hex4, e {valor:?} não é")]
    Forma { valor: String },

    #[error("um pseudónimo não pode repetir o mesmo valor duas vezes seguidas")]
    Repetido,

    #[error("{valor:?} diz quem é o cliente: {eco:?}")]
    EcoaCliente { valor: String, eco: String },

    #[error("{valor:?} diz que vertical é: {eco:?}")]
    EcoaVertical { valor: String, eco: String },
}

impl ErroPseudonimo {
    pub fn codigo(&self) -> &'static str {
        match self {
            Self::Forma { .. } => "pseudonimo.forma",
            Self::Repetido => "pseudonimo.repetido",
            Self::EcoaCliente { .. } => "pseudonimo.ecoa-cliente",
            Self::EcoaVertical { .. } => "pseudonimo.ecoa-vertical",
        }
    }

    /// O que a tela diz. Montada aqui, por quem tem o dado.
    pub fn humano(&self) -> String {
        match self {
            Self::Forma { .. } => {
                "Escolha um pseudónimo no formato palavra-palavra-1234.".to_string()
            }
            Self::Repetido => "Este pseudónimo já foi usado.".to_string(),
            Self::EcoaCliente { .. } => {
                "Este nome diz o nome do cliente. Escolha outro.".to_string()
            }
            Self::EcoaVertical { .. } => {
                "Este nome diz o produto instalado. Escolha outro.".to_string()
            }
        }
    }
}

/// O que o pseudónimo **não** pode dizer.
///
/// É a informação que muda a recusa: a lista de palavras proibidas não é
/// global, é o cliente e o vertical desta ilha.
#[derive(Debug, Clone, Default)]
pub struct Contexto {
    cliente: Vec<String>,
    vertical: Vec<String>,
    /// Valores já usados. Um pseudónimo repetido é uma colisão de nome.
    usados: BTreeSet<String>,
}

impl Contexto {
    pub fn novo(cliente: &str, vertical: &str) -> Self {
        Self {
            cliente: palavras(cliente),
            vertical: palavras(vertical),
            usados: BTreeSet::new(),
        }
    }

    pub fn com_usados<I, S>(mut self, usados: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.usados = usados.into_iter().map(Into::into).collect();
        self
    }

    pub fn marcar_usado(&mut self, valor: &str) {
        self.usados.insert(valor.to_string());
    }
}

/// Tira o diacrítico de um caractere.
///
/// 🔴 **Isto não é cosmético: é a diferença entre a regra existir e não
/// existir.** A primeira versão desta normalização só passava a letra para
/// minúsculas, e então `Condomínio Ítalo` produzia a palavra proibida
/// `ítalo` — que um pseudónimo escrito `italo` **não contém**, e a recusa
/// passava. O acento era o buraco, e era um buraco de um caractere.
///
/// A tabela cobre o Latim-1 Suplemento e o Latim-A Estendido, que é onde
/// vivem os acentos do português, do castelhano e do francês — quase todas as
/// línguas de um mapa.
/// 🔴 Exportada para o `aegis-ponte`: o mesmo buraco de um caractere, na
/// mesma tabela. Duas implementações desta normalização divergem no primeiro
/// nome com acerto, e o primeiro nome com acerto é o do cliente.
pub fn sem_acento(c: char) -> char {
    match c {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'ā' | 'ă' | 'ą' => 'a',
        'À' | 'Á' | 'Â' | 'Ã' | 'Ä' | 'Å' | 'Ā' | 'Ă' | 'Ą' => 'A',
        'è' | 'é' | 'ê' | 'ë' | 'ē' | 'ĕ' | 'ė' | 'ę' | 'ě' => 'e',
        'È' | 'É' | 'Ê' | 'Ë' | 'Ē' | 'Ĕ' | 'Ė' | 'Ę' | 'Ě' => 'E',
        'ì' | 'í' | 'î' | 'ï' | 'ī' | 'ĭ' | 'į' | 'ı' => 'i',
        'Ì' | 'Í' | 'Î' | 'Ï' | 'Ī' | 'Ĭ' | 'Į' | 'İ' => 'I',
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' | 'ō' | 'ŏ' | 'ő' => 'o',
        'Ò' | 'Ó' | 'Ô' | 'Õ' | 'Ö' | 'Ø' | 'Ō' | 'Ŏ' | 'Ő' => 'O',
        'ù' | 'ú' | 'û' | 'ü' | 'ū' | 'ŭ' | 'ů' | 'ű' | 'ų' => 'u',
        'Ù' | 'Ú' | 'Û' | 'Ü' | 'Ū' | 'Ŭ' | 'Ů' | 'Ű' | 'Ų' => 'U',
        'ç' => 'c',
        'Ç' => 'C',
        'ñ' => 'n',
        'Ñ' => 'N',
        'ý' | 'ÿ' => 'y',
        'Ý' | 'Ÿ' => 'Y',
        'š' => 's',
        'Š' => 'S',
        'ž' | 'ź' | 'ż' => 'z',
        'Ž' | 'Ź' | 'Ż' => 'Z',
        outro => outro,
    }
}

/// Quebra um texto em **sílabas** comparáveis: sem acento, sem pontuação, em
/// minúsculas.
///
/// 🔴 A comparação por eco tem de sobreviver a `Condomínio Ítalo` e a
/// `condominio-italo`. A normalização é o que torna a recusa uma regra em vez
/// de um `contains` — e um `contains` sem normalização não recusa nada, que
/// é o estado em que a regra está hoje.
fn normalizar(texto: &str) -> String {
    let mut saida = String::with_capacity(texto.len());
    let mut anterior_alfanumerico = false;
    for c in texto.chars() {
        let min = c.to_lowercase().next().unwrap_or(c);
        let limpo = sem_acento(min);
        if limpo.is_alphanumeric() {
            anterior_alfanumerico = true;
            saida.push(limpo);
        } else if anterior_alfanumerico {
            anterior_alfanumerico = false;
            saida.push('-');
        }
    }
    saida.trim_matches('-').to_string()
}

/// As "palavras" que um texto proibido traz: as partes com 3 ou mais
/// letras. `LR4 Tecnologia` vira `lr4` e `tecnologia`; a parte de 2 letras
/// (`do`, `da`) seria ruído que recusa pseudónimos sem motivo.
fn palavras(texto: &str) -> Vec<String> {
    normalizar(texto)
        .split('-')
        .filter(|p| p.len() >= 3)
        .map(str::to_string)
        .collect()
}

/// Gera um pseudónimo novo.
///
/// A geração é determinística por `semente` — não por `rand`, e a razão é
/// prática: uma geração que não se pode repetir é um teste que não se pode
/// escrever, e um teste que não se pode escrever é uma regra que não está
/// provada. O **produto** passa uma semente aleatória; os testes passam uma
/// fixa.
pub fn gerar(semente: u64, contexto: &Contexto) -> Resultado<Pseudonimo> {
    // 🔴 O xorshift tem **ponto fixo em zero**: com a semente `0` o estado
    // nunca sai de `0`, e o gerador devolve sempre o mesmo par — que, se for
    // recusado por eco, é repetido 1480 vezes e acaba em `Repetido`. Semente
    // `0` é uma entrada legítima (é o que um chamador sem sorteio nenhum
    // passa), e "sem sorteio nenhum" é justamente o caso em que a
    // determinização tem de funcionar.
    //
    // Espalhar por uma constante ímpar e forçar o bit menos significativo
    // tira o estado de zero **para sempre**.
    const ESPALHAMENTO: u64 = 0x9E37_79B9_7F4A_7C15;
    let mut x = semente.wrapping_mul(ESPALHAMENTO) | 1;
    let mut proximo = || {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        x
    };

    // Uma volta por par possível, mais uma para sair do primeiro repetido.
    for _ in 0..=(ADJETIVOS.len() * SUBSTANTIVOS.len()) {
        let a = ADJETIVOS[(proximo() as usize) % ADJETIVOS.len()];
        let s = SUBSTANTIVOS[(proximo() as usize) % SUBSTANTIVOS.len()];
        let h = format!("{:04x}", (proximo() % (PORCOES as u64).pow(4)) as u16);
        let valor = format!("{a}-{s}-{h}");

        if contexto.usados.contains(&valor) {
            continue;
        }
        match validar(&valor, contexto) {
            Ok(p) => return Ok(p),
            // Uma geração que sai com eco é normal: o gerador volta a tentar
            // com outro par. A **recusa** é o que é duro — é a validação que
            // não aceita o que lhe mandam.
            Err(_) => continue,
        }
    }

    Err(ErroPseudonimo::Repetido)
}

/// Confere um pseudónimo **dado**.
///
/// Esta é a função que o produto tem de usar quando o valor **não** foi gerado
/// por [`gerar`] — a interface do painel, o pedido de matrícula, a reserva de
/// um nome. É ela que impede o produto de aceitar à mão um valor que a regra
/// proíbe.
pub fn validar(valor: &str, contexto: &Contexto) -> Resultado<Pseudonimo> {
    let partes: Vec<&str> = valor.split('-').collect();
    // 🔴 `is_alphabetic()` aceita maiúsculas, e isso é um buraco: o DNS não
    // distingue `Sereno-falcao-a1b2` de `sereno-falcao-a1b2`, e as duas
    // formas registariam **duas** ilhas com o mesmo pseudónimo. É a mesma
    // classe do defeito que a invariante nome==domínio existe para impedir:
    // dois identificadores para uma coisa só, que divergem.
    if partes.len() != 3
        || partes[0].is_empty()
        || partes[1].is_empty()
        || partes[2].len() != 4
        || !partes[2]
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        || !partes[0].chars().all(|c| c.is_ascii_lowercase())
        || !partes[1].chars().all(|c| c.is_ascii_lowercase())
    {
        return Err(ErroPseudonimo::Forma {
            valor: valor.to_string(),
        });
    }

    let normal = normalizar(valor);
    for proibida in &contexto.cliente {
        if normal.contains(proibida.as_str()) {
            return Err(ErroPseudonimo::EcoaCliente {
                valor: valor.to_string(),
                eco: proibida.clone(),
            });
        }
    }
    for proibida in &contexto.vertical {
        if normal.contains(proibida.as_str()) {
            return Err(ErroPseudonimo::EcoaVertical {
                valor: valor.to_string(),
                eco: proibida.clone(),
            });
        }
    }

    Ok(Pseudonimo {
        valor: valor.to_string(),
    })
}

/// Confere a **forma** sem contexto — para quando só se quer o formato, e não
/// há cliente nem vertical à mão.
pub fn forma(valor: &str) -> Resultado<Pseudonimo> {
    validar(valor, &Contexto::default())
}
