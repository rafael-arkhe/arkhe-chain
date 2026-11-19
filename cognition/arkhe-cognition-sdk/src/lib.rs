//! Restricted cognition-facing data and immutable evidence snapshots.
//! This API carries no signing, persistence or authorization capability.
//! A host must authenticate evidence before supplying a snapshot.
#![forbid(unsafe_code)]

pub use arkhe_core::evidence::EvidenceEnvelope;
pub use arkhe_core::{CanonicalEncode, Digest32};
pub mod output_proof {
    pub use arkhe_core::output_proof::*;
}
pub mod formal_proof {
    pub use arkhe_core::formal_proof::*;
}
pub mod worker {
    pub use arkhe_core::worker::WorkerExecutionRecord;
}
pub mod work {
    pub use arkhe_core::work::{
        ContextEntry, ContextKind, RequestIdentity, WorkIntent, WorkIntentType,
    };
}

mod sealed {
    pub trait Sealed {}
}

/// A sealed description of the only authority available through this SDK.
///
/// ```compile_fail
/// use arkhe_cognition_sdk::CognitionAuthority;
/// struct Elevated;
/// impl CognitionAuthority for Elevated {}
/// ```
pub trait CognitionAuthority: sealed::Sealed {}

/// A marker, never a credential or a proof that arbitrary code is harmless.
/// Its private field prevents callers from forging SDK authority values.
///
/// ```compile_fail
/// use arkhe_cognition_sdk::NoSigningAuthority;
/// let forged = NoSigningAuthority {};
/// ```
#[derive(Debug)]
pub struct NoSigningAuthority {
    _private: (),
}
impl sealed::Sealed for NoSigningAuthority {}
impl CognitionAuthority for NoSigningAuthority {}

/// An owned snapshot, with no callback, database handle or mutable host access.
/// Construction does not verify evidence: admission is the host's responsibility.
/// Duplicate record identities are rejected, including identical duplicates.
///
/// ```compile_fail
/// use arkhe_cognition_sdk::EvidenceReader;
/// let reader = EvidenceReader::from_snapshot(Vec::new()).unwrap();
/// reader.append_verified(todo!());
/// ```
///
/// ```compile_fail
/// use arkhe_cognition_sdk::{EvidenceReader, Digest32};
/// let reader = EvidenceReader::from_snapshot(Vec::new()).unwrap();
/// reader.sign(Digest32::ZERO);
/// ```
///
/// ```compile_fail
/// use arkhe_cognition_sdk::{EvidenceReader, Digest32};
/// let mut reader = EvidenceReader::from_snapshot(Vec::new()).unwrap();
/// reader.get_mut(Digest32::ZERO);
/// ```
///
/// The value returned by `get` cannot be changed through a shared reference.
///
/// ```compile_fail,E0594
/// use arkhe_cognition_sdk::{EvidenceReader, Digest32};
/// fn overwrite_field(reader: &EvidenceReader, id: Digest32) {
///     let evidence = reader.get(id).unwrap();
///     evidence.kind = String::from("forged");
/// }
/// ```
///
/// ```compile_fail,E0594
/// use arkhe_cognition_sdk::{EvidenceReader, EvidenceEnvelope, Digest32};
/// fn replace_record(reader: &EvidenceReader, id: Digest32, other: EvidenceEnvelope) {
///     let evidence = reader.get(id).unwrap();
///     *evidence = other;
/// }
/// ```
///
/// ```compile_fail,E0596
/// use arkhe_cognition_sdk::{EvidenceReader, Digest32};
/// fn mutate_string(reader: &EvidenceReader, id: Digest32) {
///     reader.get(id).unwrap().kind.clear();
/// }
/// ```
///
/// ```compile_fail,E0596
/// use arkhe_cognition_sdk::{EvidenceReader, Digest32};
/// fn mutate_parents(reader: &EvidenceReader, id: Digest32) {
///     reader.get(id).unwrap().causal_parents.push(id);
/// }
/// ```
///
/// Normal shared reads remain available.
///
/// ```
/// use arkhe_cognition_sdk::{EvidenceReader, EvidenceEnvelope, Digest32};
/// let record = EvidenceEnvelope {
///     record_hash: Digest32::ZERO, kind: "observed".into(),
///     subject: Digest32::ZERO, payload_digest: Digest32::ZERO,
///     policy_digest: None, causal_parents: vec![],
/// };
/// let reader = EvidenceReader::from_snapshot(vec![record]).unwrap();
/// assert_eq!(reader.get(Digest32::ZERO).unwrap().kind, "observed");
/// ```
#[derive(Debug)]
pub struct EvidenceReader {
    records: std::collections::HashMap<Digest32, EvidenceEnvelope>,
    authority: NoSigningAuthority,
}
impl EvidenceReader {
    pub fn from_snapshot(records: Vec<EvidenceEnvelope>) -> Result<Self, &'static str> {
        let mut snapshot = std::collections::HashMap::new();
        for record in records {
            if snapshot.insert(record.record_hash, record).is_some() {
                return Err("duplicate evidence identity");
            }
        }
        Ok(Self {
            records: snapshot,
            authority: NoSigningAuthority { _private: () },
        })
    }
    pub fn get(&self, record_hash: Digest32) -> Option<&EvidenceEnvelope> {
        self.records.get(&record_hash)
    }
    pub fn authority(&self) -> &NoSigningAuthority {
        &self.authority
    }
}

