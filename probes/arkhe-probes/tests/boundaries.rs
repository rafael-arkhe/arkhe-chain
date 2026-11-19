use arkhe_barrier::preempt::{preempt, Preemption};
use arkhe_barrier::{admit, Channel, HoldReason, Release};
use arkhe_state::{atomic, journal, resume, Kind, Resume, UnavailableReason};

#[test]
fn every_channel_stays_unmediated() {
    for channel in [
        Channel::Network,
        Channel::Filesystem,
        Channel::LocalIpc,
        Channel::SharedMemory,
    ] {
        assert_eq!(
            admit(b"probe", channel),
            Release::Held(HoldReason::Unmediated)
        );
    }
}

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

#[test]
fn state_identifiers_are_distinct_plain_values_without_resuming() {
    assert_eq!(atomic::Step(1), atomic::Step(1));
    assert_ne!(atomic::Step(1), atomic::Step(2));
    assert_eq!(journal::Tx(1), journal::Tx(1));
    assert_ne!(journal::Tx(1), journal::Tx(2));
}

#[test]
fn preemption_is_not_implemented() {
    assert_eq!(preempt(), Preemption::NotImplemented);
}
