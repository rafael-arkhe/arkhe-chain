//! RFC 8785 (JCS) canonicalization plus the strict parse that AID v1.0-rc5
//! requires before an `aid` may be computed.
//!
//! JCS alone does not reject what the AID parse stage must reject: duplicate
//! object members, floating point numbers, and integers outside the
//! interoperable safe range `[-(2^53 - 1), 2^53 - 1]`. Those are refused here,
//! before canonicalization, so that two independent implementations either
//! agree on the bytes or refuse the input.

use serde::de::{self, Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};
use std::cmp::Ordering;
use std::collections::BTreeSet;
use std::fmt;

/// `2^53 - 1`: the largest integer every RFC 8259 reader represents exactly.
pub const MAX_SAFE_INT: i64 = 9_007_199_254_740_991;

/// A JSON value that survived the strict parse. Object members keep their
/// input order; canonicalization is what sorts them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Strict {
    Null,
    Bool(bool),
    Int(i64),
    Str(String),
    Array(Vec<Strict>),
    Object(Vec<(String, Strict)>),
}

impl Strict {
    /// Parse strict JSON. The error string names the rule that refused it.
    pub fn parse(bytes: &[u8]) -> Result<Self, String> {
        serde_json::from_slice::<Strict>(bytes).map_err(|e| e.to_string())
    }

    /// Object member lookup. `None` for every other kind of value.
    pub fn get(&self, key: &str) -> Option<&Strict> {
        match self {
            Strict::Object(members) => members.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    /// The RFC 8785 serialization: members ordered by UTF-16 code units,
    /// recursively, with no insignificant whitespace.
    pub fn canonical_bytes(&self) -> Vec<u8> {
        let mut out = Vec::new();
        write_canonical(self, &mut out);
        out
    }

    /// Projection into `serde_json::Value`, for typed schema validation after
    /// the strict parse has already fixed the bytes.
    pub fn to_json(&self) -> serde_json::Value {
        match self {
            Strict::Null => serde_json::Value::Null,
            Strict::Bool(b) => serde_json::Value::Bool(*b),
            Strict::Int(i) => serde_json::Value::from(*i),
            Strict::Str(s) => serde_json::Value::String(s.clone()),
            Strict::Array(items) => {
                serde_json::Value::Array(items.iter().map(Strict::to_json).collect())
            }
            Strict::Object(members) => {
                let mut map = serde_json::Map::with_capacity(members.len());
                for (key, member) in members {
                    map.insert(key.clone(), member.to_json());
                }
                serde_json::Value::Object(map)
            }
        }
    }
}

/// Lexicographic order over UTF-16 code units, which is the JCS sort and not
/// the order of Rust's `str` comparison outside the BMP.
fn utf16_cmp(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

fn write_canonical(value: &Strict, out: &mut Vec<u8>) {
    match value {
        Strict::Null => out.extend_from_slice(b"null"),
        Strict::Bool(true) => out.extend_from_slice(b"true"),
        Strict::Bool(false) => out.extend_from_slice(b"false"),
        Strict::Int(i) => out.extend_from_slice(i.to_string().as_bytes()),
        Strict::Str(s) => write_string(s, out),
        Strict::Array(items) => {
            out.push(b'[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(b',');
                }
                write_canonical(item, out);
            }
            out.push(b']');
        }
        Strict::Object(members) => {
            let mut sorted: Vec<&(String, Strict)> = members.iter().collect();
            sorted.sort_by(|a, b| utf16_cmp(&a.0, &b.0));
            out.push(b'{');
            for (i, (key, member)) in sorted.iter().enumerate() {
                if i > 0 {
                    out.push(b',');
                }
                write_string(key, out);
                out.push(b':');
                write_canonical(member, out);
            }
            out.push(b'}');
        }
    }
}

/// Minimal escapes, as RFC 8785 inherits them from ECMAScript `JSON.stringify`:
/// quote, reverse solidus, the five short control escapes, and `\u00xx` for the
/// remaining C0 controls. Everything else stays literal UTF-8.
fn write_string(s: &str, out: &mut Vec<u8>) {
    out.push(b'"');
    for ch in s.chars() {
        match ch {
            '"' => out.extend_from_slice(b"\\\""),
            '\\' => out.extend_from_slice(b"\\\\"),
            '\u{8}' => out.extend_from_slice(b"\\b"),
            '\u{9}' => out.extend_from_slice(b"\\t"),
            '\u{a}' => out.extend_from_slice(b"\\n"),
            '\u{c}' => out.extend_from_slice(b"\\f"),
            '\u{d}' => out.extend_from_slice(b"\\r"),
            c if (c as u32) < 0x20 => {
                out.extend_from_slice(format!("\\u{:04x}", c as u32).as_bytes());
            }
            c => {
                let mut buf = [0u8; 4];
                out.extend_from_slice(c.encode_utf8(&mut buf).as_bytes());
            }
        }
    }
    out.push(b'"');
}

impl<'de> Deserialize<'de> for Strict {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(StrictVisitor)
    }
}

struct StrictVisitor;

impl<'de> Visitor<'de> for StrictVisitor {
    type Value = Strict;

    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("JSON without floats, oversized integers or duplicate keys")
    }

    fn visit_unit<E: de::Error>(self) -> Result<Strict, E> {
        Ok(Strict::Null)
    }

    fn visit_bool<E: de::Error>(self, v: bool) -> Result<Strict, E> {
        Ok(Strict::Bool(v))
    }

    fn visit_i64<E: de::Error>(self, v: i64) -> Result<Strict, E> {
        if !(-MAX_SAFE_INT..=MAX_SAFE_INT).contains(&v) {
            return Err(E::custom(format!("integer {v} outside the safe range")));
        }
        Ok(Strict::Int(v))
    }

    fn visit_u64<E: de::Error>(self, v: u64) -> Result<Strict, E> {
        if v > MAX_SAFE_INT as u64 {
            return Err(E::custom(format!("integer {v} outside the safe range")));
        }
        Ok(Strict::Int(v as i64))
    }

    fn visit_f64<E: de::Error>(self, v: f64) -> Result<Strict, E> {
        Err(E::custom(format!(
            "floating point number {v} is not admitted"
        )))
    }

    fn visit_str<E: de::Error>(self, v: &str) -> Result<Strict, E> {
        Ok(Strict::Str(v.to_owned()))
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Strict, A::Error> {
        let mut items = Vec::new();
        while let Some(item) = seq.next_element()? {
            items.push(item);
        }
        Ok(Strict::Array(items))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Strict, A::Error> {
        let mut members: Vec<(String, Strict)> = Vec::new();
        let mut seen: BTreeSet<String> = BTreeSet::new();
        while let Some((key, value)) = map.next_entry::<String, Strict>()? {
            if !seen.insert(key.clone()) {
                return Err(de::Error::custom(format!(
                    "duplicate object member {key:?}"
                )));
            }
            members.push((key, value));
        }
        Ok(Strict::Object(members))
    }
}
