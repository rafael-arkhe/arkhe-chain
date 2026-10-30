.PHONY: fmt clippy test migrate audit

fmt:
	cargo fmt --all --check

clippy:
	cargo clippy --workspace --all-targets -- -D warnings

test:
	cargo test --workspace --locked

migrate:
	cargo run -p arkhe-sql-migrate -- migrate

audit:
	bash scripts/append_only_audit.sh
	bash scripts/rls_audit.sh
	bash scripts/check_migration_checksums.sh
