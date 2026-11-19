//! Resume of work. Distinct from the audit log and from consensus.
//!
//! Neither store is implemented. `resume` reports that, and a new store kind
//! has to be named in the match.

pub mod atomic;
pub mod journal;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Atomic,
    Journal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnavailableReason {
    NotImplemented,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Resume {
    Unavailable(UnavailableReason),
}

pub fn resume(kind: Kind) -> Resume {
    match kind {
        Kind::Atomic | Kind::Journal => Resume::Unavailable(UnavailableReason::NotImplemented),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn neither_store_resumes() {
        assert_eq!(
            resume(Kind::Atomic),
            Resume::Unavailable(UnavailableReason::NotImplemented)
        );
        assert_eq!(
            resume(Kind::Journal),
            Resume::Unavailable(UnavailableReason::NotImplemented)
        );
    }
}
