mod commands;

use clap::{Parser, Subcommand};

#[derive(Parser)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Migrate,
    ChecksumVerify,
    RlsAudit,
    AppendOnlyAudit,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let url = std::env::var("DATABASE_URL")?;
    let pool = sqlx::PgPool::connect(&url).await?;

    match cli.command {
        Command::Migrate => commands::migrate::run(&pool).await?,
        Command::ChecksumVerify => commands::checksum_verify::run(&pool).await?,
        Command::RlsAudit => commands::rls_audit::run(&pool).await?,
        Command::AppendOnlyAudit => commands::append_only_audit::run(&pool).await?,
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_parses_all_audit_subcommands_and_rejects_unknown() {
        assert!(matches!(
            Cli::try_parse_from(["arkhe-sql-migrate", "migrate"])
                .unwrap()
                .command,
            Command::Migrate
        ));
        assert!(matches!(
            Cli::try_parse_from(["arkhe-sql-migrate", "checksum-verify"])
                .unwrap()
                .command,
            Command::ChecksumVerify
        ));
        assert!(matches!(
            Cli::try_parse_from(["arkhe-sql-migrate", "rls-audit"])
                .unwrap()
                .command,
            Command::RlsAudit
        ));
        assert!(matches!(
            Cli::try_parse_from(["arkhe-sql-migrate", "append-only-audit"])
                .unwrap()
                .command,
            Command::AppendOnlyAudit
        ));
        assert!(Cli::try_parse_from(["arkhe-sql-migrate", "drop-all"]).is_err());
    }
}
