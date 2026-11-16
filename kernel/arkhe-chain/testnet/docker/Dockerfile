# Align with the monorepo rust-toolchain (File::try_lock needs 1.89+).
FROM rust:1.96.0-slim-bookworm AS builder
WORKDIR /usr/src/arkhe
RUN apt-get update \
  && apt-get install -y --no-install-recommends pkg-config libssl-dev build-essential \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN cargo build --release --bin arkhe-chain

FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libssl3 \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --create-home --uid 10001 --shell /usr/sbin/nologin arkhe
WORKDIR /app
COPY --from=builder /usr/src/arkhe/target/release/arkhe-chain /usr/local/bin/arkhe-chain
USER arkhe
ENTRYPOINT ["/usr/local/bin/arkhe-chain"]
