//! Experimental protocol. Mock platform attestations are explicitly opt-in.
pub mod anchor;
pub mod arkhe;
pub mod crypto;
pub mod destination;
pub mod protocol;
pub mod store;
pub mod stripe_test;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("protocol rejected: {0}")]
    Rejected(&'static str),
    #[error("database: {0}")]
    Database(#[from] sqlx::Error),
    #[error("encoding: {0}")]
    Encoding(#[from] serde_json::Error),
    #[error("migration: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),
}
pub type Result<T> = std::result::Result<T, Error>;
pub(crate) fn require(ok: bool, reason: &'static str) -> Result<()> {
    if ok {
        Ok(())
    } else {
        Err(Error::Rejected(reason))
    }
}
