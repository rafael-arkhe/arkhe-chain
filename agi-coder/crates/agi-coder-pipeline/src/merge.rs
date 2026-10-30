use agi_coder_core::ContentHash;
use std::collections::BTreeMap;
/// Combine file changes only if overlapping outputs agree exactly.
pub fn merge(
    results: &[BTreeMap<String, ContentHash>],
) -> Result<BTreeMap<String, ContentHash>, String> {
    let mut merged = BTreeMap::new();
    for files in results {
        for (path, hash) in files {
            if merged.get(path).is_some_and(|existing| existing != hash) {
                return Err(format!("conflicting change: {path}"));
            }
            merged.insert(path.clone(), *hash);
        }
    }
    Ok(merged)
}
