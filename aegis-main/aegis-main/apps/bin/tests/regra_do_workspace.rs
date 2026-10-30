//! As guardas do **workspace**, não de um crate.
//!
//! 🔴 Havia uma guarda por crate (`aegis-vertical`, `aegis-ontology`) e
//! nenhuma no `aegis-island` — que é onde acabei por escrever um slug real
//! num comentário, e ninguém apanhou. A regra é do workspace, então a guarda
//! tem de ser do workspace: um `grep` sobre **todo** o `src/` de produção.
//!
//! # Porque só `src/`
//!
//! Os ficheiros de **teste** nomeiam slugs de propósito — é a lista do que
//! está proibido. Varrer `tests/` faria a guarda acusar-se a si mesma, e uma
//! guarda que accuse o próprio teste é uma guarda que se desliga sozinha.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;

// O `cargo test` do binário já tem `aegis-vertical` e `aegis-pagina` como
// dependências da própria ilha; Declara-as aqui para a prova.

fn raiz_do_workspace() -> PathBuf {
    // `apps/bin` -> `apps` -> a raiz
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .expect("a raiz do workspace")
        .to_path_buf()
}

/// Os slugs que vivem em `verticals/`, **derivados do disco**.
///
/// Uma guarda com a lista escrita à mão deixa de proteger no dia em que um
/// vertical novo entra — e é exatamente o dia em que alguém copia um slug
/// para o código.
fn slugs_reais(raiz: &Path) -> Vec<String> {
    let Ok(entradas) = std::fs::read_dir(raiz.join("verticals")) else {
        return Vec::new();
    };
    let mut saida: Vec<String> = entradas
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.join("vertical.yaml").is_file())
        .filter_map(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
        .collect();
    saida.sort();
    saida
}

/// Só o código de **produção** (`src/`).
fn ficheiros_de_producao(raiz: &Path) -> Vec<PathBuf> {
    let mut saida = Vec::new();
    for pasta in ["crates", "apps"] {
        let Ok(entradas) = std::fs::read_dir(raiz.join(pasta)) else {
            continue;
        };
        for crate_dir in entradas.filter_map(|e| e.ok()).map(|e| e.path()) {
            let d = crate_dir.join("src");
            if d.is_dir() {
                recolher(&d, &mut saida);
            }
        }
    }
    saida
}

fn recolher(pasta: &Path, saida: &mut Vec<PathBuf>) {
    let Ok(entradas) = std::fs::read_dir(pasta) else {
        return;
    };
    for entrada in entradas.filter_map(|e| e.ok()) {
        let p = entrada.path();
        if p.is_dir() {
            recolher(&p, saida);
        } else if p.extension().is_some_and(|e| e == "rs") {
            saida.push(p);
        }
    }
}

/// As violações: ficheiros de `src/` que citam um slug de vertical.
fn violacoes(raiz: &Path, slugs: &[String]) -> Vec<String> {
    ficheiros_de_producao(raiz)
        .iter()
        .filter_map(|f| {
            let texto = std::fs::read_to_string(f).ok()?;
            let achado = slugs.iter().find(|s| texto.contains(s.as_str()))?;
            Some(format!(
                "{} cita o slug {achado:?} — um vertical é dado, e o manifesto \
                 é a única fonte",
                f.strip_prefix(raiz).unwrap_or(f).display()
            ))
        })
        .collect()
}

#[test]
fn nenhum_slug_de_vertical_vive_no_codigo_de_producao() {
    let raiz = raiz_do_workspace();
    let slugs = slugs_reais(&raiz);
    assert!(
        !slugs.is_empty(),
        "a guarda não encontrou verticais em {}/verticals — se isto passar \
         com a lista vazia, ela deixou de proteger",
        raiz.display()
    );

    let achadas = violacoes(&raiz, &slugs);
    assert!(
        achadas.is_empty(),
        "slug de vertical dentro do código de produção:\n  {}",
        achadas.join("\n  ")
    );
}

