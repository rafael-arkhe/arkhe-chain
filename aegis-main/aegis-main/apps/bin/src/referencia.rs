//! A referência do produto, **gerada do código**.
//!
//! 🔴 Isto existe por causa da queixa que o dono fez em segundo lugar:
//! *"documentação densa, mal atualizada"*. A cura não é escrever melhor — é
//! fazer a documentação **não poder divergir** do produto. Um ficheiro escrito
//! à mão descreve o que o produto fazia quando o ficheiro foi escrito; um
//! ficheiro gerado descreve o que ele faz agora, ou recusa.
//!
//! # O que sai daqui
//!
//! - **A árvore de comandos**, introspeccionada do `clap` — a mesma estrutura
//!   que responde ao `--help`.
//! - **Os códigos de saída**, dos valores que a biblioteca usa.
//! - **O vocabulário de recusa inteiro**, dos enums que a tela traduz por
//!   código.
//! - **Os crates**, com o que cada um **não** faz — que é a coluna que
//!   importa.
//!
//! # E o que NÃO sai, e porquê
//!
//! Só os enums **de variante unitária** entram no vocabulário. Os que carregam
//! dados — `ErroStore::Ligacao { url, fonte }` — não se enumeram sem inventar
//! a carga, e um catálogo de erros inventados é pior do que nenhum: parece
//! exaustivo e não é. O que se escreve para eles é o **tipo** e a regra.
//!
//! # A lista é escrita à mão, e isso é uma fraqueza
//!
//! Cada enum ganha um `todos()`/`catalogo()` ao lado de si, e **o compilador
//! não o liga ao enum**. Um motivo novo entra no `match` e fica de fora da
//! lista, e a referência passa a estar errada em silêncio.
//!
//! A cura não é um milagre: é dizer isso **na própria referência** e é
//! `desatualizada()` — que falha se o ficheiro não bater com o código. O que a
//! lista não apanha é um motivo que ficou de fora dela; o que apanha é todo o
//! resto, e um motivo em falta aparece assim que alguém abre a referência à
//! procura dele.

use clap::CommandFactory;
use std::fmt::Write as _;
use std::path::Path;

use crate::Cli;

/// A referência em Markdown.
pub fn referencia() -> String {
    let mut s = String::new();
    cabecalho(&mut s);
    comandos(&mut s);
    saidas(&mut s);
    vocabulario(&mut s);
    crates(&mut s);
    rodape(&mut s);
    s
}

/// 🔴 A referência está desatualizada?
///
/// É esta a função que faz a peça valer alguma coisa. Sem ela, *"gerada do
/// código"* é uma afirmação sobre a **origem** do ficheiro; com ela, é uma
/// afirmação sobre o **conteúdo** — e alguém tem de correr.
pub fn desatualizada(caminho: &Path) -> Result<bool, String> {
    match std::fs::read_to_string(caminho) {
        Ok(guardado) => Ok(guardado != referencia()),
        // 🔴 O ficheiro **não existir** é "desatualizado", e não um erro de
        // leitura: a referência é gerada, e a primeira vez tem de a produzir.
        Err(_) => Ok(true),
    }
}

/// Escreve, ou — com `verificar` — diz que está desatualizada.
///
/// Devolve `true` quando escreveu.
pub fn escrever(caminho: &Path, verificar: bool) -> Result<bool, String> {
    if verificar {
        if !desatualizada(caminho)? {
            return Ok(false);
        }
        return Err(format!(
            "{} está desatualizado.\n\
             \n\
             🔴 A referência é GERADA: um comando novo, um motivo novo ou uma \
             frase reescrita mudam este ficheiro — e um ficheiro desatualizado \
             é pior do que nenhum, porque parece a verdade.\n\
             \n\
             Gere-o com:\n  aegis referencia --saida {}",
            caminho.display(),
            caminho.display()
        ));
    }
    if let Some(pasta) = caminho.parent()
        && !pasta.as_os_str().is_empty()
    {
        std::fs::create_dir_all(pasta)
            .map_err(|e| format!("não criei {}: {e}", pasta.display()))?;
    }
    std::fs::write(caminho, referencia())
        .map_err(|e| format!("não escrevi {}: {e}", caminho.display()))?;
    Ok(true)
}

// ===========================================================================
// As secções
// ===========================================================================

fn cabecalho(s: &mut String) {
    s.push_str(
        "# A referência do produto\n\
         \n\
         > 🔴 **Gerada a partir do código.** Não edite este ficheiro à mão:\n\
         > `aegis referencia` reescreve-o, e `aegis referencia --verificar`\n\
         > falha quando ele já não bate com o produto. Um comando novo, um\n\
         > motivo de recusa novo ou uma frase reescrita mudam este ficheiro —\n\
         > e é por isso que ele não pode ser a fotografia de um dia.\n\
         \n\
         O que esta referência **não** é: uma explicação. Ela é o índice do\n\
         que existe. O porquê de cada regra está no `README.md` e na doc de\n\
         cada crate.\n\
         \n\
         ---\n\
         \n",
    );
}

