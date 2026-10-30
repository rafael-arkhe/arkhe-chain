//! Single-host CLI high-water mark. Operator-owned storage, not trustless state.
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
};

const PROFILE: &str = "arkhe-kya-local-hwm@1";
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Row {
    key: String,
    sequence: u32,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Disk {
    profile: String,
    rows: Vec<Row>,
}
pub struct Guard {
    file: File,
    values: BTreeMap<String, u32>,
}

pub fn initialize(path: &str) -> Result<(), String> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| "STATE_INIT_FAILED")?;
    file.try_lock().map_err(|_| "STATE_LOCK_FAILED")?;
    Guard {
        file,
        values: BTreeMap::new(),
    }
    .save()
}
impl Guard {
    pub fn open(path: &str) -> Result<Self, String> {
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(path)
            .map_err(|_| "STATE_UNAVAILABLE")?;
        file.try_lock().map_err(|_| "STATE_LOCK_FAILED")?;
        let mut bytes = Vec::new();
        (&mut file)
            .take(1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "STATE_READ_FAILED")?;
        if bytes.len() > 1024 * 1024 {
            return Err("STATE_TOO_LARGE".into());
        }
        let disk: Disk = serde_json::from_slice(&bytes).map_err(|_| "STATE_INVALID")?;
        if disk.profile != PROFILE || disk.rows.len() > 4096 {
            return Err("STATE_INVALID".into());
        }
        let mut values = BTreeMap::new();
        for row in disk.rows {
            if row.key.len() != 64
                || !row
                    .key
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                || values.insert(row.key, row.sequence).is_some()
            {
                return Err("STATE_INVALID".into());
            }
        }
        Ok(Self { file, values })
    }
    pub fn floor(&self, key: &str) -> u32 {
        self.values.get(key).copied().unwrap_or(0)
    }
    pub fn advance(&mut self, key: &str, sequence: u32) -> Result<(), String> {
        if sequence > self.floor(key) {
            if !self.values.contains_key(key) && self.values.len() >= 4096 {
                return Err("STATE_FULL".into());
            }
            self.values.insert(key.into(), sequence);
            self.save()?;
        }
        Ok(())
    }
    fn save(&mut self) -> Result<(), String> {
        let disk = Disk {
            profile: PROFILE.into(),
            rows: self
                .values
                .iter()
                .map(|(key, sequence)| Row {
                    key: key.clone(),
                    sequence: *sequence,
                })
                .collect(),
        };
        let bytes = serde_json::to_vec(&disk).map_err(|_| "STATE_WRITE_FAILED")?;
        self.file
            .seek(SeekFrom::Start(0))
            .map_err(|_| "STATE_WRITE_FAILED")?;
        self.file.set_len(0).map_err(|_| "STATE_WRITE_FAILED")?;
        self.file
            .write_all(&bytes)
            .and_then(|_| self.file.sync_all())
            .map_err(|_| "STATE_WRITE_FAILED".into())
    }
}