/// 🔴 A guarda tem de **morder**.
///
/// Uma guarda que passa porque deixou de procurar é a pior coisa que uma
/// guarda pode fazer: ela dá a mesma resposta verde com e sem defeito. Este
/// teste planta a violação numa árvore temporária, com a mesma estrutura do
/// workspace, e confirma que a mesma função a encontra.
#[test]
fn a_guarda_encontra_a_violacao_quando_ela_existe() {
    let raiz = raiz_do_workspace();
    let slugs = slugs_reais(&raiz);
    let algum = slugs.first().expect("há pelo menos um vertical").clone();

    // Uma árvore temporária com a mesma forma: `crates/algum/src/`.
    let base = std::env::temp_dir().join(format!(
        "aegis-guarda-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    let src = base.join("crates/algum/src");
    std::fs::create_dir_all(&src).expect("criar árvore temporária");

    let ficheiro = src.join("codigo.rs");
    std::fs::write(
        &ficheiro,
        format!("// o vertical {algum} vive aqui\npub fn nada() {{}}\n"),
    )
    .expect("plantar a violação");

    let achadas = violacoes(&base, std::slice::from_ref(&algum));
    let _ = std::fs::remove_dir_all(&base);

    assert_eq!(
        achadas.len(),
        1,
        "a guarda tinha de encontrar UMA violação e encontrou {}",
        achadas.len()
    );
    assert!(achadas[0].contains(&algum));
}

/// 🔴 **Toda** a página de **todo** o vertical tem de carregar e passar a
/// validação contra o próprio contrato.
///
/// Sem esta prova, um `tipo: "objectSet"` em vez de `object_set` — que é
/// *exatamente* o que aconteceu — só aparece como um **404** numa tela de
/// cliente, dias depois, e ninguém sabe que a culpa foi de uma letra. O
/// sintoma está a três camadas da causa.
#[test]
fn toda_a_pagina_de_todo_o_vertical_carrega_e_valida() {
    let raiz = raiz_do_workspace();
    let slugs = slugs_reais(&raiz);
    assert!(!slugs.is_empty());

    for slug in &slugs {
        let manifesto = aegis_vertical::carregar(&raiz.join("verticals").join(slug))
            .unwrap_or_else(|e| panic!("o vertical {slug} não carrega: {e:?}"));

        for declarada in &manifesto.paginas {
            let caminho = raiz.join("verticals").join(slug).join(&declarada.ficheiro);
            let texto = std::fs::read_to_string(&caminho)
                .unwrap_or_else(|e| panic!("{slug}: não li {}: {e}", caminho.display()));
            let valor: serde_json::Value = serde_json::from_str(&texto)
                .unwrap_or_else(|e| panic!("{slug}: {} não é JSON: {e}", caminho.display()));

            let pagina = aegis_pagina::Pagina::de_json(&valor).unwrap_or_else(|e| {
                panic!(
                    "{slug}: a página {:?} não tem o formato: {:?} — o vocabulário é                      `object_set` / `agregacao` e o verbo do bloco é `kpi` /                      `tabela` / `texto`",
                    declarada.slug,
                    e.codigo()
                )
            });

            pagina.validar(&manifesto).unwrap_or_else(|e| {
                panic!(
                    "{slug}: a página {:?} não passa a validação: [{}] {}",
                    declarada.slug,
                    e.codigo(),
                    e.humano()
                )
            });
        }
    }
}

/// 🔴 **Toda a prova do repositório tem de estar na lista.** Sem esta, uma
/// suite que deixa de compilar — ou de ser registada no workspace — desaparece
/// do relatório sem deixar rasto, e a contagem desce um bocado que ninguém
/// compara com nada.
///
/// Foi assim que 29 provas do manifesto sumiram sem uma linha de erro: a suite
/// deixou de correr, o `cargo test` ficou verde, e a contagem foi de 146 para
/// 128. Ninguém teria reparado se eu não tivesse contado.
#[test]
fn nenhuma_prova_desapareceu() {
    // Os ficheiros de prova que existem hoje. Um nome novo entra aqui; um nome
    // que saia **sem** trocar esta lista reprova.
    const ESPERADOS: &[&str] = &[
        "crates/aegis-vertical/tests/manifesto.rs",
        "crates/aegis-ontology/tests/coercao.rs",
        "crates/aegis-license/tests/interoperabilidade.rs",
        "crates/aegis-license/tests/renovacao.rs",
        "crates/aegis-ponte/tests/ponte.rs",
        // 🔴 O watchdog entrou na lista no dia em que deixou de ser órfão. Era
        // um `.rs` em `src/` que não era módulo de nada — e a guarda
        // `nenhum_ficheiro_de_src_fica_orfao` é que o apanhou. Um ficheiro
        // assim não compila, não é testado, e ninguém sabe que existe.
        "crates/aegis-ponte/tests/watchdog.rs",
        "crates/aegis-identity/tests/regras.rs",
        "crates/aegis-pagina/tests/montagem.rs",
        "crates/aegis-produto/tests/vocabulario.rs",
        "crates/aegis-produto/tests/diagnostico.rs",
        "crates/aegis-store/tests/integracao.rs",
        "crates/aegis-island/tests/saude.rs",
        "apps/bin/tests/regra_do_workspace.rs",
        "apps/bin/tests/um_produto.rs",
        // 🔴 O Construtor agêntico é a **primeira** prova que escreve, e por
        // isso a que mais precisa de estar na lista: uma prova que escreve
        // alguma coisa e desaparece do relatório deixa o repositório a escrever
        // sem ninguém a ver.
        "apps/bin/tests/construtor_agente.rs",
        "apps/bin/tests/referencia.rs",
        "apps/gui/src-tauri/tests/tres_faces.rs",
        // 🔴 A quarta face: `aegis mcp`. Entra na lista porque uma prova fora
        // da lista é uma prova que ninguém sabe que existe — e esta é a que
        // diz que a face agêntica diz o mesmo que as outras três.
        "apps/bin/tests/quatro_faces.rs",
    ];

    let raiz = raiz_do_workspace();
    let mut reais_caminhos: Vec<PathBuf> = Vec::new();
    for pasta in ["crates", "apps"] {
        let base = raiz.join(pasta);
        let Ok(entradas) = std::fs::read_dir(&base) else {
            continue;
        };
        for crate_dir in entradas.filter_map(|e| e.ok()).map(|e| e.path()) {
            // `apps/gui` tem o crate dentro de `src-tauri`
            for dir in [
                crate_dir.join("tests"),
                crate_dir.join("src-tauri").join("tests"),
            ] {
                if !dir.is_dir() {
                    continue;
                }
                let Ok(ficheiros) = std::fs::read_dir(&dir) else {
                    continue;
                };
                for f in ficheiros.filter_map(|e| e.ok()) {
                    let p = f.path();
                    if p.extension().is_some_and(|e| e == "rs") {
                        reais_caminhos.push(p);
                    }
                }
            }
        }
    }

    let reais: Vec<String> = reais_caminhos
        .iter()
        .map(|p| {
            p.strip_prefix(&raiz)
                .unwrap_or(p)
                .to_string_lossy()
                .replace(std::path::MAIN_SEPARATOR, "/")
        })
        .collect();

    let em_reais: Vec<String> = ESPERADOS
        .iter()
        .filter(|e| !reais.iter().any(|r| r == *e))
        .map(|e| e.to_string())
        .collect();
    assert!(
        em_reais.is_empty(),
        "estas provas estão na lista mas o ficheiro NÃO existe: {em_reais:?}
         Ou o ficheiro foi apagado, ou o nome mudou. Nos dois casos a lista          tem de mudar com ele — e não é o inverso."
    );

    let mut nao_listadas: Vec<String> = reais
        .iter()
        .filter(|r| !ESPERADOS.contains(&r.as_str()))
        .cloned()
        .collect();
    nao_listadas.sort();
    assert!(
        nao_listadas.is_empty(),
        "há provas que existem e NÃO estão na lista: {nao_listadas:?}
         Acrescenta-as. Uma prova fora da lista é uma prova que ninguém sabe          que existe."
    );
}

/// 🔴 **Nenhum ficheiro de `src/` pode ficar órfão.**
///
/// Um `.rs` que não é declarado como módulo **não compila** — e por isso
/// nada diz que ele existe. Fica no disco, invisível, e é a coisa mais
/// perigosa que pode acontecer a um repositório: uma segunda implementação
/// de uma regra, à espera de alguém a ler e a achar que está a usar.
///
/// Foi o que aconteceu, e a casa quase não deu por isso: `apps/bin/src/licenca.rs`
/// era uma implementação **completa** do gate de licença — com o seu
/// `fingerprint_de`, o seu `raiz_do_vendor` e a sua leitura de
/// `AEGIS_RAIZ_VENDOR` — a repetir ao lado da verdadeira, que vive em
/// `aegis-produto`. Não compilava, não era testado, e a lista de provas
/// (`nenhuma_prova_desapareceu`) não o via porque só olha para `tests/`.
///
/// 🔴 **Isto varre declarações, e não texto de produto.** É a diferença com
/// os 60 testes de regex que a casa removeu: aqueles provavam *conteúdo* de
/// produto por comparação de texto, e um ficheiro pode passar os dois sem
/// dizer nada um do outro. Isto prova um facto do **ficheiro** — existe um
/// `.rs` que ninguém compila — e o ficheiro existe ou não existe.
#[test]
fn nenhum_ficheiro_de_src_fica_orfao() {
    let raiz = raiz_do_workspace();
    let mut orfaos = Vec::new();

    for crate_dir in crate_dirs(&raiz) {
        let src = crate_dir.join("src");
        if !src.is_dir() {
            continue;
        }
        let raiz_crate = modulos_alcancaveis(&src);
        let mut declarados: std::collections::HashSet<PathBuf> =
            raiz_crate.iter().cloned().collect();
        // Um `mod` declarado dentro de um submódulo também conta.
        let mut fila: Vec<PathBuf> = raiz_crate;
        while let Some(f) = fila.pop() {
            if let Ok(texto) = std::fs::read_to_string(&f) {
                for m in declaracoes_de_modulo(&texto) {
                    let filho = f
                        .parent()
                        .map(|p| p.join(format!("{m}.rs")))
                        .unwrap_or_default();
                    if declarados.insert(filho.clone()) {
                        fila.push(filho);
                    }
                }
            }
        }

        let mut todos = Vec::new();
        recolher(&src, &mut todos);
        for ficheiro in todos {
            if !declarados.contains(&ficheiro) {
                orfaos.push(
                    ficheiro
                        .strip_prefix(&raiz)
                        .unwrap_or(&ficheiro)
                        .display()
                        .to_string(),
                );
            }
        }
    }

    assert!(
        orfaos.is_empty(),
        "estes ficheiros de `src/` NÃO são módulo de nada — não compilam, não \
         são testados, e ninguém sabe que existem:\n  {}\n\
         🔴 Apague-os, ou declare-os. Um `.rs` órfão é a segunda implementação \
         da regra à espera de alguém a achar que está a usar.",
        orfaos.join("\n  ")
    );
}

/// As pastas que são a **raiz de um crate** — sem o `src`, que é o que o
/// chamador junta.
///
/// 🔴 Esta função devolvia o `src` e o chamador juntava `src` outra vez, o
/// que punha a guarda a procurar `crates/<algo>/src/src` — que não existe. O
/// corpo do laço nunca corria, a lista ficava vazia, e **a guarda passava
/// sempre**. Foi discoveredo porque a primeira experiência com ela não mordeu:
/// uma guarda que não morde na experiência é uma guarda que não existe.
fn crate_dirs(raiz: &Path) -> Vec<PathBuf> {
    let mut saida = Vec::new();
    for pasta in ["crates", "apps"] {
        let Ok(entradas) = std::fs::read_dir(raiz.join(pasta)) else {
            continue;
        };
        for c in entradas.filter_map(|e| e.ok()).map(|e| e.path()) {
            // `apps/gui` tem o crate dentro de `src-tauri`
            if c.join("Cargo.toml").is_file() {
                saida.push(c);
            } else if c.join("src-tauri/Cargo.toml").is_file() {
                saida.push(c.join("src-tauri"));
            }
        }
    }
    saida
}

/// 🔴 **O ambiente é lido em um sítio só, e a guarda diz qual é.**
///
/// A regra da casa é *"um vocabulário de config: um lugar para ler backend,
/// licença e vertical; nenhum segundo interpretador"*. 🔴 E estava **no papel
/// e não no código**: as variáveis eram lidas em cinco sítios por quatro
/// crates, e `AEGIS_RAIZ_VENDOR` em **dois** — o que é uma segunda
/// implementação da regra da raiz do vendor, que é a que mais dói quando está
/// errada.
///
/// A guarda varre o `src/` de produção à procura de `env::var("AEGIS…")` e de
/// `env::var("COMPUTERNAME"|"HOSTNAME")`, e diz que **só** o
/// `aegis-ambiente` pode.
///
/// 🔴 Ela varre **declarações**, e não texto de produto — a mesma distinção
/// que a guarda dos órfãos. E tem uma tolerância: `AEGIS_TESTE_BANCO` e
/// `AEGIS_SH` nos **`tests/`** são legítimos, porque uma prova precisa de
/// apontar a máquina a outro sitio.
#[test]
fn nenhuma_variavel_de_ambiente_e_lida_fora_do_ambiente() {
    let raiz = raiz_do_workspace();
    let dono = "aegis-ambiente";
    let mut achadas = Vec::new();

    for crate_dir in crate_dirs(&raiz) {
        let src = crate_dir.join("src");
        if !src.is_dir() {
            continue;
        }
        let nome_do_crate = crate_dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if nome_do_crate == dono {
            continue;
        }
        let mut ficheiros = Vec::new();
        recolher(&src, &mut ficheiros);
        for f in ficheiros {
            let Ok(texto) = std::fs::read_to_string(&f) else {
                continue;
            };
            for (i, linha) in texto.lines().enumerate() {
                // 🔴 O `env::var("…")` com o nome **literal**. Uma leitura
                // feita por nome construído em runtime não é apanhada — e é
                // por isso que o `aegis-ambiente` tem funções com nome, e não
                // uma lista que alguém possa varrer.
                let algum = linha.contains("env::var(\"AEGIS")
                    || linha.contains("env::var(\"COMPUTERNAME")
                    || linha.contains("env::var(\"HOSTNAME");
                if algum {
                    achadas.push(format!(
                        "{}:{} — {}\n     a variável é lida aqui; o dono dela é \
                         o crate `{dono}`",
                        f.strip_prefix(&raiz).unwrap_or(&f).display(),
                        i + 1,
                        linha.trim()
                    ));
                }
            }
        }
    }

    assert!(
        achadas.is_empty(),
        "o ambiente é lido fora do `{dono}`:\n  {}\n\
         🔴 Uma variável lida em dois sítios é uma regra em duas versões, e as \
         duas divergem no primeiro caso de borda — que é sempre o que ninguém \
         se lembrava.",
        achadas.join("\n  ")
    );
}

/// Os módulos declarados **na raiz** de um `src/`.
///
/// 🔴 São **dois**, e não um: um crate com `lib.rs` **e** `main.rs` tem duas
/// raízes — a biblioteca e o binário — e cada uma declara os seus módulos. A
/// primeira versão aceitava só uma, e acusou o `main.rs` do Tauri de órfão.
///
/// E é por isso que uma guarda que **grita lobo** é pior do que nenhuma: esta
/// acusou um ficheiro perfeitamente legítimo, e a resposta certa a um falso
/// positivo é corrigir a guarda, não acrescentar uma exceção.
fn modulos_alcancaveis(src: &Path) -> Vec<PathBuf> {
    ["lib.rs", "main.rs"]
        .map(|nome| src.join(nome))
        .into_iter()
        .filter(|p| p.is_file())
        .collect()
}

/// Os nomes de `mod` declarados num ficheiro.
///
/// 🔴 Só `mod X;` e `mod X { … }` com o nome **imediatamente** a seguir. Um
/// `mod` escrito com a assinatura noutra linha (`mod\n  X;`) não é apanhado —
/// e é por isso que a regra do repo é "`mod` na sua linha", escrita num
/// comentário deste ficheiro para quem não leia o código.
fn declaracoes_de_modulo(texto: &str) -> Vec<String> {
    let mut saida = Vec::new();
    for linha in texto.lines() {
        let t = linha.trim_start();
        for palavra in ["mod ", "pub mod "] {
            if let Some(depois) = t.strip_prefix(palavra) {
                let nome: String = depois
                    .trim_start()
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                if !nome.is_empty() {
                    saida.push(nome);
                }
                break;
            }
        }
    }
    saida
}
///
/// Isto não é preciosismo de estilo. Aconteceu **cinco vezes** na mesma
/// semana, na mesma pessoa, em texto que outras pessoas vão ler: caracteres
/// chineses dentro de frases portuguesas, em código de produção e no README.
/// Nenhum `cargo test` apanha aquilo, nenhum `clippy` apanhava aquilo, e o
/// ficheiro ficava no disco para sempre. Foi a guarda que as contou — e
/// contou **cinco** quando eu tinha guardado na memória que foram duas.
///
/// A guarda é **apertada de propósito**: apanha um bloco de texto inteiro, e
/// diz o ficheiro e o número da linha. Um aviso por caractere seria um aviso
/// por ruído — e um aviso por ruído é um aviso que se desliga sozinho.
///
/// # O que é legítimo
///
/// Acento português, `—`, `🔴`, `…` e afins. Numa base de código em português
/// não há nenhum motivo legítimo para CJK, cirílico, árabe, hebraico, devanagari
/// ou thai — e é por isso que a lista pode ser fechada sem falsos positivos.
#[test]
fn nenhum_texto_traz_caracteres_de_outro_alfabeto() {
    const ALFABETOS_ESTRANGEIROS: &[(&str, char, char)] = &[
        ("CJK", '\u{4E00}', '\u{9FFF}'),
        ("extensão CJK", '\u{3400}', '\u{4DBF}'),
        ("hiragana", '\u{3040}', '\u{309F}'),
        ("katakana", '\u{30A0}', '\u{30FF}'),
        ("hangul", '\u{AC00}', '\u{D7AF}'),
        ("cirílico", '\u{0400}', '\u{04FF}'),
        ("arábico", '\u{0600}', '\u{06FF}'),
        ("hebraico", '\u{0590}', '\u{05FF}'),
        ("devanagari", '\u{0900}', '\u{097F}'),
        ("thai", '\u{0E00}', '\u{0E7F}'),
    ];

    let raiz = raiz_do_workspace();
    let achadas = estranho_por_alfabeto(&raiz, ALFABETOS_ESTRANGEIROS);

    assert!(
        achadas.is_empty(),
        "texto com caracteres de outro alfabeto:\n  {}\n\
         Numa base em português isto é sempre um acidente — e um acidente que \
         fica no disco para sempre, porque nenhum compilador o acusa.",
        achadas.join("\n  ")
    );
}

/// Os ficheiros de **texto** do repo, e a linha onde a guarda apanha.
fn estranho_por_alfabeto(raiz: &Path, alfabetos: &[(&str, char, char)]) -> Vec<String> {
    let mut saida = Vec::new();
    for ficheiro in ficheiros_de_texto(raiz) {
        let Ok(texto) = std::fs::read_to_string(&ficheiro) else {
            continue;
        };
        for (i, linha) in texto.lines().enumerate() {
            if let Some(c) = linha.chars().find(|c| {
                alfabetos
                    .iter()
                    .any(|(_, ini, fim)| *c >= *ini && *c <= *fim)
            }) {
                let nome = alfabetos
                    .iter()
                    .find(|(_, ini, fim)| c >= *ini && c <= *fim)
                    .map(|(n, _, _)| *n)
                    .unwrap_or("?");
                saida.push(format!(
                    "{}:{} — {nome} U+{:04X} em {c:?}",
                    ficheiro.strip_prefix(raiz).unwrap_or(&ficheiro).display(),
                    i + 1,
                    c as u32
                ));
            }
        }
    }
    saida
}

/// 🔴 As raízes **vendorizadas**: código de terceiro que vive dentro do repo.
///
/// Um fork traz o texto do upstream, e o upstream escreve em inglês, com
/// japonês nos *drawings* e com carateres de outros alfabetos espalhados pelos
/// documentos. Medido a 30/09/2026: **23 dos 539** ficheiros de texto que a
/// guarda lê em `apps/console/` trazem um alfabeto estranho — e nenhum é meu.
///
/// 🔴 **A resposta a um falso positivo é corrigir a guarda, não desligá-la.** E
/// a correção honesta **não** é "ignora `apps/console`": seria apagar a
/// protecção exactamente do sítio onde eu vou escrever código novo, e o
/// primeiro CJK numa frase minha passava.
///
/// 🔴 **A exclusão deixou de ser uma lista e passou a ser uma pergunta ao
/// `git`** (30/09/2026, D6b). Era o manifesto `.arvore-upstream` — 3014 linhas
/// escritas à mão com o que veio intacto. 🔴 E um manifesto escrito à mão
/// diverge do produto no dia em que alguém mexe num ficheiro e a lista não
/// muda: foi o que aconteceu **nove vezes**, com o portão a contar 17
/// ficheiros editados onde há 25.
///
/// O que ficou é o **commit de importação** da subtree: um ficheiro da árvore é
/// do upstream **intacto** se e só se o `git` disser que não mudou desde a
/// importação. Não há lista para crescer, encolher, nem mentir.
const BOOKMARK_DO_CONSOLE: &str = "ac910bdc023a98b6ee0344351580847dd1b66bb0";
const PREFIXO_VENDORIZADO: &str = "apps/console";

/// Os ficheiros de `apps/console/` que **mudaram** desde a importação.
/// `None` = **o `git` não respondeu**, e isso não é "não mudou nada".
///
/// 🔴 Uma chamada só: são milhares de ficheiros e o `git` já sabe a resposta.
///
/// 🔴 🔴 E o `None` é o lado que decide. A primeira versão devolvia um conjunto
/// **vazio** quando o `git` falhava — e um conjunto vazio diz "não mudou",
/// que faz a guarda **pular a árvore toda**. É o inverso do lado seguro: quando
/// não se sabe, lê-se.
fn alterados_na_arvore_vendorizada(raiz: &Path, bookmark: &str) -> Option<HashSet<PathBuf>> {
    let saida = Command::new("git")
        .args(["-C", &raiz.to_string_lossy()])
        .args([
            "diff",
            "--name-only",
            bookmark,
            "HEAD",
            "--",
            PREFIXO_VENDORIZADO,
        ])
        .output()
        .ok()?;
    if !saida.status.success() {
        return None;
    }
    Some(
        String::from_utf8_lossy(&saida.stdout)
            .lines()
            .filter(|l| !l.trim().is_empty())
            // 🔴 O `git` devolve caminhos com `/` e o `read_dir` dá com `\`, e
            // em Windows `a\b` **não** é `a/b` — o conjunto respondia a uma
            // pergunta diferente da que a guarda fez.
            .map(|l| raiz.join(l.trim().replace('/', std::path::MAIN_SEPARATOR_STR)))
            .collect(),
    )
}

/// Os ficheiros que vieram do upstream **intactos**, por caminho absoluto.
///
/// 🔴 São os da árvore que o `git` diz que **não** mudaram. Quando o `git` não
/// responde, o conjunto sai vazio — que é o mesmo que dizer "não há nada
/// intacto", e portanto **lê-se a árvore toda**.
fn intactos_das_arvores_vendorizadas(raiz: &Path, bookmark: &str) -> HashSet<PathBuf> {
    let alterados = alterados_na_arvore_vendorizada(raiz, bookmark);
    let prefixo = raiz.join(PREFIXO_VENDORIZADO);
    let mut todos = Vec::new();
    todos_os_ficheiros(&prefixo, &mut todos);
    todos
        .into_iter()
        .filter(|p| match &alterados {
            Some(a) => !a.contains(p),
            None => false,
        })
        .collect()
}

/// Todos os ficheiros debaixo de uma pasta, sem filtro de extensão.
///
/// 🔴 🔴 **Não é o `recolher`**, que é o das fontes de produção e só apanha
/// `.rs`. A primeira versão da exclusão usou-o, e o conjunto de "intactos" saiu
/// quase vazio — o que fez a guarda varrer a árvore toda e acusar o upstream.
/// 🔴 E o sintoma foi o pior possível: a guarda a funcionar, o portão a dizer
/// que não havia nada intacto, e **nenhum dos dois com razão aparente**.
fn todos_os_ficheiros(pasta: &Path, saida: &mut Vec<PathBuf>) {
    let Ok(entradas) = std::fs::read_dir(pasta) else {
        return;
    };
    for entrada in entradas.filter_map(|e| e.ok()) {
        let p = entrada.path();
        if p.is_dir() {
            if matches!(
                p.file_name().and_then(|n| n.to_str()),
                Some("node_modules") | Some(".git") | Some("target")
            ) {
                continue;
            }
            todos_os_ficheiros(&p, saida);
        } else {
            saida.push(p);
        }
    }
}

/// Só o que é **texto**, a partir de uma raiz qualquer.
///
/// 🔴 A raiz é um **argumento** e não uma lista de pastas atravessada. A
/// primeira versão varria `crates/`, `apps/`, `verticals/` e `ferramentas/`
/// hard-coded — e o teste que provava que a guarda morde não conseguia correr,
/// porque a árvore temporária dele tem `src/` e nada daquilo. A guarda estava
/// certa e a sua prova mentia; é a mesma armadilha da prova do Construtor, em
/// que a prova mexia no repositório em vez de numa cópia.
fn ficheiros_de_texto(raiz: &Path) -> Vec<PathBuf> {
    let intactos = intactos_das_arvores_vendorizadas(raiz, BOOKMARK_DO_CONSOLE);
    let mut saida = Vec::new();
    recolher_texto(raiz, &intactos, &mut saida);
    saida
}

fn recolher_texto(pasta: &Path, intactos: &HashSet<PathBuf>, saida: &mut Vec<PathBuf>) {
    let Ok(entradas) = std::fs::read_dir(pasta) else {
        return;
    };
    for entrada in entradas.filter_map(|e| e.ok()) {
        let p = entrada.path();
        let nome = p.file_name().map(|n| n.to_string_lossy().to_string());
        // 🔴 `target/` é a pasta que o `cargo` escreve e que o `.gitignore`
        // apaga; varrê-la custaria segundos e não encontraria nada.
        if matches!(
            nome.as_deref(),
            Some("target") | Some(".git") | Some("node_modules")
        ) {
            continue;
        }
        if p.is_dir() {
            recolher_texto(&p, intactos, saida);
        } else if intactos.contains(&p) {
            // 🔴 Upstream intacto: não é nosso, e o nosso trabalho é guardá-lo
            // como está. Se o mexermos, sai da lista — e passa a contar para
            // a divergência, que é a única coisa que o orçamento mede.
            continue;
        } else if matches!(
            p.extension().and_then(|e| e.to_str()),
            Some("rs" | "toml" | "yaml" | "yml" | "json" | "md" | "sh" | "mjs")
        ) {
            saida.push(p);
        }
    }
}

/// 🔴 A guarda tem de **morder** — pelo mesmo motivo da de cima: uma guarda que
/// deixou de procurar dá a mesma resposta verde com e sem defeito.
#[test]
fn a_guarda_do_alfabeto_encontra_o_que_procura() {
    let alfabetos: &[(&str, char, char)] = &[("CJK", '\u{4E00}', '\u{9FFF}')];
    let base = std::env::temp_dir().join(format!("aegis-alfabeto-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    std::fs::create_dir_all(base.join("src")).expect("criar árvore temporária");
    std::fs::write(
        base.join("src/limpo.rs"),
        "// uma frase portuguesa com acentuação: ó, ã, ç\n",
    )
    .expect("escrever o ficheiro limpo");
    std::fs::write(
        base.join("src/estragado.rs"),
        // 🔴 O caractere vem escrito como escape de propósito: um CJK literal
        // aqui dentro faria esta mesma guarda accuse o ficheiro dela própria,
        // que é a forma mais rápida de uma guarda se desligar sozinha.
        "// a phrase \u{9AD8}\u{4F4D} aqui dentro\n",
    )
    .expect("plantar o defeito");

    let achadas = estranho_por_alfabeto(&base, alfabetos);
    let _ = std::fs::remove_dir_all(&base);

    assert_eq!(
        achadas.len(),
        1,
        "a guarda tinha de encontrar UM e encontrou {}: {achadas:?}",
        achadas.len()
    );
    assert!(
        achadas[0].contains("estragado.rs"),
        "achou no ficheiro errado: {achadas:?}"
    );
    // E a acentuação portuguesa **não** pode ser accused — a guarda que acusa
    // o próprio texto do repositorio é uma guarda que se desliga sozinha.
    assert!(
        !achadas.iter().any(|a| a.contains("limpo.rs")),
        "a guarda acusou a acentuação portuguesa"
    );
}

/// 🔴 **A exclusão da árvore vendorizada não pode crescer.**
///
/// A exclusão existe porque o upstream traz 23 ficheiros com alfabetos
/// estranhos. Ela é perigosa por um caminho único: **acrescentar o meu ficheiro
/// à lista**, e a proteção de `equipa/`, do `LEIA-ME.md` e do inventário
/// desaparece — sem uma linha de erro, e sem ninguém a perceber que o lugar
/// onde se escreve código novo deixou de ser lido.
///
/// Por isso esta prova verifica as quatro propriedades que fecham esse
/// caminho, e cada uma delas falha de um jeito diferente.
#[test]
fn a_exclusao_da_arvore_vendorizada_nao_cresce() {
    let raiz = raiz_do_workspace();
    let intactos = intactos_das_arvores_vendorizadas(&raiz, BOOKMARK_DO_CONSOLE);
    let lidos = ficheiros_de_texto(&raiz);

    // 1. 🔴 O `git` **respondeu**. Uma exclusão que não responde não está a
    //    excluir nada e **parece** a que exclui tudo — e é por isso que esta
    //    falha tem de ser vermelha e não um silêncio.
    assert!(
        alterados_na_arvore_vendorizada(&raiz, BOOKMARK_DO_CONSOLE).is_some(),
        "o `git diff` contra {BOOKMARK_DO_CONSOLE} nao respondeu, e a exclusao \
         ficou sem saber. A guarda continua a ler a arvore toda — o lado seguro — \
         mas a protecao deixou de ser do upstream."
    );
    assert!(
        raiz.join(PREFIXO_VENDORIZADO).is_dir(),
        "não há árvore vendorizada em {PREFIXO_VENDORIZADO} — e a exclusão está a \
         proteger um sítio que não existe"
    );

    // 2. A exclusão **exclui alguma coisa**. Uma exclusão que não apanha nada é
    //    código morto que dá a sensação de exclusão.
    assert!(
        !intactos.is_empty(),
        "o `git` diz que nada mudou em {PREFIXO_VENDORIZADO} desde a importacao, \
         e o fork mexe lá dentro. Ou o bookmark não é o da importação, ou o \
         `git diff` está a comparar com o sítio errado."
    );

    // 3. A exclusão **não sai da sua raiz**. Um caminho com `..`, ou uma raiz
    //    errada, deixaria o `crates/` inteiro de fora da guarda por acidente.
    {
        let pasta = raiz.join(PREFIXO_VENDORIZADO);
        for ficheiro in &intactos {
            assert!(
                ficheiro.starts_with(&pasta),
                "a exclusão inclui {}, que está FORA de {PREFIXO_VENDORIZADO} — \
                 uma exclusão que sai da própria árvore deixa o resto do repo \
                 sem guarda",
                ficheiro.display()
            );
        }
    }

    // 4. 🔴 O que eu escrevo dentro da árvore vendorizada **continua lido**.
    //    É esta a propriedade que impede a lista de crescer.
    // 🔴 Só os ficheiros que a guarda **lê** — o manifesto não tem extensão e
    // a guarda não varre ficheiros sem extensão (isso é anterior a este fork e
    // está no `recolher_texto`).
    let nossos = [
        "apps/console/LEIA-ME.md",
        "apps/console/LICENCA-ESTE-FORK.md",
        "apps/console/NOTICE-AEGIS.md",
        "apps/console/equipa/AEGIS.md",
        "apps/console/equipa/PATCHES-AEGIS.md",
        "apps/console/equipa/engine.json",
        "apps/console/equipa/marca.json",
        "apps/console/equipa/mcp.json",
        "apps/console/ferramentas/aegis-que-mente.sh",
    ];
    for relativo in nossos {
        let caminho = raiz.join(relativo);
        assert!(
            caminho.is_file(),
            "{relativo} não existe. A lista `nossos` é o que impede alguém de \
             declarar o nosso texto como 'intacto' — e se o ficheiro sumiu, a \
             lista deixou de proteger o que protegeva."
        );
        assert!(
            !intactos.contains(&caminho),
            "{relativo} está na lista de 'intactos'. Isto é a exclusão a crescer: \
             o nosso texto deixou de ser lido pela guarda. Tira-o de \
             apps/console/.arvore-upstream — ou, se ele passou a ser do upstream, \
             então deixa de ser nosso e tem de sair daqui."
        );
        assert!(
            lidos.contains(&caminho),
            "{relativo} deixou de ser varrido pela guarda, e não está na lista de \
             exclusões. Nenhum dos dois lados devia acontecer."
        );
    }

    // 5. 🔴 E o `.arvore-upstream` **tem de ter desaparecido**. Eram 3014 linhas
    //    que só existiam porque não havia prefixo no `git` — e o `git` passou
    //    a ser a régua. 🔴 Deixá-lo seria a pior das duas: continuaria a ser lido
    //    por quem ainda o usasse, e dois instrumentos a responder à mesma
    //    pergunta é como a divergência divergiu **nove vezes**.
    assert!(
        !raiz.join("apps/console/.arvore-upstream").exists(),
        "o .arvore-upstream ainda existe. A exclusão agora e uma pergunta ao          `git`, e a lista e o instrumento que ja divergiu nove vezes."
    );

    // 🔴 E a coisa que a exclusão **não** pode fazer: sair da sua raiz e deixar
    // o repositório inteiro por ler. Dois ficheiros nossos, longe da árvore
    // vendorizada, têm de continuar varridos.
    for relativo in [
        "apps/bin/tests/regra_do_workspace.rs",
        "crates/aegis-produto/src/ponte.rs",
    ] {
        let caminho = raiz.join(relativo);
        assert!(
            lidos.contains(&caminho),
            "{relativo} deixou de ser varrido. A exclusão da árvore vendorizada \
             não pode alcançar o resto do repositório — e este ficheiro está \
             a provar a si próprio, que é o caso em que mais vale não confiar \
             em nada."
        );
    }
}

/// 🔴 A exclusão é **por ficheiro**, e não por pasta — e a pergunta é ao `git`
/// numa árvore que **é** um repositório.
///
/// 🔴 É uma prova com um `git init` a sério porque a exclusão **é** o `git`. A
/// versão anterior montava uma pasta e escrevia um manifesto à mão: provava
/// que o `grep` lia o ficheiro certo, **não** que a exclusão decidia bem — e
/// sem `.git` a exclusão responde "não sei", que é ler tudo, que é o lado
/// seguro e portanto não prova nada.
#[test]
fn a_exclusao_e_por_ficheiro_e_nao_por_pasta() {
    let alfabetos: &[(&str, char, char)] = &[("CJK", '\u{4E00}', '\u{9FFF}')];
    let base = std::env::temp_dir().join(format!(
        "aegis-vendorizada-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    let console = base.join("apps/console");
    std::fs::create_dir_all(&console).expect("criar árvore temporária");

    // 🔴 O caractere vem escrito como escape de propósito: um CJK literal aqui
    // dentro faria a própria guarda accusing o ficheiro dela.
    std::fs::write(console.join("deles.md"), "// \u{9AD8} o do upstream\n")
        .expect("escrever o ficheiro do upstream");
    // 🔴 O nosso ficheiro **nasce depois** da importação, e é por isso que ele
    // não é escrito aqui. Um ficheiro que estivesse no commit de importação é,
    // para o `git`, do upstream — e está certo. 🔴 A primeira versão desta
    // prova escrevia os dois antes, e o `meu.md` saía da lista por ser
    // indistinguível do upstream: a prova estava a medir um cenário que não
    // existe.

    let git = |args: &[&str]| -> String {
        let saida = Command::new("git")
            .args(["-C", &base.to_string_lossy()])
            .args(args)
            .output()
            .expect("correr o git");
        assert!(
            saida.status.success(),
            "o git {args:?} falhou: {}",
            String::from_utf8_lossy(&saida.stderr)
        );
        String::from_utf8_lossy(&saida.stdout).trim().to_string()
    };
    git(&["init", "-q"]);
    git(&["config", "user.email", "prova@aegis"]);
    git(&["config", "user.name", "prova"]);
    git(&["add", "-A"]);
    git(&["commit", "-q", "-m", "a arvore como veio do upstream"]);
    // 🔴 O bookmark é a commit da **importação**. 🔴 Passar "HEAD" faria
    // `git diff HEAD HEAD`: vazio, **com sucesso**, e sem um único erro — a
    // forma mais cara de um instrumento que não mede.
    let importacao = git(&["rev-parse", "HEAD"]);

    // O nosso ficheiro, agora: acrescentado **depois** da importação, que é
    // exactamente o que um ficheiro nosso é.
    std::fs::write(console.join("meu.md"), "// \u{4F4E} o meu\n")
        .expect("escrever o nosso ficheiro");
    // 🔴 E tem de ser **commitado**, não só posto no índice: a guarda compara
    // `git diff <importação> HEAD`, e o `HEAD` não vê o que está no índice. 🔴 A
    // primeira versão commedia o `add`, e o nosso ficheiro saía da lista — o
    // sintoma era a guarda a funcionar e a prova a dizer que não lia nada.
    git(&["add", "-A"]);
    git(&["commit", "-q", "-m", "o nosso ficheiro"]);

    // 🔴 A mesma pergunta que a guarda real faz, com o mesmo bookmark.
    let lidos = || {
        let mut todos = Vec::new();
        todos_os_ficheiros(&base, &mut todos);
        match alterados_na_arvore_vendorizada(&base, &importacao) {
            Some(alterados) => todos
                .into_iter()
                .filter(|p| !p.starts_with(&console) || alterados.contains(p))
                .collect::<Vec<_>>(),
            // 🔴 Sem `.git` a exclusão responde "não sei" — e "não sei" é
            // **ler tudo**. É o lado seguro, e é o que esta prova mede.
            None => todos,
        }
    };

    let achadas = estranho_por_alfabeto_numa(&base, &lidos(), alfabetos);
    assert_eq!(
        achadas.len(),
        1,
        "devia ser UM (o nosso ficheiro) e foram {}: {achadas:?}\n\
         🔴 Se forem 0, a exclusão virou 'ignora a pasta' e o nosso texto \
         deixou de ser lido. Se forem 2, a exclusão não está a funcionar.",
        achadas.len()
    );
    assert!(
        achadas[0].contains("meu.md"),
        "acusou o ficheiro errado: {achadas:?} — o do upstream é que devia \
         ficar de fora"
    );

    // 🔴 E mexer num ficheiro do upstream **tira-o** da exclusão. É a
    // propriedade que substitui "tirar da lista", e a que uma exclusão por
    // pasta não tem: 🔴 e o sintoma de ter feito o contrário é um CJK ourado no
    // código que acabámos de escrever, dentro do upstream, durante meses.
    std::fs::write(console.join("deles.md"), "// \u{4F4E} mexi no upstream\n")
        .expect("mexer no ficheiro do upstream");
    git(&["add", "-A"]);
    git(&["commit", "-q", "-m", "mexi no upstream"]);
    let achadas = estranho_por_alfabeto_numa(&base, &lidos(), alfabetos);
    assert_eq!(
        achadas.len(),
        2,
        "mexemos no ficheiro do upstream e a guarda continuou a pula-lo. Uma \
         exclusão por pasta faz exactamente isto: {}",
        achadas.join(" | ")
    );

    let _ = std::fs::remove_dir_all(&base);
}

/// 🔴 `estranho_por_alfabeto`, mas a lista de ficheiros **vem de fora**.
///
/// A versão original varre a árvore toda. Esta recebe a lista — que é a
/// exclusão já aplicada — porque a exclusão passou a ser uma **pergunta** e não
/// um filtro dentro do varrimento, e uma prova que volta a varrer tudo mede a
/// pergunta errada.
fn estranho_por_alfabeto_numa(
    raiz: &Path,
    ficheiros: &[PathBuf],
    alfabetos: &[(&str, char, char)],
) -> Vec<String> {
    let mut saida = Vec::new();
    for ficheiro in ficheiros {
        let Ok(texto) = std::fs::read_to_string(ficheiro) else {
            continue;
        };
        for (i, linha) in texto.lines().enumerate() {
            if let Some(c) = linha.chars().find(|c| {
                alfabetos
                    .iter()
                    .any(|(_, ini, fim)| *c >= *ini && *c <= *fim)
            }) {
                let nome = alfabetos
                    .iter()
                    .find(|(_, ini, fim)| c >= *ini && c <= *fim)
                    .map(|(n, _, _)| *n)
                    .unwrap_or("?");
                saida.push(format!(
                    "{}:{} — {nome} U+{:04X} em {c:?}",
                    ficheiro.strip_prefix(raiz).unwrap_or(ficheiro).display(),
                    i + 1,
                    c as u32
                ));
            }
        }
    }
    saida
}

// ═══ D9 — o conhecimento do agente ═══════════════════════════════════════
//
// 🔴 Onde o conhecimento do agente **vive** é uma decisão de produto, e a
// decisão tem um lado perigoso que nenhum teste de conteúdo apanha.
//
// O fork do console traz `apps/console/skills/` e `apps/console/.claude/`.
// Escrever o `AGENTS.md` do AEGIS dentro de uma dessas pastas parece a coisa
// mais óbvia do mundo — é literally onde o motor lê as instruções — e é
// exactamente o erro: um `git pull` do upstream passa por cima, e o `AGENTS.md`
// de um produto passa a ser reescrito por um upgrade de outro. É a mesma classe
// da seed que importava seeds alheias: **conhecimento de um cliente a entrar
// noutro cliente**.
//
// Por isso a casa do conhecimento é `apps/agente/`, e esta guarda diz que
// está lá e que não está nas pastas do upstream.

/// Onde o conhecimento do agente **deve** morar. Nossa, versionada, portável.
const ARVORE_DO_CONHECIMENTO: &str = "apps/agente";

/// Pastas que o **upstream** usa e que por isso são territory dele: o que
/// aparecer lá dentro e não vier no manifesto de intactos é nosso, e nosso
/// ali é defeito.
const PASTAS_RESERVADAS_AO_UPSTREAM: &[&str] = &["apps/console/skills", "apps/console/.claude"];

/// Os ficheiros nossos que apareceram nas pastas do upstream.
///
/// A raiz vem por **argumento** — a mesma lição da guarda do alfabeto: uma
/// guarda que varre pastas hard-coded não consegue ser provada numa árvore
/// temporária, e uma prova que não corre mente verde.
fn conhecimento_fora_das_nossas_pastas(raiz: &Path, bookmark: &str) -> Vec<String> {
    let intactos = intactos_das_arvores_vendorizadas(raiz, bookmark);
    let mut fora = Vec::new();
    for reservada in PASTAS_RESERVADAS_AO_UPSTREAM {
        let pasta = raiz.join(reservada);
        let Ok(entradas) = std::fs::read_dir(&pasta) else {
            continue; // A pasta não existe: nada nosso pode estar lá dentro.
        };
        for entrada in entradas.filter_map(|e| e.ok()) {
            let p = entrada.path();
            // O upstream intacto é **dele**, e o nosso trabalho é guardá-lo.
            if intactos.contains(&p) {
                continue;
            }
            // Uma subpasta recursa: `skills/portaria/` é tão nossa como um
            // ficheiro solto, e é mais fácil de esconder.
            if p.is_dir() {
                for achado in conhecimento_fora_das_nossas_pastas(&p, bookmark) {
                    fora.push(format!("{reservada}/{achado}"));
                }
                continue;
            }
            fora.push(
                p.strip_prefix(raiz)
                    .unwrap_or(&p)
                    .display()
                    // 🔴 Separador normalizado: uma mensagem de guarda com `\`
                    // no Windows e `/` no Linux não é comparável, e uma prova
                    // que só passa numa das plataformas é uma prova que não
                    // prova. O caminho do ficheiro é o mesmo.
                    .to_string()
                    .replace('\\', "/"),
            );
        }
    }
    fora
}

#[test]
fn o_conhecimento_do_agente_mora_na_arvore_dele() {
    let raiz = raiz_do_workspace();

    // 1. A casa do conhecimento **existe** e tem o `AGENTS.md`. Um workspace
    //    vazio é o estado em que o agente corre a não saber de nada — e isso
    //    não se parece com nenhum erro.
    let agents_md = raiz.join(ARVORE_DO_CONHECIMENTO).join("AGENTS.md");
    assert!(
        agents_md.is_file(),
        "{ARVORE_DO_CONHECIMENTO}/AGENTS.md não existe — e o `cwd` do agente é \
         a pasta que a instância declara, portanto o motor não tem onde ler as \
         instruções. É a pasta do D9."
    );

    // 2. **Nada nosso** nas pastas que o upstream usa.
    let fora = conhecimento_fora_das_nossas_pastas(&raiz, BOOKMARK_DO_CONSOLE);
    assert!(
        fora.is_empty(),
        "conhecimento nosso dentro de pastas do upstream:\n  {}\n\
         🔴 O motor lê as instruções de `skills/`, e o `AGENTS.md` do AEGIS \
         escrito ali é reescrito por um `git pull` do upstream — o mesmo \
         defeito da seed que importava seeds alheias. A casa é {ARVORE_DO_CONHECIMENTO}/.",
        fora.join("\n  ")
    );
}

#[test]
fn a_guarda_do_conhecimento_encontra_o_que_procura() {
    let base = std::env::temp_dir().join(format!("aegis-conhecimento-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    // A árvore temporária tem a **mesma forma** da real: as pastas do upstream
    // e a nossa, e um **repositório** — porque a exclusão é uma pergunta ao
    // `git` e uma árvore sem `.git` responde "não sei", que é ler tudo.
    std::fs::create_dir_all(base.join("apps/console/skills")).expect("criar a pasta do upstream");
    std::fs::create_dir_all(base.join(ARVORE_DO_CONHECIMENTO)).expect("criar a nossa");
    std::fs::write(
        base.join("apps/console/skills/deles.md"),
        "# deles
",
    )
    .expect("escrever o ficheiro do upstream");

    let git = |args: &[&str]| -> String {
        let saida = Command::new("git")
            .args(["-C", &base.to_string_lossy()])
            .args(args)
            .output()
            .expect("correr o git");
        assert!(
            saida.status.success(),
            "o git {args:?} falhou: {}",
            String::from_utf8_lossy(&saida.stderr)
        );
        String::from_utf8_lossy(&saida.stdout).trim().to_string()
    };
    git(&["init", "-q"]);
    git(&["config", "user.email", "prova@aegis"]);
    git(&["config", "user.name", "prova"]);
    git(&["add", "-A"]);
    git(&["commit", "-q", "-m", "a arvore como veio do upstream"]);
    // 🔴 O bookmark é a commit da **importação**, e nunca "HEAD": `git diff HEAD
    // HEAD` dá vazio **com sucesso**, que é a forma mais cara de um
    // instrumento que não mede.
    let importacao = git(&["rev-parse", "HEAD"]);

    std::fs::write(
        base.join(ARVORE_DO_CONHECIMENTO).join("AGENTS.md"),
        "# nosso
",
    )
    .expect("escrever o nosso");
    git(&["add", "-A"]);
    git(&["commit", "-q", "-m", "o nosso conhecimento"]);

    // Planta o defeito: o nosso conhecimento dentro da pasta do upstream.
    std::fs::write(
        base.join("apps/console/skills/AGENTS.md"),
        "# nosso, no sitio errado
",
    )
    .expect("plantar o defeito");
    git(&["add", "-A"]);
    git(&["commit", "-q", "-m", "o defeito"]);

    let fora = conhecimento_fora_das_nossas_pastas(&base, &importacao);
    let _ = std::fs::remove_dir_all(&base);

    assert_eq!(
        fora.len(),
        1,
        "devia ser UM (o nosso ficheiro) e foram {}: {fora:?}\n\
         🔴 Se forem 0, a guarda deixou de olhar. Se forem 2, ela está a \
         accusear o upstream — que é tão mau como não acuse nada.",
        fora.len()
    );
    assert!(
        fora[0].contains("skills/AGENTS.md"),
        "acusou o ficheiro errado: {fora:?} — `deles.md` é do upstream e não \
         pode ser acusado"
    );
}

// ═══ D9 — o conhecimento do agente só fala do vocabulário fechado ═════════

/// A referência gerada. É a **única** fonte do que o produto recusa.
const DOCUMENTO_DA_REFERENCIA: &str = "docs/REFERENCIA.md";

/// `familia.motivo`, em minúsculas. O ponto separa a família do motivo, e é o
/// que impede que uma referência a um **ficheiro** (`vertical.yaml`) seja lida
/// como um código de recusa.
fn e_codigo_de_recusa(token: &str) -> bool {
    let Some((familia, motivo)) = token.split_once('.') else {
        return false;
    };
    // `split_once` aceita um segundo ponto: `a.b.c` não é código, é um caminho.
    if motivo.contains('.') {
        return false;
    }
    !familia.is_empty()
        && familia.chars().all(|c| c.is_ascii_lowercase())
        && !motivo.is_empty()
        && motivo
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Os códigos que a referência **declara**, lidos das linhas de tabela.
///
/// 🔴 São lidos do ficheiro, nunca escritos à mão: uma lista escrita à mão
/// diverge da referência no dia em que nasce um motivo — e o dia em que nasce
/// um motivo é exactamente o que esta guarda existe para apanhar.
fn codigos_da_referencia(raiz: &Path) -> HashSet<String> {
    let Ok(texto) = std::fs::read_to_string(raiz.join(DOCUMENTO_DA_REFERENCIA)) else {
        return HashSet::new();
    };
    let mut saida = HashSet::new();
    for linha in texto.lines() {
        let l = linha.trim();
        if !l.starts_with('|') {
            continue;
        }
        let Some(inicio) = l.find('`') else { continue };
        let resto = &l[inicio + 1..];
        let Some(fim) = resto.find('`') else { continue };
        let token = &resto[..fim];
        if e_codigo_de_recusa(token) {
            saida.insert(token.to_string());
        }
    }
    saida
}

fn familias_da_referencia(codigos: &HashSet<String>) -> HashSet<String> {
    codigos
        .iter()
        .filter_map(|c| c.split_once('.').map(|(f, _)| f.to_string()))
        .collect()
}

/// Os candidatos a código num texto: sequências de minúsculas, dígitos, hífen
/// e ponto. Devolve **tudo** o que tem forma de código — quem chama decide o
/// que é nome de ficheiro e o que é recusa nomeada.
fn codigos_num_texto(texto: &str) -> Vec<String> {
    let mut saida = Vec::new();
    let mut atual = String::new();
    for c in texto.chars().chain(std::iter::once(' ')) {
        if c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '.' {
            atual.push(c);
            continue;
        }
        if e_codigo_de_recusa(&atual) {
            saida.push(atual.clone());
        }
        atual.clear();
    }
    saida
}

fn markdown_do_conhecimento(raiz: &Path) -> Vec<PathBuf> {
    let mut saida = Vec::new();
    recolher_markdown(&raiz.join(ARVORE_DO_CONHECIMENTO), &mut saida);
    saida
}

fn recolher_markdown(pasta: &Path, saida: &mut Vec<PathBuf>) {
    let Ok(entradas) = std::fs::read_dir(pasta) else {
        return;
    };
    for entrada in entradas.filter_map(|e| e.ok()) {
        let p = entrada.path();
        if p.is_dir() {
            recolher_markdown(&p, saida);
        } else if p.extension().and_then(|e| e.to_str()) == Some("md") {
            saida.push(p);
        }
    }
}

/// Os códigos que o conhecimento do agente nomeia e a referência **não
/// declara** — o sinal de que o `AGENTS.md` inventou um motivo, e de que o
/// modelo o vai repetir ao operador como se fosse do produto.
fn codigos_inventados(raiz: &Path) -> Vec<String> {
    let codigos = codigos_da_referencia(raiz);
    let familias = familias_da_referencia(&codigos);
    let mut fora = Vec::new();
    for ficheiro in markdown_do_conhecimento(raiz) {
        let Ok(texto) = std::fs::read_to_string(&ficheiro) else {
            continue;
        };
        let caminho = ficheiro
            .strip_prefix(raiz)
            .unwrap_or(&ficheiro)
            .display()
            .to_string();
        let mut vistas: HashSet<String> = HashSet::new();
        for codigo in codigos_num_texto(&texto) {
            let Some((familia, _)) = codigo.split_once('.') else {
                continue;
            };
            // 🔴 Só o que está numa **família conhecida** é recusa nomeada.
            // `vertical.yaml` casa a forma e não é código — e uma guarda que
            // accuse o nome de um ficheiro desliga-se sozinha no primeiro
            // ficheiro que alguém escrever.
            if !familias.contains(familia) || codigos.contains(&codigo) {
                continue;
            }
            if vistas.insert(codigo.clone()) {
                fora.push(format!("{caminho}: {codigo}"));
            }
        }
    }
    fora
}

#[test]
fn so_o_vocabulario_fechado_e_falado_pelo_agente() {
    let raiz = raiz_do_workspace();

    // 1. A referência **foi lida**. 🔴 Uma guarda que não descobre nada e se
    //    declara verde é pior do que nenhuma — foi o que o portão da divergência
    //    fez, imprimindo `linhas: 0` e `OK` sem conseguir ler o upstream. Se o
    //    parsing partir, isto é um **vermelho**, não um "não há códigos
    //    inventados".
    let codigos = codigos_da_referencia(&raiz);
    assert!(
        !codigos.is_empty(),
        "nenhum código foi lido de {DOCUMENTO_DA_REFERENCIA} — a guarda que \
         segue está a medir o nada. Ou a referência mudou de forma, ou esta \
         guarda deixou de a ler."
    );
    assert!(
        codigos.len() >= 50,
        "só {} códigos lidos de {DOCUMENTO_DA_REFERENCIA}, e o documento tem 53 \
         motivos: o parsing está a perder linhas.",
        codigos.len()
    );

    let fora = codigos_inventados(&raiz);
    assert!(
        fora.is_empty(),
        "o conhecimento do agente nomeia recusas que o produto não declara:\n  {}\n\
         🔴 O `AGENTS.md` é lido por um **modelo**. Um código que não existe \
         ensina-o a fabricar recusas — e o operador recebe um motivo que o \
         produto nunca disse.",
        fora.join("\n  ")
    );
}

#[test]
fn a_guarda_dos_codigos_encontra_o_que_procura() {
    let base = std::env::temp_dir().join(format!("aegis-codigos-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    std::fs::create_dir_all(base.join(ARVORE_DO_CONHECIMENTO)).expect("criar a nossa");
    std::fs::create_dir_all(base.join("docs")).expect("criar a docs");
    // Uma referência em miniatura, com a **forma** real: linha de tabela e
    // código entre plicas.
    std::fs::write(
        base.join(DOCUMENTO_DA_REFERENCIA),
        "| `pronto.seed-desatualizado` | s | g |\n| `pagina.variavel-pendente` | s | g |\n",
    )
    .expect("escrever a referência");
    std::fs::write(
        base.join(ARVORE_DO_CONHECIMENTO).join("AGENTS.md"),
        "usa `pronto.seed-desatualizado` e `vertical.yaml`, e inventou \
         `pronto.seed-desatualisado`.\n",
    )
    .expect("plantar o defeito");

    let fora = codigos_inventados(&base);
    let _ = std::fs::remove_dir_all(&base);

    assert_eq!(
        fora.len(),
        1,
        "devia ser UM (o código inventado) e foram {}: {fora:?}",
        fora.len()
    );
    assert!(
        fora[0].contains("pronto.seed-desatualisado"),
        "acusou a coisa errada: {fora:?} — `pronto.seed-desatualizado` existe na \
         referência e `vertical.yaml` não é um código de recusa"
    );
}
