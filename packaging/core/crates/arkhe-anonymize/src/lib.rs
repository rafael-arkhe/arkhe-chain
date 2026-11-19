//! Suppression of direct identifiers before a record can leave the process.
//!
//! A released payload is not an ANPD anonymization opinion. The engine does not
//! store a reverse map, does not query SERPRO, and does not submit to ANPD.

use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::BTreeMap;

const LABELS: &[&str] = &[
    "nome", "name", "email", "e-mail", "cpf", "telefone", "phone", "rg", "cnh", "pis", "nis", "mae", "filiacao",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Released,
    Refused,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Report {
    pub schema: String,
    pub status: String,
    pub reversible: bool,
    pub serpro_query: bool,
    pub anpd_submission: String,
    pub lgpd_anonymization_opinion: bool,
    pub redactions: BTreeMap<String, u32>,
    pub residual_risk: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Outcome {
    pub status: Status,
    pub value: Option<Value>,
    pub report: Report,
}

pub fn release(value: &Value) -> Outcome {
    let mut counts = BTreeMap::new();
    let rewritten = rewrite(value, &mut counts);
    let rendered = serde_json::to_string(&rewritten).unwrap_or_default();
    if still_direct(&rendered) {
        return Outcome {
            status: Status::Refused,
            value: None,
            report: report(Status::Refused, counts, "a direct-identifier pattern remained after suppression"),
        };
    }
    Outcome {
        status: Status::Released,
        value: Some(rewritten),
        report: report(
            Status::Released,
            counts,
            "suppression of detected direct identifiers; reidentification was not assessed",
        ),
    }
}

fn rewrite(value: &Value, counts: &mut BTreeMap<String, u32>) -> Value {
    match value {
        Value::Object(map) => {
            let mut out = Map::new();
            for (key, child) in map {
                if LABELS.iter().any(|label| key.eq_ignore_ascii_case(label)) {
                    bump(counts, "labeled");
                    out.insert(key.clone(), Value::String("[REDACTED]".into()));
                } else {
                    out.insert(key.clone(), rewrite(child, counts));
                }
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.iter().map(|item| rewrite(item, counts)).collect()),
        Value::String(text) => Value::String(redact_text(text, counts)),
        Value::Number(number) if cpf_digits(&number.to_string()) => {
            bump(counts, "cpf");
            Value::String("[CPF]".into())
        }
        other => other.clone(),
    }
}

fn redact_text(text: &str, counts: &mut BTreeMap<String, u32>) -> String {
    let mut out = String::new();
    let chars: Vec<char> = text.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        if let Some(end) = take_cpf(&chars[index..]) {
            bump(counts, "cpf");
            out.push_str("[CPF]");
            index += end;
            continue;
        }
        if let Some(end) = take_email(&chars[index..]) {
            bump(counts, "email");
            out.push_str("[EMAIL]");
            index += end;
            continue;
        }
        if let Some(end) = take_phone(&chars[index..]) {
            bump(counts, "phone");
            out.push_str("[PHONE]");
            index += end;
            continue;
        }
        out.push(chars[index]);
        index += 1;
    }
    out
}

fn take_cpf(chars: &[char]) -> Option<usize> {
    if chars.len() >= 14 && is_digit(chars[0]) && chars[3] == '.' && chars[7] == '.' && chars[11] == '-' {
        let digits: String = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13].iter().map(|index| chars[*index]).collect();
        if digits.chars().all(|char| char.is_ascii_digit()) {
            return Some(14);
        }
    }
    if chars.len() >= 11 && chars[..11].iter().all(|char| char.is_ascii_digit()) {
        let digits: String = chars[..11].iter().collect();
        let boundary = chars.get(11).is_none_or(|char| !char.is_ascii_digit());
        if boundary && cpf_digits(&digits) {
            return Some(11);
        }
    }
    None
}

fn take_email(chars: &[char]) -> Option<usize> {
    let text: String = chars.iter().take(254).collect();
    let end = text.find(|char: char| char.is_whitespace()).unwrap_or(text.len());
    let token = &text[..end];
    let at = token.find('@')?;
    if at == 0 || !token[at + 1..].contains('.') || token.ends_with('.') {
        return None;
    }
    Some(end)
}

fn take_phone(chars: &[char]) -> Option<usize> {
    let text: String = chars.iter().take(24).collect();
    let compact: String = text.chars().filter(|char| char.is_ascii_digit()).collect();
    if text.starts_with("+55") && compact.len() >= 12 && compact.starts_with("55") {
        return Some(text.chars().take_while(|char| char.is_ascii_digit() || "+ ()-".contains(*char)).count());
    }
    if text.starts_with('(') && text.contains(')') && compact.len() >= 10 {
        return Some(text.chars().take_while(|char| char.is_ascii_digit() || "()- ".contains(*char)).count());
    }
    None
}

fn cpf_digits(digits: &str) -> bool {
    let bytes: Vec<u8> = digits.bytes().filter(|byte| byte.is_ascii_digit()).collect();
    if bytes.len() != 11 || bytes.iter().all(|byte| *byte == bytes[0]) {
        return false;
    }
    let numbers: Vec<u32> = bytes.iter().map(|byte| u32::from(byte - b'0')).collect();
    check_digit(&numbers[..9], 10) == numbers[9] && check_digit(&numbers[..10], 11) == numbers[10]
}

fn check_digit(numbers: &[u32], weight: u32) -> u32 {
    let sum: u32 = numbers.iter().enumerate().map(|(index, number)| number * (weight - index as u32)).sum();
    let rest = (sum * 10) % 11;
    if rest == 10 { 0 } else { rest }
}

fn still_direct(text: &str) -> bool {
    let chars: Vec<char> = text.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        if take_cpf(&chars[index..]).is_some() || take_email(&chars[index..]).is_some() || take_phone(&chars[index..]).is_some() {
            return true;
        }
        index += 1;
    }
    false
}