/// Bytes the host actually received. Payload, record, subject and policy are
/// separate hashes. `record_hash` may differ from `payload_digest`; custody does.
pub struct PresentedEvidence<'a> {
    pub envelope: EvidenceEnvelope,
    pub payload_domain: &'a [u8],
    pub payload: &'a [u8],
    pub record_domain: &'a [u8],
    pub record_bytes: &'a [u8],
    pub subject_domain: &'a [u8],
    pub subject_bytes: &'a [u8],
    pub policy_domain: &'a [u8],
    pub policy: &'a [u8],
}

/// Host boundary in front of `EvidenceReader`. The reader still does not
/// authenticate evidence. This gate checks the presented bytes, then rejects
/// an unauthenticated hash, a missing causal parent, a duplicate in the batch,
/// and a hash already admitted. Each successful snapshot contains every record
/// admitted so far, so a later record can read its causal parent. A failed
/// batch leaves that history unchanged. It does not replace runtime isolation.
#[derive(Debug, Default)]
pub struct HostAdmission {
    admitted: std::collections::HashSet<Digest32>,
    history: Vec<EvidenceEnvelope>,
}
impl HostAdmission {
    pub fn admit(
        &mut self,
        records: Vec<PresentedEvidence<'_>>,
    ) -> Result<EvidenceReader, &'static str> {
        if records.is_empty() {
            return Err("empty admission");
        }
        let mut batch = std::collections::HashSet::new();
        let mut envelopes = Vec::with_capacity(records.len());
        for record in &records {
            if record.payload_domain.is_empty()
                || Digest32::blake3(record.payload_domain, record.payload)
                    != record.envelope.payload_digest
            {
                return Err("payload digest does not match presented bytes");
            }
            let kind = record.envelope.kind.as_str();
            if record.envelope.record_hash == Digest32::ZERO
                || record.envelope.subject == Digest32::ZERO
                || kind.is_empty()
                || kind != kind.trim()
            {
                return Err("unauthenticated evidence");
            }
            if record.record_domain.is_empty()
                || Digest32::blake3(record.record_domain, record.record_bytes)
                    != record.envelope.record_hash
            {
                return Err("record hash does not match presented bytes");
            }
            if record.subject_domain.is_empty()
                || Digest32::blake3(record.subject_domain, record.subject_bytes)
                    != record.envelope.subject
            {
                return Err("subject digest does not match presented bytes");
            }
            match record.envelope.policy_digest {
                None => {
                    if !record.policy_domain.is_empty() || !record.policy.is_empty() {
                        return Err("policy digest does not match presented bytes");
                    }
                }
                Some(expected) => {
                    if record.policy_domain.is_empty()
                        || Digest32::blake3(record.policy_domain, record.policy) != expected
                    {
                        return Err("policy digest does not match presented bytes");
                    }
                }
            }
            if self.admitted.contains(&record.envelope.record_hash) {
                return Err("replayed evidence");
            }
            for parent in &record.envelope.causal_parents {
                if *parent == record.envelope.record_hash
                    || (!self.admitted.contains(parent) && !batch.contains(parent))
                {
                    return Err("causal parent is not an earlier admitted record");
                }
            }
            if !batch.insert(record.envelope.record_hash) {
                return Err("duplicate evidence identity");
            }
            envelopes.push(record.envelope.clone());
        }
        let mut history = self.history.clone();
        history.extend(envelopes);
        let reader = EvidenceReader::from_snapshot(history.clone())?;
        self.admitted.extend(batch);
        self.history = history;
        Ok(reader)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn evidence() -> EvidenceEnvelope {
        EvidenceEnvelope {
            record_hash: Digest32::ZERO,
            kind: "test".into(),
            subject: Digest32::ZERO,
            payload_digest: Digest32::ZERO,
            policy_digest: None,
            causal_parents: vec![],
        }
    }
    #[test]
    fn snapshot_reads_without_mutating_host_data() {
        let original = evidence();
        let reader = EvidenceReader::from_snapshot(vec![original.clone()]).unwrap();
        assert_eq!(reader.get(original.record_hash), Some(&original));
        assert!(reader.get(Digest32::blake3(b"test", b"missing")).is_none());
        let mut detached = reader.get(original.record_hash).unwrap().clone();
        detached.kind = "changed".into();
        assert_eq!(reader.get(original.record_hash).unwrap().kind, "test");
        fn restricted<T: CognitionAuthority>(_: &T) {}
        restricted(reader.authority());
    }
    // Exhaustive destructuring deliberately breaks if fields are added. The
    // inferred generic type must be one of these exact owned data types; a
    // deref coercion cannot hide an interior-mutable wrapper.
    #[test]
    fn evidence_fields_remain_plain_owned_data() {
        trait PlainField {}
        impl PlainField for String {}
        impl PlainField for Digest32 {}
        impl PlainField for Option<Digest32> {}
        impl PlainField for Vec<Digest32> {}
        fn plain<T: PlainField>(_: &T) {}
        let record = evidence();
        let EvidenceEnvelope {
            record_hash,
            kind,
            subject,
            payload_digest,
            policy_digest,
            causal_parents,
        } = &record;
        plain(record_hash);
        plain(kind);
        plain(subject);
        plain(payload_digest);
        plain(policy_digest);
        plain(causal_parents);
        // Digest32 is itself exhaustively checked down to a byte array.
        let Digest32(bytes) = record.record_hash;
        let _: [u8; 32] = bytes;
    }

