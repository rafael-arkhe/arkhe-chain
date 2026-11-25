FROM rust:1.96.0-bookworm AS build
WORKDIR /src
COPY . .
RUN cargo build --locked --release -p arkhe-provenance-mcp --bin arkhe-provenance-mcp

FROM debian:bookworm-slim
COPY --from=build /src/target/release/arkhe-provenance-mcp /usr/local/bin/arkhe-provenance-mcp
USER nobody
ENTRYPOINT ["arkhe-provenance-mcp"]
