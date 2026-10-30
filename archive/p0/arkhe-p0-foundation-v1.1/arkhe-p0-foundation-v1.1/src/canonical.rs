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
    Map(Vec<(CanonicalValue, CanonicalValue)>),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CanonicalError {
    InvalidNegativeInteger(i64),
    DuplicateMapKey,
    LengthOverflow,
    UnexpectedEof,
    TrailingBytes,
    UnsupportedMajorType(u8),
    UnsupportedSimpleValue(u8),
    FloatForbidden,
    TagForbidden,
    IndefiniteLengthForbidden,
    NonShortestInteger,
    InvalidUtf8,
    NonCanonicalMapOrder,
}

impl fmt::Display for CanonicalError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        use CanonicalError::*;
        match self {
            InvalidNegativeInteger(v) => write!(f, "negative integer variant requires value < 0, got {v}"),
            DuplicateMapKey => write!(f, "duplicate canonical map key"),
            LengthOverflow => write!(f, "value length does not fit canonical CBOR length"),
            UnexpectedEof => write!(f, "unexpected end of input"),
            TrailingBytes => write!(f, "trailing bytes after canonical object"),
            UnsupportedMajorType(v) => write!(f, "unsupported CBOR major type {v}"),
            UnsupportedSimpleValue(v) => write!(f, "unsupported CBOR simple value {v:#x}"),
            FloatForbidden => write!(f, "floating point values are forbidden by the Arkhe profile"),
            TagForbidden => write!(f, "CBOR tags are forbidden by the Arkhe profile"),
            IndefiniteLengthForbidden => write!(f, "indefinite-length CBOR is forbidden"),
            NonShortestInteger => write!(f, "integer/length is not encoded in shortest form"),
            InvalidUtf8 => write!(f, "text string is not valid UTF-8"),
            NonCanonicalMapOrder => write!(f, "map keys are not in deterministic canonical order"),
        }
    }
}

impl std::error::Error for CanonicalError {}

pub fn canonical_bytes(value: &CanonicalValue) -> Result<Vec<u8>, CanonicalError> {
    let mut out = Vec::new();
    encode_value(value, &mut out)?;
    Ok(out)
}

/// Strict decoder for the restricted Arkhe deterministic-CBOR profile.
/// It rejects non-canonical encodings rather than normalizing them.
pub fn decode_canonical(input: &[u8]) -> Result<CanonicalValue, CanonicalError> {
    let mut pos = 0usize;
    let value = decode_value(input, &mut pos)?;
    if pos != input.len() {
        return Err(CanonicalError::TrailingBytes);
    }
    Ok(value)
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
            let n = (-1i128 - i128::from(*v)) as u64;
            encode_head(1, n, out);
        }
        CanonicalValue::Bytes(bytes) => {
            encode_head(2, u64::try_from(bytes.len()).map_err(|_| CanonicalError::LengthOverflow)?, out);
            out.extend_from_slice(bytes);
        }
        CanonicalValue::Text(text) => {
            let bytes = text.as_bytes();
            encode_head(3, u64::try_from(bytes.len()).map_err(|_| CanonicalError::LengthOverflow)?, out);
            out.extend_from_slice(bytes);
        }
        CanonicalValue::Array(items) => {
            encode_head(4, u64::try_from(items.len()).map_err(|_| CanonicalError::LengthOverflow)?, out);
            for item in items {
                encode_value(item, out)?;
            }
        }
        CanonicalValue::Map(entries) => {
            let mut encoded = Vec::with_capacity(entries.len());
            for (key, value) in entries {
                encoded.push((canonical_bytes(key)?, canonical_bytes(value)?));
            }
            encoded.sort_by(|a, b| canonical_key_cmp(&a.0, &b.0));
            for pair in encoded.windows(2) {
                if pair[0].0 == pair[1].0 {
                    return Err(CanonicalError::DuplicateMapKey);
                }
            }
            encode_head(5, u64::try_from(encoded.len()).map_err(|_| CanonicalError::LengthOverflow)?, out);
            for (key, value) in encoded {
                out.extend_from_slice(&key);
                out.extend_from_slice(&value);
            }
        }
    }
    Ok(())
}