    #[test]
    fn conflicting_snapshot_fails_closed() {
        let a = evidence();
        let mut b = a.clone();
        b.kind = "conflict".into();
        assert!(EvidenceReader::from_snapshot(vec![a.clone(), a.clone()]).is_err());
        assert!(EvidenceReader::from_snapshot(vec![a, b]).is_err());
    }

    fn presented(
        byte: u8,
        payload: &[u8],
        parents: Vec<Digest32>,
    ) -> (EvidenceEnvelope, Vec<u8>, Vec<u8>, Vec<u8>) {
        let owned = payload.to_vec();
        let record_bytes = [b"record-".as_slice(), &[byte]].concat();
        let subject_bytes = [b"subject-".as_slice(), &[byte]].concat();
        let digest = Digest32::blake3(b"AKG:SDK:TEST:PAYLOAD:v1\0", &owned);
        (
            EvidenceEnvelope {
                record_hash: Digest32::blake3(b"AKG:SDK:TEST:RECORD:v1\0", &record_bytes),
                kind: "observed".into(),
                subject: Digest32::blake3(b"AKG:SDK:TEST:SUBJECT:v1\0", &subject_bytes),
                payload_digest: digest,
                policy_digest: None,
                causal_parents: parents,
            },
            owned,
            record_bytes,
            subject_bytes,
        )
    }

