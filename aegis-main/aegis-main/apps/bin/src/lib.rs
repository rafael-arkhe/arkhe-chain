//! O `aegis` compilado **também** como biblioteca — e só para as provas.
//!
//! 🔴 Porque existe: a integração `tests/quatro_faces.rs` precisa de contar a
//! lista de ferramentas do `mcp`, e essa lista vive dentro do binário. A
//! alternativa era a prova reescrevê-la, e reescrever é a **segunda lista** — a
//! casa mediu que duas listas divergem, e a divergência de um `tools/list` só
//! se descobre em produção, com um modelo a chamar uma ferramenta que não
//! existe.
//!
//! 🔴 **O que esta biblioteca NÃO é:** um pacote com duas entradas.
//! Não há `crate-type = ["cdylib"]`, não há `dylib`, e o `aegis` continua a
//! ser **um** executável — o `aegis mcp` é um subcomando, e a regra da casa é
//! *"um produto com dois programas é um produto com dois modos de divergir"*.
//! Esta é a segunda compilação do **mesmo** código, não um segundo programa.
//!
//! 🔴 E os módulos são `pub` todos, e não um `provas::` que reexporta o que
//! calha: um `mod` privado seria uma lista de "o que as provas podem ver", e
//! essa lista divergiria do código no dia em que uma prova precisasse de outra
//! coisa. Tudo o que o binário tem, a prova vê.

pub mod mcp;

// 🔴 A `referencia` **não** vem aqui, e a razão é o que ela mede.
//
// A referência gerada lê a árvore de comandos pelo `clap` de `main.rs` — e esse
// `Cli` é do **binário**. Trazer `main.rs` para a biblioteca seria compilar a
// casca duas vezes e acabar com dois `Cli` que divergem no primeiro subcomando
// novo, que é exactamente o defeito que a referência existe para matar.
//
// A prova `tests/referencia.rs` continua a verificar pelo binário construído
// (`aegis referencia --verificar`), e essa é a forma honesta: o que se prova é
// o **executável**, não uma biblioteca que só existe para o teste.
