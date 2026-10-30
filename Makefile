.PHONY: verify-static verify-kernel fmt test cognition-conformance up down status live-verify
RUNTIME_ARGS ?= --engine docker

verify-static:
	python3 scripts/check_architecture.py
	python3 scripts/static_audit.py
	python3 scripts/check_boundaries.py
	python3 scripts/check_configs.py

fmt:
	cargo fmt --all --check

test:
	cargo test --workspace --locked

cognition-conformance:
	python3 scripts/cognition_conformance.py

verify-kernel:
	cargo check --workspace --locked
	cargo test --workspace --locked
	cargo nextest run --workspace --locked
	python3 scripts/cognition_conformance.py

up:
	python3 scripts/live_runtime.py up $(RUNTIME_ARGS)

down:
	python3 scripts/live_runtime.py down $(RUNTIME_ARGS)

status:
	python3 scripts/live_runtime.py status $(RUNTIME_ARGS)

live-verify:
	python3 scripts/live_runtime.py verify $(RUNTIME_ARGS)

node-install:
	pnpm install --frozen-lockfile

node-build:
	pnpm build:apps
	pnpm build:adapters

wasm-check:
	pnpm verify:wasm
	pnpm build:adapters
	pnpm test:adapters
