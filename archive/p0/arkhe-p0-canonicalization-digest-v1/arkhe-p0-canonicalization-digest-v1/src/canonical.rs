use std::cmp::Ordering;
use std::fmt;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CanonicalValue {
    Null,
    Bool(bool),
    Unsigned(u64),
    Negative(i64),
    Bytes(Vec<u8>),
    Text(String),
    Array(Vec<CanonicalValue>),
    /// Map entries are accepted in arbitrary order.
    /// Canonical encoding sorts by encoded key length and then lexicographically.
    /// Duplicate canonical keys are rejected.
    Map(Vec<(CanonicalValue, CanonicalValue)>),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CanonicalError {
    InvalidNegativeInteger(i64),
    DuplicateMapKey,
    LengthOverflow,
}

impl fmt::Display for CanonicalError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidNegativeInteger(v) => write!(f, "negative integer variant requires value < 0, got {v}"),
            Self::DuplicateMapKey => write!(f, "duplicate canonical map key"),
            Self::LengthOverflow => write!(f, "value length does not fit canonical CBOR length"),
        }
    }
}

impl std::error::Error for CanonicalError {}

pub fn canonical_bytes(value: &CanonicalValue) -> Result<Vec<u8>, CanonicalError> {
    let mut out = Vec::new();
    encode_value(value, &mut out)?;
    Ok(out)
}

fn encode_value(value: &CanonicalValue, out: &mut Vec<u8>) -> Result<(), CanonicalError> {
    match value {
        CanonicalValue::Null => out.push(0xf6),
        CanonicalValue::Bool(false) => out.push(0xf4),
        CanonicalValue::Bool(true) => out.push(0xf5),
        CanonicalValue::Unsigned(v) => encode_head(0, *v, out),
        CanonicalValue::Negative(v) => {
            if *v >= 0 {
                return Err(CanonicalError::InvalidNegativeInteger(*v));
            }
            // CBOR negative integer n is encoded as -1 - n in major type 1.
            let n = (-1i128 - i128::from(*v)) as u64;
            encode_head(1, n, out);
        }
        CanonicalValue::Bytes(bytes) => {
            let len = u64::try_from(bytes.len()).map_err(|_| CanonicalError::LengthOverflow)?;
            encode_head(2, len, out);
            out.extend_from_slice(bytes);
        }
        CanonicalValue::Text(text) => {
            let bytes = text.as_bytes();
            let len = u64::try_from(bytes.len()).map_err(|_| CanonicalError::LengthOverflow)?;
            encode_head(3, len, out);
            out.extend_from_slice(bytes);
        }
        CanonicalValue::Array(items) => {
            let len = u64::try_from(items.len()).map_err(|_| CanonicalError::LengthOverflow)?;
            encode_head(4, len, out);
            for item in items {
                encode_value(item, out)?;
            }
        }
        CanonicalValue::Map(entries) => {
            let mut encoded = Vec::with_capacity(entries.len());
            for (key, value) in entries {
                let key_bytes = canonical_bytes(key)?;
                let value_bytes = canonical_bytes(value)?;
                encoded.push((key_bytes, value_bytes));
            }

            encoded.sort_by(|a, b| {
                let len_cmp = a.0.len().cmp(&b.0.len());
                if len_cmp == Ordering::Equal {
                    a.0.cmp(&b.0)
                } else {
                    len_cmp
                }
            });

            for pair in encoded.windows(2) {
                if pair[0].0 == pair[1].0 {
                    return Err(CanonicalError::DuplicateMapKey);
                }
            }

            let len = u64::try_from(encoded.len()).map_err(|_| CanonicalError::LengthOverflow)?;
            encode_head(5, len, out);
            for (key, value) in encoded {
                out.extend_from_slice(&key);
                out.extend_from_slice(&value);
            }
        }
    }
    Ok(())
}

fn encode_head(major: u8, value: u64, out: &mut Vec<u8>) {
    let prefix = major << 5;
    match value {
        0..=23 => out.push(prefix | value as u8),
        24..=0xff => {
            out.push(prefix | 24);
            out.push(value as u8);
        }
        0x100..=0xffff => {
            out.push(prefix | 25);
            out.extend_from_slice(&(value as u16).to_be_bytes());
        }
        0x1_0000..=0xffff_ffff => {
            out.push(prefix | 26);
            out.extend_from_slice(&(value as u32).to_be_bytes());
        }
        _ => {
            out.push(prefix | 27);
            out.extend_from_slice(&value.to_be_bytes());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_order_is_canonical() {
        let a = CanonicalValue::Map(vec![
            (CanonicalValue::Text("b".into()), CanonicalValue::Unsigned(2)),
            (CanonicalValue::Text("a".into()), CanonicalValue::Unsigned(1)),
        ]);
        let b = CanonicalValue::Map(vec![
            (CanonicalValue::Text("a".into()), CanonicalValue::Unsigned(1)),
            (CanonicalValue::Text("b".into()), CanonicalValue::Unsigned(2)),
        ]);
        assert_eq!(canonical_bytes(&a).unwrap(), canonical_bytes(&b).unwrap());
    }

    #[test]
    fn duplicate_keys_fail_closed() {
        let value = CanonicalValue::Map(vec![
            (CanonicalValue::Text("a".into()), CanonicalValue::Unsigned(1)),
            (CanonicalValue::Text("a".into()), CanonicalValue::Unsigned(2)),
        ]);
        assert_eq!(canonical_bytes(&value), Err(CanonicalError::DuplicateMapKey));
    }

    #[test]
    fn shortest_integer_encoding_is_used() {
        assert_eq!(canonical_bytes(&CanonicalValue::Unsigned(23)).unwrap(), vec![0x17]);
        assert_eq!(canonical_bytes(&CanonicalValue::Unsigned(24)).unwrap(), vec![0x18, 0x18]);
        assert_eq!(
            canonical_bytes(&CanonicalValue::Unsigned(256)).unwrap(),
            vec![0x19, 0x01, 0x00]
        );
    }
}
