//! Separate process boundary for effects.
//!
//! `admit` holds every channel because mediation is not implemented. A new
//! channel has to be named in the match, and the only result is hold.

pub mod preempt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HoldReason {
    Unmediated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Release {
    Held(HoldReason),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Channel {
    Network,
    Filesystem,
    LocalIpc,
    SharedMemory,
}

pub fn admit(_effect_id: &[u8], channel: Channel) -> Release {
    match channel {
        Channel::Network | Channel::Filesystem | Channel::LocalIpc | Channel::SharedMemory => {
            Release::Held(HoldReason::Unmediated)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_channel_is_held_unmediated() {
        for channel in [
            Channel::Network,
            Channel::Filesystem,
            Channel::LocalIpc,
            Channel::SharedMemory,
        ] {
            assert_eq!(
                admit(b"effect", channel),
                Release::Held(HoldReason::Unmediated)
            );
        }
    }

    #[test]
    fn preemption_is_not_implemented() {
        assert_eq!(preempt::preempt(), preempt::Preemption::NotImplemented);
    }
}