fn comandos(s: &mut String) {
    s.push_str("## Os comandos\n\n");
    s.push_str(
        "🔴 Esta árvore é **introspeccionada** do `clap` — a mesma estrutura que\n\
         responde ao `--help`. Não há lista escrita à mão, e por isso não pode\n\
         haver um comando no programa que não esteja aqui.\n\n",
    );
    arvore(s, &Cli::command(), &[]);
    s.push('\n');
}

/// Percorre a árvore, levando consigo o **caminho** até aqui.
///
/// 🔴 O caminho é o que se escreve na linha de comandos, e é por isso que
/// desce com a recursão: o `clap` sabe o nome de cada subcomando mas não sabe
/// o caminho, e `get_override_usage()` devolve o uso **dele**, sem o que vem
/// antes. A primeira versão imprimia `renovar` onde devia imprimir
/// `aegis licenca renovar`, que é a forma mais direta de uma referência gerar
/// um comando que não corre.
fn arvore(s: &mut String, cmd: &clap::Command, caminho: &[&str]) {
    if caminho.is_empty() {
        for sub in cmd.get_subcommands() {
            arvore(s, sub, &[sub.get_name()]);
        }
        return;
    }

    let uso = format!("aegis {}", caminho.join(" "));
    let _ = writeln!(s, "### `{uso}`\n");
    let _ = writeln!(
        s,
        "{}\n",
        primeiro_paragrafo(cmd.get_about().map(|a| a.to_string()))
    );

    // As opções e os argumentos, do `clap` — e só os que a pessoa escreve.
    let mut linhas = Vec::new();
    for a in cmd.get_arguments() {
        // 🔴 O que está **oculto** fica de fora: o `clap` usa argumentos
        // escondidos para uso interno, e listá-los aqui seria mostrar coisas
        // que não se escrevem.
        if a.is_hide_set() {
            continue;
        }
        let id = a.get_id();
        // 🔴 O nome que a pessoa escreve é o **long** do `clap`, e não o `id`.
        // O `id` é `chave_oem` e a flag é `--chave-oem` — o `clap` traduz o
        // traço, e é essa tradução que a pessoa tem de escrever. A primeira
        // versão imprimia o `id` e produzia uma referência com comandos que
        // **não correm** — que é a forma mais cara de uma documentação gerada:
        // ela parece exactamente igual à certa.
        let escrito = match (a.get_long(), a.get_short()) {
            (Some(long), _) => format!("--{long}"),
            (None, Some(short)) => format!("-{short}"),
            // Sem long nem short é um **posicional**, e escreve-se `<assim>`.
            (None, None) => format!("<{}>", id.as_str()),
        };
        let obrigatorio = if a.is_required_set() {
            " **(obrigatório)**"
        } else {
            ""
        };
        let ajuda = a.get_help().map(|h| h.to_string()).unwrap_or_default();
        // 🔴 Uma célula vazia é um dívida visível. A referência não a
        // inventa: se a opção não tem texto, a célula fica vazia — e isso é
        // o que fez aparecer as sete opções sem `--help` na CLI.
        let ajuda = if ajuda.trim().is_empty() {
            "_sem descrição_".to_string()
        } else {
            ajuda
        };
        linhas.push(format!("| `{}` | {}{} |", escrito, ajuda, obrigatorio));
    }
    if !linhas.is_empty() {
        let _ = writeln!(s, "| Opção | Para que serve |\n|---|---|");
        for l in linhas {
            let _ = writeln!(s, "{l}");
        }
        let _ = writeln!(s);
    }

    for sub in cmd.get_subcommands() {
        let mut abaixo = caminho.to_vec();
        abaixo.push(sub.get_name());
        arvore(s, sub, &abaixo);
    }
}

/// O primeiro parágrafo da ajuda.
///
/// 🔴 O `about` traz o texto **todo** — o resumo e a explicação. A referência
/// é um índice: a explicação é o porquê, e o porquê está na doc do crate.
/// Copiar tudo aqui dava um ficheiro que ninguém lia.
fn primeiro_paragrafo(sobre: Option<String>) -> String {
    let Some(texto) = sobre else {
        return "_Sem descrição._".to_string();
    };
    let primeiro = texto
        .split("\n\n")
        .next()
        .unwrap_or(&texto)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if primeiro.is_empty() {
        "_Sem descrição._".to_string()
    } else {
        primeiro
    }
}

