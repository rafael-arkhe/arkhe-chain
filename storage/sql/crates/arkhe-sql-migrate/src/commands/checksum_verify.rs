use sha2::{Digest, Sha384};
use sqlx::PgPool;
use std::path::{Path, PathBuf};

pub async fn verify_checksums_in_dir(
    migrations_dir: &Path,
    rows: &[(i64, Vec<u8>)],
) -> anyhow::Result<()> {
    for (version, stored) in rows {
        let prefix = version.to_string();
        let mut found: Option<PathBuf> = None;
        for entry in std::fs::read_dir(migrations_dir)? {
            let path = entry?.path();
            if path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with(&prefix) && n.ends_with(".sql"))
                .unwrap_or(false)
            {
                found = Some(path);
                break;
            }
        }

        let path = found.ok_or_else(|| anyhow::anyhow!("missing migration file for {version}"))?;
        let bytes = tokio::fs::read(&path).await?;
        let digest = Sha384::digest(bytes);

        anyhow::ensure!(
            stored.as_slice() == &digest[..],
            "migration checksum mismatch for {} ({})",
            version,
            path.display()
        );
    }

    Ok(())
}

pub async fn run(pool: &PgPool) -> anyhow::Result<()> {
    let rows: Vec<(i64, Vec<u8>)> =
        sqlx::query_as("SELECT version, checksum FROM _sqlx_migrations ORDER BY version")
            .fetch_all(pool)
            .await?;

    verify_checksums_in_dir(Path::new("migrations"), &rows).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn migrations_dir() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../migrations")
    }

    fn collect_expected_rows(dir: &Path) -> Vec<(i64, Vec<u8>)> {
        let mut rows = Vec::new();
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !name.ends_with(".sql") {
                continue;
            }
            let version: i64 = name
                .split('_')
                .next()
                .unwrap()
                .parse()
                .expect("numeric migration prefix");
            let bytes = std::fs::read(&path).unwrap();
            let digest = Sha384::digest(bytes).to_vec();
            rows.push((version, digest));
        }
        rows.sort_by_key(|(v, _)| *v);
        rows
    }

    #[tokio::test]
    async fn verifies_all_published_migrations_and_rejects_tamper_or_missing() {
        let dir = migrations_dir();
        let rows = collect_expected_rows(&dir);
        assert!(rows.len() >= 19, "expected published SQL migrations");
        verify_checksums_in_dir(&dir, &rows).await.unwrap();

        let mut tampered = rows.clone();
        tampered[0].1[0] ^= 0x01;
        let err = verify_checksums_in_dir(&dir, &tampered).await.unwrap_err();
        assert!(err.to_string().contains("migration checksum mismatch"));

        let missing = vec![(99999999999999i64, vec![0u8; 48])];
        let err_missing = verify_checksums_in_dir(&dir, &missing).await.unwrap_err();
        assert!(err_missing.to_string().contains("missing migration file"));
    }
}
