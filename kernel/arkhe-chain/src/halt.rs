use crate::ChainError;

/// Read `emergency.halt` from a properties document.
///
/// `true` and `false` are the only accepted values. A missing key, a second
/// assignment, or any other text is `HaltConfig`: the caller must stop.
pub fn load_emergency_halt(text: &str) -> Result<bool, ChainError> {
    let mut value = None;
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, raw_value)) = line.split_once('=') else {
            return Err(ChainError::HaltConfig);
        };
        if key.trim() != "emergency.halt" || value.is_some() {
            return Err(ChainError::HaltConfig);
        }
        value = Some(match raw_value.trim() {
            "true" => true,
            "false" => false,
            _ => return Err(ChainError::HaltConfig),
        });
    }
    value.ok_or(ChainError::HaltConfig)
}