fn saidas(s: &mut String) {
    let _ = writeln!(
        s,
        "## Os códigos de saída\n\n\
         São decididos em `aegis_produto::Resultado::saida()` — **a única função\n\
         do produto que decide um número** — e as três faces usam-na.\n\n\
         | Código | Significado |\n|---|---|\n\
         | `{}` | Feito |\n\
         | `{}` | Falhou — o pedido era legítimo e não foi possível |\n\
         | `{}` | **Recusado com motivo** — o pedido é legítimo e o estado não o permite |\n\n\
         Uma recusa traz **código**, **frase** e **gesto**. O gesto é o que\n\
         separa a recusa da falha: quem recebe *\"falhou\"* não sabe o que\n\
         fazer, e quem recebe *\"pedir licença ao parceiro\"* sabe.\n",
        aegis_produto::SAIDA_FEITO,
        aegis_produto::SAIDA_FALHOU,
        aegis_produto::SAIDA_RECUSADO,
    );
}
/// A lista do vocabulário **vem do produto**, e não desta casca.
///
/// 🔴 Uma segunda lista aqui seria uma segunda versão da regra — e as duas
/// divergem no primeiro caso de borda. A casca junta o que o `clap` sabe; o
/// que o produto sabe, o produto diz (`aegis_produto::vocabulario_de_recusa`).
fn vocabulario(s: &mut String) {
    let linhas = aegis_produto::vocabulario_de_recusa();
    let familias: std::collections::BTreeSet<&str> = linhas.iter().map(|l| l.familia).collect();

    let _ = writeln!(
        s,
        "## O vocabulário de recusa\n\n\
         Tudo o que o produto recusa tem um **código fechado**, e é por ele que a\n\
         tela traduz — *nunca* por casamento de texto. Casar dentro da frase\n\
         quebraria no dia em que a frase fosse reescrita, e passaria a dizer\n\
         outra coisa que a medição não disse.\n\n\
         São **{} motivos** em **{} famílias**.\n",
        linhas.len(),
        familias.len(),
    );

    let mut familia_atual = "";
    for l in &linhas {
        if l.familia != familia_atual {
            familia_atual = l.familia;
            let _ = writeln!(s, "\n### {familia_atual}\n");
            let _ = writeln!(s, "| Código | A tela diz | O que fazer |\n|---|---|---|");
        }
        let _ = writeln!(s, "| `{}` | {} | {} |", l.codigo, l.frase, l.gesto);
    }

    let _ = write!(
        s,
        "\n\
         🔴 **Só entram aqui os enums de variante unitária.** Os que carregam\n\
         dados — `ErroStore::Ligacao {{ url, fonte }}` — não se enumeram sem\n\
         inventar a carga, e um catálogo de erros inventados é pior do que\n\
         nenhum: parece exaustivo e não é.\n\
         \n\
         🔴 **A lista de cada família é escrita à mão** e o compilador não a\n\
         liga ao enum. Um motivo novo entra no `match` e fica de fora daqui. O\n\
         que apanha essa omissão é a pessoa que abre esta referência à procura\n\
         dele — e é por isso que ela é gerada e verificada.\n"
    );
}

fn crates(s: &mut String) {
    let _ = writeln!(
        s,
        "## Os crates\n\n\
         🔴 A **segunda coluna** é a mais importante, e é uma *constraint*: o que\n\
         cada crate **não** faz. Um limite escrito é um limite que se cumpre; um\n\
         limite apenas imaginado é um limite que se perde na primeira ida.\n\n\
         | crate | o que é | o que **não** é |\n|---|---|---|\n\
         | `aegis-vertical` | Lê e valida o `vertical.yaml` | Não conhece banco, rede ou ilha |\n\
         | `aegis-ontology` | O contrato e a coação de uma instância | Não conhece nenhum vertical |\n\
         | `aegis-identity` | Pseudónimo, papéis e escopo | **Puro** — não toca em banco nem em rede |\n\
         | `aegis-license` | Raiz do vendor → Chave OEM → licença → renovação | **Não assina** — nenhuma chave privada entra no núcleo |\n\
         | `aegis-pagina` | O formato da página, e a `Montagem` que **grava o `vertical.yaml`** | Não sabe renderizar nem falar de HTTP |\n\
         | `aegis-produto` | As operações do produto, com `Resultado` estruturado | Não sabe imprimir — é isso que a torna partilhável |\n\
         | `aegis-store` | **Toda** a SQL do sistema | O `PgPool` não sai daqui |\n\
         | `aegis-island` | HTTP, `/health`, `/health/ready` e a tela | Não escreve SQL |\n\
         | `apps/bin` | A casca da linha de comandos | Não conhece regra de produto — chama a biblioteca |\n\
         | `apps/gui` | A janela (Tauri) | Não conhece regra de produto — chama a biblioteca |\n"
    );
}

fn rodape(s: &mut String) {
    let _ = write!(
        s,
        "\n---\n\
         \n\
         Para a explicação de cada regra — e para o que esta referência **não**\n\
         cobre — ver o `README.md`. Para gerar:\n\
         \n\
         ```sh\n\
         aegis referencia --saida docs/REFERENCIA.md\n\
         aegis referencia --verificar --saida docs/REFERENCIA.md   # falha se divergir\n\
         ```\n"
    );
}
