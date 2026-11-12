//! An append-only in-process MMR. Persistence and external anchoring are adapters.
pub mod mmr;
pub mod transparency;
pub use mmr::*;
pub use transparency::{accept_external_witness, local_checkpoint, transparency_status};