fn decode_value(input: &[u8], pos: &mut usize) -> Result<CanonicalValue, CanonicalError> {
    let initial = *input.get(*pos).ok_or(CanonicalError::UnexpectedEof)?;
    *pos += 1;

    let major = initial >> 5;
    let ai = initial & 0x1f;

    match major {
        0 => Ok(CanonicalValue::Unsigned(read_arg(input, pos, ai)?)),
        1 => {
            let n = read_arg(input, pos, ai)?;
            if n > i64::MAX as u64 {
                return Err(CanonicalError::LengthOverflow);
            }
            Ok(CanonicalValue::Negative(-1 - (n as i64)))
        }
        2 => {
            let len = read_len(input, pos, ai)?;
            let bytes = take(input, pos, len)?.to_vec();
            Ok(CanonicalValue::Bytes(bytes))
        }
        3 => {
            let len = read_len(input, pos, ai)?;
            let raw = take(input, pos, len)?;
            let text = std::str::from_utf8(raw).map_err(|_| CanonicalError::InvalidUtf8)?;
            Ok(CanonicalValue::Text(text.to_owned()))
        }
        4 => {
            let len = read_len(input, pos, ai)?;
            let mut items = Vec::with_capacity(len);
            for _ in 0..len {
                items.push(decode_value(input, pos)?);
            }
            Ok(CanonicalValue::Array(items))
        }
        5 => {
            let len = read_len(input, pos, ai)?;
            let mut entries = Vec::with_capacity(len);
            let mut previous_key_bytes: Option<Vec<u8>> = None;

            for _ in 0..len {
                let key_start = *pos;
                let key = decode_value(input, pos)?;
                let key_bytes = input[key_start..*pos].to_vec();

                if let Some(prev) = &previous_key_bytes {
                    match canonical_key_cmp(prev, &key_bytes) {
                        Ordering::Less => {}
                        Ordering::Equal => return Err(CanonicalError::DuplicateMapKey),
                        Ordering::Greater => return Err(CanonicalError::NonCanonicalMapOrder),
                    }
                }
                previous_key_bytes = Some(key_bytes);
                let value = decode_value(input, pos)?;
                entries.push((key, value));
            }
            Ok(CanonicalValue::Map(entries))
        }
        6 => Err(CanonicalError::TagForbidden),
        7 => match ai {
            20 => Ok(CanonicalValue::Bool(false)),
            21 => Ok(CanonicalValue::Bool(true)),
            22 => Ok(CanonicalValue::Null),
            25 | 26 | 27 => Err(CanonicalError::FloatForbidden),
            31 => Err(CanonicalError::IndefiniteLengthForbidden),
            other => Err(CanonicalError::UnsupportedSimpleValue(other)),
        },
        other => Err(CanonicalError::UnsupportedMajorType(other)),
    }
}

fn read_len(input: &[u8], pos: &mut usize, ai: u8) -> Result<usize, CanonicalError> {
    if ai == 31 {
        return Err(CanonicalError::IndefiniteLengthForbidden);
    }
    usize::try_from(read_arg(input, pos, ai)?).map_err(|_| CanonicalError::LengthOverflow)
}

fn read_arg(input: &[u8], pos: &mut usize, ai: u8) -> Result<u64, CanonicalError> {
    match ai {
        0..=23 => Ok(ai as u64),
        24 => {
            let v = take(input, pos, 1)?[0] as u64;
            if v < 24 { return Err(CanonicalError::NonShortestInteger); }
            Ok(v)
        }
        25 => {
            let b = take(input, pos, 2)?;
            let v = u16::from_be_bytes([b[0], b[1]]) as u64;
            if v <= 0xff { return Err(CanonicalError::NonShortestInteger); }
            Ok(v)
        }
        26 => {
            let b = take(input, pos, 4)?;
            let v = u32::from_be_bytes([b[0], b[1], b[2], b[3]]) as u64;
            if v <= 0xffff { return Err(CanonicalError::NonShortestInteger); }
            Ok(v)
        }
        27 => {
            let b = take(input, pos, 8)?;
            let v = u64::from_be_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]);
            if v <= 0xffff_ffff { return Err(CanonicalError::NonShortestInteger); }
            Ok(v)
        }
        31 => Err(CanonicalError::IndefiniteLengthForbidden),
        _ => Err(CanonicalError::UnsupportedSimpleValue(ai)),
    }
}

fn take<'a>(input: &'a [u8], pos: &mut usize, len: usize) -> Result<&'a [u8], CanonicalError> {
    let end = pos.checked_add(len).ok_or(CanonicalError::LengthOverflow)?;
    if end > input.len() {
        return Err(CanonicalError::UnexpectedEof);
    }
    let slice = &input[*pos..end];
    *pos = end;
    Ok(slice)
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

fn canonical_key_cmp(a: &[u8], b: &[u8]) -> Ordering {
    a.len().cmp(&b.len()).then_with(|| a.cmp(b))
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
    fn strict_decoder_rejects_non_shortest_integer() {
        assert_eq!(decode_canonical(&[0x18, 0x17]), Err(CanonicalError::NonShortestInteger));
    }

    #[test]
    fn strict_decoder_rejects_indefinite_array() {
        assert_eq!(decode_canonical(&[0x9f, 0x01, 0xff]), Err(CanonicalError::IndefiniteLengthForbidden));
    }

    #[test]
    fn strict_decoder_rejects_float() {
        assert_eq!(decode_canonical(&[0xf9, 0x00, 0x00]), Err(CanonicalError::FloatForbidden));
    }

    #[test]
    fn strict_decoder_rejects_invalid_utf8() {
        assert_eq!(decode_canonical(&[0x61, 0xff]), Err(CanonicalError::InvalidUtf8));
    }

    #[test]
    fn strict_decoder_rejects_noncanonical_map_order() {
        // {"b": 2, "a": 1}
        let raw = [0xa2, 0x61, b'b', 0x02, 0x61, b'a', 0x01];
        assert_eq!(decode_canonical(&raw), Err(CanonicalError::NonCanonicalMapOrder));
    }
}
