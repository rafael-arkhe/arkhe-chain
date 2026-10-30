//! A referência tem de estar **em dia com o código**.
//!
//! 🔴 `aegis referencia` gerar o ficheiro é uma coisa; alguém correr isso é
//! outra. Sem uma prova, o ficheiro diverge no primeiro comando novo e passa a
//! descrever um produto que não existe — e a documentação errada é pior do que
//! a inexistente, porque **parece** a verdade.
//!
//! E o que se prova aqui é a referência gerada, contra a **gerada outra vez**:
//! o binário é corrido com `--verificar`, que sai com `3` se o ficheiro não
//! bater. É a mesma propriedade que o `--help` tem com a árvore de comandos, e
//! é medida contra o **binário** — não contra uma função chamada de outro
//! lado, que provaria a função e não o produto.

use std::path::{Path, PathBuf};
use std::process::Command;

fn raiz() -> PathBuf {
    // `apps/bin` -> `apps` -> a raiz
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .expect("a raiz do workspace")
        .to_path_buf()
}

fn binario() -> PathBuf {
    // 🔴 O caminho vem do **Cargo**, e não de `target/debug`.
    //
    // A versão anterior escrevia `target/debug/aegis[.exe]` à mão, e isso
    // partiu-se no dia em que `CARGO_TARGET_DIR` passou a apontar para outro
    // disco — que é o que a casa faz, porque o `target` são 20 GB e o `C:`
    // encheu. `CARGO_BIN_EXE_<nome>` é o caminho que o Cargo garante, e ele
    // funciona em qualquer configuração.
    PathBuf::from(env!("CARGO_BIN_EXE_aegis"))
}

fn referencia() -> PathBuf {
    raiz().join("docs/REFERENCIA.md")
}

#[test]
fn a_referencia_esta_em_dia_com_o_codigo() {
    // 🔴 O caminho vai **absoluto**, e não a omissão do `--saida`.
    //
    // A primeira versão deixou o default e a prova deu FALHA com a referência
    // acabada de gerar: o `--saida` cai para `docs/REFERENCIA.md`, relativo ao
    // **CWD**, e o CWD de um teste de integração é `apps/bin` — onde não há
    // pasta `docs`. A prova estava a verificar um ficheiro que não existe e a
    // dizer que estava desatualizado.
    //
    // É o mesmo alçapão que já mordeu em `um_produto.rs`, e é a segunda vez
    // neste repo. O sintoma é sempre o mesmo — "a prova falha e o ficheiro
    // está certo" — e a causa é sempre uma: um caminho que depende de onde se
    // está de pé.
    let saida = Command::new(binario())
        .args([
            "referencia",
            "--verificar",
            "--saida",
            referencia().to_str().expect("caminho"),
        ])
        .output();

    let saida = saida.unwrap_or_else(|e| {
        panic!(
            "não corri {}: {e}\n\
             🔴 Esta prova mede o BINÁRIO. Sem ele compilado, ela não tem o que \
             medir — e uma prova que não mede nada tem de ser vermelha.",
            binario().display()
        )
    });

    assert_eq!(
        saida.status.code(),
        Some(0),
        "a referência está desatualizada:\n{}\n\
         🔴 Gere-a com: aegis referencia",
        String::from_utf8_lossy(&saida.stderr)
    );
}

/// 🔴 **A guarda tem de morder.** Uma guarda que passa porque deixou de
/// procurar dá a mesma resposta verde com e sem defeito.
#[test]
fn a_guarda_da_referencia_encontra_o_que_procura() {
    // Uma referência num sítio qualquer, com o conteúdo trocado.
    let falso =
        std::env::temp_dir().join(format!("aegis-referencia-{}-falsa.md", std::process::id()));
    std::fs::write(&falso, "# isto não é a referência\n").expect("escrever a falsa");

    let saida = Command::new(binario())
        .args([
            "referencia",
            "--verificar",
            "--saida",
            falso.to_str().expect("caminho"),
        ])
        .output()
        .expect("correr o binário");
    let _ = std::fs::remove_file(&falso);

    // E tem de recusar com `3` — não com `1`, porque um ficheiro desatualizado
    // é um pedido legítimo a que o ficheiro não corresponde, e não uma falha.
    assert_eq!(
        saida.status.code(),
        Some(3),
        "uma referência que não bate com o código tem de RECUSAR (3), e não \
         falhar (1) nem passar (0)"
    );
    let texto = String::from_utf8_lossy(&saida.stderr);
    assert!(
        texto.contains("referencia.desatualizada"),
        "a recusa tem de trazer o código: {texto}"
    );
}

/// O ficheiro **tem de existir** no repositório.
///
/// 🔴 `--verificar` diz que um ficheiro que não existe está desatualizado, e
/// isso está certo para a máquina. Mas para o repositório é outra conversa: se
/// o ficheiro não estiver versionado, a prova passa (o binário geraria-o) e o
/// `git` fica sem ele — que é a armadilha do `/*` do `.gitignore` da raiz,
/// já experienceda na casa com o `.github/` e com a pasta da CI.
#[test]
fn a_referencia_esta_no_repositorio() {
    assert!(
        referencia().is_file(),
        "{} não existe.\n\
         🔴 Gere-a com `aegis referencia` e **versione-a** — uma referência \
         gerada que não está no repositório não é documentação, é um artefacto \
         de uma máquina.",
        referencia().display()
    );
    let texto = std::fs::read_to_string(referencia()).expect("ler a referência");
    assert!(
        texto.contains("Gerada a partir do código"),
        "a referência não diz que é gerada — e o aviso é a primeira coisa que \
         impede alguém de a editar à mão"
    );
}