fn bump(counts: &mut BTreeMap<String, u32>, key: &str) {
    *counts.entry(key.to_string()).or_insert(0) += 1;
}

fn is_digit(char: char) -> bool {
    char.is_ascii_digit()
}

fn report(status: Status, redactions: BTreeMap<String, u32>, residual_risk: &str) -> Report {
    Report {
        schema: "arkhe-anonymization-report/v1".into(),
        status: match status {
            Status::Released => "RELEASED",
            Status::Refused => "REFUSED",
        }
        .into(),
        reversible: false,
        serpro_query: false,
        anpd_submission: "not_sent".into(),
        lgpd_anonymization_opinion: false,
        redactions,
        residual_risk: residual_risk.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthetic_record_releases_without_the_identifier() {
        let input = serde_json::json!({
            "nome": "Pessoa Sintetica",
            "cpf": "000.000.000-00",
            "email": "pessoa.sintetica@example.test",
            "telefone": "+55 11 90000-0000",
            "nota": "protocolo 123"
        });
        let outcome = release(&input);
        assert_eq!(outcome.status, Status::Released);
        let rendered = serde_json::to_string(outcome.value.as_ref().unwrap()).unwrap();
        assert!(!rendered.contains("000.000.000-00"));
        assert!(!rendered.contains("pessoa.sintetica@example.test"));
        assert!(!rendered.contains("90000-0000"));
        assert!(!rendered.contains("Pessoa Sintetica"));
        assert!(rendered.contains("protocolo 123"));
        assert!(!outcome.report.reversible);
        assert!(!outcome.report.serpro_query);
        assert_eq!(outcome.report.anpd_submission, "not_sent");
        assert!(!outcome.report.lgpd_anonymization_opinion);
    }

    #[test]
    fn unformatted_checksum_is_suppressed_and_a_leftover_refuses() {
        let digits = "39053344705";
        assert!(cpf_digits(digits));
        let outcome = release(&serde_json::json!({"nota": digits}));
        let rendered = serde_json::to_string(outcome.value.as_ref().unwrap()).unwrap();
        assert!(!rendered.contains(digits));
        assert_eq!(outcome.status, Status::Released);
        let leaked = release(&serde_json::json!({"nota": "keep pessoa@example.test"}));
        assert_eq!(leaked.status, Status::Released);
        let forced = still_direct("x pessoa@example.test");
        assert!(forced);
    }
}
