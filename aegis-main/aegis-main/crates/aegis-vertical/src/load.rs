//! Carregar um vertical do disco.
//!
//! A ordem é **fixa** e cada passo diz por que falhou:
//! existe → lê → parse → valida referências internas → valida ficheiros.
//! Um passo nunca é pulado em silêncio.

use std::path::{Path, PathBuf};

use crate::error::ManifestError;
use crate::manifest::{Manifesto, NOME_MANIFESTO};

/// Carrega o vertical da pasta dada.
///
/// A pasta tem de conter um `vertical.yaml`. O `Manifesto.pasta` gravado é a
/// pasta canónica, para que `paginas[].ficheiro` e `saude.*` resolvam contra
/// ela e não contra o diretório de trabalho de quem chamou.
pub fn carregar(pasta: &Path) -> Result<Manifesto, ManifestError> {
    let caminho = pasta.join(NOME_MANIFESTO);
    if !caminho.is_file() {
        return Err(if pasta.is_dir() {
            ManifestError::NaoEhVertical {
                caminho: pasta.to_path_buf(),
                falta: NOME_MANIFESTO,
            }
        } else {
            ManifestError::NaoEncontrado {
                caminho: caminho.clone(),
            }
        });
    }

    let texto = std::fs::read_to_string(&caminho).map_err(|fonte| ManifestError::Leitura {
        caminho: caminho.clone(),
        fonte,
    })?;

    let mut manifesto: Manifesto =
        serde_yaml::from_str(&texto).map_err(|fonte| ManifestError::Parse { fonte })?;

    manifesto.pasta = pasta.to_path_buf();
    manifesto.validar()?;
    validar_ficheiros(&manifesto)?;

    Ok(manifesto)
}

/// Referências internas já foram conferidas. Falta o **disco**: um vertical
/// que declara uma página que não existe instala e depois mostra menu morto.
fn validar_ficheiros(manifesto: &Manifesto) -> Result<(), ManifestError> {
    for pagina in &manifesto.paginas {
        let caminho = manifesto.pasta.join(&pagina.ficheiro);
        if !caminho.is_file() {
            return Err(ManifestError::FicheiroAusente { caminho });
        }
    }
    for lista in [&manifesto.saude.exigido, &manifesto.saude.opcional] {
        for entrada in lista {
            // 🔴 `@algo` é uma checagem **embutida**: a ilha é que sabe se a
            // implementa, e este crate não pode saber — a dependência vai
            // para o lado certo. Exigir que exista um ficheiro seria dizer
            // que toda a verificação é um script, e foi o que obrigou um
            // vertical a escrever um drop-in só para alcançar a base de dados
            // que a ilha já tem ligada dentro dela.
            if entrada.to_string_lossy().starts_with('@') {
                continue;
            }
            // `saude.d` é a convenção greenboot: o caminho é relativo à
            // pasta do vertical e aponta para um executável dentro dele.
            let caminho = normalizar(&manifesto.pasta.join(entrada));
            if !caminho.is_file() {
                return Err(ManifestError::FicheiroAusente { caminho });
            }
        }
    }
    Ok(())
}

/// `saude.d/exigido/x.sh` é relativo à **raiz** da ilha em muitos desenhos,
/// mas relativo ao vertical é mais simples de entregar (a pasta do vertical
/// viaja inteira). Aceitamos os dois: `./`, `saude.d/…` a partir do vertical.
fn normalizar(caminho: &Path) -> PathBuf {
    let mut saida = PathBuf::new();
    for componente in caminho.components() {
        match componente {
            std::path::Component::CurDir => {}
            c => saida.push(c),
        }
    }
    saida
}

/// Lista os verticais de uma pasta que contenha verticais.
///
/// Usado pela CLI para mostrar o catálogo. **Um vertical que não carrega é
/// erro, não aviso**: um catálogo que esconde um vertical quebrado é um
/// catálogo que mente.
pub fn listar(raiz: &Path) -> Result<Vec<Manifesto>, ManifestError> {
    let entradas = std::fs::read_dir(raiz).map_err(|fonte| ManifestError::Leitura {
        caminho: raiz.to_path_buf(),
        fonte,
    })?;

    let mut pastas: Vec<PathBuf> = entradas
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_dir() && crate::manifest::parece_vertical(p))
        .collect();
    pastas.sort();

    let mut saida = Vec::with_capacity(pastas.len());
    for pasta in pastas {
        saida.push(carregar(&pasta)?);
    }
    Ok(saida)
}
