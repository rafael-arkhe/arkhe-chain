//! RFC 8949 length-first deterministic CBOR over the JSON data model.
//! Floating point values are rejected. Text map keys sort by encoded length, then bytes.
use serde::Serialize;
use serde_json::Value;

fn head(out: &mut Vec<u8>, major: u8, n: u64) {
    let tag = major << 5;
    if n < 24 {
        out.push(tag | n as u8);
    } else if n <= 0xff {
        out.extend([tag | 24, n as u8]);
    } else if n <= 0xffff {
        out.push(tag | 25);
        out.extend((n as u16).to_be_bytes());
    } else if n <= 0xffffffff {
        out.push(tag | 26);
        out.extend((n as u32).to_be_bytes());
    } else {
        out.push(tag | 27);
        out.extend(n.to_be_bytes());
    }
}
fn encode(v: &Value, out: &mut Vec<u8>) -> Result<(), crate::Error> {
    match v {
        Value::Null => out.push(0xf6),
        Value::Bool(b) => out.push(if *b { 0xf5 } else { 0xf4 }),
        Value::Number(n) => {
            if let Some(n) = n.as_u64() {
                head(out, 0, n);
            } else if let Some(n) = n.as_i64() {
                head(out, 1, (-1i128 - n as i128) as u64);
            } else {
                return Err(crate::Error::Encoding(
                    "floating point is outside this profile".into(),
                ));
            }
        }
        Value::String(s) => {
            head(out, 3, s.len() as u64);
            out.extend(s.as_bytes());
        }
        Value::Array(a) => {
            head(out, 4, a.len() as u64);
            for x in a {
                encode(x, out)?;
            }
        }
        Value::Object(m) => {
            let mut entries = Vec::new();
            for (k, v) in m {
                let mut key = Vec::new();
                encode(&Value::String(k.clone()), &mut key)?;
                entries.push((key, v));
            }
            entries.sort_by(|a, b| a.0.len().cmp(&b.0.len()).then(a.0.cmp(&b.0)));
            head(out, 5, entries.len() as u64);
            for (k, v) in entries {
                out.extend(k);
                encode(v, out)?;
            }
        }
    }
    Ok(())
}
pub fn canonical<T: Serialize>(value: &T) -> Result<Vec<u8>, crate::Error> {
    let value = serde_json::to_value(value).map_err(|e| crate::Error::Encoding(e.to_string()))?;
    let mut out = Vec::new();
    encode(&value, &mut out)?;
    Ok(out)
}
