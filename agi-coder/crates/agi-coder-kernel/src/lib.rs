//! The gate issues an authorization capability only after evidence validation.
pub mod containment;
pub mod evidence_store;
pub mod policy;
pub use containment::*;
pub use evidence_store::*;
pub use policy::*;
