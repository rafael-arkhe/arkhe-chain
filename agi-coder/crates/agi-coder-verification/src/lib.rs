//! Specification-owned oracle and mutation campaign contracts.
//! This is a finite-domain engine, not an automatic natural-language test generator.
pub mod mutation;
pub mod oracle;
pub mod process;
pub mod spec_verifier;
pub use mutation::*;
pub use oracle::*;
pub use process::*;
pub use spec_verifier::*;
