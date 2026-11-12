//! Library surface for the `agi` and `agi-coder` binaries.
//!
//! The operator console and the terminal share these calls. Neither path
//! grants execution authority.

pub mod arc3;
pub mod cockpit;
pub mod observe;
pub mod ops;
pub mod pending;
pub mod serve;
