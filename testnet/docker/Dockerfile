# File locking in std (File::try_lock) needs Rust 1.89 or later.
FROM rust:1.89-slim-bookworm AS builder
WORKDIR /usr/src/arkhe
RUN apt-get update && apt-get install -y pkg-config libssl-dev build-essential && rm -rf /var/lib/apt/lists/*
COPY . .
RUN cargo build --release --bin arkhe-chain

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /usr/src/arkhe/target/release/arkhe-chain /usr/local/bin/arkhe-chain
ENTRYPOINT ["/usr/local/bin/arkhe-chain"]