    fn present<'a>(
        envelope: &'a EvidenceEnvelope,
        payload: &'a [u8],
        record_bytes: &'a [u8],
        subject_bytes: &'a [u8],
    ) -> PresentedEvidence<'a> {
        PresentedEvidence {
            envelope: envelope.clone(),
            payload_domain: b"AKG:SDK:TEST:PAYLOAD:v1\0",
            payload,
            record_domain: b"AKG:SDK:TEST:RECORD:v1\0",
            record_bytes,
            subject_domain: b"AKG:SDK:TEST:SUBJECT:v1\0",
            subject_bytes,
            policy_domain: b"",
            policy: b"",
        }
    }

    #[test]
    fn host_rejects_unauthenticated_duplicate_and_replay() {
        let mut host = HostAdmission::default();
        assert_eq!(host.admit(vec![]).unwrap_err(), "empty admission");
        let (zero, zero_payload, zero_record, zero_subject) = presented(0, b"zero", vec![]);
        let mut zero = zero;
        zero.record_hash = Digest32::ZERO;
        assert_eq!(
            host.admit(vec![present(
                &zero,
                &zero_payload,
                &zero_record,
                &zero_subject
            )])
            .unwrap_err(),
            "unauthenticated evidence"
        );
        let (mut bare_subject, bare_payload, bare_record, bare_subject_bytes) =
            presented(6, b"bare-subject", vec![]);
        bare_subject.subject = Digest32::ZERO;
        assert_eq!(
            host.admit(vec![present(
                &bare_subject,
                &bare_payload,
                &bare_record,
                &bare_subject_bytes
            )])
            .unwrap_err(),
            "unauthenticated evidence"
        );
        let (mut spaced, spaced_payload, spaced_record, spaced_subject) =
            presented(7, b"spaced", vec![]);
        spaced.kind = " observed".into();
        assert_eq!(
            host.admit(vec![present(
                &spaced,
                &spaced_payload,
                &spaced_record,
                &spaced_subject
            )])
            .unwrap_err(),
            "unauthenticated evidence"
        );
        let (first, first_payload, first_record, first_subject) = presented(1, b"first", vec![]);
        assert_ne!(first.record_hash, first.payload_digest);
        let reader = host
            .admit(vec![present(
                &first,
                &first_payload,
                &first_record,
                &first_subject,
            )])
            .unwrap();
        assert_eq!(reader.get(first.record_hash).unwrap().kind, "observed");
        assert_eq!(
            host.admit(vec![present(
                &first,
                &first_payload,
                &first_record,
                &first_subject
            )])
            .unwrap_err(),
            "replayed evidence"
        );
        let mut flipped = first_payload.clone();
        flipped[0] ^= 1;
        let (other, _, other_record, other_subject) = presented(4, b"other", vec![]);
        assert_eq!(
            host.admit(vec![present(
                &other,
                &flipped,
                &other_record,
                &other_subject
            )])
            .unwrap_err(),
            "payload digest does not match presented bytes"
        );
        let mut flipped_record = first_record.clone();
        flipped_record[0] ^= 1;
        let (bound, bound_payload, _, bound_subject) = presented(5, b"bound", vec![]);
        assert_eq!(
            host.admit(vec![present(
                &bound,
                &bound_payload,
                &flipped_record,
                &bound_subject
            )])
            .unwrap_err(),
            "record hash does not match presented bytes"
        );
        let (subject_env, subject_payload, subject_record, subject_bytes) =
            presented(8, b"subject", vec![]);
        let mut flipped_subject = subject_bytes.clone();
        flipped_subject[0] ^= 1;
        assert_eq!(
            host.admit(vec![present(
                &subject_env,
                &subject_payload,
                &subject_record,
                &flipped_subject
            )])
            .unwrap_err(),
            "subject digest does not match presented bytes"
        );
        let (mut policy_env, policy_payload, policy_record, policy_subject) =
            presented(9, b"policy", vec![]);
        let policy_bytes = b"policy-body".to_vec();
        policy_env.policy_digest =
            Some(Digest32::blake3(b"AKG:SDK:TEST:POLICY:v1\0", &policy_bytes));
        let mut policy_item = present(
            &policy_env,
            &policy_payload,
            &policy_record,
            &policy_subject,
        );
        policy_item.policy_domain = b"AKG:SDK:TEST:POLICY:v1\0";
        let mut flipped_policy = policy_bytes.clone();
        flipped_policy[0] ^= 1;
        policy_item.policy = &flipped_policy;
        assert_eq!(
            host.admit(vec![policy_item]).unwrap_err(),
            "policy digest does not match presented bytes"
        );
        let mut policy_item = present(
            &policy_env,
            &policy_payload,
            &policy_record,
            &policy_subject,
        );
        policy_item.policy_domain = b"AKG:SDK:TEST:POLICY:v1\0";
        let (open_env, open_payload, open_record, open_subject) = presented(10, b"open", vec![]);
        let mut open_item = present(&open_env, &open_payload, &open_record, &open_subject);
        open_item.policy = b"x";
        assert_eq!(
            host.admit(vec![open_item]).unwrap_err(),
            "policy digest does not match presented bytes"
        );
        policy_item.policy = &policy_bytes;
        host.admit(vec![policy_item]).unwrap();
        let (fresh, fresh_payload, fresh_record, fresh_subject) = presented(11, b"fresh", vec![]);
        let (missing, missing_payload, missing_record, missing_subject) =
            presented(3, b"missing", vec![Digest32([9; 32])]);
        assert!(host
            .admit(vec![
                present(&fresh, &fresh_payload, &fresh_record, &fresh_subject),
                present(
                    &missing,
                    &missing_payload,
                    &missing_record,
                    &missing_subject
                )
            ])
            .is_err());
        host.admit(vec![present(
            &fresh,
            &fresh_payload,
            &fresh_record,
            &fresh_subject,
        )])
        .unwrap();
        let (child, child_payload, child_record, child_subject) =
            presented(2, b"child", vec![first.record_hash]);
        assert!(host
            .admit(vec![
                present(&child, &child_payload, &child_record, &child_subject),
                present(&child, &child_payload, &child_record, &child_subject)
            ])
            .is_err());
        assert_eq!(
            host.admit(vec![present(
                &missing,
                &missing_payload,
                &missing_record,
                &missing_subject
            )])
            .unwrap_err(),
            "causal parent is not an earlier admitted record"
        );
        let reader = host
            .admit(vec![present(
                &child,
                &child_payload,
                &child_record,
                &child_subject,
            )])
            .unwrap();
        assert_eq!(
            reader.get(child.record_hash).unwrap().causal_parents.len(),
            1
        );
        assert_eq!(reader.get(first.record_hash).unwrap().kind, "observed");
        let (parent, parent_payload, parent_record, parent_subject) =
            presented(14, b"parent", vec![]);
        let (late, late_payload, late_record, late_subject) =
            presented(15, b"late", vec![parent.record_hash]);
        assert_eq!(
            host.admit(vec![
                present(&late, &late_payload, &late_record, &late_subject),
                present(&parent, &parent_payload, &parent_record, &parent_subject),
            ])
            .unwrap_err(),
            "causal parent is not an earlier admitted record"
        );
        let parent_reader = host
            .admit(vec![present(
                &parent,
                &parent_payload,
                &parent_record,
                &parent_subject,
            )])
            .unwrap();
        assert!(parent_reader.get(late.record_hash).is_none());
        let late_reader = host
            .admit(vec![present(
                &late,
                &late_payload,
                &late_record,
                &late_subject,
            )])
            .unwrap();
        assert_eq!(
            late_reader.get(late.record_hash).unwrap().causal_parents,
            vec![parent.record_hash]
        );
        assert!(late_reader.get(parent.record_hash).is_some());
    }
}
