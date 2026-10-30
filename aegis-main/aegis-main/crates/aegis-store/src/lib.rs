//! **aegis-store** — o Postgres do AEGIS, e a costura que o núcleo anterior
//! não tinha.
//!
//! # As três regras que este crate existe para
//!
//! 1. **Uma autoridade de schema.** As migrações da pasta `migracoes/` são a
//!    única fonte, com checksum conferido. O núcleo anterior tinha duas em
//!    disputa — `create_all` e o carimbo de Alembic — e a frota pagou com
//!    `DuplicateColumnError` numa noite de março.
//!
//! 2. **Toda a SQL vive aqui.** O `PgPool` não sai deste crate. O que o
//!    núcleo anterior tinha era o contrário: 457 de 700 arquivos com
//!    `AsyncSession` na mão, sem nenhuma costura onde uma mudança fosse
//!    segura. É daí que vem "cada vez que mexo é dias e dias".
//!
//! 3. **O isolamento é do banco.** `aegis.tenant_id` é um GUC de sessão lido
//!    por políticas RLS, e toda leitura e escrita passa por
//!    [`pool::com_tenant`]. A aplicação pode errar; a política, não.

mod erro;
mod migracoes;
mod pool;
mod repo;

pub use erro::{ErroStore, Resultado};
pub use migracoes::{aplicar, versao_do_schema};
pub use pool::{ROLE_DE_APP, abrir, ligar_dono, preparar_role_de_app, url_do_app, vivo};
pub use repo::{Isolamento, Objeto, Repo, Tenant};
